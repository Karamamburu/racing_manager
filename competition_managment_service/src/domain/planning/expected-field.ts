import { AdvancementCut, CompetitionFormat, StageSpec } from '../types';

export function sourceStageIds(format: CompetitionFormat): string[] {
  const targeted = new Set<string>();
  for (const stage of format.stages) {
    if (stage.advancement.type !== 'ROUTES') {
      continue;
    }
    for (const route of stage.advancement.routes) {
      targeted.add(route.toStageId);
    }
  }
  return format.stages
    .filter((stage) => !targeted.has(stage.id))
    .map((stage) => stage.id);
}

export function applyCutToCount(
  cut: AdvancementCut,
  fieldSize: number,
  heatCount = 1,
): number {
  if (fieldSize < 1) {
    return 0;
  }
  switch (cut.type) {
    case 'TOP_PERCENT':
      return Math.min(fieldSize, Math.floor((fieldSize * cut.percent) / 100));
    case 'TOP_FRACTION':
      return Math.min(
        fieldSize,
        Math.floor((fieldSize * cut.numerator) / cut.denominator),
      );
    case 'TOP_N':
      return Math.min(fieldSize, cut.n);
    case 'RANK_RANGE':
      return Math.max(0, Math.min(fieldSize, cut.to) - (cut.from - 1));
    case 'TOP_PER_HEAT':
      return Math.min(fieldSize, Math.max(1, heatCount) * cut.n);
    case 'FIRST_HALF':
      return Math.ceil(fieldSize / 2);
    case 'SECOND_HALF':
      return fieldSize - Math.ceil(fieldSize / 2);
    default:
      return 0;
  }
}

function heatCountHint(stage: StageSpec, fieldSize: number): number {
  if (stage.heats.type !== 'HEATS') {
    return 1;
  }
  if (stage.heats.heatSize != null && fieldSize > 0) {
    return Math.min(fieldSize, Math.max(1, Math.ceil(fieldSize / stage.heats.heatSize)));
  }
  if (stage.heats.heatCount != null) {
    return Math.min(stage.heats.heatCount, Math.max(1, fieldSize));
  }
  return 1;
}

export function expectedFieldByStage(
  format: CompetitionFormat,
  participantCount: number,
): Map<string, number> {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const byId = new Map(format.stages.map((stage) => [stage.id, stage]));

  for (const stage of format.stages) {
    indegree.set(stage.id, 0);
    outgoing.set(stage.id, []);
  }
  for (const stage of format.stages) {
    if (stage.advancement.type !== 'ROUTES') {
      continue;
    }
    for (const route of stage.advancement.routes) {
      outgoing.get(stage.id)?.push(route.toStageId);
      indegree.set(route.toStageId, (indegree.get(route.toStageId) ?? 0) + 1);
    }
  }

  const incoming = new Map<string, number>();
  const queue = format.stages
    .filter((stage) => (indegree.get(stage.id) ?? 0) === 0)
    .map((stage) => stage.id);
  for (const id of queue) {
    incoming.set(id, participantCount);
  }

  while (queue.length > 0) {
    const id = queue.shift() as string;
    const stage = byId.get(id) as StageSpec;
    const fieldSize = incoming.get(id) ?? 0;
    if (stage.advancement.type === 'ROUTES') {
      const heats = heatCountHint(stage, fieldSize);
      for (const route of stage.advancement.routes) {
        const going = applyCutToCount(route.cut, fieldSize, heats);
        incoming.set(route.toStageId, (incoming.get(route.toStageId) ?? 0) + going);
        const nextDegree = (indegree.get(route.toStageId) ?? 1) - 1;
        indegree.set(route.toStageId, nextDegree);
        if (nextDegree === 0) {
          queue.push(route.toStageId);
        }
      }
    }
  }

  for (const stage of format.stages) {
    if (!incoming.has(stage.id)) {
      incoming.set(stage.id, 0);
    }
  }
  return incoming;
}
