import { BadRequestException } from '@nestjs/common';
import { parseUpdateRegistrationBody } from './parse-update-registration';

const startId = '11111111-1111-4111-8111-111111111111';

describe('parseUpdateRegistrationBody', () => {
  it('keeps enrollments unchanged when omitted', () => {
    expect(parseUpdateRegistrationBody({ startNumber: 12 })).toEqual({
      startNumber: 12,
    });
  });

  it('allows an enrollments-only patch', () => {
    expect(
      parseUpdateRegistrationBody({
        enrollments: [{ startId, formatId: 3 }],
      }),
    ).toEqual({
      enrollments: [{ startId, formatId: 3 }],
    });
  });

  it('returns an empty patch when both fields are omitted', () => {
    expect(parseUpdateRegistrationBody({})).toEqual({});
    expect(parseUpdateRegistrationBody({ enrollments: undefined })).toEqual({});
  });

  it('rejects an empty enrollments set', () => {
    expect(() => parseUpdateRegistrationBody({ enrollments: [] })).toThrow(
      'enrollments must be a non-empty array.',
    );
  });

  it('rejects non-array enrollments', () => {
    expect(() => parseUpdateRegistrationBody({ enrollments: 'x' })).toThrow(
      BadRequestException,
    );
    expect(() => parseUpdateRegistrationBody({ enrollments: null })).toThrow(
      BadRequestException,
    );
  });

  it('rejects non-object enrollment items', () => {
    expect(() => parseUpdateRegistrationBody({ enrollments: [null] })).toThrow(
      BadRequestException,
    );
    expect(() => parseUpdateRegistrationBody({ enrollments: [[]] })).toThrow(
      BadRequestException,
    );
  });

  it('rejects malformed start ids', () => {
    expect(() =>
      parseUpdateRegistrationBody({
        enrollments: [{ startId: 'not-a-uuid', formatId: 1 }],
      }),
    ).toThrow('startId must be a UUID.');
  });

  it('rejects duplicate start ids', () => {
    expect(() =>
      parseUpdateRegistrationBody({
        enrollments: [
          { startId, formatId: 1 },
          { startId, formatId: 2 },
        ],
      }),
    ).toThrow('startId must be unique.');
  });

  it('rejects invalid format ids', () => {
    expect(() =>
      parseUpdateRegistrationBody({
        enrollments: [{ startId, formatId: 0 }],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseUpdateRegistrationBody({
        enrollments: [{ startId, formatId: 1.5 }],
      }),
    ).toThrow(BadRequestException);
  });

  it('keeps start number validation', () => {
    expect(() => parseUpdateRegistrationBody({ startNumber: 0 })).toThrow(
      'startNumber must be an integer greater than 0.',
    );
    expect(() => parseUpdateRegistrationBody({ startNumber: 'x' })).toThrow(
      'startNumber must be an integer greater than 0.',
    );
  });

  it('rejects a non-object body', () => {
    expect(() => parseUpdateRegistrationBody(null)).toThrow(
      BadRequestException,
    );
    expect(() => parseUpdateRegistrationBody([])).toThrow(BadRequestException);
  });
});
