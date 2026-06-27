import type { MainSlide } from './main';
import type { TracksStat } from './tracks';

export type TrackFeature = {
  key: string;
  title: string;
  value: string;
};

export type TrackEventType = 'Гонка' | 'Контрольная тренировка' | 'Тестовый старт';

export type TrackEventStatus = 'DONE' | 'PLANNED';

export type TrackEventRow = {
  key: string;
  event: string;
  type: TrackEventType;
  date: string;
  participants: number;
  status: TrackEventStatus;
};

export type TrackPageResponse = {
  title: string;
  subtitle: string;
  stats: TracksStat[];
  slides: MainSlide[];
  features: TrackFeature[];
  events: TrackEventRow[];
};
