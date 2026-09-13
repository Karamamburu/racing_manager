export type EventTypeCode = 'RACE' | 'TIME_TRIAL';

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

export type CreateEventRequest = {
  name: string;
  eventType: EventTypeCode;
  sport: SportCode;
  eventDate: string;
  distanceKm?: number;
  description?: string;
  registrationOpen?: string;
  registrationClose?: string;
  formatIds?: number[];
  laps: CreateEventLapRequest[];
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
  registrationOpen: string | null;
  registrationClose: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  formats: EventFormatRef[];
  laps: EventLap[];
};

export type RecentEventRow = {
  id: string;
  name: string;
  eventDate: string;
  distanceKm: number | null;
  status: 'PLANNED' | 'DONE' | 'CANCELLED';
  trackName: string;
  registeredCount: number;
};

export type EventParticipant = {
  id: string;
  userId: string | null;
  fullName: string;
  birthYear: number | null;
  gender: string | null;
  city: string | null;
  district: string | null;
  team: string | null;
  startNumber: number | null;
  finishTimeMs: number | null;
  place: number | null;
  format: EventFormatRef | null;
  laps: ParticipantLap[];
  status: string;
  note: string | null;
  registeredAt: string;
};

export type GenderCode = 'M' | 'F';

export type CreateRegistrationRequest = {
  firstName?: string;
  lastName?: string;
  gender?: GenderCode;
  birthYear?: number;
  city?: string;
  district?: string;
  team?: string;
  formatId?: number;
};

export type UpdateRegistrationRequest = {
  startNumber: number;
};

export type UpsertResultRequest = {
  timeMilliseconds?: number;
  laps?: ParticipantLap[];
};

export type ResultResponse = {
  id: string;
  registrationId: string;
  timeMilliseconds: number;
  recordedAt: string;
  updatedAt: string;
  laps: ParticipantLap[];
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
};

export type EventDetails = {
  id: string;
  name: string;
  eventType: string;
  sport: string;
  eventDate: string;
  distanceKm: number | null;
  description: string | null;
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
  registrations: EventParticipant[];
};

export type EventRaceSummary = {
  routeId: string;
  name: string;
  trackName: string;
  eventDate: string;
  eventType: string;
  status: 'PLANNED' | 'DONE' | 'CANCELLED';
  registeredCount: number;
};
