export type EventTypeCode = 'RACE' | 'TIME_TRIAL';

export type EventStatusCode = 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export type SportCode = 'RUN' | 'SKI' | 'ROLLER_SKI' | 'BIKE';

export type ParticipationFormat = {
  id: number;
  sport: SportCode;
  code: string;
  name: string;
  sortOrder: number;
};

export type EventFormatRef = {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
};

export type EventLap = {
  id: string;
  lapNumber: number;
  distanceKm: number;
};

export type ParticipantLap = {
  lapNumber: number;
  timeMilliseconds: number;
};

export type CreateEventLapRequest = {
  lapNumber: number;
  distanceKm: number;
};

export type StartPurposeType = 'CUP_RACE' | 'CONTROL_TRAINING';

export type RouteColorCode =
  | 'BLUE'
  | 'ORANGE'
  | 'CYAN'
  | 'RED'
  | 'MAGENTA'
  | 'YELLOW';

export type StartInputRequest = {
  id?: string;
  purposeType: StartPurposeType;
  formatIds: number[];
  lapCount: number;
  lapLengthMeters: number;
  displayName: string | null;
  routeColor?: RouteColorCode | null;
  sortOrder: number;
};

export type StartResponse = StartInputRequest & {
  id: string;
  formats?: EventFormatRef[];
  routeColor?: RouteColorCode | null;
  resolvedLabel: string;
  legacyEffectiveDistanceM: number | null;
  displayedDistanceMeters: number;
};

export type CatalogStartResponse = StartResponse & {
  registeredCount: number;
};

export type CreateEventRequest = {
  name: string;
  eventType: EventTypeCode;
  sport: SportCode;
  eventDate: string;
  distanceKm?: number;
  description?: string;
  mapLink?: string;
  registrationOpen?: string;
  registrationClose?: string;
  formatIds?: number[];
  laps?: CreateEventLapRequest[];
  // Required by the shipped API; tightened in the starts editor wave.
  starts?: StartInputRequest[];
};

export type CreatedEventResponse = {
  id: string;
  trackId: string;
  name: string;
  eventType: string;
  sport: string;
  eventDate: string;
  distanceKm: number | null;
  description: string | null;
  mapLink: string | null;
  registrationOpen: string | null;
  registrationClose: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  formats: EventFormatRef[];
  laps: EventLap[];
  starts: StartResponse[];
};

export type RecentEventRow = {
  id: string;
  name: string;
  eventDate: string;
  distanceKm: number | null;
  status: EventStatusCode;
  trackName: string;
  registeredCount: number;
  starts: CatalogStartResponse[];
};

export type EventParticipant = {
  id: string;
  enrollmentId: string;
  startId: string;
  startLabel: string;
  sortOrder: number;
  enrollmentStatus: string;
  userId: string | null;
  fullName: string;
  birthYear: number | null;
  gender: string | null;
  city: string | null;
  district: string | null;
  team: string | null;
  startNumber: number | null;
  finishTimeMs: number | null;
  outcome: string | null;
  place: number | null;
  format: EventFormatRef | null;
  laps: ParticipantLap[];
  status: string;
  isCupEligible: boolean;
  note: string | null;
  registeredAt: string;
  sectionId: string;
};

export type EnrollmentInputRequest = {
  startId: string;
  formatId: number;
};

export type EnrollmentResponse = {
  id: string;
  registrationId: string;
  startId: string;
  formatId: number;
  status: string;
  isCupEligible: boolean;
};

export type ResultOutcome = 'FINISHED' | 'DNS' | 'DNF' | 'DSQ';

export type GenderCode = 'M' | 'F';

export type AgeGroupId =
  | 'AGE_LE_14'
  | 'AGE_15_16'
  | 'AGE_17_18'
  | 'AGE_19_20'
  | 'AGE_21_23'
  | 'AGE_24_40'
  | 'AGE_41_50'
  | 'AGE_51_60'
  | 'AGE_61_PLUS';

export type AgeSectionKind = 'BASE_GROUP' | 'PRESET';

export type AgeSplitPresetId =
  | 'PRESET_JUNIOR_UNDER_24'
  | 'PRESET_MASTERS_41_PLUS'
  | 'PRESET_ALL_GROUPS';

export type AgeSectionRef = {
  id: string;
  kind: AgeSectionKind;
  title: string;
};

export type AgeCategoryRef = {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  groupIds: AgeGroupId[];
};

export type AgeSplitRef = {
  startId: string;
  formatId: number;
  gender: string;
  enabled: boolean;
  /**
   * Ordered age categories of the configuration; empty when the configuration
   * is disabled. Optional here only until the retired `sections` fixture is
   * removed from the service spec.
   */
  categories?: AgeCategoryRef[];
  /**
   * @deprecated predecessor read shape, no longer returned by the API.
   */
  sections?: AgeSectionRef[];
};

export type SetAgeSplitSectionRequest = {
  kind: AgeSectionKind;
  id: string;
};

export type SetAgeSplitRequest = {
  gender: GenderCode;
  startId: string;
  formatId: number;
  enabled: boolean;
  sections: SetAgeSplitSectionRequest[];
};

export type SetAgeCategoryRequest = {
  groupIds: AgeGroupId[];
};

export type SetAgeCategoriesRequest = {
  gender: GenderCode;
  startId: string;
  formatId: number;
  enabled: boolean;
  categories: SetAgeCategoryRequest[];
};

export type CreateRegistrationRequest = {
  firstName?: string;
  lastName?: string;
  gender?: GenderCode;
  birthYear?: number;
  city?: string;
  district?: string;
  team?: string;
  formatId?: number;
  // Required by the shipped API; tightened in the registration UI wave.
  enrollments?: EnrollmentInputRequest[];
};

export type UpdateRegistrationRequest = {
  startNumber?: number;
  enrollments?: EnrollmentInputRequest[];
};

export type UpsertResultRequest = {
  // Required by the shipped API; tightened in the protocol UI wave.
  outcome?: ResultOutcome;
  timeMilliseconds?: number;
  /** Deprecated: per-lap result arrays are rejected by the enrollment route. */
  laps?: ParticipantLap[];
};

export type ResultResponse = {
  id: string;
  enrollmentId: string;
  registrationId: string;
  outcome: string;
  timeMilliseconds: number | null;
  recordedAt: string;
  updatedAt: string;
};

export type RegistrationResponse = {
  id: string;
  eventId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  gender: string;
  birthYear: number;
  city: string | null;
  district: string | null;
  team: string | null;
  formatId: number | null;
  startNumber: number | null;
  status: string;
  note: string | null;
  registeredAt: string;
  updatedAt: string;
  enrollments?: EnrollmentResponse[];
};

export type EventDetails = {
  id: string;
  name: string;
  eventType: string;
  sport: string;
  eventDate: string;
  distanceKm: number | null;
  description: string | null;
  mapLink: string | null;
  registrationOpen: string | null;
  registrationClose: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  track: {
    id: string;
    name: string;
    locationCity: string | null;
    mapLink: string | null;
  };
  createdBy: {
    id: string;
    name: string;
  } | null;
  formats: EventFormatRef[];
  laps: EventLap[];
  starts: StartResponse[];
  registrations: EventParticipant[] | null;
  registeredCount: number;
  finishedCategories: CategoryFinishRef[];
  ageSplits?: AgeSplitRef[];
};

export type CategoryFinishRef = {
  startId: string | null;
  formatId: number | null;
  gender: string;
};

export type EventRaceSummary = {
  routeId: string;
  name: string;
  trackName: string;
  eventDate: string;
  eventType: string;
  status: EventStatusCode;
  registeredCount: number;
};
