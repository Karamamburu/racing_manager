export class DomainError extends Error {
  readonly code: string;
  readonly path?: string;

  constructor(code: string, message: string, path?: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.path = path;
  }
}

export const ErrorCodes = {
  FORMAT_INVALID: 'FORMAT_INVALID',
  STAGE_NOT_FOUND: 'STAGE_NOT_FOUND',
  PARTICIPANT_INVALID: 'PARTICIPANT_INVALID',
  SEEDING_INVALID: 'SEEDING_INVALID',
  RESULT_INVALID: 'RESULT_INVALID',
  ADVANCEMENT_INVALID: 'ADVANCEMENT_INVALID',
  MANUAL_ASSIGNMENT_INVALID: 'MANUAL_ASSIGNMENT_INVALID',
  PRESET_NOT_FOUND: 'PRESET_NOT_FOUND',
  COMPETITION_NOT_FOUND: 'COMPETITION_NOT_FOUND',
  COMPETITION_INVALID: 'COMPETITION_INVALID',
  STAGE_NOT_READY: 'STAGE_NOT_READY',
} as const;
