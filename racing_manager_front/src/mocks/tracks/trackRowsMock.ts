import type { TrackRow } from '../../shared/types/tracks';
import { tracksResponseMock } from './tracksResponseMock';

const trackRowsMock: TrackRow[] = [
  ...tracksResponseMock.map((track) => ({
    key: track.id,
    track: track.name,
    city: track.city,
    discipline: track.sports[0] ?? 'Лыжероллеры',
    length: `${track.distanceKm} км`,
    updatedAt: track.updatedAt,
    manager: track.manager,
    load: track.load,
  })),
];

export { trackRowsMock };
