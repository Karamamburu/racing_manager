import type { MainDashboardResponse } from '../../shared/types/main';
import { getEventRacesOverviewMock } from '../event';
import aleshkinoImage from '../assets/aleshkino.png';
import lazutinkaImage from '../assets/lazutinka.png';
import planernayaImage from '../assets/planernaya.png';

const mainResponseMock: MainDashboardResponse = {
  slides: [
    {
      key: 'winter-2026',
      title: 'Зимние соревнования 2026',
      subtitle: 'Подготовка и регистрация команд открыта до 15 января.',
      image: aleshkinoImage,
    },
    {
      key: 'new-tracks',
      title: 'Новые трассы сезона',
      subtitle: 'Добавлены 4 новых маршрута с уровнем сложности Expert.',
      image: lazutinkaImage,
    },
    {
      key: 'regional-cup',
      title: 'Кубок региона',
      subtitle: 'Актуальные результаты и онлайн-обновление очков участников.',
      image: planernayaImage,
    },
  ],
  stats: [
    {
      key: 'upcoming-races',
      title: 'Ближайшие гонки',
      value: 8,
      description: 'Регистрации открыты, 2 гонки почти заполнены.',
    },
    {
      key: 'active-tracks',
      title: 'Активные трассы',
      value: 14,
      description: '10 трасс доступны круглый год, 4 сезонные.',
    },
    {
      key: 'cup-seasons',
      title: 'Кубковые сезоны',
      value: 3,
      suffix: 'в работе',
      description: 'Сводка по вашему участию обновляется после каждого старта.',
      actionLabel: 'Посмотреть мой прогресс',
    },
  ],
  events: getEventRacesOverviewMock()
    .filter((event) => event.status !== 'CANCELLED')
    .map((event) => ({
      key: event.routeId,
      event: event.name,
      date: event.eventDate,
      status: event.status === 'DONE' ? 'DONE' : 'PLANNED',
      track: event.trackName,
      registeredCount: event.registeredCount,
    })),
};

export { mainResponseMock };
