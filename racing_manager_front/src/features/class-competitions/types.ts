export type ClassCompetitionStatus = 'DRAFT' | 'IN_PROGRESS' | 'DONE';

export type ClassStageStatus = 'PENDING' | 'SEEDED' | 'COMPLETED';

export type HeatResultStatus = 'OK' | 'DNS' | 'DNF' | 'DSQ';

export type AddableStageKind = 'PROLOGUE' | 'EIGHTHFINAL' | 'QUARTERFINAL' | 'SEMIFINAL';

export type ClassHeatSlot = {
  position: number;
  registrationId: string;
  firstName: string;
  lastName: string;
  startNumber: number | null;
  registrationStatus: string;
  timeMilliseconds: number | null;
  resultStatus: HeatResultStatus | null;
  laps: Array<{ lapNumber: number; timeMilliseconds: number }>;
};

export type ClassCompetitionStage = {
  stageId: string;
  kind: string;
  label: string | null;
  status: ClassStageStatus;
  sourceStageId: string | null;
  qualifierStatus: 'QQ' | 'NQ' | null;
  heats: Array<{
    heatNumber: number;
    slots: ClassHeatSlot[];
  }>;
  entries: Array<{
    registrationId: string;
    firstName: string;
    lastName: string;
    startNumber: number | null;
    seed: number;
    eliminated: boolean;
  }>;
};

export type ClassCompetitionView = {
  id: string;
  eventId: string;
  formatId: number | null;
  gender: string;
  status: ClassCompetitionStatus;
  stages: ClassCompetitionStage[];
  classification: Array<{
    registrationId: string;
    place: number;
    timeMilliseconds: number | null;
  }>;
};
