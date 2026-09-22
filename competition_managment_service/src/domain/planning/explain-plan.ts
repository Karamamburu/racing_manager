import { balancedHeatSizes, resolveHeatCount } from '../seeding/heat-sizes';
import { CompetitionFormat, StageKind, StageSpec } from '../types';
import { expectedFieldByStage } from './expected-field';
import {
  DEFAULT_MAX_HEAT_SIZE,
  DEFAULT_PREFERRED_HEAT_SIZE,
  ProposePlanInput,
  ProposedPlan,
  StageRationale,
} from './types';

function preferredSize(input?: ProposePlanInput): number {
  return input?.preferredHeatSize ?? DEFAULT_PREFERRED_HEAT_SIZE;
}

function heatRationale(stage: StageSpec, expected: number): {
  heatCount: number | null;
  heatSizes: number[];
} {
  if (stage.heats.type !== 'HEATS' || expected < 1) {
    return { heatCount: null, heatSizes: [] };
  }
  const count = resolveHeatCount(
    expected,
    stage.heats.heatCount,
    stage.heats.heatSize,
  );
  return { heatCount: count, heatSizes: balancedHeatSizes(expected, count) };
}

function hasKind(format: CompetitionFormat, kind: StageKind): boolean {
  return format.stages.some((stage) => stage.kind === kind);
}

function noteForStage(
  stage: StageSpec,
  expected: number,
  preferred: number,
  format: CompetitionFormat,
  heatCount: number | null,
  heatSizes: number[],
): string {
  if (stage.heats.type === 'NONE') {
    return `ranking the full field of ${expected}`;
  }
  if (stage.kind === 'QUARTERFINAL' || stage.kind === 'EIGHTHFINAL') {
    return `n=${expected} > ${preferred * (stage.kind === 'EIGHTHFINAL' ? 4 : 2)}, keep heatSize<=${preferred}`;
  }
  if (stage.kind === 'SEMIFINAL' && !hasKind(format, 'QUARTERFINAL')) {
    return `n=${expected} fits in ${heatCount ?? 2} heats of ${preferred}; skip quarterfinals`;
  }
  if (stage.kind === 'FINAL' && !hasKind(format, 'SEMIFINAL')) {
    return `n=${expected} fits in one heat of ${preferred}`;
  }
  if (heatCount != null && heatSizes.length > 0) {
    return `${heatCount} heats (${heatSizes.join('/')})`;
  }
  return `expected field ${expected}`;
}

export function explainPlan(
  format: CompetitionFormat,
  input: ProposePlanInput,
): ProposedPlan {
  const preferredHeatSize = preferredSize(input);
  const expected = expectedFieldByStage(format, input.participantCount);
  const stages: StageRationale[] = format.stages.map((stage) => {
    const expectedParticipants = expected.get(stage.id) ?? 0;
    const heats = heatRationale(stage, expectedParticipants);
    return {
      stageId: stage.id,
      kind: stage.kind,
      expectedParticipants,
      heatCount: heats.heatCount,
      heatSizes: heats.heatSizes,
      note: noteForStage(
        stage,
        expectedParticipants,
        preferredHeatSize,
        format,
        heats.heatCount,
        heats.heatSizes,
      ),
    };
  });

  return {
    format,
    constraints: {
      participantCount: input.participantCount,
      preferredHeatSize,
      maxHeatSize: input.maxHeatSize ?? DEFAULT_MAX_HEAT_SIZE,
      includePrologue: input.includePrologue ?? true,
      includeFinalB: input.includeFinalB ?? true,
    },
    stages,
  };
}
