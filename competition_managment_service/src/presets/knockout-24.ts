import { CompetitionFormat } from '../domain/types';

export const KNOCKOUT_24_PRESET_ID = 'knockout-24';

export const knockout24Format: CompetitionFormat = {
  stages: [
    {
      id: 'prologue',
      kind: 'PROLOGUE',
      label: 'Prologue',
      heats: { type: 'NONE' },
      ranking: { type: 'BY_PLACE' },
      advancement: {
        type: 'ROUTES',
        routes: [
          {
            cut: { type: 'TOP_PERCENT', percent: 50 },
            toStageId: 'qf',
          },
        ],
      },
    },
    {
      id: 'qf',
      kind: 'QUARTERFINAL',
      label: '1/4 final',
      heats: {
        type: 'HEATS',
        heatCount: 4,
        heatSize: 6,
        remainder: 'BALANCED',
        seeding: { type: 'SNAKE' },
      },
      ranking: { type: 'BY_PLACE' },
      advancement: {
        type: 'ROUTES',
        routes: [
          {
            cut: { type: 'TOP_FRACTION', numerator: 1, denominator: 2 },
            toStageId: 'sf',
          },
        ],
      },
    },
    {
      id: 'sf',
      kind: 'SEMIFINAL',
      label: '1/2 final',
      heats: {
        type: 'HEATS',
        heatCount: 2,
        heatSize: 6,
        remainder: 'BALANCED',
        seeding: { type: 'SNAKE' },
      },
      ranking: { type: 'BY_PLACE' },
      advancement: {
        type: 'ROUTES',
        routes: [
          {
            cut: { type: 'RANK_RANGE', from: 1, to: 6 },
            toStageId: 'final_a',
          },
          {
            cut: { type: 'RANK_RANGE', from: 7, to: 12 },
            toStageId: 'final_b',
          },
        ],
      },
    },
    {
      id: 'final_a',
      kind: 'FINAL_A',
      label: 'Final A',
      heats: {
        type: 'HEATS',
        heatCount: 1,
        remainder: 'BALANCED',
        seeding: { type: 'BY_OVERALL_RANK' },
      },
      ranking: { type: 'BY_PLACE' },
      advancement: { type: 'NONE' },
    },
    {
      id: 'final_b',
      kind: 'FINAL_B',
      label: 'Final B',
      heats: {
        type: 'HEATS',
        heatCount: 1,
        remainder: 'BALANCED',
        seeding: { type: 'BY_OVERALL_RANK' },
      },
      ranking: { type: 'BY_PLACE' },
      advancement: { type: 'NONE' },
    },
  ],
};

export type CompetitionPreset = {
  id: string;
  label: string;
  description: string;
  format: CompetitionFormat;
};

export const knockout24Preset: CompetitionPreset = {
  id: KNOCKOUT_24_PRESET_ID,
  label: 'Knockout 24',
  description:
    'Prologue (top 50%) → 4×6 quarterfinals (snake, top half) → 2×6 semifinals split into Final A and Final B.',
  format: knockout24Format,
};

export const PRESETS: CompetitionPreset[] = [knockout24Preset];

export function listPresets(): Array<Omit<CompetitionPreset, 'format'>> {
  return PRESETS.map(({ id, label, description }) => ({ id, label, description }));
}

export function getPreset(id: string): CompetitionPreset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
