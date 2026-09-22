import { AdvanceStageResult, Participant, StartLists } from '../domain/types';

export type NextStageWrite = {
  toStageId: string;
  participants: Participant[];
  startLists: StartLists | null;
};

export type AdvancePersistencePlan = {
  eliminatedIds: string[];
  rankings: AdvanceStageResult['ranking'];
  routes: NextStageWrite[];
};

export function advancePersistencePlan(
  result: AdvanceStageResult,
): AdvancePersistencePlan {
  return {
    eliminatedIds: result.eliminated.map((participant) => participant.id),
    rankings: result.ranking,
    routes: result.routes.map((route) => ({
      toStageId: route.toStageId,
      participants: route.participants,
      startLists: route.startLists,
    })),
  };
}
