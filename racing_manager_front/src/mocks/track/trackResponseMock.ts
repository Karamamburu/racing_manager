import type { TrackPageResponse } from '../../shared/types/track';
import aleshkinoImage from '../assets/aleshkino.png';
import lazutinkaImage from '../assets/lazutinka.png';
import planernayaImage from '../assets/planernaya.png';

const trackResponseMockById: Record<string, TrackPageResponse> = {
  '1': {
    title: 'Трасса "Алёшкино"',
    subtitle: 'Актуальные показатели, инфраструктура и календарь мероприятий',
    stats: [
      { key: 'completed-races', title: 'Проведено гонок', value: 24 },
      { key: 'total-distance', title: 'Общая длина дистанций', value: 78.4, suffix: 'км' },
      { key: 'participants', title: 'Участников за сезон', value: 932 },
      { key: 'records', title: 'Зафиксировано рекордов', value: 11 },
    ],
    slides: [
      {
        key: 'track-news',
        title: 'Новости трассы',
        subtitle: 'Обновления состояния покрытия и расписания стартов.',
        image: aleshkinoImage,
      },
      {
        key: 'race-announcement',
        title: 'Ближайшие старты',
        subtitle: 'Регистрация на ближайшую гонку откроется в понедельник.',
        image: aleshkinoImage,
      },
      {
        key: 'training-camp',
        title: 'Учебно-тренировочные сборы',
        subtitle: 'Серия контрольных тренировок для новичков и команд.',
        image: aleshkinoImage,
      },
    ],
    features: [
      { key: 'surface', title: 'Покрытие', value: 'Асфальт и утрамбованный грунт' },
      { key: 'elevation', title: 'Перепад высот', value: '52 м на полном круге' },
      { key: 'lighting', title: 'Освещение', value: 'Освещена до 23:00' },
      { key: 'parking', title: 'Парковка', value: 'На 180 мест, бесплатная' },
      { key: 'service-zone', title: 'Сервис-зона', value: 'Переодевалки, душ, прокат' },
      { key: 'safety', title: 'Безопасность', value: 'Пункт медпомощи и маршалы на трассе' },
    ],
    events: [
      {
        key: 'event-1',
        event: 'Открытый кубок "Алёшкино"',
        type: 'Гонка',
        date: '2026-05-12',
        participants: 128,
        status: 'DONE',
      },
      {
        key: 'event-2',
        event: 'Контрольный старт команд',
        type: 'Контрольная тренировка',
        date: '2026-06-02',
        participants: 76,
        status: 'DONE',
      },
      {
        key: 'event-3',
        event: 'Ночной тестовый заезд',
        type: 'Тестовый старт',
        date: '2026-07-10',
        participants: 42,
        status: 'PLANNED',
      },
      {
        key: 'event-4',
        event: 'Летний спринт',
        type: 'Гонка',
        date: '2026-08-03',
        participants: 160,
        status: 'PLANNED',
      },
    ],
  },
  '2': {
    title: 'Трасса "Планерная"',
    subtitle: 'Статистика загрузки, особенности рельефа и календарь стартов',
    stats: [
      { key: 'completed-races', title: 'Проведено гонок', value: 16 },
      { key: 'total-distance', title: 'Общая длина дистанций', value: 64.2, suffix: 'км' },
      { key: 'participants', title: 'Участников за сезон', value: 684 },
      { key: 'records', title: 'Зафиксировано рекордов', value: 6 },
    ],
    slides: [
      {
        key: 'planernaya-news',
        title: 'Обновление маршрута',
        subtitle: 'Участок 3.2 км временно перенесен на новый круг.',
        image: planernayaImage,
      },
      {
        key: 'planernaya-races',
        title: 'Осенний календарь стартов',
        subtitle: 'Открыта предварительная регистрация для клубов.',
        image: planernayaImage,
      },
      {
        key: 'planernaya-training',
        title: 'Тренировочные заезды',
        subtitle: 'Еженедельные контрольные тренировки по субботам.',
        image: planernayaImage,
      },
    ],
    features: [
      { key: 'surface', title: 'Покрытие', value: 'Асфальт, щебень' },
      { key: 'elevation', title: 'Перепад высот', value: '71 м' },
      { key: 'lighting', title: 'Освещение', value: 'Основной круг освещен до 22:30' },
      { key: 'parking', title: 'Парковка', value: 'На 120 мест' },
      { key: 'service-zone', title: 'Сервис-зона', value: 'Прокат, техподдержка, кафе' },
      { key: 'safety', title: 'Безопасность', value: 'Пост медпомощи на старте' },
    ],
    events: [
      {
        key: 'event-1',
        event: 'Планерная XC',
        type: 'Гонка',
        date: '2026-04-19',
        participants: 102,
        status: 'DONE',
      },
      {
        key: 'event-2',
        event: 'Контрольная тренировка юниоров',
        type: 'Контрольная тренировка',
        date: '2026-06-15',
        participants: 58,
        status: 'DONE',
      },
      {
        key: 'event-3',
        event: 'Тестовый старт по новому кругу',
        type: 'Тестовый старт',
        date: '2026-07-28',
        participants: 40,
        status: 'PLANNED',
      },
    ],
  },
  '3': {
    title: 'Трасса "Лазутинка"',
    subtitle: 'Паспорт трассы, ключевые параметры и ближайшие мероприятия',
    stats: [
      { key: 'completed-races', title: 'Проведено гонок', value: 19 },
      { key: 'total-distance', title: 'Общая длина дистанций', value: 58.9, suffix: 'км' },
      { key: 'participants', title: 'Участников за сезон', value: 743 },
      { key: 'records', title: 'Зафиксировано рекордов', value: 9 },
    ],
    slides: [
      {
        key: 'lazutinka-news',
        title: 'Подготовка к зимнему циклу',
        subtitle: 'Трасса проходит сезонное обслуживание и разметку.',
        image: lazutinkaImage,
      },
      {
        key: 'lazutinka-race',
        title: 'Кубковый этап',
        subtitle: 'Заявки команд принимаются до 5 сентября.',
        image: lazutinkaImage,
      },
      {
        key: 'lazutinka-train',
        title: 'Открытые тренировки',
        subtitle: 'Свободные слоты для индивидуальных спортсменов.',
        image: lazutinkaImage,
      },
    ],
    features: [
      { key: 'surface', title: 'Покрытие', value: 'Лесная тропа, асфальтированные петли' },
      { key: 'elevation', title: 'Перепад высот', value: '47 м' },
      { key: 'lighting', title: 'Освещение', value: 'Освещены тренировочные секции' },
      { key: 'parking', title: 'Парковка', value: 'На 90 мест' },
      { key: 'service-zone', title: 'Сервис-зона', value: 'Прокат и зона разминки' },
      { key: 'safety', title: 'Безопасность', value: 'Патруль на основных поворотах' },
    ],
    events: [
      {
        key: 'event-1',
        event: 'Лазутинка Trail',
        type: 'Гонка',
        date: '2026-03-22',
        participants: 110,
        status: 'DONE',
      },
      {
        key: 'event-2',
        event: 'Контрольная тренировка клубов',
        type: 'Контрольная тренировка',
        date: '2026-05-30',
        participants: 61,
        status: 'DONE',
      },
      {
        key: 'event-3',
        event: 'Тестовый вечерний старт',
        type: 'Тестовый старт',
        date: '2026-08-12',
        participants: 44,
        status: 'PLANNED',
      },
    ],
  },
};

const getTrackResponseMockById = (id: string) => trackResponseMockById[id];

export { getTrackResponseMockById, trackResponseMockById };
