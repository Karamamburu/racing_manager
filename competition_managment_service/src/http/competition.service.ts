import { Injectable } from '@nestjs/common';
import { advanceStage } from '../domain/advance-stage';
import { DomainError, ErrorCodes } from '../domain/errors';
import { buildStartLists } from '../domain/build-start-lists';
import { validateFormat } from '../domain/validate-format';
import {
  AdvanceStageInput,
  BuildStartListsInput,
  CompetitionFormat,
} from '../domain/types';
import { getPreset, listPresets } from '../presets';

@Injectable()
export class CompetitionService {
  listPresets() {
    return listPresets();
  }

  getPreset(id: string) {
    const preset = getPreset(id);
    if (!preset) {
      throw new DomainError(
        ErrorCodes.PRESET_NOT_FOUND,
        `Preset "${id}" was not found.`,
        'id',
      );
    }
    return preset;
  }

  validate(format: CompetitionFormat) {
    validateFormat(format);
    return { valid: true, format };
  }

  startLists(input: BuildStartListsInput) {
    return buildStartLists(input);
  }

  advance(input: AdvanceStageInput) {
    return advanceStage(input);
  }
}
