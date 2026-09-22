import { CompetitionFormat, StageKind } from '../types';

export const DEFAULT_PREFERRED_HEAT_SIZE = 6;
export const DEFAULT_MAX_HEAT_SIZE = 8;

export type ProposePlanInput = {
  participantCount: number;
  preferredHeatSize?: number;
  maxHeatSize?: number;
  includePrologue?: boolean;
  includeFinalB?: boolean;
};

export type StageRationale = {
  stageId: string;
  kind: StageKind;
  expectedParticipants: number;
  heatCount: number | null;
  heatSizes: number[];
  note: string;
};

export type ProposedPlan = {
  format: CompetitionFormat;
  constraints: {
    participantCount: number;
    preferredHeatSize: number;
    maxHeatSize: number;
    includePrologue: boolean;
    includeFinalB: boolean;
  };
  stages: StageRationale[];
};

export type AddStageOp = {
  afterStageId: string;
  stage: import('../types').StageSpec;
};

export type PatchHeatsOp = {
  stageId: string;
  heatSize?: number;
  heatCount?: number;
};

export type RevisePlanInput = {
  format: CompetitionFormat;
  participantCount: number;
  removeStageIds?: string[];
  addStages?: AddStageOp[];
  patchHeats?: PatchHeatsOp[];
  preferredHeatSize?: number;
  maxHeatSize?: number;
  includePrologue?: boolean;
  includeFinalB?: boolean;
};
