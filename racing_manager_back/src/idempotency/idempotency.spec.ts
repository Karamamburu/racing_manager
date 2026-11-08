import { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import {
  IDEMPOTENCY_RETENTION_MS,
  IdempotencyService,
  hashPayload,
  type IdempotencyScope,
} from './idempotency.service';

type FakeRow = {
  actorKey: string;
  httpMethod: string;
  routeTemplate: string;
  idempotencyKey: string;
  payloadHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
  expiresAt: Date;
};

function rowKey(scope: {
  actorKey: string;
  httpMethod: string;
  routeTemplate: string;
  idempotencyKey: string;
}): string {
  return [
    scope.actorKey,
    scope.httpMethod,
    scope.routeTemplate,
    scope.idempotencyKey,
  ].join('|');
}

class FakePrisma {
  readonly rows = new Map<string, FakeRow>();

  readonly idempotencyRecord = {
    create: ({ data }: { data: Omit<FakeRow, 'createdAt'> }) => {
      const key = rowKey(data);
      if (this.rows.has(key)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const row: FakeRow = { ...data, createdAt: new Date() };
      this.rows.set(key, row);
      return Promise.resolve(row);
    },
    findUnique: ({
      where,
    }: {
      where: {
        actorKey_httpMethod_routeTemplate_idempotencyKey: {
          actorKey: string;
          httpMethod: string;
          routeTemplate: string;
          idempotencyKey: string;
        };
      };
    }) => {
      const key = rowKey(
        where.actorKey_httpMethod_routeTemplate_idempotencyKey,
      );
      return Promise.resolve(this.rows.get(key) ?? null);
    },
    update: ({
      where,
      data,
    }: {
      where: {
        actorKey_httpMethod_routeTemplate_idempotencyKey: {
          actorKey: string;
          httpMethod: string;
          routeTemplate: string;
          idempotencyKey: string;
        };
      };
      data: Partial<FakeRow>;
    }) => {
      const key = rowKey(
        where.actorKey_httpMethod_routeTemplate_idempotencyKey,
      );
      const row = this.rows.get(key);
      if (!row) throw new Error('Missing idempotency row');
      Object.assign(row, data);
      return Promise.resolve(row);
    },
    deleteMany: ({
      where,
    }: {
      where: {
        actorKey: string;
        httpMethod: string;
        routeTemplate: string;
        idempotencyKey: string;
      };
    }) => {
      this.rows.delete(rowKey(where));
      return Promise.resolve({ count: 1 });
    },
  };
}

const scope: IdempotencyScope = {
  actorKey: 'user-1',
  method: 'POST',
  routeTemplate: '/events/:eventId/registrations',
  key: 'key-1',
};

function makeService() {
  const prisma = new FakePrisma();
  return {
    prisma,
    service: new IdempotencyService(prisma as unknown as PrismaService),
  };
}

describe('hashPayload', () => {
  it('is stable across object key order', () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
  });

  it('differs for a different payload', () => {
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });
});

describe('IdempotencyService', () => {
  it('retains records for at least 24 hours', () => {
    expect(IDEMPOTENCY_RETENTION_MS).toBeGreaterThanOrEqual(
      24 * 60 * 60 * 1000,
    );
  });

  it('claims a key once and replays the stored response', async () => {
    const { service, prisma } = makeService();
    const hash = hashPayload({ enrollments: [] });

    expect(await service.claim(scope, hash)).toEqual({ kind: 'claimed' });
    await service.complete(scope, 201, { id: 'registration-1' });

    expect(await service.claim(scope, hash)).toEqual({
      kind: 'replay',
      status: 201,
      body: { id: 'registration-1' },
    });
    expect(prisma.rows.size).toBe(1);
  });

  it('returns conflict for the same key with a different payload', async () => {
    const { service } = makeService();

    await service.claim(scope, hashPayload({ a: 1 }));

    expect(await service.claim(scope, hashPayload({ a: 2 }))).toEqual({
      kind: 'conflict',
      reason: 'payload_mismatch',
    });
  });

  it('returns in-progress conflict for a fresh open claim', async () => {
    const { service } = makeService();
    const hash = hashPayload({ a: 1 });

    await service.claim(scope, hash);

    expect(await service.claim(scope, hash)).toEqual({
      kind: 'conflict',
      reason: 'in_progress',
    });
  });

  it('takes over a stale open claim', async () => {
    const { service, prisma } = makeService();
    const hash = hashPayload({ a: 1 });
    await service.claim(scope, hash);

    const row = [...prisma.rows.values()][0];
    row.createdAt = new Date(Date.now() - 5 * 60 * 1000);

    expect(await service.claim(scope, hash)).toEqual({ kind: 'claimed' });
  });

  it('releases the claim so a retry can run again', async () => {
    const { service, prisma } = makeService();
    const hash = hashPayload({ a: 1 });

    await service.claim(scope, hash);
    await service.release(scope);

    expect(prisma.rows.size).toBe(0);
    expect(await service.claim(scope, hash)).toEqual({ kind: 'claimed' });
  });
});

@Controller('demo')
class DemoController {
  calls = 0;
  shouldFail = false;

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create() {
    if (this.shouldFail) {
      throw new Error('boom');
    }
    this.calls += 1;
    return { ok: true, call: this.calls };
  }
}

describe('IdempotencyInterceptor', () => {
  let app: INestApplication;
  let controller: DemoController;
  const claim = jest.fn();
  const complete = jest.fn(() => Promise.resolve(undefined));
  const release = jest.fn(() => Promise.resolve(undefined));

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [DemoController],
      providers: [
        {
          provide: IdempotencyService,
          useValue: { claim, complete, release },
        },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
      ],
    }).compile();
    controller = moduleRef.get(DemoController);
    app = moduleRef.createNestApplication();
    await app.init();
    return app.getHttpServer() as Server;
  }

  beforeEach(() => {
    claim.mockReset();
    complete.mockClear();
    release.mockClear();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('runs without replay protection when the header is absent', async () => {
    const server = await createApp();

    const first = await request(server).post('/demo').send({ a: 1 });
    const second = await request(server).post('/demo').send({ a: 1 });

    expect(first.status).toBe(201);
    expect(second.body).toEqual({ ok: true, call: 2 });
    expect(claim).not.toHaveBeenCalled();
  });

  it('claims, completes and replays a keyed request', async () => {
    const server = await createApp();
    claim.mockResolvedValueOnce({ kind: 'claimed' });
    claim.mockResolvedValueOnce({
      kind: 'replay',
      status: 201,
      body: { ok: true, call: 1 },
    });

    const first = await request(server)
      .post('/demo')
      .set('Idempotency-Key', 'key-1')
      .send({ a: 1 });
    const second = await request(server)
      .post('/demo')
      .set('Idempotency-Key', 'key-1')
      .send({ a: 1 });

    expect(first.body).toEqual({ ok: true, call: 1 });
    expect(second.status).toBe(201);
    expect(second.body).toEqual({ ok: true, call: 1 });
    expect(controller.calls).toBe(1);
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'key-1' }),
      201,
      { ok: true, call: 1 },
    );
  });

  it('returns 409 when the same key was used with a different payload', async () => {
    const server = await createApp();
    claim.mockResolvedValueOnce({ kind: 'claimed' });
    claim.mockResolvedValueOnce({
      kind: 'conflict',
      reason: 'payload_mismatch',
    });

    await request(server).post('/demo').set('Idempotency-Key', 'key-1').send({
      a: 1,
    });
    const conflict = await request(server)
      .post('/demo')
      .set('Idempotency-Key', 'key-1')
      .send({ a: 2 });

    expect(conflict.status).toBe(409);
    expect(controller.calls).toBe(1);
  });

  it('releases the claim when the handler fails', async () => {
    const server = await createApp();
    claim.mockResolvedValueOnce({ kind: 'claimed' });
    controller.shouldFail = true;

    const response = await request(server)
      .post('/demo')
      .set('Idempotency-Key', 'key-1')
      .send({});

    expect(response.status).toBe(500);
    expect(release).toHaveBeenCalled();
  });
});
