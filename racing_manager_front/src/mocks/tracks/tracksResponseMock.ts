import type { SportDiscipline, TrackCardItem } from '../../shared/types/tracks';
import aleshkinoImage from '../assets/aleshkino.png';
import lazutinkaImage from '../assets/lazutinka.png';
import planernayaImage from '../assets/planernaya.png';

type TrackServerItem = {
  id: string;
  name: string;
  city: string;
  region: string;
  sports: SportDiscipline[];
  distanceKm: number;
  status: TrackCardItem['status'];
  image: string;
  updatedAt: string;
  manager: string;
  load: number;
  registeredRacers: number;
};

const tracksResponseMock: TrackServerItem[] = [
  {
    id: '1',
    name: 'Алёшкино',
    city: 'Москва',
    region: 'Москва',
    sports: ['Лыжероллеры', 'Велосипед'],
    distanceKm: 7.5,
    status: 'OPEN',
    image: aleshkinoImage,
    updatedAt: '21 июн 2026',
    manager: 'Olivia Brandt',
    load: 74,
    registeredRacers: 46,
  },
  {
    id: '2',
    name: 'Планерная',
    city: 'Химки',
    region: 'Московская область',
    sports: ['Лыжи', 'Велосипед'],
    distanceKm: 12.1,
    status: 'IN_DEV',
    image: planernayaImage,
    updatedAt: '20 июн 2026',
    manager: 'Leo Fischer',
    load: 56,
    registeredRacers: 38,
  },
  {
    id: '3',
    name: 'Лазутинка',
    city: 'Одинцово',
    region: 'Московская область',
    sports: ['Лыжи', 'Лыжероллеры'],
    distanceKm: 4.3,
    status: 'IN_DEV',
    image: lazutinkaImage,
    updatedAt: '18 июн 2026',
    manager: 'Mia Hofer',
    load: 89,
    registeredRacers: 36,
  },
];

export { tracksResponseMock };
