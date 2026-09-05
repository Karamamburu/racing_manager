import type { TrackFilterOption } from '../../shared/types/tracks';
import { tracksResponseMock } from './tracksResponseMock';

const cityOptionsMock: TrackFilterOption[] = [
  { value: 'all-city', label: 'Все города' },
  ...Array.from(new Set(tracksResponseMock.map((track) => track.city))).map((city) => ({
    value: city.toLowerCase().replace(/\s+/g, '-'),
    label: city,
  })),
];

const sportLabelToValue: Record<string, string> = {
  Лыжи: 'ski',
  Бег: 'run',
  Лыжероллеры: 'roller-ski',
  Велосипед: 'bike',
};

const sportOptionsMock: TrackFilterOption[] = [
  { value: 'all-sports', label: 'Все виды спорта' },
  ...Array.from(new Set(tracksResponseMock.flatMap((track) => track.sports))).map((sport) => ({
    value: sportLabelToValue[sport] ?? sport.toLowerCase(),
    label: sport,
  })),
];

export { cityOptionsMock, sportOptionsMock };
