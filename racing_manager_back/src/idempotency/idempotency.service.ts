import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';

export const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_IN_PROGRESS_TTL_MS = 60 * 1000;
const IN_PROGRESS_STATUS = 0;

export type IdempotencyScope = {
  actorKey: string;
  method: string;
  routeTemplate: string;
  key: string;
};

export type IdempotencyClaim =
  | { kind: 'claimed' }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'conflict'; reason: 'payload_mismatch' | 'in_progress' };

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashPayload(body: unknown): string {
  return createHash('sha256')
    .update(stableJson(body ?? null))
    .digest('hex');
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(
    scope: IdempotencyScope,
    payloadHash: string,
  ): Promise<IdempotencyClaim> {
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_RETENTION_MS);
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          ...toUnique(scope),
          payloadHash,
          responseStatus: IN_PROGRESS_STATUS,
          expiresAt,
        },
      });
      return { kind: 'claimed' };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }

    const row = await this.prisma.idempotencyRecord.findUnique({
      where: {
        actorKey_httpMethod_routeTemplate_idempotencyKey: toUnique(scope),
      },
    });
    if (!row) {
      return { kind: 'conflict', reason: 'in_progress' };
    }
    if (row.payloadHash !== payloadHash) {
      return { kind: 'conflict', reason: 'payload_mismatch' };
    }
    if (row.responseStatus !== IN_PROGRESS_STATUS) {
      return {
        kind: 'replay',
        status: row.responseStatus,
        body: row.responseBody,
      };
    }

    const stale =
      Date.now() - row.createdAt.getTime() > IDEMPOTENCY_IN_PROGRESS_TTL_MS;
    if (!stale) {
      return { kind: 'conflict', reason: 'in_progress' };
    }

    await this.prisma.idempotencyRecord.update({
      where: {
        actorKey_httpMethod_routeTemplate_idempotencyKey: toUnique(scope),
      },
      data: { payloadHash, createdAt: new Date(), expiresAt },
    });
    return { kind: 'claimed' };
  }

  async complete(
    scope: IdempotencyScope,
    status: number,
    body: unknown,
  ): Promise<void> {
    await this.prisma.idempotencyRecord.update({
      where: {
        actorKey_httpMethod_routeTemplate_idempotencyKey: toUnique(scope),
      },
      data: {
        responseStatus: status,
        responseBody: (body ?? null) as Prisma.InputJsonValue,
      },
    });
  }

  async release(scope: IdempotencyScope): Promise<void> {
    await this.prisma.idempotencyRecord.deleteMany({
      where: {
        actorKey: scope.actorKey,
        httpMethod: scope.method,
        routeTemplate: scope.routeTemplate,
        idempotencyKey: scope.key,
      },
    });
  }
}

function toUnique(scope: IdempotencyScope) {
  return {
    actorKey: scope.actorKey,
    httpMethod: scope.method,
    routeTemplate: scope.routeTemplate,
    idempotencyKey: scope.key,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002',
  );
}
