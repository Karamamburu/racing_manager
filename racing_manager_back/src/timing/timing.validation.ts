import { BadRequestException, type ValidationError } from '@nestjs/common';

/** Human labels for the timing request fields a validation refusal can name. */
const FIELD_LABELS: Record<string, string> = {
  attemptId: 'Попытка',
  kind: 'Тип отметки',
  startNumber: 'Номер участника',
  enrollmentId: 'Участник',
  clientCapturedAt: 'Время нажатия',
  clientElapsedMs: 'Прошедшее время',
  clockEpochId: 'Отсчёт',
  workstationInstanceId: 'Рабочая станция',
  deviceSequence: 'Последовательность',
  lastIssuedSequence: 'Последняя последовательность',
  reason: 'Причина',
  targetType: 'Тип цели',
  targetId: 'Цель',
  officialAt: 'Официальное время',
  chosenAttemptId: 'Выбранная попытка',
  startId: 'Старт',
  formatId: 'Формат',
  gender: 'Пол',
  classCompetitionId: 'Гонка',
  stageId: 'Этап',
  heatNumber: 'Заезд',
  pendingFinishId: 'Непривязанный финиш',
  toWorkstationInstanceId: 'Станция назначения',
  lockToken: 'Захват',
};

function fieldLabel(property: string): string {
  return FIELD_LABELS[property] ?? property;
}

function constraintMessage(
  property: string,
  constraint: string,
  value: string | undefined,
): string {
  const label = fieldLabel(property);
  if (value !== undefined && /[А-Яа-яЁё]/.test(value)) return value;
  switch (constraint) {
    case 'isUuid':
      return `Поле «${label}» имеет неверный формат идентификатора.`;
    case 'isInt':
      return `Поле «${label}» должно быть целым числом.`;
    case 'min':
      return `Значение поля «${label}» слишком маленькое.`;
    case 'isString':
      return `Поле «${label}» должно быть строкой.`;
    case 'isNotEmpty':
    case 'isDefined':
    case 'minLength':
      return `Заполните поле «${label}».`;
    case 'isIn':
      return `Недопустимое значение поля «${label}».`;
    case 'isBoolean':
      return `Поле «${label}» должно быть да или нет.`;
    case 'isISO8601':
      return `Поле «${label}» должно содержать дату в формате ISO-8601.`;
    case 'whitelistValidation':
      return `В запросе есть неизвестное поле «${label}».`;
    default:
      return `Поле «${label}» заполнено неверно.`;
  }
}

/** Turns class-validator failures into short Russian sentences for the timing surface. */
export function timingValidationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const messages: string[] = [];
  for (const error of errors) {
    const constraints = error.constraints ?? {};
    const entries = Object.entries(constraints);
    if (entries.length === 0) {
      messages.push(`Поле «${fieldLabel(error.property)}» заполнено неверно.`);
      continue;
    }
    for (const [constraint, value] of entries) {
      messages.push(constraintMessage(error.property, constraint, value));
    }
  }
  return new BadRequestException(messages);
}
