import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AgeSplitDomainError } from './age-split.errors';

/** Maps the age-split domain rejections to the existing 400 error body shape. */
@Catch(AgeSplitDomainError)
export class AgeSplitExceptionFilter implements ExceptionFilter {
  catch(exception: AgeSplitDomainError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = HttpStatus.BAD_REQUEST;
    res.status(status).json({ statusCode: status, message: exception.message });
  }
}
