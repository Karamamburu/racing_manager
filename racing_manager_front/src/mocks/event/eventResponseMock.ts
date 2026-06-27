import type {
  EventPageResponse,
  EventRegistration,
  EventRegistrationFormValues,
  EventRaceSummary,
} from '../../shared/types/event';
import { tracksResponseMock } from '../tracks/tracksResponseMock';

type EventDetails = {
  id: string;
  trackId: string;
  name: string;
  eventType: 'RACE' | 'TIME_TRIAL';
  sport: 'RUN' | 'SKI' | 'ROLLER_SKI' | 'BIKE';
  eventDate: string;
  distanceKm: string;
  description: string;
  mapLink: string;
  registrationOpen: string;
  registrationClose: string;
  status: 'PLANNED' | 'DONE' | 'CANCELLED';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

const eventDetailsByRouteId: Record<string, EventDetails> = {
  '1_event-1': {
    id: '8c35fd24-6688-44a8-a5af-6ffb74f74a11',
    trackId: '1',
    name: 'Открытый кубок "Алёшкино"',
    eventType: 'RACE',
    sport: 'ROLLER_SKI',
    eventDate: '2026-05-12',
    distanceKm: '15.00',
    description: 'Кубковая гонка с массовым стартом.',
    mapLink: 'https://maps.google.com/?q=55.8522,37.3823',
    registrationOpen: '2026-04-01T09:00:00Z',
    registrationClose: '2026-05-10T18:00:00Z',
    status: 'DONE',
    createdBy: '1209f3f8-6e79-4cb9-8247-98537f6fe6d1',
    createdAt: '2026-03-20T10:14:00Z',
    updatedAt: '2026-05-12T16:32:00Z',
  },
  '1_event-2': {
    id: '9733ec78-5f95-441f-8204-623dc57c1b65',
    trackId: '1',
    name: 'Контрольный старт команд',
    eventType: 'TIME_TRIAL',
    sport: 'BIKE',
    eventDate: '2026-06-02',
    distanceKm: '10.00',
    description: 'Индивидуальный зачет по контрольному времени.',
    mapLink: 'https://nakarte.me/map?lon=37.3823&lat=55.8522&zoom=15&basemap=Esri.WorldTopoMap',
    registrationOpen: '2026-05-10T08:00:00Z',
    registrationClose: '2026-06-01T20:00:00Z',
    status: 'DONE',
    createdBy: '7bba4183-58fa-4fa3-bda4-f149cd50cbe4',
    createdAt: '2026-04-18T09:40:00Z',
    updatedAt: '2026-06-02T12:01:00Z',
  },
  '1_event-3': {
    id: '98ce0fdd-e57f-4e4d-bc6d-7af5d38f8573',
    trackId: '1',
    name: 'Ночной тестовый заезд',
    eventType: 'TIME_TRIAL',
    sport: 'RUN',
    eventDate: '2026-07-10',
    distanceKm: '7.50',
    description: 'Тестовое мероприятие на вечернем освещении.',
    mapLink: 'https://maps.google.com/?q=55.8522,37.3823',
    registrationOpen: '2026-06-20T09:00:00Z',
    registrationClose: '2026-07-09T21:00:00Z',
    status: 'PLANNED',
    createdBy: '92b95a0f-35cd-452e-a8e4-07ef10bc8398',
    createdAt: '2026-06-05T13:00:00Z',
    updatedAt: '2026-06-25T13:00:00Z',
  },
};

const registrationsByRouteId: Record<string, EventRegistration[]> = {
  '1_event-1': [
    {
      startNumber: 'TBD',
      fullName: 'Иванов Алексей Петрович',
      birthYear: 1990,
      wheelType: 'Быстрые',
      team: 'СК Север',
      district: 'САО',
    },
    {
      startNumber: 'TBD',
      fullName: 'Смирнова Анна Викторовна',
      birthYear: 1996,
      wheelType: 'Классика',
      team: 'Fast Rollers',
      district: 'Химки',
    },
    {
      startNumber: 'TBD',
      fullName: 'Петров Дмитрий Сергеевич',
      birthYear: 1988,
      wheelType: 'Медленные',
      team: 'Roll Team 77',
      district: 'Одинцово',
    },
  ],
  '1_event-2': [
    {
      startNumber: 'TBD',
      fullName: 'Кузнецова Мария Андреевна',
      birthYear: 1998,
      wheelType: 'Классика',
      team: 'Вектор',
      district: 'ЗАО',
    },
    {
      startNumber: 'TBD',
      fullName: 'Новиков Егор Павлович',
      birthYear: 1992,
      wheelType: 'Быстрые',
      team: 'Планерная Racing',
      district: 'Химки',
    },
  ],
  '1_event-3': [
    {
      startNumber: 'TBD',
      fullName: 'Федорова Елена Игоревна',
      birthYear: 2001,
      wheelType: 'Медленные',
      team: 'Night Riders',
      district: 'СВАО',
    },
  ],
};

function getEventResponseMockById(routeId: string): EventPageResponse | undefined {
  const event = eventDetailsByRouteId[routeId];
  if (!event) return undefined;
  const registeredUsers = registrationsByRouteId[routeId] ?? [];
  const registrationFormInitial: EventRegistrationFormValues = {
    fullName: '',
    birthYear: 1995,
    wheelType: 'Классика',
    team: '',
    district: '',
  };

  return {
    id: event.id,
    title: event.name,
    subtitle: 'Карточка мероприятия и регистрация участника',
    features: [
      { key: 'id', title: 'Идентификатор события', value: event.id },
      { key: 'track_id', title: 'Идентификатор трассы', value: event.trackId },
      { key: 'name', title: 'Название', value: event.name },
      {
        key: 'event_type',
        title: 'Тип мероприятия',
        value: event.eventType === 'RACE' ? 'Гонка' : 'Раздельный старт',
      },
      {
        key: 'sport',
        title: 'Дисциплина',
        value:
          event.sport === 'RUN'
            ? 'Бег'
            : event.sport === 'SKI'
              ? 'Лыжи'
              : event.sport === 'ROLLER_SKI'
                ? 'Лыжероллеры'
                : 'Велосипед',
      },
      { key: 'event_date', title: 'Дата проведения', value: event.eventDate },
      { key: 'distance_km', title: 'Дистанция, км', value: event.distanceKm },
      { key: 'description', title: 'Краткое описание', value: event.description },
      { key: 'registration_open', title: 'Открытие регистрации', value: event.registrationOpen },
      { key: 'registration_close', title: 'Закрытие регистрации', value: event.registrationClose },
      {
        key: 'status',
        title: 'Статус мероприятия',
        value: event.status === 'DONE' ? 'Завершено' : event.status === 'PLANNED' ? 'Запланировано' : 'Отменено',
      },
      { key: 'created_by', title: 'Создано пользователем', value: event.createdBy },
      { key: 'created_at', title: 'Создано в', value: event.createdAt },
      { key: 'updated_at', title: 'Обновлено в', value: event.updatedAt },
    ],
    descriptionParagraphs: [
      'Все участники обязаны использовать шлем и исправную экипировку. Перед стартом проводится обязательная проверка безопасности.',
      'Формат старта раздельный: участники уходят на дистанцию по стартовым слотам с интервалом в 30 секунд.',
      'На трассе действуют правила приоритета на узких участках, а также обязательный проезд через контрольные точки.',
    ],
    mapLink: event.mapLink,
    registrationFormInitial,
    registeredUsers,
  };
}

function getEventRacesOverviewMock(): EventRaceSummary[] {
  const trackNamesById = Object.fromEntries(tracksResponseMock.map((track) => [track.id, track.name]));

  return Object.entries(eventDetailsByRouteId).map(([routeId, event]) => ({
    routeId,
    name: event.name,
    trackName: trackNamesById[event.trackId] ?? `Трасса ${event.trackId}`,
    eventDate: event.eventDate,
    eventType: event.eventType === 'RACE' ? 'Гонка' : 'Раздельный старт',
    status: event.status,
    registeredCount: (registrationsByRouteId[routeId] ?? []).length,
  }));
}

export { getEventResponseMockById, getEventRacesOverviewMock };
