import { advanceStage } from '../../src/domain/advance-stage';
import { CompetitionFormat } from '../../src/domain/types';
import { advancePersistencePlan } from '../../src/persistence/advance-plan';

const miniFormat: CompetitionFormat = {
  stages: [
    {
      id: 'prologue',
      kind: 'PROLOGUE',
      heats: { type: 'NONE' },
      ranking: { type: 'BY_TIME' },
      advancement: {
        type: 'ROUTES',
        routes: [
          {
            cut: { type: 'TOP_PERCENT', percent: 50 },
            toStageId: 'qf',
          },
        ],
      },
    },
    {
      id: 'qf',
      kind: 'QUARTERFINAL',
      heats: { type: 'NONE' },
      ranking: { type: 'BY_TIME' },
      advancement: { type: 'NONE' },
    },
  ],
};

describe('advancePersistencePlan', () => {
  it('keeps the two prologue qualifiers for the next stage', () => {
    const participants = [
      { id: 'p1', seed: 1 },
      { id: 'p2', seed: 2 },
      { id: 'p3', seed: 3 },
      { id: 'p4', seed: 4 },
    ];
    const result = advanceStage({
      format: miniFormat,
      stageId: 'prologue',
      participants,
      heatResults: [
        {
          heatNumber: 1,
          results: participants.map((participant) => ({
            participantId: participant.id,
            status: 'OK' as const,
            timeMilliseconds: participant.seed * 1000,
          })),
        },
      ],
    });

    const plan = advancePersistencePlan(result);
    expect(plan.routes).toHaveLength(1);
    expect(plan.routes[0].toStageId).toBe('qf');
    expect(plan.routes[0].participants.map((item) => item.id)).toEqual(['p1', 'p2']);
    expect(plan.eliminatedIds).toEqual(['p3', 'p4']);
  });
});
