export type ClassCompetitionStatus = 'DRAFT' | 'IN_PROGRESS' | 'DONE';

export type ClassStageStatus = 'PENDING' | 'SEEDED' | 'COMPLETED';

export type ClassRaceSectionKind =
  | 'CATEGORY'
  | 'CATEGORY_NUMBER'
  | 'REMAINDER'
  | 'NO_BIRTH_YEAR';

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
  startId: string | null;
  formatId: number | null;
  gender: string;
  sectionId: string;
  sectionKind: ClassRaceSectionKind;
  title: string;
  subtitle: string | null;
  targetGroupIds: string[];
  targetWholeCategory: boolean;
  capturedEnrollmentIds: string[];
  youngestBound: number | null;
  status: ClassCompetitionStatus;
  stages: ClassCompetitionStage[];
  classification: Array<{
    registrationId: string;
    place: number;
    timeMilliseconds: number | null;
  }>;
};
