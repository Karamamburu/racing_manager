import { knockout24Format } from '../../src/presets';
import {
  toCompetitionResponse,
  toDomainParticipants,
  toFormat,
  toHeatResults,
} from '../../src/persistence/mappers';

describe('persistence mappers', () => {
  it('round-trips a CompetitionFormat JSON snapshot', () => {
    const snapshot = JSON.parse(JSON.stringify(knockout24Format)) as unknown;
    const format = toFormat(snapshot);
    expect(format.stages.map((stage) => stage.id)).toEqual([
      'prologue',
      'qf',
      'sf',
      'final_a',
      'final_b',
    ]);
    expect(format.stages[1].heats).toEqual({
      type: 'HEATS',
      heatCount: 4,
      heatSize: 6,
      remainder: 'BALANCED',
      seeding: { type: 'SNAKE' },
    });
  });

  it('maps participant rows to domain participants', () => {
    expect(
      toDomainParticipants([
        { externalId: 'p1', seed: 2, meta: { bib: 12 } },
        { externalId: 'p2', seed: 1 },
      ]),
    ).toEqual([
      { id: 'p1', seed: 2, meta: { bib: 12 } },
      { id: 'p2', seed: 1 },
    ]);
  });

  it('maps stored heats to domain heatResults', () => {
    expect(
      toHeatResults([
        {
          heatNumber: 1,
          slots: [
            {
              position: 1,
              participant: { externalId: 'p1', seed: 1 },
              result: {
                status: 'OK',
                place: 1,
              },
            },
            {
              position: 2,
              participant: { externalId: 'p2', seed: 2 },
              result: null,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        heatNumber: 1,
        results: [
          {
            participantId: 'p1',
            status: 'OK',
            place: 1,
          },
        ],
      },
    ]);
  });

  it('builds a competition response from stored rows', () => {
    const view = toCompetitionResponse({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Sprint',
      status: 'IN_PROGRESS',
      formatSnapshot: knockout24Format,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      participants: [{ externalId: 'p1', seed: 1 }],
      stageEntries: [
        {
          stageId: 'prologue',
          seed: 1,
          eliminated: false,
          participant: { externalId: 'p1', seed: 1 },
        },
      ],
      stageRuns: [
        {
          stageId: 'prologue',
          status: 'SEEDED',
          heats: [
            {
              heatNumber: 1,
              slots: [
                {
                  position: 1,
                  participant: { externalId: 'p1', seed: 1 },
                  result: {
                    status: 'OK',
                    place: 1,
                  },
                },
              ],
            },
          ],
          rankings: [],
        },
      ],
    });

    expect(view.participants[0].id).toBe('p1');
    expect(view.stages[0].heats[0].slots[0].result?.place).toBe(1);
  });
});
