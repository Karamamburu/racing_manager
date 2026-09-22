import { assignHeats, singleHeat } from './seeding/assign-heats';
import { normalizeParticipants } from './participants';
import { BuildStartListsInput, StartLists, isSingleHeatFinal } from './types';
import { findStage, validateFormat } from './validate-format';

export function buildStartLists(input: BuildStartListsInput): StartLists {
  validateFormat(input.format);
  const stage = findStage(input.format, input.stageId);
  const participants = normalizeParticipants(input.participants);

  if (stage.heats.type === 'NONE' || isSingleHeatFinal(stage.kind)) {
    return {
      stageId: stage.id,
      heats: singleHeat(participants),
    };
  }

  return {
    stageId: stage.id,
    heats: assignHeats(participants, stage.heats, input.manualHeats),
  };
}
