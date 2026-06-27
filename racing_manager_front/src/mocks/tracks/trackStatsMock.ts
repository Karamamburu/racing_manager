import type { TracksStat } from '../../shared/types/tracks';
import { tracksResponseMock } from './tracksResponseMock';

const totalTracks = tracksResponseMock.length;
const activeTracks = tracksResponseMock.filter((track) => track.status === 'OPEN').length;
const totalDistance = Number(tracksResponseMock.reduce((sum, track) => sum + track.distanceKm, 0).toFixed(1));
const totalRacers = tracksResponseMock.reduce((sum, track) => sum + track.registeredRacers, 0);

const trackStatsMock: TracksStat[] = [
  { key: 'total', title: 'Всего трасс', value: totalTracks },
  { key: 'active', title: 'Активных сейчас', value: activeTracks, suffix: `/ ${totalTracks}` },
  { key: 'distance', title: 'Общая длина трасс', value: totalDistance, suffix: 'км' },
  { key: 'racers', title: 'Участников зарегистрировано', value: totalRacers },
];

export { trackStatsMock };
