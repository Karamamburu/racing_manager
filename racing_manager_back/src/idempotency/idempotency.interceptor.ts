import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  EMPTY,
  Observable,
  catchError,
  from,
  map,
  mergeMap,
  switchMap,
  throwError,
} from 'rxjs';
import {
  IdempotencyService,
  hashPayload,
  type IdempotencyScope,
} from './idempotency.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const IDEMPOTENCY_HEADER = 'idempotency-key';

type IdempotentRequest = Request & {
  route?: { path?: string };
  baseUrl?: string;
  body?: unknown;
  session?: { userSub?: string };
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<IdempotentRequest>();
    const response = http.getResponse<Response>();

    const key = request.headers[IDEMPOTENCY_HEADER];
    if (
      typeof key !== 'string' ||
      key.trim().length === 0 ||
      !MUTATING_METHODS.has(request.method)
    ) {
      return next.handle();
    }

    const route = (request as unknown as { route?: { path?: string } }).route;
    const routeTemplate = `${request.baseUrl ?? ''}${route?.path ?? ''}`;
    if (!routeTemplate) {
      return next.handle();
    }

    const scope: IdempotencyScope = {
      actorKey: request.session?.userSub ?? 'anonymous',
      method: request.method,
      routeTemplate,
      key: key.trim(),
    };
    const payloadHash = hashPayload(request.body);

    return from(this.idempotency.claim(scope, payloadHash)).pipe(
      mergeMap((claim) => {
        if (claim.kind === 'conflict') {
          throw new ConflictException(
            claim.reason === 'payload_mismatch'
              ? 'Idempotency-Key was already used with a different payload.'
              : 'A request with this Idempotency-Key is still in progress.',
          );
        }
        if (claim.kind === 'replay') {
          response.status(claim.status).json(claim.body ?? null);
          return EMPTY;
        }

        const status =
          this.reflector.get<number | undefined>(
            HTTP_CODE_METADATA,
            context.getHandler(),
          ) ?? (request.method === 'POST' ? 201 : 200);

        return next.handle().pipe(
          mergeMap((body) =>
            from(this.idempotency.complete(scope, status, body)).pipe(
              map(() => body as unknown),
            ),
          ),
          catchError((error: unknown) =>
            from(this.idempotency.release(scope)).pipe(
              switchMap(() => throwError(() => error)),
            ),
          ),
        );
      }),
    );
  }
}
