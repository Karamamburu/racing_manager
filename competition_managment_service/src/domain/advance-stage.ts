import { applyAdvancement } from './advancement/apply-advancement';
import { buildStartLists } from './build-start-lists';
import { normalizeParticipants, withSeeds } from './participants';
import { rankStage } from './ranking/rank-stage';
import {
  AdvanceStageInput,
  AdvanceStageResult,
  AdvancementRoute,
  Participant,
} from './types';
import { findStage, validateFormat } from './validate-format';

function toReseededParticipants(entries: { participant: Participant }[]): Participant[] {
  return withSeeds(entries.map((entry) => entry.participant));
}

function resolveRoutes(input: AdvanceStageInput): AdvancementRoute[] {
  const stage = findStage(input.format, input.stageId);
  if (input.routes) {
    for (const route of input.routes) {
      findStage(input.format, route.toStageId, 'routes');
    }
    return input.routes;
  }
  if (stage.advancement.type === 'ROUTES') {
    return stage.advancement.routes;
  }
  return [];
}

export function advanceStage(input: AdvanceStageInput): AdvanceStageResult {
  validateFormat(input.format);
  const stage = findStage(input.format, input.stageId);
  const participants = normalizeParticipants(input.participants);
  const ranking = rankStage(participants, input.heatResults);
  const advanced = applyAdvancement(
    resolveRoutes(input),
    ranking,
    participants.length,
  );

  const routes = advanced.routes.map((route) => {
    const nextParticipants = toReseededParticipants(route.entries);
    const nextStage = findStage(input.format, route.toStageId, 'advancement');
    const canBuildStartLists =
      nextStage.heats.type === 'NONE' ||
      (nextStage.heats.type === 'HEATS' && nextStage.heats.seeding.type !== 'MANUAL');

    return {
      toStageId: route.toStageId,
      participants: nextParticipants,
      startLists:
        canBuildStartLists && nextParticipants.length > 0
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
