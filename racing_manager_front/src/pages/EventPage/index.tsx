import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Card, Col, Empty, Grid, Modal, Result, Row, Select, Skeleton, Space, Table, Tabs, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { canChangeEventStatus, canCreateEvents, canManageCreatedEvent, isAdministrator } from '../../features/auth/canCreateEvents';
import { authService } from '../../features/auth/authService';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import type {
  ClassCompetitionStage,
  ClassCompetitionView,
} from '../../features/class-competitions/types';
import {
  classCompetitionsQueryKey,
  useClassCompetitionsQuery,
} from '../../features/class-competitions/useClassCompetitionsQuery';
import { eventsService } from '../../features/events/eventsService';
import { recentEventsQueryKey } from '../../features/events/useRecentEventsQuery';
import { EventStartBlocks } from '../../features/events/EventStartBlocks';
import { categoryYoungestBound, countAgeGroups } from '../../features/events/ageCategories';
import {
  categoryHasResults,
  categoryIsFinished,
  categoryReadyToFinish,
  groupParticipants,
  type ClassificationSection,
  type GenderGroup,
} from '../../features/events/protocolGroups';
import {
  collectProtocolFilterValues,
  emptyProtocolFilters,
  filterProtocolGroups,
  type ProtocolFilters as ProtocolFiltersValue,
} from '../../features/events/protocolFilters';
import {
  eventDetailsQueryKey,
  useEventDetailsQuery,
} from '../../features/events/useEventDetailsQuery';
import {
  isEventRegistrationOpen,
  isRegistrationWindowClosed,
  registrationClosedReason,
} from '../../features/registrations/registrationWindow';
import { registrationsService } from '../../features/registrations/registrationsService';
import { FeaturesCard } from '../../shared/components';
import { formatDateTime } from '../../shared/formatDateTime';
import { eventStatusMeta, isPastCompletedEvent, PAST_COMPLETED_EVENT_LOCKED_MESSAGE, type EventStatusCode } from '../../shared/eventStatus';
import {
  isActiveRegistrationStatus,
  isRecordableRegistrationStatus,
  registrationStatusMeta,
  type RegistrationStatusCode,
} from '../../shared/registrationStatus';
import { AppShell } from '../../shared/layout';
import type {
  AgeGroupId,
  EventFormatRef,
  EventParticipant,
  SetAgeCategoriesRequest,
  StartResponse,
} from '../../shared/types/event';
import type { FeatureItem } from '../../shared/types/track';
import { AgeSplitModal, type AgeSplitCategory } from './components/AgeSplitModal';
import { ClassCompetitionPanel } from './components/ClassCompetitionPanel';
import { EditEventModal } from './components/EditEventModal';
import { EventTrackMap } from './components/EventTrackMap';
import { EventStatusSelect } from './components/EventStatusSelect';
import { FinishTimeCell } from './components/FinishTimeCell';
import { ProtocolFilters } from './components/ProtocolFilters';
import { RegisterEventModal } from './components/RegisterEventModal';
import { RegisterParticipantModal } from './components/RegisterParticipantModal';
import { SeedTestRegistrationsModal } from './components/SeedTestRegistrationsModal';
import { RegistrationStatusSelect } from './components/RegistrationStatusSelect';
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

const genderLabels: Record<string, string> = {
  M: 'Мужской',
  F: 'Женский',
};

const REACHED_STAGE_LABELS: Record<string, string> = {
  PROLOGUE: 'Пролог',
  EIGHTHFINAL: '1/8',
  QUARTERFINAL: '1/4',
  SEMIFINAL: '1/2',
  FINAL: 'Финал',
  FINAL_A: 'Финал A',
  FINAL_B: 'Финал B',
};

function reachedStageLabel(stage: ClassCompetitionStage): string {
  return REACHED_STAGE_LABELS[stage.kind] ?? stage.label ?? stage.stageId;
}

function lastReachedStage(
  competition: ClassCompetitionView,
  registrationId: string,
): { label: string; laps: EventParticipant['laps'] } | null {
  let reached: { label: string; laps: EventParticipant['laps'] } | null = null;
  for (const stage of competition.stages) {
    if (stage.status === 'PENDING') continue;
    for (const heat of stage.heats) {
      const slot = heat.slots.find((item) => item.registrationId === registrationId);
      if (!slot) continue;
      reached = { label: reachedStageLabel(stage), laps: slot.laps };
    }
  }
  return reached;
}

function competitionsForRows(
  rows: EventParticipant[],
  competitions: ClassCompetitionView[],
): ClassCompetitionView[] {
  const sample = rows[0];
  if (!sample) return [];
  return competitions.filter(
    (competition) =>
      competition.gender === sample.gender &&
      competition.formatId === (sample.format?.id ?? null) &&
      competition.startId === sample.startId,
  );
}

type ProtocolSectionView = {
  key: string;
  title: string;
  subtitle: string | null;
  rows: EventParticipant[];
  allRows: EventParticipant[];
  competition: ClassCompetitionView | null;
  sectionId: string;
  bound: number;
};

function simpleSectionBound(
  sectionId: string,
  split: { categories: Array<{ id: string; groupIds: AgeGroupId[] }> } | null,
): number {
  if (sectionId === 'CATEGORY') return 1_000_000.5;
  if (sectionId === 'REMAINDER') return 1_000_000;
  if (sectionId === 'NO_BIRTH_YEAR') return 1_000_001;
  const category = split?.categories.find((item) => item.id === sectionId);
  return category ? categoryYoungestBound(category.groupIds) : 1_000_002;
}

type ProtocolParticipant = EventParticipant & { reachedStage?: string | null };

function rowsWithClassification(
  rows: EventParticipant[],
  competition: ClassCompetitionView | null,
): ProtocolParticipant[] {
  if (!competition || competition.status !== 'DONE') return rows;
  const placed = new Map(
    competition.classification.map((item) => [item.registrationId, item]),
  );
  return rows
    .map((row) => {
      const result = placed.get(row.id);
      const reached = lastReachedStage(competition, row.id);
      return {
        ...row,
        ...(result
          ? {
              place: result.place,
              finishTimeMs: result.timeMilliseconds ?? row.finishTimeMs,
            }
          : {}),
        laps: reached?.laps ?? [],
        reachedStage: reached?.label ?? null,
      };
    })
    .sort((a, b) => (a.place ?? Number.POSITIVE_INFINITY) - (b.place ?? Number.POSITIVE_INFINITY));
}

function formatParticipantCount(count: number, gender: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const one = mod10 === 1 && mod100 !== 11;
  const few = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14);
  if (gender === 'F') {
    if (one) return `${count} участница`;
    if (few) return `${count} участницы`;
    return `${count} участниц`;
  }
  if (one) return `${count} участник`;
  if (few) return `${count} участника`;
  return `${count} участников`;
}

function isIncompleteProfileError(text: string): boolean {
  return (
    text.includes('firstName') ||
    text.includes('lastName') ||
    text.includes('gender must be') ||
    text.includes('birthYear')
  );
}

function getParticipantColumns(options: {
  showReachedStage?: boolean;
  canAssignNumbers: boolean;
  canAssignResults: boolean;
  canChangeStatus: boolean;
  savingNumberId: string | null;
  savingResultId: string | null;
  savingStatusId: string | null;
  savingOutcomeId: string | null;
  onAssignNumber: (participant: EventParticipant, startNumber: number) => Promise<void>;
  onChangeStatus: (participant: EventParticipant, status: RegistrationStatusCode) => Promise<void>;
  onAssignOutcome: (
    participant: EventParticipant,
    outcome: 'DNS' | 'DNF' | 'DSQ',
  ) => Promise<void>;
  onAssignResult: (participant: EventParticipant, timeMilliseconds: number) => Promise<void>;
}): ColumnsType<ProtocolParticipant> {
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
    ...(options.showReachedStage
      ? [
          {
            title: 'Этап гонки',
            key: 'reachedStage',
            width: 120,
            render: (_value: unknown, record: ProtocolParticipant) => record.reachedStage ?? '—',
          },
        ]
      : []),
    {
      title: 'Результат',
      key: 'outcome',
      width: 150,
      render: (_value: unknown, record: ProtocolParticipant) => {
        if (!options.canAssignResults) {
          return record.outcome ?? '—';
        }
        const editable =
          record.startNumber != null &&
          isRecordableRegistrationStatus(record.status);
        return (
          <Select
            size="small"
            style={{ width: 120 }}
            placeholder="—"
            value={record.outcome ?? undefined}
            disabled={!editable}
            loading={options.savingOutcomeId === record.enrollmentId}
            options={[
              { value: 'FINISHED', label: 'Финиш' },
              { value: 'DNS', label: 'DNS' },
              { value: 'DNF', label: 'DNF' },
              { value: 'DSQ', label: 'DSQ' },
            ]}
            onChange={(outcome) => {
              if (outcome === 'FINISHED') return;
              void options.onAssignOutcome(
                record,
                outcome as 'DNS' | 'DNF' | 'DSQ',
              );
            }}
          />
        );
      },
    },
    {
      title: 'Время',
      dataIndex: 'finishTimeMs',
      key: 'finishTimeMs',
      width: 150,
      render: (value: number | null, record) => (
        <FinishTimeCell
          value={value}
          canEdit={
            options.canAssignResults &&
            record.startNumber != null &&
            isRecordableRegistrationStatus(record.status)
          }
          saving={options.savingResultId === record.enrollmentId}
          onSave={(timeMilliseconds) => options.onAssignResult(record, timeMilliseconds)}
        />
      ),
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
      width: 280,
      render: (value: string, record) => {
        if (options.canChangeStatus) {
          return (
            <RegistrationStatusSelect
              value={value}
              loading={options.savingStatusId === record.id}
              onChange={(status) => options.onChangeStatus(record, status)}
            />
          );
        }
        const status = registrationStatusMeta(value);
        return <Tag color={status.color}>{status.text}</Tag>;
      },
    },
  ];
}

const mobileProtocolColumnKeys = ['place', 'fullName', 'finishTimeMs'] as const;

function columnsForProtocol(
  columns: ColumnsType<ProtocolParticipant>,
  compact: boolean,
): ColumnsType<ProtocolParticipant> {
  if (!compact) return columns;
  const compactColumns: ColumnsType<ProtocolParticipant> = [];
  for (const key of mobileProtocolColumnKeys) {
    const column = columns.find((item) => item.key === key);
    if (!column) continue;
    if (key === 'place') compactColumns.push({ ...column, width: 68 });
    else if (key === 'finishTimeMs') compactColumns.push({ ...column, width: 84 });
    else compactColumns.push({ ...column, ellipsis: true });
  }
  return compactColumns;
}

/**
 * U-32/S-04: no event status hides the control; the event lock covers dates,
 * starts, formats and results only, so a finished or cancelled event keeps it.
 * A test flips a status into this list to prove the gate stays empty.
 */
export const AGE_SPLIT_BLOCKING_EVENT_STATUSES: readonly string[] = [];

export type AgeSplitSelectionInput = {
  roles: string[] | undefined;
  eventStatus: string;
  bracketInProgress: boolean;
  hasStarts: boolean;
  rowCount: number;
  startId: string;
  formatId: number | null;
  gender: string;
  startLabel: string;
  formatName: string;
};

/**
 * U-41/O-01/S-09: the «Возрастные категории» control exists only for an
 * administrator or organizer on a protocol category with at least one row.
 */
export function resolveAgeSplitSelection(
  input: AgeSplitSelectionInput,
): AgeSplitCategory | null {
  if (
    AGE_SPLIT_BLOCKING_EVENT_STATUSES.includes(input.eventStatus) ||
    input.bracketInProgress ||
    !canCreateEvents(input.roles) ||
    !input.hasStarts ||
    input.rowCount < 1 ||
    input.formatId === null ||
    (input.gender !== 'M' && input.gender !== 'F')
  ) {
    return null;
  }
  return {
    startId: input.startId,
    formatId: input.formatId,
    gender: input.gender,
    startLabel: input.startLabel,
    formatName: input.formatName,
  };
}

/** A protocol section is homogeneous: one start, one format and one gender. */
function sectionBelongsToCategory(
  section: ClassificationSection,
  category: AgeSplitCategory,
): boolean {
  return (
    section.rows.length > 0 &&
    section.rows.every(
      (row) =>
        row.startId === category.startId &&
        row.format?.id === category.formatId &&
        row.gender === category.gender,
    )
  );
}

/**
 * U-08…U-11, U-29, E-02: picker counts come from the full row set of the
 * selected protocol category — gender × start × participation format — so the
 * protocol search, the city and team filters and the current draft never
 * change them. `section.rows` is read; `visibleRows` is not.
 */
export function resolveAgeSplitGroupCounts(
  groups: readonly GenderGroup[],
  category: AgeSplitCategory | null,
): Partial<Record<AgeGroupId, number>> {
  if (!category) return {};
  for (const group of groups) {
    for (const section of group.sections) {
      if (sectionBelongsToCategory(section, category)) {
        return countAgeGroups(section.rows);
      }
    }
  }
  return {};
}

export function EventPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const eventQuery = useEventDetailsQuery(id);
  const sessionQuery = useSessionQuery();
  const classCompetitionsQuery = useClassCompetitionsQuery(
    id,
    sessionQuery.data?.authenticated === true,
  );
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerInitialFormatId, setRegisterInitialFormatId] = useState<number | undefined>();
  const [pendingRegistration, setPendingRegistration] = useState<{
    start: StartResponse;
    format: EventFormatRef;
  } | null>(null);
  const [isRegisteringByFormat, setIsRegisteringByFormat] = useState(false);
  const [registerInitialStartId, setRegisterInitialStartId] = useState<string | undefined>();
  const [isRegisterParticipantOpen, setIsRegisterParticipantOpen] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [isCancelRegistrationOpen, setIsCancelRegistrationOpen] = useState(false);
  const [isTestRegistrationsOpen, setIsTestRegistrationsOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isCancellingRegistration, setIsCancellingRegistration] = useState(false);
  const [savingStartNumberId, setSavingStartNumberId] = useState<string | null>(null);
  const [savingFinishTimeId, setSavingFinishTimeId] = useState<string | null>(null);
  const [savingOutcomeId, setSavingOutcomeId] = useState<string | null>(null);
  const [savingRegistrationStatusId, setSavingRegistrationStatusId] = useState<string | null>(null);
  const [finishingCategory, setFinishingCategory] = useState<string | null>(null);
  const [ageSplitCategory, setAgeSplitCategory] = useState<AgeSplitCategory | null>(null);
  const [isSavingAgeSplit, setIsSavingAgeSplit] = useState(false);
  const [fullProtocolKeys, setFullProtocolKeys] = useState<string[]>([]);
  const [collapsedBlockKeys, setCollapsedBlockKeys] = useState<string[]>([]);
  const [protocolFilters, setProtocolFilters] =
    useState<ProtocolFiltersValue>(emptyProtocolFilters);
  const screens = Grid.useBreakpoint();
  const compactProtocol = screens.md === false;

  const toggleFullProtocol = (key: string) => {
    setFullProtocolKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const toggleBlockCollapsed = (key: string) => {
    setCollapsedBlockKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

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
  const pastCompleted = isPastCompletedEvent(event);
  const canAssignNumbers =
    canCreateEvents(session?.roles) &&
    (event.status === 'PLANNED' || event.status === 'IN_PROGRESS');
  const canAssignResults =
    canCreateEvents(session?.roles) &&
    event.status !== 'CANCELLED' &&
    !pastCompleted;
  const canChangeStatus = canChangeEventStatus(session?.roles);
  const canChangeRegistrationStatus =
    canCreateEvents(session?.roles) &&
    event.status !== 'CANCELLED' &&
    !pastCompleted;
  const registrations = event.registrations ?? [];
  const myRegistration = registrations.find(
    (registration: EventParticipant) =>
      Boolean(registration.userId) && registration.userId === session?.userId,
  );
  const canRegister = isEventRegistrationOpen(event);
  const closedReason = registrationClosedReason(event);
  const isPlatformUser = session?.authenticated === true;
  const registerDisabled = !isPlatformUser || !canRegister;
  const registerTooltip = !sessionQuery.isFetched
    ? undefined
    : !isPlatformUser
      ? 'Регистрация на гонку доступна только зарегистрированным на платформе пользователям'
      : !canRegister
        ? closedReason ?? undefined
        : undefined;
  const showRegister = event.status === 'PLANNED' && !myRegistration;
  const canPickFormat = isPlatformUser && showRegister;
  const canRegisterParticipant =
    canCreateEvents(session?.roles) &&
    (event.status === 'PLANNED' || event.status === 'IN_PROGRESS');
  const canSeedTestRegistrations =
    isAdministrator(session?.roles) &&
    !pastCompleted &&
    event.status !== 'CANCELLED';
  const canWithdrawOwn =
    myRegistration != null &&
    isActiveRegistrationStatus(myRegistration.status) &&
    event.status === 'PLANNED';
  const hasHeaderActions = showRegister || canWithdrawOwn || canManage;
  const status = eventStatusMeta(event.status);
  const features: FeatureItem[] = [
    { key: 'track', title: 'Трасса', value: event.track.name },
    { key: 'eventDate', title: 'Дата проведения', value: formatDateTime(event.eventDate) },
    {
      key: 'eventType',
      title: 'Тип мероприятия',
      value: eventTypeLabels[event.eventType] ?? event.eventType,
    },
    {
      key: 'registrationOpen',
      title: 'Начало выдачи номеров',
      value: formatDateTime(event.registrationOpen),
    },
    { key: 'sport', title: 'Дисциплина', value: sportLabels[event.sport] ?? event.sport },
    {
      key: 'registrationClose',
      title: 'Окончание выдачи номеров',
      value: formatDateTime(event.registrationClose),
    },
  ];
  const refreshEvent = async () => {
    if (!event.id) return;
    await queryClient.invalidateQueries({ queryKey: eventDetailsQueryKey(event.id) });
    await queryClient.invalidateQueries({ queryKey: classCompetitionsQueryKey(event.id) });
    void queryClient.invalidateQueries({ queryKey: recentEventsQueryKey });
  };

  const confirmFormatRegistration = async () => {
    if (!pendingRegistration) return;
    const { start, format } = pendingRegistration;
    setIsRegisteringByFormat(true);
    try {
      const result = await registrationsService.create(event.id, {
        enrollments: [{ startId: start.id, formatId: format.id }],
      });
      if (result.status === 201 || result.status === 200) {
        setPendingRegistration(null);
        Modal.success({
          title: 'Вы зарегистрированы',
          content: (
            <>
              Старт: {start.resolvedLabel}
              <br />
              Формат: {format.name}
            </>
          ),
        });
        await refreshEvent();
        return;
      }
      message.error(`Неожиданный код ответа: ${result.status}`);
    } catch (error) {
      const statusCode = registrationsService.getStatus(error);
      const text = registrationsService.getErrorMessage(error);
      if (statusCode === 400 && isIncompleteProfileError(text)) {
        setPendingRegistration(null);
        setRegisterInitialFormatId(format.id);
        setRegisterInitialStartId(start.id);
        setIsRegisterOpen(true);
        message.info('Чтобы зарегистрироваться, заполните недостающие данные заявки.');
        return;
      }
      message.error(text);
    } finally {
      setIsRegisteringByFormat(false);
    }
  };

  const assignStartNumber = async (participant: EventParticipant, startNumber: number) => {
    setSavingStartNumberId(participant.id);
    try {
      await registrationsService.update(event.id, participant.id, { startNumber });
      message.success(`Номер ${startNumber} выдан, заявка подтверждена`);
      refreshEvent();
    } catch (error) {
      const statusCode = registrationsService.getStatus(error);
      const text =
        statusCode === 403
          ? 'Недостаточно прав. Выдавать номера может организатор или администратор.'
          : statusCode === 409
            ? 'Этот стартовый номер уже занят.'
            : registrationsService.getErrorMessage(error);
      throw new Error(text);
    } finally {
      setSavingStartNumberId(null);
    }
  };

  const assignFinishTime = async (
    participant: EventParticipant,
    timeMilliseconds: number,
  ) => {
    setSavingFinishTimeId(participant.enrollmentId);
    try {
      await registrationsService.upsertResult(event.id, participant.enrollmentId, {
        outcome: 'FINISHED',
        timeMilliseconds,
      });
      await refreshEvent();
      message.success('Время прохождения записано');
    } catch (error) {
      const statusCode = registrationsService.getStatus(error);
      const text =
        statusCode === 403
          ? 'Недостаточно прав. Записывать результаты может организатор или администратор.'
          : registrationsService.getErrorMessage(error);
      throw new Error(text);
    } finally {
      setSavingFinishTimeId(null);
    }
  };

  const assignOutcome = async (
    participant: EventParticipant,
    outcome: 'DNS' | 'DNF' | 'DSQ',
  ) => {
    setSavingOutcomeId(participant.enrollmentId);
    try {
      await registrationsService.upsertResult(event.id, participant.enrollmentId, {
        outcome,
      });
      await refreshEvent();
      message.success('Результат записан');
    } catch (error) {
      const statusCode = registrationsService.getStatus(error);
      const text =
        statusCode === 403
          ? 'Недостаточно прав. Записывать результаты может организатор или администратор.'
          : registrationsService.getErrorMessage(error);
      throw new Error(text);
    } finally {
      setSavingOutcomeId(null);
    }
  };

  const finishCategory = async (
    startId: string,
    formatId: number | null,
    gender: string,
    key: string,
  ) => {
    if (gender !== 'M' && gender !== 'F') return;
    setFinishingCategory(key);
    try {
      await eventsService.finishCategory(event.id, { startId, formatId, gender });
      await refreshEvent();
      message.success('Гонка завершена');
    } catch (error) {
      message.error(eventsService.getErrorMessage(error));
    } finally {
      setFinishingCategory(null);
    }
  };

  const saveAgeSplit = async (payload: SetAgeCategoriesRequest) => {
    setIsSavingAgeSplit(true);
    try {
      await eventsService.setAgeSplit(event.id, payload);
      await refreshEvent();
      message.success('Возрастные категории сохранены');
      setAgeSplitCategory(null);
    } catch (error) {
      message.error(eventsService.getErrorMessage(error));
    } finally {
      setIsSavingAgeSplit(false);
    }
  };

  const submitRegistrationStatus = async (
    participant: EventParticipant,
    nextStatus: RegistrationStatusCode,
  ) => {
    setSavingRegistrationStatusId(participant.id);
    try {
      await registrationsService.updateStatus(event.id, participant.id, nextStatus);
      message.success(`Статус заявки: ${registrationStatusMeta(nextStatus).text}`);
      await refreshEvent();
    } catch (error) {
      const statusCode = registrationsService.getStatus(error);
      if (statusCode === 403) {
        message.error(
          'Недостаточно прав. Статус заявки может менять организатор или администратор.',
        );
      } else {
        message.error(registrationsService.getErrorMessage(error));
      }
      throw error;
    } finally {
      setSavingRegistrationStatusId(null);
    }
  };

  const assignRegistrationStatus = async (
    participant: EventParticipant,
    nextStatus: RegistrationStatusCode,
  ) => {
    if (nextStatus === 'CANCELLED') {
      Modal.confirm({
        title: 'Отменить заявку участника?',
        content:
          'Заявка получит статус «Отменена», стартовый номер будет сброшен, результат удалён.',
        okText: 'Отменить заявку',
        okButtonProps: { danger: true },
        cancelText: 'Назад',
        onOk: () => submitRegistrationStatus(participant, nextStatus),
      });
      return;
    }
    await submitRegistrationStatus(participant, nextStatus);
  };

  const canRunBracket =
    canCreateEvents(session?.roles) && event.status !== 'CANCELLED' && !pastCompleted;
  const registrationClosed = isRegistrationWindowClosed(event);
  const classCompetitions = classCompetitionsQuery.data ?? [];
  const participantColumns = getParticipantColumns({
    canAssignNumbers,
    canAssignResults,
    canChangeStatus: canChangeRegistrationStatus,
    savingNumberId: savingStartNumberId,
    savingResultId: savingFinishTimeId,
    savingStatusId: savingRegistrationStatusId,
    savingOutcomeId,
    onAssignNumber: assignStartNumber,
    onChangeStatus: assignRegistrationStatus,
    onAssignOutcome: assignOutcome,
    onAssignResult: assignFinishTime,
  });
  const participantGroups = groupParticipants(
    registrations,
    event.formats,
    event.starts,
    event.ageSplits ?? [],
  );
  const cityOptions = collectProtocolFilterValues(registrations, 'city');
  const teamOptions = collectProtocolFilterValues(registrations, 'team');
  const filteredParticipantGroups = filterProtocolGroups(
    participantGroups,
    protocolFilters,
  );
  const showProtocolToolbar =
    event.registrations !== null && registrations.length > 0;
  const ageSplitValue =
    ageSplitCategory === null
      ? null
      : event.ageSplits?.find(
          (item) =>
            item.startId === ageSplitCategory.startId &&
            item.formatId === ageSplitCategory.formatId &&
            item.gender === ageSplitCategory.gender,
        ) ?? null;
  const ageSplitNotApplied =
    ageSplitCategory !== null &&
    classCompetitions.some(
      (competition) =>
        competition.formatId === ageSplitCategory.formatId &&
        competition.gender === ageSplitCategory.gender &&
        competition.startId === ageSplitCategory.startId &&
        competition.targetWholeCategory,
    );
  const ageSplitRaceSections =
    ageSplitCategory === null
      ? []
      : classCompetitions
          .filter(
            (competition) =>
              competition.formatId === ageSplitCategory.formatId &&
              competition.gender === ageSplitCategory.gender &&
              competition.startId === ageSplitCategory.startId &&
              !competition.targetWholeCategory,
          )
          .map((competition) => competition.title || competition.sectionId);
  const ageSplitGroupCounts = resolveAgeSplitGroupCounts(
    participantGroups,
    ageSplitCategory,
  );

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

  const handleDelete = () => {
    Modal.confirm({
      title: 'Удалить мероприятие?',
      content: `«${event.name}» и все заявки будут удалены без возможности восстановления.`,
      okText: 'Удалить',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await eventsService.remove(event.id);
          await queryClient.invalidateQueries({ queryKey: recentEventsQueryKey });
          queryClient.removeQueries({ queryKey: eventDetailsQueryKey(event.id) });
          message.success('Мероприятие удалено');
          navigate('/');
        } catch (error) {
          message.error(eventsService.getErrorMessage(error));
          throw error;
        }
      },
    });
  };

  return (
    <AppShell
      title={event.name}
      subtitle={`${event.track.name} · ${formatDateTime(event.eventDate)}`}
      extra={
        hasHeaderActions ? (
          <Space wrap>
            {showRegister ? (
              <Tooltip title={registerTooltip}>
                <span>
                  <Button
                    type="primary"
                    disabled={registerDisabled}
                    onClick={() => {
                      setRegisterInitialFormatId(undefined);
                      setRegisterInitialStartId(undefined);
                      setIsRegisterOpen(true);
                    }}
                  >
                    Зарегистрироваться
                  </Button>
                </span>
              </Tooltip>
            ) : null}
            {canWithdrawOwn ? (
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
                <Button danger onClick={handleDelete}>
                  Удалить
                </Button>
              </>
            ) : null}
          </Space>
        ) : undefined
      }
    >
      <Space direction="vertical" size={24} className="event-page" style={{ width: '100%' }}>
        <Card>
          <Space align="center" wrap>
            <Typography.Title level={2} style={{ margin: 0 }}>
              {event.name}
            </Typography.Title>
            {canChangeStatus ? (
              <EventStatusSelect
                value={event.status}
                loading={isUpdatingStatus}
                disabled={pastCompleted}
                disabledReason={
                  pastCompleted ? PAST_COMPLETED_EVENT_LOCKED_MESSAGE : undefined
                }
                onChange={handleStatusChange}
              />
            ) : (
              <Tag color={status.color}>{status.text}</Tag>
            )}
            {myRegistration ? <Tag color="green">Вы зарегистрированы</Tag> : null}
          </Space>
        </Card>

        <FeaturesCard
          title="Характеристики мероприятия"
          features={features}
          column={2}
          extra={
            <Typography.Text type="secondary">
              Создал: {event.createdBy?.name ?? '—'}
            </Typography.Text>
          }
        />

        <Row gutter={[24, 24]}>
          <Col xs={24} xl={event.mapLink ? 12 : 24}>
            <Card title="Старты" style={{ height: '100%' }}>
              <EventStartBlocks
                starts={event.starts}
                formats={event.formats}
                stacked={Boolean(event.mapLink)}
                canRegister={canPickFormat}
                registerDisabled={registerDisabled}
                registerTooltip={registerTooltip}
                onRegister={(start, format) =>
                  setPendingRegistration({ start, format })
                }
              />
            </Card>
          </Col>
          {event.mapLink ? (
            <Col xs={24} xl={12}>
              <EventTrackMap mapLink={event.mapLink} />
            </Col>
          ) : null}
        </Row>

        <Card title="Положение о мероприятии">
          {event.description ? (
            <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
              {event.description}
            </Typography.Paragraph>
          ) : (
            <Typography.Text type="secondary">Положение не указано</Typography.Text>
          )}
        </Card>

        <Card
          title={`Зарегистрированные участники (${event.registeredCount})`}
          extra={
            canRegisterParticipant || canSeedTestRegistrations ? (
              <Space wrap>
                {canRegisterParticipant ? (
                  <Button type="primary" onClick={() => setIsRegisterParticipantOpen(true)}>
                    Зарегистрировать участника
                  </Button>
                ) : null}
                {canSeedTestRegistrations ? (
                  <Button onClick={() => setIsTestRegistrationsOpen(true)}>Тестовые заявки</Button>
                ) : null}
              </Space>
            ) : null
          }
        >
          {showProtocolToolbar ? (
            <div style={{ marginBottom: 16 }}>
              <ProtocolFilters
                value={protocolFilters}
                cityOptions={cityOptions}
                teamOptions={teamOptions}
                onChange={setProtocolFilters}
              />
            </div>
          ) : null}
          {event.registrations === null ? (
            <Space direction="vertical" size={12}>
              <Typography.Text type="secondary">
                Список участников доступен только авторизованным пользователям
              </Typography.Text>
              <Button type="primary" onClick={() => authService.startLoginFlow()}>
                Войти
              </Button>
            </Space>
          ) : participantGroups.length === 0 ? (
            <Table
              columns={participantColumns}
              dataSource={[]}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'Пока никто не зарегистрировался' }}
            />
          ) : filteredParticipantGroups.length === 0 ? (
            <Empty description="Участники не найдены">
              <Button onClick={() => setProtocolFilters(emptyProtocolFilters)}>
                Сбросить фильтры
              </Button>
            </Empty>
          ) : (
            <Space direction="vertical" size={24} style={{ width: '100%' }}>
              {classCompetitionsQuery.isError ? (
                <Typography.Text type="danger">
                  Не удалось загрузить сетку многоэтапной гонки.
                </Typography.Text>
              ) : null}
              {filteredParticipantGroups.map((group) => (
                <div key={group.key} className="event-participant-group">
                  <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>
                    {group.title} ({group.sections.reduce((sum, section) => sum + section.visibleRows.length, 0)})
                  </Typography.Title>
                  <Tabs
                    type="card"
                    items={group.sections.map((section) => {
                      const sample = section.rows[0];
                      const formatId = sample?.format?.id ?? null;
                      const gender = sample?.gender ?? '';
                      const startId = sample?.startId ?? '';
                      const categoryFinished = categoryIsFinished(
                        event.finishedCategories ?? [],
                        startId,
                        formatId,
                        gender,
                      );
                      const readyToFinish = categoryReadyToFinish(section.rows);
                      const sectionCompetitions = competitionsForRows(
                        section.rows,
                        classCompetitions,
                      );
                      const wholeRace =
                        sectionCompetitions.find((item) => item.targetWholeCategory) ??
                        null;
                      const bracketInProgress = sectionCompetitions.some(
                        (item) => item.status !== 'DONE',
                      );
                      const split =
                        event.ageSplits?.find(
                          (item) =>
                            item.startId === startId &&
                            item.formatId === formatId &&
                            item.gender === gender,
                        ) ?? null;
                      const racedRegistrationIds = new Set(
                        registrations
                          .filter((row) => row.raceId != null)
                          .map((row) => row.id),
                      );
                      const sectionViews: ProtocolSectionView[] = [];
                      if (wholeRace) {
                        sectionViews.push({
                          key: `race-${wholeRace.id}`,
                          title: wholeRace.title || section.title,
                          subtitle: wholeRace.subtitle,
                          rows: section.visibleRows,
                          allRows: section.rows,
                          competition: wholeRace,
                          sectionId: wholeRace.sectionId,
                          bound: wholeRace.youngestBound ?? 0,
                        });
                      } else {
                        for (const competition of sectionCompetitions) {
                          sectionViews.push({
                            key: `race-${competition.id}`,
                            title: competition.title || section.title,
                            subtitle: competition.subtitle,
                            rows: section.visibleRows.filter(
                              (row) => row.raceId === competition.id,
                            ),
                            allRows: section.rows.filter(
                              (row) => row.raceId === competition.id,
                            ),
                            competition,
                            sectionId: competition.sectionId,
                            bound: competition.youngestBound ?? 0,
                          });
                        }
                        for (const ageSection of section.ageSections) {
                          const rows = ageSection.visibleRows.filter(
                            (row) => row.raceId == null,
                          );
                          if (rows.length === 0) continue;
                          sectionViews.push({
                            key: `simple-${ageSection.key}`,
                            title: ageSection.title ?? section.title,
                            subtitle: ageSection.subtitle,
                            rows,
                            allRows: ageSection.rows.filter(
                              (row) => row.raceId == null,
                            ),
                            competition: null,
                            sectionId: ageSection.key,
                            bound: simpleSectionBound(ageSection.key, split),
                          });
                        }
                        if (sectionViews.length === 0) {
                          sectionViews.push({
                            key: `simple-${section.key}`,
                            title: section.title,
                            subtitle: null,
                            rows: section.visibleRows,
                            allRows: section.rows,
                            competition: null,
                            sectionId: 'CATEGORY',
                            bound: 0,
                          });
                        }
                      }
                      sectionViews.sort(
                        (left, right) =>
                          left.bound - right.bound ||
                          (left.competition ? 0 : 1) -
                            (right.competition ? 0 : 1) ||
                          left.title.localeCompare(right.title),
                      );
                      const compactActive =
                        compactProtocol && !fullProtocolKeys.includes(section.key);
                      const ageSplitSelection: AgeSplitCategory | null =
                        resolveAgeSplitSelection({
                          roles: session?.roles,
                          eventStatus: event.status,
                          bracketInProgress: false,
                          hasStarts: event.starts.length > 0,
                          rowCount: section.rows.length,
                          startId,
                          formatId,
                          gender,
                          startLabel:
                            event.starts.find((item) => item.id === startId)
                              ?.resolvedLabel ?? section.title,
                          formatName: sample?.format?.name ?? '',
                        });
                      const renderTable = (view: ProtocolSectionView) => {
                        const raced = view.rows.some((row) =>
                          racedRegistrationIds.has(row.id),
                        );
                        const locked = view.competition != null || categoryFinished;
                        const columns = locked
                          ? getParticipantColumns({
                              showReachedStage: view.competition != null,
                              canAssignNumbers: false,
                              canAssignResults: false,
                              canChangeStatus: false,
                              savingNumberId: savingStartNumberId,
                              savingResultId: savingFinishTimeId,
                              savingStatusId: savingRegistrationStatusId,
                              savingOutcomeId,
                              onAssignNumber: assignStartNumber,
                              onChangeStatus: assignRegistrationStatus,
                              onAssignOutcome: assignOutcome,
                              onAssignResult: assignFinishTime,
                            })
                          : getParticipantColumns({
                              showReachedStage: false,
                              canAssignNumbers: raced ? false : canAssignNumbers,
                              canAssignResults: canAssignResults,
                              canChangeStatus: canChangeRegistrationStatus,
                              savingNumberId: savingStartNumberId,
                              savingResultId: savingFinishTimeId,
                              savingStatusId: savingRegistrationStatusId,
                              savingOutcomeId,
                              onAssignNumber: assignStartNumber,
                              onChangeStatus: assignRegistrationStatus,
                              onAssignOutcome: assignOutcome,
                              onAssignResult: assignFinishTime,
                            });
                        return (
                          <Table
                            key={view.key}
                            className={
                              compactActive
                                ? 'protocol-table protocol-table--compact'
                                : 'protocol-table'
                            }
                            columns={columnsForProtocol(columns, compactActive)}
                            dataSource={rowsWithClassification(
                              view.rows,
                              view.competition,
                            )}
                            rowKey="id"
                            pagination={false}
                            tableLayout={compactActive ? 'fixed' : undefined}
                            scroll={compactActive ? undefined : { x: 'max-content' }}
                          />
                        );
                      };
                      const finishControl =
                        canRunBracket && !categoryFinished ? (
                          <Tooltip
                            title={
                              readyToFinish
                                ? undefined
                                : 'Укажите результат каждому участнику, который занимает место, либо поставьте DNS, DNF, DSQ или NQ.'
                            }
                          >
                            <span>
                              <Button
                                {...(readyToFinish
                                  ? { color: 'green', variant: 'solid' as const }
                                  : { type: 'primary' as const })}
                                disabled={!readyToFinish || bracketInProgress}
                                loading={finishingCategory === section.key}
                                onClick={() =>
                                  finishCategory(startId, formatId, gender, section.key)
                                }
                              >
                                Завершить гонку
                              </Button>
                            </span>
                          </Tooltip>
                        ) : null;
                      return {
                        key: section.key,
                        label: (
                          <Space size={8}>
                            <span>{section.title}</span>
                            <Typography.Text type="secondary">
                              {formatParticipantCount(
                                section.visibleRows.length,
                                group.key,
                              )}
                            </Typography.Text>
                          </Space>
                        ),
                        children: (
                          <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 12,
                                flexWrap: 'wrap',
                              }}
                            >
                              <Space size={8} wrap>
                                {ageSplitSelection ? (
                                  <Button
                                    onClick={() =>
                                      setAgeSplitCategory(ageSplitSelection)
                                    }
                                  >
                                    Возрастные категории
                                  </Button>
                                ) : null}
                                {compactProtocol ? (
                                  <Button
                                    type="link"
                                    size="small"
                                    style={{ paddingInline: 0 }}
                                    onClick={() => toggleFullProtocol(section.key)}
                                  >
                                    {fullProtocolKeys.includes(section.key)
                                      ? 'Краткий протокол'
                                      : 'Полный протокол'}
                                  </Button>
                                ) : null}
                              </Space>
                              <Space size={8} wrap>
                                {finishControl}
                                {categoryFinished ? <Tag>Гонка завершена</Tag> : null}
                              </Space>
                            </div>
                            {sectionViews.map((view) => (
                              <div
                                key={view.key}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 8,
                                  padding: 12,
                                  border: '1px solid #f0f0f0',
                                  borderRadius: 8,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <Space size={4} align="baseline" wrap>
                                    <Button
                                      type="text"
                                      size="small"
                                      aria-expanded={!collapsedBlockKeys.includes(view.key)}
                                      aria-label={
                                        collapsedBlockKeys.includes(view.key)
                                          ? 'Развернуть категорию'
                                          : 'Свернуть категорию'
                                      }
                                      title={
                                        collapsedBlockKeys.includes(view.key)
                                          ? 'Развернуть категорию'
                                          : 'Свернуть категорию'
                                      }
                                      icon={
                                        collapsedBlockKeys.includes(view.key) ? (
                                          <RightOutlined />
                                        ) : (
                                          <DownOutlined />
                                        )
                                      }
                                      onClick={() => toggleBlockCollapsed(view.key)}
                                    />
                                    <Space size={8} align="baseline" wrap>
                                      <Typography.Text strong>{view.title}</Typography.Text>
                                      {view.subtitle ? (
                                        <Typography.Text type="secondary">
                                          {view.subtitle}
                                        </Typography.Text>
                                      ) : null}
                                      <Typography.Text type="secondary">
                                        {formatParticipantCount(view.rows.length, group.key)}
                                      </Typography.Text>
                                      {view.competition ? (
                                        <Tag>Многоэтапная гонка</Tag>
                                      ) : null}
                                    </Space>
                                  </Space>
                                  {!view.competition && classCompetitionsQuery.isSuccess ? (
                                    <ClassCompetitionPanel
                                      eventId={event.id}
                                      competition={null}
                                      startId={startId}
                                      sectionId={view.sectionId}
                                      formatId={formatId}
                                      gender={gender}
                                      eventLaps={event.laps ?? []}
                                      canManage={canRunBracket}
                                      registrationClosed={registrationClosed}
                                      categoryHasResults={categoryHasResults(view.allRows) || categoryFinished}
                                      onChanged={refreshEvent}
                                    />
                                  ) : null}
                                </div>
                                {!collapsedBlockKeys.includes(view.key) ? (
                                  <>
                                    {view.competition && classCompetitionsQuery.isSuccess ? (
                                      <ClassCompetitionPanel
                                        eventId={event.id}
                                        competition={view.competition}
                                        startId={startId}
                                        sectionId={view.sectionId}
                                        formatId={formatId}
                                        gender={gender}
                                        eventLaps={event.laps ?? []}
                                        canManage={canRunBracket}
                                        registrationClosed={registrationClosed}
                                        categoryHasResults={categoryHasResults(view.allRows) || categoryFinished}
                                        onChanged={refreshEvent}
                                      />
                                    ) : null}
                                    {view.competition &&
                                    view.competition.status !== 'DONE'
                                      ? null
                                      : renderTable(view)}
                                  </>
                                ) : null}
                              </div>
                            ))}
                          </Space>
                        ),
                      };
                    })}
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
      <SeedTestRegistrationsModal
        open={isTestRegistrationsOpen}
        eventId={event.id}
        formats={event.formats}
        starts={event.starts}
        onClose={() => setIsTestRegistrationsOpen(false)}
        onCreated={refreshEvent}
      />
      <RegisterEventModal
        open={isRegisterOpen}
        eventId={event.id}
        formats={event.formats}
        starts={event.starts}
        initialFormatId={registerInitialFormatId}
        initialStartId={registerInitialStartId}
        onClose={() => setIsRegisterOpen(false)}
        onRegistered={refreshEvent}
      />
      <Modal
        title="Регистрация на гонку"
        open={pendingRegistration != null}
        onCancel={() => {
          if (isRegisteringByFormat) return;
          setPendingRegistration(null);
        }}
        okText="Зарегистрироваться"
        cancelText="Отмена"
        confirmLoading={isRegisteringByFormat}
        onOk={() => void confirmFormatRegistration()}
      >
        {pendingRegistration
          ? `Вы хотите зарегистрироваться на гонку «${event.name}» на старте «${pendingRegistration.start.resolvedLabel}» в категории «${pendingRegistration.format.name}»?`
          : null}
      </Modal>
      <RegisterParticipantModal
        open={isRegisterParticipantOpen}
        eventId={event.id}
        formats={event.formats}
        starts={event.starts}
        onClose={() => setIsRegisterParticipantOpen(false)}
        onRegistered={refreshEvent}
      />
      <AgeSplitModal
        open={ageSplitCategory !== null}
        category={ageSplitCategory}
        value={ageSplitValue}
        groupCounts={ageSplitGroupCounts}
        notApplied={ageSplitNotApplied}
        raceSections={ageSplitRaceSections}
        saving={isSavingAgeSplit}
        onClose={() => setAgeSplitCategory(null)}
        onSave={saveAgeSplit}
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
