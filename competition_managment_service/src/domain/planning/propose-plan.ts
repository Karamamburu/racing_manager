import { DomainError, ErrorCodes } from '../errors';
import { SeedingRule, StageKind, StageSpec } from '../types';
import { explainPlan } from './explain-plan';
import {
  DEFAULT_MAX_HEAT_SIZE,
  DEFAULT_PREFERRED_HEAT_SIZE,
  ProposePlanInput,
  ProposedPlan,
} from './types';
import { validateFormat } from '../validate-format';

type HeatCountMode = 'field' | 'two' | 'one';

type KnockoutRound = {
  id: string;
  kind: StageKind;
  label: string;
  heatCountMode: HeatCountMode;
  seeding: SeedingRule;
};

function resolveConstraints(input: ProposePlanInput): {
  participantCount: number;
  preferredHeatSize: number;
  maxHeatSize: number;
  includePrologue: boolean;
  includeFinalB: boolean;
} {
  if (!Number.isInteger(input.participantCount) || input.participantCount < 1) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'participantCount must be an integer >= 1.',
      'participantCount',
    );
  }
  const preferredHeatSize = input.preferredHeatSize ?? DEFAULT_PREFERRED_HEAT_SIZE;
  const maxHeatSize = input.maxHeatSize ?? DEFAULT_MAX_HEAT_SIZE;
  if (!Number.isInteger(preferredHeatSize) || preferredHeatSize < 1) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'preferredHeatSize must be an integer >= 1.',
      'preferredHeatSize',
    );
  }
  if (!Number.isInteger(maxHeatSize) || maxHeatSize < 1) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'maxHeatSize must be an integer >= 1.',
      'maxHeatSize',
    );
  }
  if (preferredHeatSize > maxHeatSize) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'preferredHeatSize must be <= maxHeatSize.',
      'preferredHeatSize',
    );
  }
  return {
    participantCount: input.participantCount,
    preferredHeatSize,
    maxHeatSize,
    includePrologue: input.includePrologue ?? true,
    includeFinalB: input.includeFinalB ?? true,
  };
}

function knockoutRounds(
  n: number,
  preferred: number,
  includeFinalB: boolean,
): KnockoutRound[] {
  if (n <= preferred) {
    return [
      {
        id: 'final',
        kind: 'FINAL',
        label: 'Final',
        heatCountMode: 'one',
        seeding: { type: 'BY_OVERALL_RANK' },
      },
    ];
  }

  const rounds: KnockoutRound[] = [
    {
      id: 'sf',
      kind: 'SEMIFINAL',
      label: '1/2 final',
      heatCountMode: 'two',
      seeding: { type: 'SNAKE' },
    },
  ];

  if (includeFinalB) {
    rounds.push(
      {
        id: 'final_a',
        kind: 'FINAL_A',
        label: 'Final A',
        heatCountMode: 'one',
        seeding: { type: 'BY_OVERALL_RANK' },
      },
      {
        id: 'final_b',
        kind: 'FINAL_B',
        label: 'Final B',
        heatCountMode: 'one',
        seeding: { type: 'BY_OVERALL_RANK' },
      },
    );
  } else {
    rounds.push({
      id: 'final',
      kind: 'FINAL',
      label: 'Final',
      heatCountMode: 'one',
      seeding: { type: 'BY_OVERALL_RANK' },
    });
  }

  if (n > 2 * preferred) {
    rounds.unshift({
      id: 'qf',
      kind: 'QUARTERFINAL',
      label: '1/4 final',
      heatCountMode: 'field',
      seeding: { type: 'SNAKE' },
    });
  }
  if (n > 4 * preferred) {
    rounds.unshift({
      id: 'eighth',
      kind: 'EIGHTHFINAL',
      label: '1/8 final',
      heatCountMode: 'field',
      seeding: { type: 'SNAKE' },
    });
  }

  return rounds;
}

function heatCountFor(mode: HeatCountMode, expected: number, preferred: number): number {
  if (mode === 'one') {
    return 1;
  }
  if (mode === 'two') {
    return 2;
  }
  return Math.max(1, Math.ceil(Math.max(1, expected) / preferred));
}

function capacityFor(mode: HeatCountMode, expected: number, preferred: number): number {
  return heatCountFor(mode, expected, preferred) * preferred;
}

function heatsFor(
  expected: number,
  preferred: number,
  mode: HeatCountMode,
  seeding: SeedingRule,
): StageSpec['heats'] {
  return {
    type: 'HEATS',
    heatCount: heatCountFor(mode, expected, preferred),
    heatSize: preferred,
    remainder: 'BALANCED',
    seeding,
  };
}

function sfExpectedOf(rounds: KnockoutRound[], expected: number[], fallback: number): number {
  const index = rounds.findIndex((item) => item.id === 'sf');
  return index >= 0 ? (expected[index] ?? fallback) : fallback;
}

function roundExpected(rounds: KnockoutRound[], startCount: number): number[] {
  const expected: number[] = [];
  let current = startCount;
  for (const round of rounds) {
    if (round.kind === 'FINAL_B') {
      const sfExpected = sfExpectedOf(rounds, expected, current);
      expected.push(sfExpected - Math.ceil(sfExpected / 2));
      continue;
    }
    if (round.kind === 'FINAL_A' || (round.kind === 'FINAL' && rounds.some((item) => item.id === 'sf'))) {
      expected.push(Math.ceil(sfExpectedOf(rounds, expected, current) / 2));
      continue;
    }
    expected.push(current);
    if (round.kind === 'EIGHTHFINAL' || round.kind === 'QUARTERFINAL') {
      current = Math.floor(current / 2);
    } else if (round.kind === 'SEMIFINAL') {
      current = Math.ceil(current / 2);
    }
  }
  return expected;
}

function wireKnockout(
  rounds: KnockoutRound[],
  expected: number[],
  preferred: number,
): StageSpec[] {
  const includeB = rounds.some((round) => round.id === 'final_b');
  return rounds.map((round, index) => {
    const stage: StageSpec = {
      id: round.id,
      kind: round.kind,
      label: round.label,
      heats: heatsFor(expected[index] ?? 1, preferred, round.heatCountMode, round.seeding),
      ranking: { type: 'BY_PLACE' },
      advancement: { type: 'NONE' },
    };

    if (round.id === 'eighth') {
      stage.advancement = {
        type: 'ROUTES',
        routes: [{ cut: { type: 'TOP_FRACTION', numerator: 1, denominator: 2 }, toStageId: 'qf' }],
      };
    } else if (round.id === 'qf') {
      stage.advancement = {
        type: 'ROUTES',
        routes: [{ cut: { type: 'TOP_FRACTION', numerator: 1, denominator: 2 }, toStageId: 'sf' }],
      };
    } else if (round.id === 'sf') {
      if (includeB) {
        stage.advancement = {
          type: 'ROUTES',
          routes: [
            { cut: { type: 'FIRST_HALF' }, toStageId: 'final_a' },
            { cut: { type: 'SECOND_HALF' }, toStageId: 'final_b' },
          ],
        };
      } else {
        stage.advancement = {
          type: 'ROUTES',
          routes: [{ cut: { type: 'FIRST_HALF' }, toStageId: 'final' }],
        };
      }
    }

    return stage;
  });
}

export function proposePlan(input: ProposePlanInput): ProposedPlan {
  const constraints = resolveConstraints(input);
  const { participantCount, preferredHeatSize, includePrologue, includeFinalB } = constraints;
  const rounds = knockoutRounds(participantCount, preferredHeatSize, includeFinalB);
  const first = rounds[0];
  const firstCapacity = capacityFor(first.heatCountMode, participantCount, preferredHeatSize);
  const intoKnockout = Math.min(participantCount, firstCapacity);
  const expected = roundExpected(rounds, intoKnockout);
  const knockout = wireKnockout(rounds, expected, preferredHeatSize);

  const stages: StageSpec[] = [];
  if (includePrologue) {
    stages.push({
      id: 'prologue',
      kind: 'PROLOGUE',
      label: 'Prologue',
      heats: { type: 'NONE' },
      ranking: { type: 'BY_PLACE' },
      advancement: {
        type: 'ROUTES',
        routes: [{ cut: { type: 'TOP_N', n: intoKnockout }, toStageId: first.id }],
      },
    });
  }
  stages.push(...knockout);

  const format = { stages };
  validateFormat(format);
  return explainPlan(format, {
    participantCount,
    preferredHeatSize,
    maxHeatSize: constraints.maxHeatSize,
    includePrologue,
    includeFinalB,
  });
}

export function attachProposedTail(
  currentFormat: { stages: StageSpec[] },
  lockedStageIds: Set<string>,
  fromStageId: string,
  tail: { stages: StageSpec[] },
  advanceCount: number,
): { stages: StageSpec[] } {
  if (!lockedStageIds.has(fromStageId)) {
    throw new DomainError(
      ErrorCodes.STAGE_NOT_FOUND,
      `Stage "${fromStageId}" is not locked and cannot receive a proposed tail.`,
      'stageId',
    );
  }
  const first = tail.stages[0];
  if (!first) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'Proposed tail must contain at least one stage.',
      'format.stages',
    );
  }
  const locked = currentFormat.stages.filter((stage) => lockedStageIds.has(stage.id));
  const lockedIds = new Set(locked.map((stage) => stage.id));
  for (const stage of tail.stages) {
    if (lockedIds.has(stage.id)) {
      throw new DomainError(
        ErrorCodes.FORMAT_INVALID,
        `Proposed stage "${stage.id}" collides with a stage that already started.`,
        'format.stages',
      );
    }
  }

  const n = Math.max(1, advanceCount);
  const stages = [
    ...locked.map((stage) =>
      stage.id === fromStageId
        ? {
            ...stage,
            advancement: {
              type: 'ROUTES' as const,
              routes: [{ cut: { type: 'TOP_N' as const, n }, toStageId: first.id }],
            },
          }
        : stage,
    ),
    ...tail.stages,
  ];
  const format = { stages };
  validateFormat(format);
  return format;
}
