type SportDiscipline = 'Лыжи' | 'Бег' | 'Лыжероллеры' | 'Велосипед';

type TrackCardItem = {
  key: string;
  name: string;
  city: string;
  region: string;
  sports: SportDiscipline[];
  distanceKm: number;
  status: 'OPEN' | 'MAINTENANCE' | 'IN_DEV';
  image: string;
};

type TrackRow = {
  key: string;
  track: string;
  city: string;
  discipline: SportDiscipline;
  length: string;
  updatedAt: string;
  manager: string;
  load: number;
};

type TracksStat = {
  key: string;
  title: string;
  value: number;
  suffix?: string;
};

type TrackFilterOption = {
  value: string;
  label: string;
};

export type {
  SportDiscipline,
  TrackCardItem,
  TrackRow,
  TracksStat,
  TrackFilterOption,
};