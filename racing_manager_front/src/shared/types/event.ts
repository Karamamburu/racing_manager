import type { FeatureItem } from './track';

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
