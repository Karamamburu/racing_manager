import { Button, Card, Result, Skeleton, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useParams } from 'react-router-dom';
import { useEventDetailsQuery } from '../../features/events/useEventDetailsQuery';
import { FeaturesCard } from '../../shared/components';
import { AppShell } from '../../shared/layout';
import type { EventParticipant } from '../../shared/types/event';
import type { FeatureItem } from '../../shared/types/track';

const eventTypeLabels: Record<string, string> = {
  RACE: 'Гонка',
  TIME_TRIAL: 'Контрольная тренировка',
};

const sportLabels: Record<string, string> = {
  SKI: 'Лыжи',
  RUN: 'Бег',
  ROLLER_SKI: 'Лыжероллеры',
  BIKE: 'Велосипед',
};

const statusLabels: Record<string, { text: string; color: string }> = {
  PLANNED: { text: 'Запланировано', color: 'blue' },
  DONE: { text: 'Завершено', color: 'green' },
  CANCELLED: { text: 'Отменено', color: 'red' },
};

const registrationStatusLabels: Record<string, { text: string; color: string }> = {
  PENDING: { text: 'Ожидает', color: 'gold' },
  CONFIRMED: { text: 'Подтверждена', color: 'green' },
  CANCELLED: { text: 'Отменена', color: 'default' },
};

const genderLabels: Record<string, string> = {
  M: 'Мужской',
  F: 'Женский',
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ru-RU');
}

const participantColumns: ColumnsType<EventParticipant> = [
  {
    title: 'ФИО',
    dataIndex: 'fullName',
    key: 'fullName',
  },
  {
    title: 'Год рождения',
    dataIndex: 'birthYear',
    key: 'birthYear',
    render: (value: number | null) => value ?? '—',
  },
  {
    title: 'Пол',
    dataIndex: 'gender',
    key: 'gender',
    render: (value: string | null) => (value ? genderLabels[value] ?? value : '—'),
  },
  {
    title: 'Город',
    dataIndex: 'city',
    key: 'city',
    render: (value: string | null) => value ?? '—',
  },
  {
    title: 'Район',
    dataIndex: 'district',
    key: 'district',
    render: (value: string | null) => value ?? '—',
  },
  {
    title: 'Команда',
    dataIndex: 'team',
    key: 'team',
    render: (value: string | null) => value ?? '—',
  },
  {
    title: 'Статус заявки',
    dataIndex: 'status',
    key: 'status',
    render: (value: string) => {
      const status = registrationStatusLabels[value];
      return <Tag color={status?.color}>{status?.text ?? value}</Tag>;
    },
  },
  {
    title: 'Подана',
    dataIndex: 'registeredAt',
    key: 'registeredAt',
    render: (value: string) => formatDateTime(value),
  },
];

export function EventPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const eventQuery = useEventDetailsQuery(id);

  if (eventQuery.isLoading) {
    return (
      <AppShell title="Мероприятие" subtitle="Загружаем карточку...">
        <Card>
          <Skeleton active paragraph={{ rows: 10 }} />
        </Card>
      </AppShell>
    );
  }

  if (eventQuery.isError || !eventQuery.data) {
    return (
      <AppShell title="Мероприятие не найдено" subtitle="Проверьте ссылку или вернитесь к списку событий">
        <Result
          status="404"
          title="Мероприятие не найдено"
          subTitle="Для указанного идентификатора нет записи в базе."
          extra={
            <Button type="primary" onClick={() => navigate('/')}>
              На главную
            </Button>
          }
        />
      </AppShell>
    );
  }

  const event = eventQuery.data;
  const status = statusLabels[event.status] ?? { text: event.status, color: 'default' };
  const features: FeatureItem[] = [
    { key: 'track', title: 'Трасса', value: event.track.name },
    { key: 'city', title: 'Город', value: event.track.locationCity ?? '—' },
    {
      key: 'eventType',
      title: 'Тип',
      value: eventTypeLabels[event.eventType] ?? event.eventType,
    },
    { key: 'sport', title: 'Вид спорта', value: sportLabels[event.sport] ?? event.sport },
    { key: 'eventDate', title: 'Дата проведения', value: event.eventDate },
    {
      key: 'distanceKm',
      title: 'Дистанция, км',
      value: event.distanceKm === null ? '—' : String(event.distanceKm),
    },
    { key: 'status', title: 'Статус', value: status.text },
    {
      key: 'registrationOpen',
      title: 'Открытие регистрации',
      value: formatDateTime(event.registrationOpen),
    },
    {
      key: 'registrationClose',
      title: 'Закрытие регистрации',
      value: formatDateTime(event.registrationClose),
    },
    { key: 'createdBy', title: 'Создал', value: event.createdBy?.name ?? '—' },
    { key: 'createdAt', title: 'Создано', value: formatDateTime(event.createdAt) },
    {
      key: 'participants',
      title: 'Участников',
      value: String(event.registrations.length),
    },
  ];

  return (
    <AppShell
      title={event.name}
      subtitle={`${event.track.name} · ${event.eventDate}`}
      extra={
        <Button type="default" onClick={() => navigate('/')}>
          На главную
        </Button>
      }
    >
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <Card>
          <Space align="center" wrap>
            <Typography.Title level={2} style={{ margin: 0 }}>
              {event.name}
            </Typography.Title>
            <Tag color={status.color}>{status.text}</Tag>
          </Space>
        </Card>

        <FeaturesCard title="Характеристики мероприятия" features={features} />

        <Card title="Описание">
          {event.description ? (
            <Typography.Paragraph>{event.description}</Typography.Paragraph>
          ) : (
            <Typography.Text type="secondary">Описание не указано</Typography.Text>
          )}
          {event.track.mapLink ? (
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              <Typography.Link href={event.track.mapLink} target="_blank" rel="noreferrer">
                Открыть карту трассы
              </Typography.Link>
            </Typography.Paragraph>
          ) : null}
        </Card>

        <Card title={`Зарегистрированные участники (${event.registrations.length})`}>
          <Table
            columns={participantColumns}
            dataSource={event.registrations}
            rowKey="id"
            pagination={false}
            locale={{ emptyText: 'Пока никто не зарегистрировался' }}
          />
        </Card>
      </Space>
    </AppShell>
  );
}
