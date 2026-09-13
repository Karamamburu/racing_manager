import { Button, Card, Modal, Result, Skeleton, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { canChangeEventStatus, canCreateEvents, canManageCreatedEvent } from '../../features/auth/canCreateEvents';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
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
import { formatFinishTime } from '../../shared/formatFinishTime';
import { eventStatusMeta, type EventStatusCode } from '../../shared/eventStatus';
import { AppShell } from '../../shared/layout';
import type { EventFormatRef, EventLap, EventParticipant } from '../../shared/types/event';
import type { FeatureItem } from '../../shared/types/track';
import { EditEventModal } from './components/EditEventModal';
import { EventStatusSelect } from './components/EventStatusSelect';
import { FinishTimeCell } from './components/FinishTimeCell';
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

const genderGroupLabels: Record<string, string> = {
  M: 'Мужчины',
  F: 'Женщины',
};

const GENDER_ORDER = ['M', 'F'] as const;

type ClassificationSection = {
  key: string;
  title: string;
  rows: EventParticipant[];
};

type SavingLap = {
  registrationId: string;
  lapNumber: number;
};

function formatLapCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} круг`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} круга`;
  return `${count} кругов`;
}

function formatEventLaps(laps: EventLap[]): string {
  if (laps.length === 0) return '—';
  const first = laps[0].distanceKm;
  const allEqual = laps.every((lap) => lap.distanceKm === first);
  if (allEqual) return `${formatLapCount(laps.length)} по ${first} км`;
  return laps.map((lap) => `${lap.lapNumber}: ${lap.distanceKm} км`).join(', ');
}

function participantLapTime(participant: EventParticipant, lapNumber: number): number | null {
  return (participant.laps ?? []).find((lap) => lap.lapNumber === lapNumber)?.timeMilliseconds ?? null;
}

function classificationTitle(gender: string, formatName: string | null): string {
  const genderLabel = genderGroupLabels[gender] ?? gender;
  if (!formatName) return genderLabel;
  return `${genderLabel} · ${formatName}`;
}

function groupParticipants(
  participants: EventParticipant[],
  formats: EventFormatRef[],
): ClassificationSection[] {
  const sortedFormats = [...formats].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  );
  const sections: ClassificationSection[] = [];

  if (sortedFormats.length === 0) {
    for (const gender of GENDER_ORDER) {
      const rows = participants.filter((participant) => participant.gender === gender);
      if (rows.length) {
        sections.push({
          key: gender,
          title: classificationTitle(gender, null),
          rows,
        });
      }
    }
    return sections;
  }

  for (const format of sortedFormats) {
    for (const gender of GENDER_ORDER) {
      const rows = participants.filter(
        (participant) =>
          participant.format?.id === format.id && participant.gender === gender,
      );
      if (rows.length) {
        sections.push({
          key: `${format.id}-${gender}`,
          title: classificationTitle(gender, format.name),
          rows,
        });
      }
    }
  }
  return sections;
}

function getParticipantColumns(options: {
  eventLaps: EventLap[];
  canAssignNumbers: boolean;
  canAssignResults: boolean;
  savingNumberId: string | null;
  savingResultId: string | null;
  savingLap: SavingLap | null;
  onAssignNumber: (participant: EventParticipant, startNumber: number) => Promise<void>;
  onAssignLap: (
    participant: EventParticipant,
    lapNumber: number,
    timeMilliseconds: number,
  ) => Promise<void>;
  onAssignResult: (participant: EventParticipant, timeMilliseconds: number) => Promise<void>;
  onInvalidResult: () => void;
}): ColumnsType<EventParticipant> {
  const recordsByLaps = options.eventLaps.length > 0;
  const lapColumns: ColumnsType<EventParticipant> = options.eventLaps.map((lap) => ({
    title: (
      <span>
        Круг {lap.lapNumber}
        <div style={{ fontWeight: 400, fontSize: 12, color: 'rgba(0, 0, 0, 0.45)' }}>
          {lap.distanceKm} км
        </div>
      </span>
    ),
    key: `lap-${lap.lapNumber}`,
    width: 130,
    render: (_value: unknown, record) => (
      <FinishTimeCell
        value={participantLapTime(record, lap.lapNumber)}
        canEdit={options.canAssignResults && record.startNumber != null}
        saving={
          options.savingLap?.registrationId === record.id &&
          options.savingLap.lapNumber === lap.lapNumber
        }
        onSave={(timeMilliseconds) =>
          options.onAssignLap(record, lap.lapNumber, timeMilliseconds)
        }
        onInvalid={options.onInvalidResult}
      />
    ),
  }));

  return [
    {
      title: 'Место',
      dataIndex: 'place',
      key: 'place',
      width: 80,
      render: (value: number | null) => value ?? '—',
    },
    {
      title: '№',
      dataIndex: 'startNumber',
      key: 'startNumber',
      render: (value: number | null, record) => (
        <StartNumberCell
          value={value}
          canEdit={options.canAssignNumbers}
          saving={options.savingNumberId === record.id}
          onSave={(startNumber) => options.onAssignNumber(record, startNumber)}
        />
      ),
    },
    ...lapColumns,
    {
      title: recordsByLaps ? (
        <Tooltip title="Сумма времени кругов">
          <span>Время</span>
        </Tooltip>
      ) : (
        'Время'
      ),
      dataIndex: 'finishTimeMs',
      key: 'finishTimeMs',
      width: 150,
      render: (value: number | null, record) => {
        if (!recordsByLaps) {
          return (
            <FinishTimeCell
              value={value}
              canEdit={options.canAssignResults && record.startNumber != null}
              saving={options.savingResultId === record.id}
              onSave={(timeMilliseconds) => options.onAssignResult(record, timeMilliseconds)}
              onInvalid={options.onInvalidResult}
            />
          );
        }
        const filled = (record.laps ?? []).length;
        const incomplete = value != null && filled < options.eventLaps.length;
        const label = formatFinishTime(value);
        if (!incomplete) return label;
        return (
          <Tooltip title={`Заполнено кругов: ${filled} из ${options.eventLaps.length}`}>
            <span>{label}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Участник',
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
  ];
}

export function EventPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const eventQuery = useEventDetailsQuery(id);
  const sessionQuery = useSessionQuery();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [isCancelRegistrationOpen, setIsCancelRegistrationOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isCancellingRegistration, setIsCancellingRegistration] = useState(false);
  const [savingStartNumberId, setSavingStartNumberId] = useState<string | null>(null);
  const [savingFinishTimeId, setSavingFinishTimeId] = useState<string | null>(null);
  const [savingLap, setSavingLap] = useState<SavingLap | null>(null);

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
  const session = sessionQuery.data;
  const canManage = canManageCreatedEvent({
    roles: session?.roles,
    profileId: session?.userId,
    createdById: event.createdBy?.id,
    status: event.status,
  });
  const canAssignNumbers =
    canCreateEvents(session?.roles) &&
    (event.status === 'PLANNED' || event.status === 'IN_PROGRESS');
  const canAssignResults =
    canCreateEvents(session?.roles) && event.status !== 'CANCELLED';
  const canChangeStatus = canChangeEventStatus(session?.roles);
  const myRegistration = event.registrations.find(
    (registration: EventParticipant) =>
      Boolean(registration.userId) && registration.userId === session?.userId,
  );
  const canRegister = isEventRegistrationOpen(event);
  const closedReason = registrationClosedReason(event);
  const showRegister = event.status === 'PLANNED' && !myRegistration;
  const hasHeaderActions = showRegister || Boolean(myRegistration) || canManage;
  const status = eventStatusMeta(event.status);
  const features: FeatureItem[] = [
    { key: 'track', title: 'Трасса', value: event.track.name },
    {
      key: 'eventType',
      title: 'Тип мероприятия',
      value: eventTypeLabels[event.eventType] ?? event.eventType,
    },
    { key: 'sport', title: 'Дисциплина', value: sportLabels[event.sport] ?? event.sport },
    { key: 'eventDate', title: 'Дата проведения', value: formatDateTime(event.eventDate) },
    {
      key: 'distanceKm',
      title: 'Дистанция',
      value: event.distanceKm === null ? '—' : `${event.distanceKm} км`,
    },
    {
      key: 'laps',
      title: 'Круги',
      value: formatEventLaps(event.laps ?? []),
    },
    {
      key: 'formats',
      title: 'Форматы участия',
      value:
        event.formats.length > 0 ? (
          <Space size={[4, 8]} wrap>
            {event.formats.map((format: EventFormatRef) => (
              <Tag key={format.id}>{format.name}</Tag>
            ))}
          </Space>
        ) : (
          '—'
        ),
    },
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
  ];

  const refreshEvent = async () => {
    if (!event.id) return;
    await queryClient.invalidateQueries({ queryKey: eventDetailsQueryKey(event.id) });
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

  const assignLapTime = async (
    participant: EventParticipant,
    lapNumber: number,
    timeMilliseconds: number,
  ) => {
    setSavingLap({ registrationId: participant.id, lapNumber });
    try {
      await registrationsService.upsertResult(event.id, participant.id, {
        laps: [{ lapNumber, timeMilliseconds }],
      });
      await refreshEvent();
      message.success(`Время круга ${lapNumber} записано`);
    } catch (error) {
      const statusCode = registrationsService.getStatus(error);
      if (statusCode === 403) {
        message.error(
          'Недостаточно прав. Записывать результаты может организатор или администратор.',
        );
      } else {
        message.error(registrationsService.getErrorMessage(error));
      }
      throw error;
    } finally {
      setSavingLap(null);
    }
  };

  const assignFinishTime = async (
    participant: EventParticipant,
    timeMilliseconds: number,
  ) => {
    setSavingFinishTimeId(participant.id);
    try {
      await registrationsService.upsertResult(event.id, participant.id, {
        timeMilliseconds,
      });
      await refreshEvent();
      message.success('Время прохождения записано');
    } catch (error) {
      const statusCode = registrationsService.getStatus(error);
      if (statusCode === 403) {
        message.error(
          'Недостаточно прав. Записывать результаты может организатор или администратор.',
        );
      } else {
        message.error(registrationsService.getErrorMessage(error));
      }
      throw error;
    } finally {
      setSavingFinishTimeId(null);
    }
  };

  const participantColumns = getParticipantColumns({
    eventLaps: event.laps ?? [],
    canAssignNumbers,
    canAssignResults,
    savingNumberId: savingStartNumberId,
    savingResultId: savingFinishTimeId,
    savingLap,
    onAssignNumber: assignStartNumber,
    onAssignLap: assignLapTime,
    onAssignResult: assignFinishTime,
    onInvalidResult: () => {
      message.error('Введите время цифрами. Минуты и секунды — до 59, например 13215 → 01:32:15');
    },
  });
  const participantSections = groupParticipants(event.registrations, event.formats);

  const handleStatusChange = (nextStatus: EventStatusCode) => {
    if (nextStatus === 'CANCELLED') {
      setIsCancelConfirmOpen(true);
      return;
    }
    void submitEventStatus(nextStatus);
  };

  const submitEventStatus = async (nextStatus: EventStatusCode) => {
    setIsUpdatingStatus(true);
    if (nextStatus === 'CANCELLED') setIsCancelling(true);
    try {
      await eventsService.updateEventStatus(event.id, nextStatus);
      const labels: Record<EventStatusCode, string> = {
        PLANNED: 'Мероприятие переведено в статус «Запланировано»',
        IN_PROGRESS: 'Мероприятие переведено в статус «В процессе»',
        DONE: 'Мероприятие переведено в статус «Завершено»',
        CANCELLED: 'Мероприятие отменено',
      };
      message.success(labels[nextStatus]);
      setIsCancelConfirmOpen(false);
      refreshEvent();
    } catch (error) {
      const statusCode = eventsService.getStatus(error);
      if (statusCode === 401) {
        message.error('Неаутентифицирован. Войдите в систему ещё раз.');
      } else if (statusCode === 403) {
        message.error('Недостаточно прав. Статус может менять администратор или организатор.');
      } else {
        message.error(eventsService.getErrorMessage(error));
      }
    } finally {
      setIsUpdatingStatus(false);
      setIsCancelling(false);
    }
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
    await submitEventStatus('CANCELLED');
  };

  return (
    <AppShell
      title={event.name}
      subtitle={`${event.track.name} · ${formatDateTime(event.eventDate)}`}
      extra={
        hasHeaderActions ? (
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
              <Button onClick={() => setIsEditOpen(true)}>Редактировать</Button>
            ) : null}
          </Space>
        ) : undefined
      }
    >
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <Card>
          <Space align="center" wrap>
            <Typography.Title level={2} style={{ margin: 0 }}>
              {event.name}
            </Typography.Title>
            {canChangeStatus ? (
              <EventStatusSelect
                value={event.status}
                loading={isUpdatingStatus}
                onChange={handleStatusChange}
              />
            ) : (
              <Tag color={status.color}>{status.text}</Tag>
            )}
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
          {participantSections.length === 0 ? (
            <Table
              columns={participantColumns}
              dataSource={[]}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'Пока никто не зарегистрировался' }}
            />
          ) : (
            <Space direction="vertical" size={24} style={{ width: '100%' }}>
              {participantSections.map((section) => (
                <div key={section.key}>
                  <Typography.Title level={5} style={{ marginTop: 0 }}>
                    {section.title}
                  </Typography.Title>
                  <Table
                    columns={participantColumns}
                    dataSource={section.rows}
                    rowKey="id"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                  />
                </div>
              ))}
            </Space>
          )}
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
        formats={event.formats}
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
