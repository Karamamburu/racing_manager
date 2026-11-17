import type { ValidationError } from '@nestjs/common';
import { timingValidationExceptionFactory } from './timing.validation';

function error(
  property: string,
  constraints: Record<string, string>,
): ValidationError {
  return { property, constraints, children: [] } as ValidationError;
}

describe('timingValidationExceptionFactory', () => {
  it('translates field format and whitelist failures into Russian', () => {
    const exception = timingValidationExceptionFactory([
      error('attemptId', { isUuid: 'attemptId must be a UUID' }),
      error('unexpected', {
        whitelistValidation: 'property unexpected should not exist',
      }),
    ]);

    expect((exception.getResponse() as { message: string[] }).message).toEqual([
      'Поле «Попытка» имеет неверный формат идентификатора.',
      'В запросе есть неизвестное поле «unexpected».',
    ]);
  });

  it('keeps a custom Russian constraint message', () => {
    const exception = timingValidationExceptionFactory([
      error('kind', { consistentCaptureIdentity: 'Проверьте поля отметки.' }),
    ]);

    expect((exception.getResponse() as { message: string[] }).message).toEqual([
      'Проверьте поля отметки.',
    ]);
  });
});
