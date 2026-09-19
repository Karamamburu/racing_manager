import { CompetitionFormat } from '../domain/types';

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

export function isTerminalStage(format: CompetitionFormat, stageId: string): boolean {
  const stage = format.stages.find((item) => item.id === stageId);
  return stage?.advancement.type === 'NONE';
}

export function terminalStageIds(format: CompetitionFormat): string[] {
  return format.stages
    .filter((stage) => stage.advancement.type === 'NONE')
    .map((stage) => stage.id);
}
