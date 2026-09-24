import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError, ErrorCodes } from '../domain/errors';

const NOT_FOUND_CODES = new Set<string>([
  ErrorCodes.PRESET_NOT_FOUND,
  ErrorCodes.STAGE_NOT_FOUND,
  ErrorCodes.COMPETITION_NOT_FOUND,
]);

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = NOT_FOUND_CODES.has(exception.code)
      ? HttpStatus.NOT_FOUND
      : HttpStatus.BAD_REQUEST;
    const body: { code: string; message: string; path?: string } = {
      code: exception.code,
      message: exception.message,
    };
    if (exception.path) {
      body.path = exception.path;
    }

    const urlPath = (request.url ?? '').split('?')[0] ?? '';
    const competitionMatch = urlPath.match(
      /\/v1\/competitions\/([^/]+)/,
    );
    const stageMatch = urlPath.match(/\/stages\/([^/]+)/);

    this.logger.warn({
      event: 'domain_error',
      code: exception.code,
      path: exception.path,
      competitionId: competitionMatch?.[1],
      stageId: stageMatch?.[1] ? decodeURIComponent(stageMatch[1]) : undefined,
      method: request.method,
      url: urlPath,
      status,
      msg: exception.message,
    });

    response.status(status).json(body);
  }
}
