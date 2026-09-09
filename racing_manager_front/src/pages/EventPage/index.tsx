import { Button, Card, Modal, Result, Skeleton, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { canCreateEvents, canManageCreatedEvent } from '../../features/auth/canCreateEvents';
import { usePersonalQuery } from '../../features/auth/usePersonalQuery';
import { eventsService } from '../../features/events/eventsService';
import { recentEventsQueryKey } from '../../features/events/useRecentEventsQuery';
import {
  eventDetailsQueryKey,
  useEventDetailsQuery,
} from '../../features/events/useEventDetailsQuery';
import {
  isEventRegistrationOpen,
  registrationClosedReason,
} from '../../features/registrations/registrationWindow';
import { registrationsService } from '../../features/registrations/registrationsService';
import { FeaturesCard } from '../../shared/components';
import { formatDateTime } from '../../shared/formatDateTime';
import { AppShell } from '../../shared/layout';
import type { EventParticipant } from '../../shared/types/event';
import type { FeatureItem } from '../../shared/types/track';
import { EditEventModal } from './components/EditEventModal';
import { RegisterEventModal } from './components/RegisterEventModal';
import { StartNumberCell } from './components/StartNumberCell';

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
  REGISTERED: { text: 'Зарегистрирована', color: 'blue' },
  CONFIRMED: { text: 'Подтверждена', color: 'green' },
  CANCELLED: { text: 'Отменена', color: 'red' },
  WITHDRAWN: { text: 'Отозвана', color: 'default' },
};

const genderLabels: Record<string, string> = {
  M: 'Мужской',
  F: 'Женский',
};

function getParticipantColumns(options: {
  canAssignNumbers: boolean;
  savingId: string | null;
  onAssignNumber: (participant: EventParticipant, startNumber: number) => Promise<void>;
}): ColumnsType<EventParticipant> {
  return [
    {
      title: 'Стартовый номер',
      dataIndex: 'startNumber',
      key: 'startNumber',
      render: (value: number | null, record) => (
        <StartNumberCell
          value={value}
          canEdit={options.canAssignNumbers}
          saving={options.savingId === record.id}
          onSave={(startNumber) => options.onAssignNumber(record, startNumber)}
        />
      ),
    },
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
}

export function EventPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const eventQuery = useEventDetailsQuery(id);
  const personalQuery = usePersonalQuery();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [isCancelRegistrationOpen, setIsCancelRegistrationOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancellingRegistration, setIsCancellingRegistration] = useState(false);
  const [savingStartNumberId, setSavingStartNumberId] = useState<string | null>(null);

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
  const profile = personalQuery.data?.profile;
  const canManage = canManageCreatedEvent({
    roles: personalQuery.data?.roles,
    profileId: profile?.id,
    createdById: event.createdBy?.id,
    status: event.status,
  });
  const canAssignNumbers =
    canCreateEvents(personalQuery.data?.roles) && event.status === 'PLANNED';
  const myRegistration = event.registrations.find(
    (registration: EventParticipant) =>
      Boolean(registration.userId) && registration.userId === profile?.id,
  );
  const canRegister = isEventRegistrationOpen(event);
  const closedReason = registrationClosedReason(event);
  const showRegister = event.status === 'PLANNED' && !myRegistration;
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
    { key: 'eventDate', title: 'Дата проведения', value: formatDateTime(event.eventDate) },
    {
      key: 'distanceKm',
      title: 'Дистанция, км',
      value: event.distanceKm === null ? '—' : String(event.distanceKm),
    },
    { key: 'status', title: 'Статус', value: status.text },
    {
      key: 'registrationOpen',
      title: 'Начало выдачи номеров',
      value: formatDateTime(event.registrationOpen),
    },
    {
      key: 'registrationClose',
      title: 'Окончание выдачи номеров',
      value: formatDateTime(event.registrationClose),
    },
    { key: 'createdBy', title: 'Создал', value: event.createdBy?.name ?? '—' },
    { key: 'createdAt', title: 'Создано', value: formatDateTime(event.createdAt) },
    { key: 'participants', title: 'Участников', value: String(event.registrations.length) },
  ];

  const refreshEvent = () => {
    if (!event.id) return;
    void queryClient.invalidateQueries({ queryKey: eventDetailsQueryKey(event.id) });
    void queryClient.invalidateQueries({ queryKey: recentEventsQueryKey });
  };

  const assignStartNumber = async (participant: EventParticipant, startNumber: number) => {
    setSavingStartNumberId(participant.id);
    try {
      await registrationsService.update(event.id, participant.id, { startNumber });
      message.success(`Номер ${startNumber} выдан, заявка подтверждена`);
      refreshEvent();
    } catch (error) {
      const statusCode = registrationsService.getStatus(error);
      if (statusCode === 403) {
        message.error('Недостаточно прав. Выдавать номера может организатор или администратор.');
      } else if (statusCode === 409) {
        message.error('Этот стартовый номер уже занят.');
      } else {
        message.error(registrationsService.getErrorMessage(error));
      }
      throw error;
    } finally {
      setSavingStartNumberId(null);
    }
  };

  const participantColumns = getParticipantColumns({
    canAssignNumbers,
    savingId: savingStartNumberId,
    onAssignNumber: assignStartNumber,
  });

  const handleCancelEvent = () => {
    setIsCancelConfirmOpen(true);
  };

  const submitCancelRegistration = async () => {
    setIsCancellingRegistration(true);
    try {
      await registrationsService.cancelOwn(event.id);
      message.success('Заявка отозвана');
      setIsCancelRegistrationOpen(false);
      refreshEvent();
    } catch (error) {
      const statusCode = registrationsService.getStatus(error);
      if (statusCode === 401) {
        message.error('Неаутентифицирован. Войдите в систему ещё раз.');
      } else if (statusCode === 404) {
        message.error('Активная регистрация не найдена.');
      } else {
        message.error(registrationsService.getErrorMessage(error));
      }
    } finally {
      setIsCancellingRegistration(false);
    }
  };

  const submitCancelEvent = async () => {
    setIsCancelling(true);
    try {
      await eventsService.cancelEvent(event.id);
      message.success('Мероприятие отменено');
      setIsCancelConfirmOpen(false);
      refreshEvent();
    } catch (error) {
      const statusCode = eventsService.getStatus(error);
      if (statusCode === 401) {
        message.error('Неаутентифицирован. Войдите в систему ещё раз.');
      } else if (statusCode === 403) {
        message.error('Недостаточно прав. Отменить может только создатель-администратор.');
      } else {
        message.error(eventsService.getErrorMessage(error));
      }
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <AppShell
      title={event.name}
      subtitle={`${event.track.name} · ${formatDateTime(event.eventDate)}`}
      extra={
        <Space wrap>
          {showRegister ? (
            <Tooltip title={!canRegister ? closedReason : undefined}>
              <span>
                <Button
                  type="primary"
                  disabled={!canRegister}
                  onClick={() => setIsRegisterOpen(true)}
                >
                  Зарегистрироваться
                </Button>
              </span>
            </Tooltip>
          ) : null}
          {myRegistration ? (
            <Button
              danger
              loading={isCancellingRegistration}
              onClick={() => setIsCancelRegistrationOpen(true)}
            >
              Отозвать заявку
            </Button>
          ) : null}
          {canManage ? (
            <>
              <Button onClick={() => setIsEditOpen(true)}>Редактировать</Button>
              <Button danger loading={isCancelling} onClick={handleCancelEvent}>
                Отменить мероприятие
              </Button>
            </>
          ) : null}
          <Button type="default" onClick={() => navigate('/')}>
            На главную
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <Card>
          <Space align="center" wrap>
            <Typography.Title level={2} style={{ margin: 0 }}>
              {event.name}
            </Typography.Title>
            <Tag color={status.color}>{status.text}</Tag>
            {myRegistration ? <Tag color="green">Вы зарегистрированы</Tag> : null}
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
      <EditEventModal
        open={isEditOpen}
        event={event}
        onClose={() => setIsEditOpen(false)}
        onUpdated={refreshEvent}
      />
      <RegisterEventModal
        open={isRegisterOpen}
        eventId={event.id}
        isAuthenticated={Boolean(personalQuery.data?.authenticated)}
        profile={profile}
        onClose={() => setIsRegisterOpen(false)}
        onRegistered={refreshEvent}
      />
      <Modal
        title="Отозвать заявку?"
        open={isCancelRegistrationOpen}
        onCancel={() => setIsCancelRegistrationOpen(false)}
        okText="Отозвать заявку"
        okButtonProps={{ danger: true, loading: isCancellingRegistration }}
        cancelText="Назад"
        onOk={submitCancelRegistration}
      >
        Заявка получит статус «Отозвана» и исчезнет из списка участников.
      </Modal>
      <Modal
        title="Отменить мероприятие?"
        open={isCancelConfirmOpen}
        onCancel={() => setIsCancelConfirmOpen(false)}
        okText="Отменить мероприятие"
        okButtonProps={{ danger: true, loading: isCancelling }}
        cancelText="Назад"
        onOk={submitCancelEvent}
      >
        Мероприятие получит статус «Отменено», активные заявки — «Отменена»,
        и событие исчезнет из списка ближайших.
      </Modal>
    </AppShell>
  );
}
