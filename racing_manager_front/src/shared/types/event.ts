import type { FeatureItem } from './track';

export type EventTypeCode = 'RACE' | 'TIME_TRIAL';

export type SportCode = 'RUN' | 'SKI' | 'ROLLER_SKI' | 'BIKE';

export type CreateEventRequest = {
  name: string;
  eventType: EventTypeCode;
  sport: SportCode;
  eventDate: string;
  distanceKm?: number;
  description?: string;
  registrationOpen?: string;
  registrationClose?: string;
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
};

export type RecentEventRow = {
  id: string;
  name: string;
  eventDate: string;
  status: 'PLANNED' | 'DONE' | 'CANCELLED';
  trackName: string;
  registeredCount: number;
};

export type EventParticipant = {
  id: string;
  userId: string;
  fullName: string;
  birthYear: number | null;
  gender: string | null;
  city: string | null;
  district: string | null;
  team: string | null;
  status: string;
  note: string | null;
  registeredAt: string;
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
  registrations: EventParticipant[];
};

export type WheelType = 'Быстрые' | 'Медленные' | 'Классика';

export type EventRegistrationFormValues = {
  fullName: string;
  birthYear: number;
  wheelType: WheelType;
  team: string;
  district: string;
};

export type EventRegistration = EventRegistrationFormValues & {
  startNumber: 'TBD';
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

export type EventPageResponse = {
  id: string;
  title: string;
  subtitle: string;
  features: FeatureItem[];
  descriptionParagraphs: string[];
  mapLink: string;
  registrationFormInitial: EventRegistrationFormValues;
  registeredUsers: EventRegistration[];
};
