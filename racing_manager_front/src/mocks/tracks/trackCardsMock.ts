import type { TrackCardItem } from '../../shared/types/tracks';
import { tracksResponseMock } from './tracksResponseMock';

const trackCardsMock: TrackCardItem[] = [
  ...tracksResponseMock.map((track) => ({
    key: track.id,
    name: track.name,
    city: track.city,
    region: track.region,
    sports: track.sports,
    distanceKm: track.distanceKm,
    status: track.status,
    image: track.image,
  })),
];

export { trackCardsMock };
