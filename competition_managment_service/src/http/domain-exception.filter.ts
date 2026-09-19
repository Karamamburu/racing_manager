import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { DomainError, ErrorCodes } from '../domain/errors';

const NOT_FOUND_CODES = new Set<string>([
  ErrorCodes.PRESET_NOT_FOUND,
  ErrorCodes.STAGE_NOT_FOUND,
  ErrorCodes.COMPETITION_NOT_FOUND,
]);

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
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
    response.status(status).json(body);
  }
}
