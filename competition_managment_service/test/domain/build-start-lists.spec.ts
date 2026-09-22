import { buildStartLists } from '../../src/domain/build-start-lists';
import { proposePlan } from '../../src/domain/planning';
import { knockout24Format } from '../../src/presets';
import { heatSeeds, makeParticipants } from './helpers';

describe('buildStartLists', () => {
  it('builds a single seed-order list for NONE layout', () => {
    const result = buildStartLists({
      format: knockout24Format,
      stageId: 'prologue',
      participants: makeParticipants(48),
    });
    expect(result.heats).toHaveLength(1);
    expect(result.heats[0].slots).toHaveLength(48);
    expect(result.heats[0].slots[0].participant.seed).toBe(1);
    expect(result.heats[0].slots[47].participant.seed).toBe(48);
  });

  it('builds QF snake heats for 24 athletes', () => {
    const result = buildStartLists({
      format: knockout24Format,
      stageId: 'qf',
      participants: makeParticipants(24),
    });
    expect(heatSeeds(result.heats)).toEqual([
      [1, 8, 9, 16, 17, 24],
      [2, 7, 10, 15, 18, 23],
      [3, 6, 11, 14, 19, 22],
      [4, 5, 12, 13, 20, 21],
    ]);
  });

  it('sizes QF heats to a 20-athlete field', () => {
    const result = buildStartLists({
      format: knockout24Format,
      stageId: 'qf',
      participants: makeParticipants(20),
    });
    expect(result.heats).toHaveLength(4);
    expect(result.heats.map((heat) => heat.slots.length)).toEqual([5, 5, 5, 5]);
  });

  it('puts every finalist into one heat even when they exceed the heat size', () => {
    const format = proposePlan({ participantCount: 24 }).format;
    for (const stageId of ['final_a', 'final_b']) {
      const stage = format.stages.find((item) => item.id === stageId);
      if (stage?.heats.type === 'HEATS') {
        stage.heats.heatCount = 1;
        stage.heats.heatSize = 6;
      }
    }

    const finalA = buildStartLists({
      format,
      stageId: 'final_a',
      participants: makeParticipants(10),
    });
    expect(finalA.heats).toHaveLength(1);
    expect(finalA.heats[0].slots).toHaveLength(10);

    const finalB = buildStartLists({
      format,
      stageId: 'final_b',
      participants: makeParticipants(8),
    });
    expect(finalB.heats).toHaveLength(1);
    expect(finalB.heats[0].slots).toHaveLength(8);
  });

  it('uses fewer QF heats when only 10 athletes remain', () => {
    const result = buildStartLists({
      format: knockout24Format,
      stageId: 'qf',
      participants: makeParticipants(10),
    });
    expect(result.heats).toHaveLength(2);
    expect(result.heats.map((heat) => heat.slots.length)).toEqual([5, 5]);
  });
});
