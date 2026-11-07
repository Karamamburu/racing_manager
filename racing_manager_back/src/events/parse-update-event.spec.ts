import { BadRequestException } from '@nestjs/common';
import { parseCreateEventBody, parseStartInputs } from './parse-create-event';
import { parseUpdateEventBody } from './parse-update-event';

const validStart = (overrides: Record<string, unknown> = {}) => ({
  purposeType: 'CUP_RACE',
  formatIds: [1, 2],
  lapCount: 5,
  lapLengthMeters: 2000,
  displayName: 'Элита',
  sortOrder: 0,
  ...overrides,
});

const validCreateBody = (starts?: unknown) => ({
  name: 'Кубок',
  sport: 'RUN',
  eventDate: '2026-11-07',
  laps: [{ lapNumber: 1, distanceKm: 10 }],
  formatIds: [1],
  ...(starts === undefined ? {} : { starts }),
});

describe('parseStartInputs', () => {
  it('parses starts and normalizes blank display names to null', () => {
    const starts = parseStartInputs([
      validStart({ id: '11111111-1111-4111-8111-111111111111' }),
      validStart({
        purposeType: 'CONTROL_TRAINING',
        displayName: '   ',
        sortOrder: 1,
      }),
    ]);

    expect(starts).toHaveLength(2);
    expect(starts[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      purposeType: 'CUP_RACE',
      displayName: 'Элита',
      sortOrder: 0,
    });
    expect(starts[1]).toMatchObject({
      purposeType: 'CONTROL_TRAINING',
      displayName: null,
      sortOrder: 1,
    });
    expect(starts[1].id).toBeUndefined();
  });

  it.each([
    ['not an array', 'starts'],
    ['empty', []],
    ['missing starts', undefined],
  ])('rejects %s', (_label, value) => {
    expect(() => parseStartInputs(value)).toThrow(BadRequestException);
  });

  it('rejects non-object items', () => {
    expect(() => parseStartInputs([null])).toThrow(BadRequestException);
    expect(() => parseStartInputs([[]])).toThrow(BadRequestException);
    expect(() => parseStartInputs(['x'])).toThrow(BadRequestException);
  });

  it('rejects invalid purpose types', () => {
    expect(() =>
      parseStartInputs([validStart({ purposeType: 'TRAINING' })]),
    ).toThrow(BadRequestException);
    expect(() =>
      parseStartInputs([validStart({ purposeType: undefined })]),
    ).toThrow(BadRequestException);
  });

  it('rejects empty, duplicate or invalid format ids', () => {
    expect(() => parseStartInputs([validStart({ formatIds: [] })])).toThrow(
      BadRequestException,
    );
    expect(() => parseStartInputs([validStart({ formatIds: [1, 1] })])).toThrow(
      'formatIds must not contain duplicates.',
    );
    expect(() => parseStartInputs([validStart({ formatIds: [0] })])).toThrow(
      BadRequestException,
    );
  });

  it('rejects invalid lap counts and lengths', () => {
    expect(() => parseStartInputs([validStart({ lapCount: 0 })])).toThrow(
      BadRequestException,
    );
    expect(() => parseStartInputs([validStart({ lapCount: 51 })])).toThrow(
      BadRequestException,
    );
    expect(() =>
      parseStartInputs([validStart({ lapLengthMeters: 0 })]),
    ).toThrow(BadRequestException);
    expect(() =>
      parseStartInputs([validStart({ lapLengthMeters: 1.5 })]),
    ).toThrow(BadRequestException);
  });

  it('rejects negative or duplicate sort orders', () => {
    expect(() => parseStartInputs([validStart({ sortOrder: -1 })])).toThrow(
      BadRequestException,
    );
    expect(() =>
      parseStartInputs([validStart(), validStart({ sortOrder: 0 })]),
    ).toThrow('sortOrder must be unique.');
  });

  it('rejects malformed or duplicate start ids', () => {
    expect(() => parseStartInputs([validStart({ id: 'not-a-uuid' })])).toThrow(
      BadRequestException,
    );
    const id = '11111111-1111-4111-8111-111111111111';
    expect(() =>
      parseStartInputs([
        validStart({ id, sortOrder: 0 }),
        validStart({ id, sortOrder: 1 }),
      ]),
    ).toThrow('id must be unique.');
  });

  it('rejects more than 20 starts', () => {
    const starts = Array.from({ length: 21 }, (_, index) =>
      validStart({ sortOrder: index }),
    );
    expect(() => parseStartInputs(starts)).toThrow(BadRequestException);
  });
});

describe('parseCreateEventBody starts compatibility', () => {
  it('keeps legacy body valid without starts during expand', () => {
    const parsed = parseCreateEventBody(validCreateBody());

    expect(parsed.starts).toBeUndefined();
    expect(parsed.laps).toHaveLength(1);
  });

  it('parses starts when the client sends them', () => {
    const parsed = parseCreateEventBody(validCreateBody([validStart()]));

    expect(parsed.starts).toEqual([
      {
        purposeType: 'CUP_RACE',
        formatIds: [1, 2],
        lapCount: 5,
        lapLengthMeters: 2000,
        displayName: 'Элита',
        sortOrder: 0,
      },
    ]);
  });
});

describe('parseUpdateEventBody', () => {
  it('returns no starts when the field is omitted', () => {
    expect(parseUpdateEventBody({ name: 'Новое имя' })).toEqual({});
    expect(parseUpdateEventBody({ starts: undefined })).toEqual({});
  });

  it('rejects an empty desired set', () => {
    expect(() => parseUpdateEventBody({ starts: [] })).toThrow(
      'starts must be a non-empty array.',
    );
  });

  it('rejects null and non-array starts', () => {
    expect(() => parseUpdateEventBody({ starts: null })).toThrow(
      BadRequestException,
    );
    expect(() => parseUpdateEventBody({ starts: 'x' })).toThrow(
      BadRequestException,
    );
  });

  it('parses a present desired set', () => {
    const parsed = parseUpdateEventBody({
      starts: [validStart({ sortOrder: 2 })],
    });

    expect(parsed.starts).toHaveLength(1);
    expect(parsed.starts?.[0].sortOrder).toBe(2);
  });

  it('rejects a non-object body', () => {
    expect(() => parseUpdateEventBody(null)).toThrow(BadRequestException);
    expect(() => parseUpdateEventBody([])).toThrow(BadRequestException);
  });
});
