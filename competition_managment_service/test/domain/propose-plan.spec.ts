import { proposePlan, revisePlan } from '../../src/domain/planning';
import { resolveHeatCount } from '../../src/domain/seeding/heat-sizes';

function ids(plan: { format: { stages: Array<{ id: string }> } }): string[] {
  return plan.format.stages.map((stage) => stage.id);
}

function rationale(
  plan: {
    stages: Array<{
      stageId: string;
      heatCount: number | null;
      heatSizes: number[];
      expectedParticipants: number;
      note: string;
    }>;
  },
  stageId: string,
) {
  const row = plan.stages.find((stage) => stage.stageId === stageId);
  if (!row) {
    throw new Error(`missing rationale for ${stageId}`);
  }
  return row;
}

function heatSpec(plan: ReturnType<typeof proposePlan>, stageId: string) {
  const stage = plan.format.stages.find((item) => item.id === stageId);
  if (!stage || stage.heats.type !== 'HEATS') {
    throw new Error(`missing heats for ${stageId}`);
  }
  return stage.heats;
}

describe('proposePlan', () => {
  it('builds prologue, 4 QF, 2 SF and finals A/B for 24', () => {
    const plan = proposePlan({ participantCount: 24 });
    expect(ids(plan)).toEqual(['prologue', 'qf', 'sf', 'final_a', 'final_b']);
    expect(rationale(plan, 'qf')).toMatchObject({
      expectedParticipants: 24,
      heatCount: 4,
      heatSizes: [6, 6, 6, 6],
    });
    expect(rationale(plan, 'sf')).toMatchObject({
      expectedParticipants: 12,
      heatCount: 2,
      heatSizes: [6, 6],
    });
    expect(rationale(plan, 'final_a')).toMatchObject({
      expectedParticipants: 6,
      heatCount: 1,
      heatSizes: [6],
    });
    expect(rationale(plan, 'final_b')).toMatchObject({
      expectedParticipants: 6,
      heatCount: 1,
      heatSizes: [6],
    });
  });

  it('builds 3 quarterfinals for 17', () => {
    const plan = proposePlan({ participantCount: 17 });
    expect(ids(plan)).toEqual(['prologue', 'qf', 'sf', 'final_a', 'final_b']);
    expect(rationale(plan, 'qf')).toMatchObject({
      expectedParticipants: 17,
      heatCount: 3,
      heatSizes: [6, 6, 5],
    });
    expect(rationale(plan, 'sf').expectedParticipants).toBe(8);
    expect(rationale(plan, 'sf').heatCount).toBe(2);
  });

  it('skips quarterfinals when 12 fit in two semifinals', () => {
    const plan = proposePlan({ participantCount: 12 });
    expect(ids(plan)).toEqual(['prologue', 'sf', 'final_a', 'final_b']);
    expect(rationale(plan, 'sf')).toMatchObject({
      expectedParticipants: 12,
      heatCount: 2,
      heatSizes: [6, 6],
    });
    expect(rationale(plan, 'sf').note).toMatch(/skip quarterfinals/);
  });

  it('uses a single final for 5', () => {
    const plan = proposePlan({ participantCount: 5 });
    expect(ids(plan)).toEqual(['prologue', 'final']);
    expect(rationale(plan, 'final')).toMatchObject({
      expectedParticipants: 5,
      heatCount: 1,
      heatSizes: [5],
    });
  });

  it('adds 1/8 finals for 48', () => {
    const plan = proposePlan({ participantCount: 48 });
    expect(ids(plan)).toEqual(['prologue', 'eighth', 'qf', 'sf', 'final_a', 'final_b']);
    expect(rationale(plan, 'eighth')).toMatchObject({
      expectedParticipants: 48,
      heatCount: 8,
      heatSizes: [6, 6, 6, 6, 6, 6, 6, 6],
    });
    expect(rationale(plan, 'qf')).toMatchObject({
      expectedParticipants: 24,
      heatCount: 4,
    });
  });

  it('proposes 3 quarterfinals as the remaining grid after 17 finishers', () => {
    const tail = proposePlan({ participantCount: 17, includePrologue: false });
    expect(ids(tail)).toEqual(['qf', 'sf', 'final_a', 'final_b']);
    expect(rationale(tail, 'qf')).toMatchObject({
      expectedParticipants: 17,
      heatCount: 3,
      heatSizes: [6, 6, 5],
    });
    const remaining = revisePlan({
      format: proposePlan({ participantCount: 17 }).format,
      participantCount: 17,
      removeStageIds: ['qf'],
    });
    expect(ids(remaining)).toEqual(['prologue', 'sf', 'final_a', 'final_b']);
    expect(rationale(remaining, 'sf').heatCount).toBe(2);
  });
});

describe('revisePlan', () => {
  it('drops quarterfinals and enlarges the two semifinals', () => {
    const proposed = proposePlan({ participantCount: 24 });
    const revised = revisePlan({
      format: proposed.format,
      participantCount: 24,
      removeStageIds: ['qf'],
    });
    expect(ids(revised)).toEqual(['prologue', 'sf', 'final_a', 'final_b']);
    const prologue = revised.format.stages.find((stage) => stage.id === 'prologue');
    expect(prologue?.advancement).toEqual({
      type: 'ROUTES',
      routes: [{ cut: { type: 'TOP_N', n: 24 }, toStageId: 'sf' }],
    });
    const sf = heatSpec(revised, 'sf');
    expect(sf.heatCount).toBe(2);
    expect(sf.heatSize).toBeGreaterThanOrEqual(12);
    expect(resolveHeatCount(24, sf.heatCount, sf.heatSize)).toBe(2);
    expect(rationale(revised, 'sf')).toMatchObject({
      expectedParticipants: 24,
      heatCount: 2,
      heatSizes: [12, 12],
    });
  });

  it('prepends a stage when afterStageId is null and points it at the former first stage', () => {
    const withoutPrologue = revisePlan({
      format: proposePlan({ participantCount: 12 }).format,
      participantCount: 12,
      removeStageIds: ['prologue'],
    });
    expect(ids(withoutPrologue)).toEqual(['sf', 'final_a', 'final_b']);

    const restored = revisePlan({
      format: withoutPrologue.format,
      participantCount: 12,
      addStages: [
        {
          afterStageId: null,
          stage: {
            id: 'prologue',
            kind: 'PROLOGUE',
            label: 'Prologue',
            heats: { type: 'NONE' },
            ranking: { type: 'BY_PLACE' },
            advancement: {
              type: 'ROUTES',
              routes: [{ cut: { type: 'TOP_N', n: 12 }, toStageId: 'ignored' }],
            },
          },
        },
      ],
    });

    expect(ids(restored)).toEqual(['prologue', 'sf', 'final_a', 'final_b']);
    expect(restored.format.stages[0].advancement).toEqual({
      type: 'ROUTES',
      routes: [{ cut: { type: 'TOP_N', n: 12 }, toStageId: 'sf' }],
    });
  });
});
