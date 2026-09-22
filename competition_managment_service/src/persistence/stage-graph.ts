import { sourceStageIds as domainSourceStageIds } from '../domain/planning';
import { CompetitionFormat } from '../domain/types';

export function sourceStageIds(format: CompetitionFormat): string[] {
  return domainSourceStageIds(format);
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
