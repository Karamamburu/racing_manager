import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
} from '@nestjs/common';
import type { Server } from 'http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AgeSplitController } from './age-split.controller';
import {
  AgeSplitCategoryNotFoundError,
  CATEGORY_NOT_FOUND_MESSAGE,
  EMPTY_AGE_CATEGORIES_MESSAGE,
  EmptyAgeCategoriesError,
} from './age-split.errors';
import { AgeSplitService, type AgeCategoriesRef } from './age-split.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const START_ID = '22222222-2222-4222-8222-222222222222';
const AGE_SPLIT_PATH = `/admin/events/${EVENT_ID}/categories/age-split`;

const AGE_CATEGORIES_REF: AgeCategoriesRef = {
  startId: START_ID,
  formatId: 1,
  gender: 'M',
  enabled: true,
  categories: [
    {
      id: 'CATEGORY_1',
      number: 1,
      title: 'Категория 1',
      subtitle: '15–16, 17–18',
      groupIds: ['AGE_15_16', 'AGE_17_18'],
    },
  ],
};

const AGE_CATEGORIES_BODY = {
  gender: 'M',
  startId: START_ID,
  formatId: 1,
  enabled: true,
  categories: [{ groupIds: ['AGE_15_16', 'AGE_17_18'] }],
};

type SetSplitStub = jest.Mock<Promise<AgeCategoriesRef>, [string, unknown]>;

function makeSetSplit(
  handler: (id: string, body: unknown) => Promise<AgeCategoriesRef> = () =>
    Promise.resolve(AGE_CATEGORIES_REF),
): SetSplitStub {
  return jest.fn(handler);
}

function makeServiceStub(setSplit: SetSplitStub = makeSetSplit()) {
  return { setSplit };
}

describe('AgeSplitController HTTP contract', () => {
  let app: INestApplication;

  async function createApp(
    service = makeServiceStub(),
    canActivateRoles: () => boolean = () => true,
  ) {
    const moduleRef = await Test.createTestingModule({
      controllers: [AgeSplitController],
      providers: [{ provide: AgeSplitService, useValue: service }],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: canActivateRoles })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(
      (
        req: { session?: Record<string, unknown> },
        _res: unknown,
        next: () => void,
      ) => {
        req.session = { userSub: 'sub' };
        next();
      },
    );
    await app.init();
    return app.getHttpServer() as Server;
  }

  afterEach(async () => {
    await app?.close();
  });

  it('returns 200 with the AgeCategoriesRef and forwards the path id and body', async () => {
    const setSplit = makeSetSplit();
    const server = await createApp(makeServiceStub(setSplit));

    const response = await request(server)
      .put(AGE_SPLIT_PATH)
      .send(AGE_CATEGORIES_BODY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(AGE_CATEGORIES_REF);
    expect(setSplit).toHaveBeenCalledTimes(1);
    expect(setSplit).toHaveBeenCalledWith(EVENT_ID, AGE_CATEGORIES_BODY);
  });

  it('maps a BadRequestException from the service to 400', async () => {
    const setSplit = makeSetSplit(() =>
      Promise.reject(new BadRequestException('Категория не найдена.')),
    );
    const server = await createApp(makeServiceStub(setSplit));

    const response = await request(server)
      .put(AGE_SPLIT_PATH)
      .send(AGE_CATEGORIES_BODY);

    expect(response.status).toBe(400);
    expect(setSplit).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'an unknown protocol category',
      new AgeSplitCategoryNotFoundError(CATEGORY_NOT_FOUND_MESSAGE),
      CATEGORY_NOT_FOUND_MESSAGE,
    ],
    [
      'an enabled save without a group',
      new EmptyAgeCategoriesError(EMPTY_AGE_CATEGORIES_MESSAGE),
      EMPTY_AGE_CATEGORIES_MESSAGE,
    ],
  ])(
    'maps the domain rejection for %s to 400 with its message',
    async (_label, domainError, message) => {
      const setSplit = makeSetSplit(() => Promise.reject(domainError));
      const server = await createApp(makeServiceStub(setSplit));

      const response = await request(server)
        .put(AGE_SPLIT_PATH)
        .send(AGE_CATEGORIES_BODY);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ statusCode: 400, message });
      expect(setSplit).toHaveBeenCalledTimes(1);
    },
  );

  it('returns 400 for a non-UUID id without calling the service', async () => {
    const setSplit = makeSetSplit();
    const server = await createApp(makeServiceStub(setSplit));

    const response = await request(server)
      .put('/admin/events/not-a-uuid/categories/age-split')
      .send(AGE_CATEGORIES_BODY);

    expect(response.status).toBe(400);
    expect(setSplit).not.toHaveBeenCalled();
  });

  it('returns 403 and skips the service when the roles guard denies', async () => {
    const setSplit = makeSetSplit();
    const server = await createApp(makeServiceStub(setSplit), () => {
      throw new ForbiddenException();
    });

    const response = await request(server)
      .put(AGE_SPLIT_PATH)
      .send(AGE_CATEGORIES_BODY);

    expect(response.status).toBe(403);
    expect(setSplit).not.toHaveBeenCalled();
  });

  it('passes an enabled categories body through unchanged', async () => {
    const setSplit = makeSetSplit();
    const server = await createApp(makeServiceStub(setSplit));
    const body = {
      gender: 'F',
      startId: START_ID,
      formatId: 2,
      enabled: true,
      categories: [{ groupIds: ['AGE_LE_14', 'AGE_15_16'] }],
      ignoredExtra: 'kept-as-is',
    };

    await request(server).put(AGE_SPLIT_PATH).send(body);

    expect(setSplit).toHaveBeenCalledTimes(1);
    expect(setSplit.mock.calls[0][1]).toEqual(body);
  });

  it('passes a retired sections body to the service unchanged', async () => {
    const setSplit = makeSetSplit();
    const server = await createApp(makeServiceStub(setSplit));
    const body = {
      gender: 'M',
      startId: START_ID,
      formatId: 1,
      enabled: true,
      sections: [{ kind: 'BASE_GROUP', id: 'AGE_24_40' }],
    };

    await request(server).put(AGE_SPLIT_PATH).send(body);

    expect(setSplit).toHaveBeenCalledTimes(1);
    expect(setSplit.mock.calls[0][1]).toEqual(body);
  });
});
