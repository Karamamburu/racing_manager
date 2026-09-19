import { advanceStage } from '../../src/domain/advance-stage';
import { DomainError } from '../../src/domain/errors';
import {
  CompetitionFormat,
  HeatResult,
  Participant,
  ResultStatus,
} from '../../src/domain/types';
import { knockout24Format } from '../../src/presets';
import { heatSeeds, makeParticipants } from './helpers';

function placedHeat(
  heatNumber: number,
  participants: Participant[],
  statusById: Record<string, ResultStatus> = {},
): HeatResult {
  return {
    heatNumber,
    results: participants.map((participant) => {
      const status = statusById[participant.id] ?? 'OK';
      return {
        participantId: participant.id,
        status,
        ...(status === 'OK' ? { place: participant.seed } : {}),
      };
    }),
  };
}

describe('advanceStage', () => {
  it('takes the top 50% from a 48-athlete prologue in seed order', () => {
    const participants = makeParticipants(48);
    const result = advanceStage({
      format: knockout24Format,
      stageId: 'prologue',
      participants,
      heatResults: [placedHeat(1, participants)],
    });

    const qualified = result.routes[0];
    expect(qualified.toStageId).toBe('qf');
    expect(qualified.participants.map((item) => item.id)).toEqual(
      makeParticipants(24).map((item) => item.id),
    );
    expect(qualified.participants.map((item) => item.seed)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
    expect(heatSeeds(qualified.startLists?.heats ?? [])).toEqual([
      [1, 8, 9, 16, 17, 24],
      [2, 7, 10, 15, 18, 23],
      [3, 6, 11, 14, 19, 22],
      [4, 5, 12, 13, 20, 21],
    ]);
    expect(result.eliminated).toHaveLength(24);
  });

  it('advances the top half of a 24-athlete quarterfinal', () => {
    const participants = makeParticipants(24);
    const startLists = advanceStage({
      format: knockout24Format,
      stageId: 'prologue',
      participants: makeParticipants(48),
      heatResults: [placedHeat(1, makeParticipants(48))],
    }).routes[0].startLists;

    const heatResults: HeatResult[] = (startLists?.heats ?? []).map((heat) =>
      placedHeat(
        heat.heatNumber,
        heat.slots.map((slot) => slot.participant),
      ),
    );

    const result = advanceStage({
      format: knockout24Format,
      stageId: 'qf',
      participants,
      heatResults,
    });

    expect(result.routes[0].toStageId).toBe('sf');
    expect(result.routes[0].participants.map((item) => item.id)).toEqual(
      makeParticipants(12).map((item) => item.id),
    );
    expect(result.eliminated).toHaveLength(12);
  });

  it('splits a 12-athlete semifinal into Final A and Final B', () => {
    const participants = makeParticipants(12);
    const heatResults: HeatResult[] = [
      placedHeat(1, participants.slice(0, 6)),
      placedHeat(2, participants.slice(6)),
    ];

    const result = advanceStage({
      format: knockout24Format,
      stageId: 'sf',
      participants,
      heatResults,
    });

    expect(result.routes.map((route) => route.toStageId)).toEqual([
      'final_a',
      'final_b',
    ]);
    expect(result.routes[0].participants.map((item) => item.id)).toEqual(
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
    );
    expect(result.routes[1].participants.map((item) => item.id)).toEqual(
      ['p7', 'p8', 'p9', 'p10', 'p11', 'p12'],
    );
    expect(result.eliminated).toHaveLength(0);
  });

  it('does not let a DNF athlete occupy an advancement slot', () => {
    const participants = makeParticipants(48);
    const result = advanceStage({
      format: knockout24Format,
      stageId: 'prologue',
      participants,
      heatResults: [placedHeat(1, participants, { p1: 'DNF' })],
    });

    const qualifiedIds = result.routes[0].participants.map((item) => item.id);
    expect(qualifiedIds).toHaveLength(24);
    expect(qualifiedIds).not.toContain('p1');
    expect(qualifiedIds[0]).toBe('p2');
    expect(qualifiedIds[23]).toBe('p25');
    expect(result.eliminated.some((item) => item.id === 'p1')).toBe(true);
  });

  it('advances the top N per heat', () => {
    const format: CompetitionFormat = {
      stages: [
        {
          id: 'qf',
          kind: 'QUARTERFINAL',
          heats: {
            type: 'HEATS',
            heatCount: 4,
            remainder: 'BALANCED',
            seeding: { type: 'SNAKE' },
          },
          ranking: { type: 'BY_PLACE' },
          advancement: {
            type: 'ROUTES',
            routes: [{ cut: { type: 'TOP_PER_HEAT', n: 2 }, toStageId: 'sf' }],
          },
        },
        {
          id: 'sf',
          kind: 'SEMIFINAL',
          heats: { type: 'NONE' },
          ranking: { type: 'BY_PLACE' },
          advancement: { type: 'NONE' },
        },
      ],
    };

    const participants = makeParticipants(24);
    const heatResults: HeatResult[] = [
      placedHeat(1, [participants[0], participants[7], participants[8], participants[15], participants[16], participants[23]]),
      placedHeat(2, [participants[1], participants[6], participants[9], participants[14], participants[17], participants[22]]),
      placedHeat(3, [participants[2], participants[5], participants[10], participants[13], participants[18], participants[21]]),
      placedHeat(4, [participants[3], participants[4], participants[11], participants[12], participants[19], participants[20]]),
    ];

    const result = advanceStage({
      format,
      stageId: 'qf',
      participants,
      heatResults,
    });

    expect(result.routes[0].participants.map((item) => item.id)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
      'p6',
      'p7',
      'p8',
    ]);
  });

  it('throws when a result is missing', () => {
    const participants = makeParticipants(2);
    expect(() =>
      advanceStage({
        format: knockout24Format,
        stageId: 'prologue',
        participants,
        heatResults: [
          {
            heatNumber: 1,
            results: [{ participantId: 'p1', status: 'OK', place: 1 }],
          },
        ],
      }),
    ).toThrow(DomainError);
  });

  it('takes 10 of 20 from prologue by the default 50% cut and sizes QF heats', () => {
    const participants = makeParticipants(20);
    const result = advanceStage({
      format: knockout24Format,
      stageId: 'prologue',
      participants,
      heatResults: [placedHeat(1, participants)],
    });

    expect(result.routes[0].toStageId).toBe('qf');
    expect(result.routes[0].participants).toHaveLength(10);
    expect(result.routes[0].startLists?.heats).toHaveLength(2);
  });

  it('lets the judge skip the quarterfinals after a short prologue', () => {
    const participants = makeParticipants(20);
    const result = advanceStage({
      format: knockout24Format,
      stageId: 'prologue',
      participants,
      heatResults: [placedHeat(1, participants)],
      routes: [{ cut: { type: 'TOP_N', n: 12 }, toStageId: 'sf' }],
    });

    expect(result.routes[0].toStageId).toBe('sf');
    expect(result.routes[0].participants.map((item) => item.id)).toEqual(
      makeParticipants(12).map((item) => item.id),
    );
    expect(result.routes[0].startLists?.heats).toHaveLength(2);
  });

  it('splits a 10-athlete semifinal into Final A and Final B by halves', () => {
    const participants = makeParticipants(10);
    const result = advanceStage({
      format: knockout24Format,
      stageId: 'sf',
      participants,
      heatResults: [
        placedHeat(1, participants.slice(0, 5)),
        placedHeat(2, participants.slice(5)),
      ],
    });

    expect(result.routes[0].participants.map((item) => item.id)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
    ]);
    expect(result.routes[1].participants.map((item) => item.id)).toEqual([
      'p6',
      'p7',
      'p8',
      'p9',
      'p10',
    ]);
  });
});
