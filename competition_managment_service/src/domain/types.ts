export const STAGE_KINDS = [
  'PROLOGUE',
  'EIGHTHFINAL',
  'QUARTERFINAL',
  'SEMIFINAL',
  'FINAL',
  'FINAL_A',
  'FINAL_B',
  'CUSTOM',
] as const;

export type StageKind = (typeof STAGE_KINDS)[number];

export function isSingleHeatFinal(kind: StageKind): boolean {
  return kind === 'FINAL' || kind === 'FINAL_A' || kind === 'FINAL_B';
}

export const RESULT_STATUSES = ['OK', 'DNS', 'DNF', 'DSQ', 'NQ'] as const;

export type ResultStatus = (typeof RESULT_STATUSES)[number];

export type Participant = {
  id: string;
  seed: number;
  meta?: Record<string, unknown>;
};

export type ParticipantResult = {
  participantId: string;
  status: ResultStatus;
  place?: number;
};

export type HeatResult = {
  heatNumber: number;
  results: ParticipantResult[];
};

export type SeedingRule =
  | { type: 'BY_OVERALL_RANK' }
  | { type: 'SNAKE' }
  | { type: 'CROSS' }
  | { type: 'MANUAL' };

export type HeatLayout =
  | { type: 'NONE' }
  | {
      type: 'HEATS';
      heatCount?: number;
      heatSize?: number;
      remainder: 'BALANCED';
      seeding: SeedingRule;
    };

export type RankingRule = { type: 'BY_PLACE' };

export type AdvancementCut =
  | { type: 'TOP_PERCENT'; percent: number }
  | { type: 'TOP_FRACTION'; numerator: number; denominator: number }
  | { type: 'TOP_N'; n: number }
  | { type: 'RANK_RANGE'; from: number; to: number }
  | { type: 'TOP_PER_HEAT'; n: number }
  | { type: 'FIRST_HALF' }
  | { type: 'SECOND_HALF' };

export type AdvancementRoute = {
  cut: AdvancementCut;
  toStageId: string;
};

export type Advancement =
  | { type: 'NONE' }
  | { type: 'ROUTES'; routes: AdvancementRoute[] };

export type StageSpec = {
  id: string;
  kind: StageKind;
  label?: string;
  heats: HeatLayout;
  ranking: RankingRule;
  advancement: Advancement;
};

export type CompetitionFormat = {
  stages: StageSpec[];
};

export type HeatSlot = {
  position: number;
  participant: Participant;
};

export type Heat = {
  heatNumber: number;
  slots: HeatSlot[];
};

export type StartLists = {
  stageId: string;
  heats: Heat[];
};

export type ManualHeatAssignment = {
  heatNumber: number;
  participantIds: string[];
};

export type RankedEntry = {
  participant: Participant;
  heatNumber: number;
  status: ResultStatus;
  place: number | null;
  rank: number;
};

export type AdvancementDestination = {
  toStageId: string;
  participants: Participant[];
  startLists: StartLists | null;
};

export type AdvanceStageResult = {
  stageId: string;
  ranking: RankedEntry[];
  routes: AdvancementDestination[];
  eliminated: Participant[];
};

export type BuildStartListsInput = {
  format: CompetitionFormat;
  stageId: string;
  participants: Participant[];
  manualHeats?: ManualHeatAssignment[];
};

export type AdvanceStageInput = {
  format: CompetitionFormat;
  stageId: string;
  participants: Participant[];
  heatResults: HeatResult[];
  routes?: AdvancementRoute[];
};
