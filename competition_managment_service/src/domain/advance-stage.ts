import { applyAdvancement } from './advancement/apply-advancement';
import { buildStartLists } from './build-start-lists';
import { normalizeParticipants, withSeeds } from './participants';
import { rankStage } from './ranking/rank-stage';
import {
  AdvanceStageInput,
  AdvanceStageResult,
  Participant,
} from './types';
import { findStage, validateFormat } from './validate-format';

function toReseededParticipants(entries: { participant: Participant }[]): Participant[] {
  return withSeeds(entries.map((entry) => entry.participant));
}

export function advanceStage(input: AdvanceStageInput): AdvanceStageResult {
  validateFormat(input.format);
  const stage = findStage(input.format, input.stageId);
  const participants = normalizeParticipants(input.participants);
  const ranking = rankStage(participants, input.heatResults, stage.ranking);
  const advanced = applyAdvancement(stage, ranking, participants.length);

  const routes = advanced.routes.map((route) => {
    const nextParticipants = toReseededParticipants(route.entries);
    const nextStage = findStage(input.format, route.toStageId, 'advancement');
    const canBuildStartLists =
      nextStage.heats.type === 'NONE' ||
      (nextStage.heats.type === 'HEATS' && nextStage.heats.seeding.type !== 'MANUAL');

    return {
      toStageId: route.toStageId,
      participants: nextParticipants,
      startLists: canBuildStartLists
        ? buildStartLists({
            format: input.format,
            stageId: route.toStageId,
            participants: nextParticipants,
          })
        : null,
    };
  });

  return {
    stageId: stage.id,
    ranking,
    routes,
    eliminated: advanced.eliminated.map((entry) => entry.participant),
  };
}
