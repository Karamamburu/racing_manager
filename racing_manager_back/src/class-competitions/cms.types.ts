export type CmsResultStatus = 'OK' | 'DNS' | 'DNF' | 'DSQ' | 'NQ';

export type CmsAdvancement =
  | { type: 'NONE' }
  | {
      type: 'ROUTES';
      routes: Array<{
        cut: { type: string; n?: number; numerator?: number; denominator?: number };
        toStageId: string;
      }>;
    };

export type CmsStageSpec = {
  id: string;
  kind: string;
  label?: string;
  heats:
    | { type: 'NONE' }
    | {
        type: 'HEATS';
        heatCount?: number;
        heatSize?: number;
        remainder: 'BALANCED';
        seeding: { type: string };
      };
  ranking: { type: 'BY_PLACE' };
  advancement: CmsAdvancement;
};

export type CmsHeatSlot = {
  position: number;
  participantId: string;
  result: { status: CmsResultStatus; place: number | null } | null;
};

export type CmsStageRun = {
  stageId: string;
  status: 'PENDING' | 'SEEDED' | 'COMPLETED';
  entries: Array<{ participantId: string; seed: number; eliminated: boolean }>;
  heats: Array<{ heatNumber: number; slots: CmsHeatSlot[] }>;
  ranking: Array<{
    participantId: string;
    rank: number;
    heatNumber: number;
    status: CmsResultStatus;
    place: number | null;
  }>;
};

export type CmsCompetition = {
  id: string;
  name: string | null;
  status: 'DRAFT' | 'IN_PROGRESS' | 'DONE';
  format: { stages: CmsStageSpec[] };
  participants: Array<{ id: string; seed: number }>;
  stages: CmsStageRun[];
};

export type CmsHeatResult = {
  heatNumber: number;
  results: Array<{
    participantId: string;
    status: 'OK' | 'DNS' | 'DNF' | 'DSQ';
    place?: number;
  }>;
};
