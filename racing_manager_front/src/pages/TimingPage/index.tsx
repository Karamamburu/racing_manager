import { ArrowLeftOutlined, CopyOutlined } from '@ant-design/icons';
import { AxiosError } from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Modal,
  Result,
  Row,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { useEventDetailsQuery } from '../../features/events/useEventDetailsQuery';
import { AnonymousSplitQueue } from '../../features/timing/AnonymousSplitQueue';
import { AttemptRecordDrawer } from '../../features/timing/AttemptRecordDrawer';
import {
  canAdministerTiming,
  canOperateTiming,
} from '../../features/timing/capabilities';
import { CaptureControls } from '../../features/timing/CaptureControls';
import { NumberCaptureField } from '../../features/timing/NumberCaptureField';
import { PendingFinishBar } from '../../features/timing/PendingFinishBar';
import { TimingCategoryBlock } from '../../features/timing/TimingCategoryBlock';
import { TimingHeatBlock } from '../../features/timing/TimingHeatBlock';
import { TimingMetricsPanel } from '../../features/timing/TimingMetrics';
import {
  deriveTimingOfflineView,
  timingOfflineBlockKey,
} from '../../features/timing/timingOffline';
import { TimingSendQueue } from '../../features/timing/TimingSendQueue';
import { timingService } from '../../features/timing/timingService';
import type {
  TimingAnonymousSplitView,
  TimingCaptureView,
  TimingCategoryBlockView,
  TimingCategoryState,
  TimingParticipantTileView,
  TimingStageGroupView,
  TimingStageState,
  TimingSurfaceView,
} from '../../features/timing/types';
import {
  timingSurfaceQueryKey,
  type TimingCaptureOutcome,
  useTimingCapture,
} from '../../features/timing/useTimingCapture';
import { formatDateTime } from '../../shared/formatDateTime';
import { AppShell } from '../../shared/layout';
import type { EventDetails } from '../../shared/types/event';
import {
  timingBlockLayout,
  timingBlockRows,
  timingRowItemFlex,
  type TimingBlockLayout,
} from './blockLayout';

/** Session key of the workstation instance that owns this browser tab. */
const WORKSTATION_STORAGE_KEY = 'timing-workstation-instance';

const GENDER_LABELS: Record<string, string> = {
  M: 'Мужчины',
  F: 'Женщины',
};

/** Active categories first, untouched ones next, every closed state last. */
const CATEGORY_STATE_ORDER: Record<TimingCategoryState, number> = {
  RUNNING: 0,
  NOT_STARTED: 1,
  COMPLETED: 2,
  INCOMPLETE: 2,
  CANCELLED: 2,
};

/**
 * The protocol category a block belongs to: a category block and every heat
 * block of its race share the same start, format and gender, so they move as
 * one unit and keep their stage-header grouping.
 */
function blockCategoryKey(block: TimingCategoryBlockView): string {
  return `${block.startId}:${block.formatId}:${block.gender}`;
}

/** One card placed in a width row, with the fraction the row gives it. */
type BlockRowItem = {
  key: string;
  layout: TimingBlockLayout;
  node: ReactNode;
  priority?: number;
};

/** Stage state as the header names it: formed, not formed, closed (U-12). */
const STAGE_STATE_LABELS: Record<TimingStageState, string> = {
  PENDING: 'Заезды не сформированы',
  SEEDED: 'Заезды сформированы',
  COMPLETED: 'Этап завершён',
};

const STAGE_STATE_COLORS: Record<TimingStageState, string> = {
  PENDING: 'orange',
  SEEDED: 'blue',
  COMPLETED: 'green',
};

/** What a stage header states when the API supplied no reason of its own. */
const STAGE_HEATS_MISSING_MESSAGE = 'Заезды этого этапа ещё не сформированы.';

/**
 * The page states the online-only rule itself where no component owns the gate
 * (U-07, F-04, FR-43, FR-48). A capture-side entry is queued instead, so this
 * sentence never replaces an unsent status.
 */
const OFFLINE_REQUIRED_MESSAGE = 'Нужна связь с сервером.';

/** The connection state the page shows beside its unsent figures (S-04). */
const CONNECTED_LABEL = 'Связь есть';
const DISCONNECTED_LABEL = 'Нет связи с сервером';

/** The overlay the figures trigger opens (U-07, E-09). */
const SEND_QUEUE_DIALOG_LABEL = 'Очередь отправки';

/**
 * The close control of the queue content. It is named here as well, because the
 * page moves keyboard focus into the overlay through it when the overlay opens
 * (E-09) and the content component paints it.
 */
const SEND_QUEUE_CLOSE_LABEL = 'Закрыть очередь отправки';

/**
 * The reserved figures row of the top control card (U-12, S-08).
 *
 * The row is rendered in every state and keeps its height while the figures
 * change, so no capture can add, remove or move a control in page flow. It is
 * the positioning context of the overlay, which floats over the page instead of
 * taking page flow (U-09, F-10).
 */
const FIGURES_ROW_STYLE: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  minHeight: 32,
};

/**
 * The unsent figures as the single pressable control (U-08, U-09).
 *
 * It keeps the accepted wording on one line: a four-digit count scrolls inside
 * the control instead of wrapping and growing the reserved row (S-10, U-12).
 */
const FIGURES_TRIGGER_STYLE: CSSProperties = {
  whiteSpace: 'nowrap',
  overflowX: 'auto',
  background: 'transparent',
  border: 'none',
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  height: 28,
};

/**
 * The overlay itself: an absolutely positioned panel inside the reserved row.
 * It carries no backdrop and traps no focus, so every control behind it stays
 * operable (U-09, S-06).
 */
const SEND_QUEUE_OVERLAY_STYLE: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 4,
  zIndex: 1050,
};

/** The assignment press a cleared selection can no longer route (E-13). */
const NO_SELECTED_SPLIT_MESSAGE = 'Назначение недоступно: отсечка не выбрана';

/**
 * The volatile-storage warning (FR-30, O-01).
 *
 * A memory-backed outbox cannot keep an entry beyond this page view, and the
 * product cannot recover an entry it never stored. The page states that before
 * the loss, while at least one unsent entry exists, and leaves the confirmation
 * itself to the browser: no local dialog may imply a recovery that does not
 * exist.
 */
const VOLATILE_STORAGE_WARNING =
  'Записи хранятся только в этой вкладке. Перезагрузка или закрытие страницы их потеряет.';

/**
 * The surface the page derives against before its read resolves. The leave
 * guard runs before the early returns, so it needs a derivation even while the
 * surface is absent; an empty one derives empty views and renders nothing.
 */
const EMPTY_TIMING_SURFACE: TimingSurfaceView = {
  eventId: '',
  captureWorkstationInstanceId: null,
  categories: [],
};

/**
 * The workstation instance of this tab, created once and kept in
 * `sessionStorage`, so a reload continues the same instance instead of
 * pretending to be a new workstation and asking for capture again.
 */
function readWorkstationInstanceId(): string {
  try {
    const stored = sessionStorage.getItem(WORKSTATION_STORAGE_KEY);
    if (stored) return stored;
    const created = newWorkstationInstanceId();
    sessionStorage.setItem(WORKSTATION_STORAGE_KEY, created);
    return created;
  } catch (error) {
    console.warn(
      'timing: sessionStorage is unavailable, using an in-memory workstation instance',
      error,
    );
    return newWorkstationInstanceId();
  }
}

function newWorkstationInstanceId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `workstation-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * The message of an API refusal. The rules live in the API, so the surface
 * shows the text it returned and never maps a status code to a local rule.
 */
function describeError(error: unknown): string {
  if (error instanceof AxiosError) {
    const payload = error.response?.data as
      | { message?: string | string[] }
      | undefined;
    const text = payload?.message;
    if (typeof text === 'string' && text.trim()) return text;
    if (Array.isArray(text) && text.length > 0) return text.join(' ');
  }
  return 'Не удалось выполнить запрос хронометража';
}

/**
 * The stable identity of one block on the surface. The API supplies `blockKey`;
 * a surface that predates it keeps the identity the page already rendered by.
 * A category identity is its start, format and gender; a heat identity must add
 * the stage and the heat, or two heats of one category would collide.
 */
function blockIdentity(block: TimingCategoryBlockView): string {
  if (block.blockKey !== undefined) return block.blockKey;
  if (block.kind === 'HEAT') {
    return `heat:${block.classCompetitionId ?? block.startId}:${
      block.stageId ?? ''
    }:${String(block.heatNumber ?? 0)}`;
  }
  return `${block.startId}:${block.formatId}:${block.gender}`;
}

/** The multi-stage race a heat block belongs to. */
function heatRaceIdentity(block: TimingCategoryBlockView): string {
  return block.classCompetitionId ?? block.startId;
}

/**
 * The human title and subtitle of one block, from the event starts and
 * participation formats. The backend order stays untouched: this only names a
 * block, and falls back to its ids when the event read model does not know it.
 */
function describeBlock(
  block: TimingCategoryBlockView,
  event: EventDetails | undefined,
): { title: string; subtitle: string } {
  const format = event?.formats.find((item) => item.id === block.formatId);
  const start = event?.starts.find((item) => item.id === block.startId);
  const gender = GENDER_LABELS[block.gender] ?? block.gender;
  return {
    title: format ? `${format.name} · ${gender}` : `${block.formatId} · ${gender}`,
    subtitle: start ? start.resolvedLabel : block.startId,
  };
}

/**
 * One stage header: the race, the stage and its state, plus the reason its
 * heats are missing or closed (U-12, F-12, S-06).
 */
function StageHeader({ group }: { group: TimingStageGroupView }) {
  const reason =
    group.blockReason ??
    (group.heatBlockKeys.length === 0 ? STAGE_HEATS_MISSING_MESSAGE : null);
  return (
    <Card size="small">
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space wrap size={8} align="center">
          <Typography.Text strong>{group.raceTitle}</Typography.Text>
          <Typography.Text>{group.stageLabel}</Typography.Text>
          <Tag color={STAGE_STATE_COLORS[group.stageState]}>
            {STAGE_STATE_LABELS[group.stageState]}
          </Tag>
        </Space>
        {reason === null ? null : (
          <Alert type="warning" showIcon message={reason} />
        )}
      </Space>
    </Card>
  );
}

/**
 * Whether the surface still knows an attempt, as its block's newest attempt or
 * as one of the earlier attempts of the same category.
 */
function surfaceHasAttempt(
  surface: TimingSurfaceView,
  attemptId: string,
): boolean {
  return surface.categories.some(
    (block) =>
      block.attemptId === attemptId ||
      block.lastAttempts.some((attempt) => attempt.attemptId === attemptId),
  );
}

/**
 * The event-wide timing surface (AD-9, AD-17).
 *
 * One block per timeable protocol category in the backend order. The page only
 * renders: `useTimingCapture` owns the clock anchor, the capture outbox and
 * every mutation, so this component wires the controls to that hook and never
 * talks to the API for a write itself. The attempt record drawer owns every
 * correction control (T13), so the page only decides which attempt it reads and
 * which block supplies the participant names (U-29).
 *
 * The page also owns the two client-only display states of the anonymous split
 * workflow: the split the number field assigns (E-04) and the block whose
 * running attempt receives the next empty Enter (E-01, U-02). Neither is ever
 * written to the event, the attempt or a result.
 *
 * MANUAL-TIMING-4: the page derives the whole offline report once from the
 * outbox the hook owns and the surface the server confirms (FR-11, FR-12), then
 * hands the same figures to the send queue, to the three capture figures beside
 * the controls, to every block header and tile, to the number field and to the
 * record drawer. Nothing here counts an unsent entry as a pass, and the only
 * connection rule the page applies itself is the one no component owns
 * (U-07, F-04). A device whose outbox is volatile states that while it holds an
 * unsent entry and asks the browser to confirm a leave (FR-30, O-01).
 *
 * MANUAL-TIMING-6: the top control card keeps one reserved figures row, and the
 * figures are that row's single pressable control (U-08, U-12). The detailed
 * send queue is reachable only through it and lives in a non-modal overlay
 * outside page flow (U-07, U-09), so a capture that queues, sends or drains
 * moves nothing behind the overlay (E-05, F-10).
 */
export function TimingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const eventQuery = useEventDetailsQuery(id);
  const [workstationInstanceId] = useState(readWorkstationInstanceId);
  const backToEvent = id ? (
    <Button
      icon={<ArrowLeftOutlined />}
      aria-label="К мероприятию"
      onClick={() => navigate(`/events/${id}`)}
    >
      К мероприятию
    </Button>
  ) : undefined;
  // The record the drawer reads, and the `enrollmentId → fullName` map of the
  // block that supplied the attempt, so a pass names its participant without a
  // second request per row.
  const [recordAttemptId, setRecordAttemptId] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [recordTitle, setRecordTitle] = useState('Запись');
  const [recordParticipantNames, setRecordParticipantNames] = useState<
    Record<string, string>
  >({});
  // The queued split in assignment mode and the block that is current; both
  // are page-session display state (AD-17, E-02).
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const [anonymousNotice, setAnonymousNotice] = useState<string | null>(null);
  // The page's own online-only refusal, for the presses no component gates
  // (U-07, F-04). It never stands in for an unsent capture.
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  // The on-demand unsent overlay and the two elements that own its focus: the
  // panel itself decides whether focus returns to the trigger (U-07, E-09).
  const [overlayOpen, setOverlayOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const overlayTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [splitChoice, setSplitChoice] = useState<{
    splitId: string;
    startNumber: number;
    attempts: Array<{
      attemptId: string;
      label: string;
      passCount: number;
      requiredLaps: number;
    }>;
  } | null>(null);

  const roles = sessionQuery.data?.roles ?? [];
  const canOperate = canOperateTiming(roles);
  const canAdminister = canAdministerTiming(roles);

  const surfaceQueryKey = timingSurfaceQueryKey(id);
  // The surface is read on mount, on `Обновить` and after every mutation. A
  // running block advances its clock locally, so no timer reads the surface for
  // it (AD-19, FR-39): the old 5 s running poll is gone on purpose.
  const surfaceQuery = useQuery<TimingSurfaceView>({
    queryKey: surfaceQueryKey,
    queryFn: () => timingService.getSurface(id as string),
    enabled: Boolean(id) && canOperate,
  });

  // The capture hook is called before any early return: it owns the client
  // clock anchor (AD-2), the write-before-send outbox (AD-3) and every
  // invalidation, and a page render must never reorder those hooks.
  const capture = useTimingCapture(
    id,
    surfaceQuery.data,
    workstationInstanceId,
    (text) => message.error(text),
  );

  /**
   * The page's own online-only guard, for a press no component gates (U-07,
   * F-04). A capture-side entry is queued and never reaches this guard.
   */
  const requireConnection = (): boolean => {
    if (capture.isOnline) return true;
    setOfflineNotice(OFFLINE_REQUIRED_MESSAGE);
    return false;
  };

  /**
   * `Обновить` reads both halves of the offline report again: the surface the
   * server confirms and the outbox this device keeps (FR-11, FR-12).
   */
  const refreshReads = () => {
    void queryClient.invalidateQueries({ queryKey: surfaceQueryKey });
    void capture.refreshQueue();
  };

  /**
   * Closes the overlay and returns focus to the trigger only when focus was
   * inside it (E-08, E-09, F-04). A referee typing in the number field keeps
   * both the focus and the value already typed there.
   */
  const closeOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const active = document.activeElement;
    const focusWasInside =
      overlay !== null && active !== null && overlay.contains(active);
    setOverlayOpen(false);
    if (focusWasInside) overlayTriggerRef.current?.focus();
  }, []);

  /** A returned connection retires the page's own notice, not a component's reason. */
  useEffect(() => {
    if (!capture.isOnline) return;
    setOfflineNotice(null);
  }, [capture.isOnline]);

  // An open record never outlives its attempt on the surface: once a refetch
  // no longer lists it, the drawer closes instead of reading a record the
  // surface dropped. A closed attempt stays listed as the category's newest or
  // earlier attempt, so its closure report remains readable.
  useEffect(() => {
    if (recordAttemptId === null) return;
    const surface = surfaceQuery.data;
    if (surface === undefined) return;
    if (surfaceHasAttempt(surface, recordAttemptId)) return;
    setRecordAttemptId(null);
  }, [recordAttemptId, surfaceQuery.data]);

  // A selected entry that another actor assigned, undid or cancelled leaves the
  // number field in normal capture mode without a local click (E-09, F-05).
  useEffect(() => {
    if (selectedSplitId === null) return;
    const splits = surfaceQuery.data?.anonymousSplits;
    if (splits === undefined) return;
    if (splits.some((entry) => entry.splitId === selectedSplitId)) return;
    setSelectedSplitId(null);
  }, [selectedSplitId, surfaceQuery.data]);

  /** Opens the record of the attempt the block currently shows (U-29). */
  const openRecord = (block: TimingCategoryBlockView) => {
    const attemptId = block.attemptId;
    if (attemptId === null) return;
    setRecordTitle(
      block.kind === 'HEAT' ? 'Запись заезда' : 'Запись категории',
    );
    setRecordParticipantNames(
      Object.fromEntries(
        block.participants.map((participant) => [
          participant.enrollmentId,
          participant.fullName,
        ]),
      ),
    );
    setRecordAttemptId(attemptId);
  };

  /**
   * The device outbox as the page reports it. One derivation feeds the three
   * capture figures, the send queue, both pending-mark maps and the
   * volatile-storage guard, so the page total, the send queue and the tiles can
   * never disagree (S-01, S-04, FR-11, FR-12, FR-30, FR-37, FR-46, U-08). It is
   * derived here, before the early returns, because the leave guard below is a
   * hook; the empty surface stands in only while the real read is absent, and
   * every early return renders no surface at all.
   */
  const offlineView = deriveTimingOfflineView(
    capture.queueItems,
    surfaceQuery.data ?? EMPTY_TIMING_SURFACE,
  );

  /**
   * The one accepted figures line: the text and the accessible name of the
   * overlay trigger, read from the same snapshot as the overlay itself (U-08,
   * U-10, U-12).
   */
  const figuresLine = `Не отправлено: ${offlineView.totals.unsentEntries} · Отправляется: ${offlineView.totals.sendingEntries} · Ожидают отправки: ${offlineView.totals.waitingEntries} · из них отметок: ${offlineView.totals.pendingMarks}`;

  /**
   * The volatile-storage protection (FR-30, O-01). It reads the same unsent
   * total as the page figures and the send queue, so a durable device and an
   * empty queue stay unguarded.
   */
  const needsVolatileWarning =
    !capture.isDurable && offlineView.totals.unsentEntries > 0;

  // Escape is the deliberate close of the overlay: unlike a press outside it,
  // it always closes and restores focus only when focus was inside (E-08, F-03).
  useEffect(() => {
    if (!overlayOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeOverlay();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [overlayOpen, closeOverlay]);

  // Opening announces the dialog and takes keyboard focus into it, so a
  // keyboard user reads the rows and closes it without a pointer (E-09).
  useEffect(() => {
    if (!overlayOpen) return;
    const closeButton = overlayRef.current?.querySelector<HTMLElement>(
      `[aria-label="${SEND_QUEUE_CLOSE_LABEL}"]`,
    );
    closeButton?.focus();
  }, [overlayOpen]);

  useEffect(() => {
    if (!needsVolatileWarning) return;
    // The browser owns the confirmation dialog: a local modal could imply a
    // recovery the product cannot offer (FR-30).
    const confirmLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', confirmLeave);
    return () => {
      window.removeEventListener('beforeunload', confirmLeave);
    };
  }, [needsVolatileWarning]);

  const event = eventQuery.data;
  const subtitle = event
    ? `${event.name} · ${formatDateTime(event.eventDate)}`
    : 'Загружаем мероприятие...';

  if (!id) {
    return (
      <AppShell title="Хронометраж" subtitle="Мероприятие не выбрано">
        <Result
          status="404"
          title="Мероприятие не найдено"
          subTitle="В адресе нет идентификатора мероприятия."
        />
      </AppShell>
    );
  }

  if (sessionQuery.isLoading) {
    return (
      <AppShell title="Хронометраж" subtitle={subtitle} extra={backToEvent}>
        <Card>
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      </AppShell>
    );
  }

  if (!canOperate) {
    return (
      <AppShell title="Хронометраж" subtitle={subtitle} extra={backToEvent}>
        <Result
          status="403"
          title="Хронометраж недоступен"
          subTitle="Экран хронометража открыт только для судей (REFEREE) и администраторов. Роль ORGANIZER без роли REFEREE доступа не даёт."
        />
      </AppShell>
    );
  }

  if (surfaceQuery.isLoading) {
    return (
      <AppShell title="Хронометраж" subtitle={subtitle} extra={backToEvent}>
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      </AppShell>
    );
  }

  if (surfaceQuery.isError) {
    return (
      <AppShell title="Хронометраж" subtitle={subtitle} extra={backToEvent}>
        <Alert
          type="error"
          showIcon
          message="Не удалось загрузить поверхность хронометража"
          description={describeError(surfaceQuery.error)}
          action={
            <Button size="small" onClick={() => void surfaceQuery.refetch()}>
              Повторить
            </Button>
          }
        />
      </AppShell>
    );
  }

  const surface = surfaceQuery.data;
  if (!surface) {
    return (
      <AppShell title="Хронометраж" subtitle={subtitle} extra={backToEvent}>
        <Card>
          <Empty description="Хронометраж пуст" />
        </Card>
      </AppShell>
    );
  }

  // The surface exposes the holder instance only, so the lock view carries the
  // fields it knows and leaves the user id and moment absent. A free lock is
  // `null`, the value the capture controls read as free (AD-5).
  const captureView: TimingCaptureView | null =
    surface.captureWorkstationInstanceId === null
      ? null
      : {
          eventId: surface.eventId,
          workstationInstanceId: surface.captureWorkstationInstanceId,
          heldByUserId: null,
          heldAt: null,
        };

  const isCaptureHolder =
    surface.captureWorkstationInstanceId !== null &&
    surface.captureWorkstationInstanceId === workstationInstanceId;
  const holderLabel = isCaptureHolder
    ? 'это устройство'
    : surface.captureWorkstationInstanceId === null
      ? 'свободен'
      : `устройство ${surface.captureWorkstationInstanceId}`;
  const hasRunningBlock = surface.categories.some(
    (block) => block.state === 'RUNNING',
  );

  // A block reads its own share under the identity the derivation used, so a
  // tile mark and its block total stay one fact (FR-10, FR-37).
  const pendingMarksByBlock = new Map<string, Map<string, number>>();
  for (const tile of offlineView.participantMarks) {
    const perParticipant =
      pendingMarksByBlock.get(tile.blockKey) ?? new Map<string, number>();
    perParticipant.set(tile.enrollmentId, tile.pendingMarks);
    pendingMarksByBlock.set(tile.blockKey, perParticipant);
  }
  const pendingMarkTotalsByBlock = new Map<string, number>(
    offlineView.blockMarks.map((blockMarks) => [
      blockMarks.blockKey,
      blockMarks.pendingMarks,
    ]),
  );

  const anonymousSplits: TimingAnonymousSplitView[] =
    surface.anonymousSplits ?? [];
  const selectedSplit =
    anonymousSplits.find((entry) => entry.splitId === selectedSplitId) ?? null;

  // The stage headers group the heat blocks; a heat block's race comes from its
  // own fields, so a surface without headers still renders every heat (U-12).
  const stageGroups = surface.stageGroups ?? [];
  const stageGroupsByRace = new Map<string, TimingStageGroupView[]>();
  const heatBlocksByKey = new Map<string, TimingCategoryBlockView>();
  for (const group of stageGroups) {
    const groups = stageGroupsByRace.get(group.raceId) ?? [];
    groups.push(group);
    stageGroupsByRace.set(group.raceId, groups);
  }
  for (const block of surface.categories) {
    if (block.kind !== 'HEAT') continue;
    heatBlocksByKey.set(blockIdentity(block), block);
  }
  const raceTitleOf = (raceId: string): string | undefined =>
    stageGroups.find((group) => group.raceId === raceId)?.raceTitle;

  /** Copies this tab's workstation id, so the referee can transfer capture. */
  const copyWorkstationId = async () => {
    try {
      await navigator.clipboard.writeText(workstationInstanceId);
      setCopyNotice({ text: 'ID скопирован', error: false });
    } catch {
      setCopyNotice({
        text: 'Не удалось скопировать. Выделите ID вручную.',
        error: true,
      });
    }
  };

  /** The Start press of one block; a refusal leaves capture state untouched. */
  const startBlock = (block: TimingCategoryBlockView) => {
    // A start writes on the server and is never queued, so it waits for a
    // connection instead of pretending to be an offline capture (U-07, F-04).
    if (!requireConnection()) return;
    void capture.startAttempt(block).then(
      () => {
        setAnonymousNotice(null);
        setOfflineNotice(null);
      },
      (failure: unknown) => {
        console.warn('timing: the Start press was refused', failure);
      },
    );
  };

  /** Enter on the empty field: one anonymous split of the current attempt. */
  const captureAnonymousSplit = async (): Promise<TimingCaptureOutcome> => {
    const outcome = await capture.captureAnonymous();
    setAnonymousNotice(null);
    return outcome;
  };

  /**
   * A committed number in assignment mode belongs to the selected entry.
   *
   * The outcome keeps the field's own rules (FR-15…FR-18): a confirmed or
   * unsent assignment leaves the mode so the same split is not offered a second
   * time while it is unsent (E-13), and a refused one stays in the queue and can
   * be selected again later. An ambiguous number keeps the existing picker and
   * records nothing.
   */
  const assignSelectedSplit = async (
    startNumber: number,
  ): Promise<TimingCaptureOutcome> => {
    const split = selectedSplit;
    if (split === null) {
      throw new Error(NO_SELECTED_SPLIT_MESSAGE);
    }
    try {
      const outcome = await capture.assignAnonymousSplit(
        split.splitId,
        startNumber,
      );
      setSelectedSplitId(null);
      return outcome;
    } catch (error) {
      if (
        error instanceof AxiosError &&
        (error.response?.data as { code?: string } | undefined)?.code ===
          'SPLIT_CHOICE_REQUIRED'
      ) {
        const details = (
          error.response?.data as {
            details?: {
              candidates?: Array<{
                attemptId: string;
                passCount: number;
                requiredLaps: number;
              }>;
            };
          }
        ).details;
        const labels = split.candidates ?? [];
        setSplitChoice({
          splitId: split.splitId,
          startNumber,
          attempts: (details?.candidates ?? []).map((candidate) => ({
            attemptId: candidate.attemptId,
            label:
              labels.find(
                (entry) => entry.attemptId === candidate.attemptId,
              )?.attemptLabel ?? candidate.attemptId,
            passCount: candidate.passCount,
            requiredLaps: candidate.requiredLaps,
          })),
        });
      }
      throw error;
    }
  };

  const chooseSplitAttempt = async (attemptId: string) => {
    if (splitChoice === null) return;
    await capture.assignAnonymousSplit(
      splitChoice.splitId,
      splitChoice.startNumber,
      attemptId,
    );
    setSelectedSplitId(null);
    setSplitChoice(null);
  };

  /** A cancelled entry leaves the queue at once; the page clears the mode. */
  const cancelAnonymousSplit = async (splitId: string, reason: string) => {
    // A cancellation is a record correction and stays online-only (U-07,
    // F-04). The dialog keeps its reason open with the sentence.
    if (!requireConnection()) throw new Error(OFFLINE_REQUIRED_MESSAGE);
    await capture.cancelAnonymousSplit(splitId, reason);
    setSelectedSplitId((current) => (current === splitId ? null : current));
  };

  /** Withdrawing a queued split writes on the server, so it is online-only too. */
  const undoAnonymousSplit = async (
    splitId: string,
    deviceSequence: number,
  ): Promise<void> => {
    if (!requireConnection()) return;
    await capture.undoAnonymousSplit(splitId, deviceSequence);
  };

  /** A bound finish is a queued capture-side entry, so its outcome is awaited. */
  const bindPendingFinish = async (
    pendingId: string,
    startNumber: number,
  ): Promise<void> => {
    await capture.bindPending(pendingId, startNumber);
  };

  /**
   * One category or heat block with its own pending-finish bar. The attempt id
   * is narrowed once, because a tile click must route to the attempt of its own
   * block (E-07), and a heat keeps the category behaviour untouched.
   */
  const renderBlock = (block: TimingCategoryBlockView) => {
    const attemptId = block.state === 'RUNNING' ? block.attemptId : null;
    // The block keeps its capture hand-over only while the lock is free; the
    // global controls above own take, transfer and force-release otherwise
    // (AD-5).
    const onTakeCapture =
      surface.captureWorkstationInstanceId === null
        ? () => {
            void capture.takeCapture();
          }
        : undefined;
    const onParticipantClick =
      attemptId === null
        ? undefined
        : (participant: TimingParticipantTileView) => {
            void capture.commitTile(participant, attemptId);
          };
    // The record is readable without the capture lock: reading never writes. A
    // block without an attempt has nothing to open (U-29).
    const onOpenRecord =
      block.attemptId === null ? undefined : () => openRecord(block);
    // A heat names itself from its own stage and heat fields; only a category
    // block reads the event starts and participation formats.
    const view = block.kind === 'HEAT' ? null : describeBlock(block, event);
    // Both figures come from the page's outbox view, never from the block: the
    // tiles and the header read one derivation (FR-10, FR-37, U-08).
    const blockKey = timingOfflineBlockKey(block);
    const pendingMarks = pendingMarksByBlock.get(blockKey);
    const pendingMarkCount = pendingMarkTotalsByBlock.get(blockKey) ?? 0;

    return (
      <Space
        key={blockIdentity(block)}
        direction="vertical"
        size={8}
        style={{ width: '100%' }}
      >
        {view === null ? (
          <TimingHeatBlock
            block={block}
            raceTitle={raceTitleOf(heatRaceIdentity(block))}
            isCaptureHolder={isCaptureHolder}
            onStart={() => startBlock(block)}
            onTakeCapture={onTakeCapture}
            onParticipantClick={onParticipantClick}
            onOpenRecord={onOpenRecord}
            pendingMarksByParticipant={pendingMarks}
            pendingMarkCount={pendingMarkCount}
          />
        ) : (
          <TimingCategoryBlock
            block={block}
            title={view.title}
            subtitle={view.subtitle}
            isCaptureHolder={isCaptureHolder}
            onStart={() => startBlock(block)}
            onTakeCapture={onTakeCapture}
            onParticipantClick={onParticipantClick}
            onOpenRecord={onOpenRecord}
            pendingMarksByParticipant={pendingMarks}
            pendingMarkCount={pendingMarkCount}
          />
        )}

        {block.pendingFinishes.length > 0 ? (
          <PendingFinishBar
            pending={block.pendingFinishes}
            onBind={bindPendingFinish}
          />
        ) : null}
      </Space>
    );
  };

  // The surface is rendered in the backend order: a category block, then the
  // stage headers and heat blocks of its own start, format and gender (U-13,
  // U-14, FR-51). A stage header is emitted once, before the first heat block
  // of its race; a race whose stages carry no heat block keeps its headers.
  // Keep the backend order inside one state, but bring the category the
  // referee is working on to the top and fold every finished category down.
  // A category block and its heat blocks move together, so a sorted group
  // still renders its stage headers before its heats.
  const groupOrder = new Map<
    string,
    { blocks: TimingCategoryBlockView[]; index: number; priority: number }
  >();
  surface.categories.forEach((block, index) => {
    const key = blockCategoryKey(block);
    const existing = groupOrder.get(key);
    if (existing === undefined) {
      groupOrder.set(key, {
        blocks: [block],
        index,
        priority: CATEGORY_STATE_ORDER[block.state],
      });
      return;
    }
    existing.blocks.push(block);
    existing.priority = Math.min(
      existing.priority,
      CATEGORY_STATE_ORDER[block.state],
    );
  });
  const orderedGroups = [...groupOrder.values()].sort(
    (left, right) =>
      left.priority - right.priority || left.index - right.index,
  );
  const renderedRaces = new Set<string>();
  const renderedStageKeys = new Set<string>();

  /** One packed row of cards, each at its exact fraction of the width. */
  const renderPackedRows = (items: readonly BlockRowItem[]) =>
    timingBlockRows(items).map((row) => (
      <div key={row[0].key} className="timing-block-row">
        {row.map((item) => (
          <div
            key={item.key}
            className="timing-block-row__item"
            data-layout={item.layout}
            style={{ flex: timingRowItemFlex(item.layout, row.length) }}
          >
            {item.node}
          </div>
        ))}
      </div>
    ));

  const blockGroups: BlockRowItem[] = orderedGroups.map((group) => {
    const categoryBlocks = group.blocks.filter((block) => block.kind !== 'HEAT');
    const heatBlocks = group.blocks.filter((block) => block.kind === 'HEAT');
    if (heatBlocks.length === 0) {
      const categoryBlock = categoryBlocks[0];
      return {
        key: blockCategoryKey(group.blocks[0]),
        layout: timingBlockLayout(group.blocks),
        priority: group.priority,
        node: categoryBlock === undefined ? null : renderBlock(categoryBlock),
      };
    }

    // A multi-stage race is its own full-width section. Its heats still share
    // rows inside their stage, so two 7-8-participant heats sit side by side
    // instead of stacking as full-width cards.
    const heatsByRace = new Map<string, TimingCategoryBlockView[]>();
    for (const heat of heatBlocks) {
      const raceId = heatRaceIdentity(heat);
      const heats = heatsByRace.get(raceId) ?? [];
      heats.push(heat);
      heatsByRace.set(raceId, heats);
    }
    const raceSections: ReactNode[] = [];
    for (const [raceId, raceHeats] of heatsByRace) {
      if (renderedRaces.has(raceId)) continue;
      renderedRaces.add(raceId);
      const renderedHeatKeys = new Set<string>();
      const stageSections: ReactNode[] = [];
      for (const stage of stageGroupsByRace.get(raceId) ?? []) {
        renderedStageKeys.add(stage.blockKey);
        const heatItems: BlockRowItem[] = [];
        for (const key of stage.heatBlockKeys) {
          const heat = heatBlocksByKey.get(key);
          if (heat === undefined || renderedHeatKeys.has(key)) continue;
          renderedHeatKeys.add(key);
          heatItems.push({
            key,
            layout: timingBlockLayout([heat]),
            node: renderBlock(heat),
          });
        }
        stageSections.push(
          <div key={stage.blockKey} className="timing-stage-section">
            <StageHeader group={stage} />
            {heatItems.length === 0 ? null : renderPackedRows(heatItems)}
          </div>,
        );
      }
      // A heat block its stage header did not group still renders (FR-17).
      const ungroupedHeats: BlockRowItem[] = [];
      for (const heat of raceHeats) {
        const key = blockIdentity(heat);
        if (renderedHeatKeys.has(key)) continue;
        renderedHeatKeys.add(key);
        ungroupedHeats.push({
          key,
          layout: timingBlockLayout([heat]),
          node: renderBlock(heat),
        });
      }
      raceSections.push(
        <div key={raceId} className="timing-race-section">
          {stageSections}
          {ungroupedHeats.length === 0
            ? null
            : renderPackedRows(ungroupedHeats)}
        </div>,
      );
    }

    return {
      key: blockCategoryKey(group.blocks[0]),
      layout: 'full',
      priority: group.priority,
      node: (
        <div className="timing-race-section">
          {categoryBlocks.map((block) => (
            <div key={blockIdentity(block)}>{renderBlock(block)}</div>
          ))}
          {raceSections}
        </div>
      ),
    };
  });
  const trailingStageHeaders = stageGroups
    .filter((group) => !renderedStageKeys.has(group.blockKey))
    .map((group) => <StageHeader key={group.blockKey} group={group} />);

  return (
    <AppShell title="Хронометраж" subtitle={subtitle} extra={backToEvent}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {isCaptureHolder ? null : (
          <Alert
            type="info"
            showIcon
            message={
              surface.captureWorkstationInstanceId === null
                ? 'Захват хронометража свободен. Возьмите его на этом устройстве, чтобы вести хронометраж.'
                : 'Только для чтения: хронометраж ведётся на другом устройстве.'
            }
          />
        )}

        <Card size="small">
          <div style={FIGURES_ROW_STYLE}>
            <button
              ref={overlayTriggerRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={overlayOpen}
              title={figuresLine}
              onClick={() => setOverlayOpen(true)}
              style={FIGURES_TRIGGER_STYLE}
            >
              {figuresLine}
            </button>

            {overlayOpen ? (
              <div
                ref={overlayRef}
                role="dialog"
                aria-label={SEND_QUEUE_DIALOG_LABEL}
                style={SEND_QUEUE_OVERLAY_STYLE}
              >
                <TimingSendQueue
                  entries={offlineView.unsentEntries}
                  unsentEntries={offlineView.totals.unsentEntries}
                  sendingEntries={offlineView.totals.sendingEntries}
                  waitingEntries={offlineView.totals.waitingEntries}
                  pendingMarks={offlineView.totals.pendingMarks}
                  isOnline={capture.isOnline}
                  isSending={capture.isFlushing}
                  onSendNow={capture.sendNow}
                  onClose={closeOverlay}
                />
              </div>
            ) : null}
          </div>

          <Row gutter={[16, 12]}>
            <Col
              xs={24}
              xl={8}
              xxl={6}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <Space
                direction="vertical"
                size={10}
                style={{ width: '100%', flex: 1 }}
              >
                <Space wrap size={16} align="center">
                  <Typography.Text>Захват: {holderLabel}</Typography.Text>
                  <Space size={2} align="center">
                    <Typography.Text type="secondary">
                      Устройство: {workstationInstanceId}
                    </Typography.Text>
                    <Button
                      size="small"
                      type="link"
                      icon={<CopyOutlined />}
                      aria-label="Копировать ID устройства"
                      title="Копировать ID устройства"
                      onClick={() => void copyWorkstationId()}
                    >
                      Копировать
                    </Button>
                    {copyNotice === null ? null : (
                      <Typography.Text
                        type={copyNotice.error ? 'danger' : 'success'}
                        style={{ fontSize: 12 }}
                      >
                        {copyNotice.text}
                      </Typography.Text>
                    )}
                  </Space>
                  <Typography.Text
                    type={capture.isOnline ? 'secondary' : 'warning'}
                  >
                    {capture.isOnline ? CONNECTED_LABEL : DISCONNECTED_LABEL}
                  </Typography.Text>
                  <Button size="small" onClick={refreshReads}>
                    Обновить
                  </Button>
                </Space>

                {needsVolatileWarning ? (
                  <Alert
                    type="warning"
                    showIcon
                    message={VOLATILE_STORAGE_WARNING}
                  />
                ) : null}

                <CaptureControls
                  capture={captureView}
                  workstationInstanceId={workstationInstanceId}
                  canAdminister={canAdminister}
                  isOnline={capture.isOnline}
                  unsentEntries={offlineView.totals.unsentEntries}
                  onTake={capture.takeCapture}
                  onTransfer={capture.transferCapture}
                  onForceRelease={capture.forceRelease}
                />

                {anonymousNotice === null ? null : (
                  <Alert type="warning" showIcon message={anonymousNotice} />
                )}

                {offlineNotice === null ? null : (
                  <Alert type="warning" showIcon message={offlineNotice} />
                )}
              </Space>
            </Col>
            <Col
              xs={24}
              xl={8}
              xxl={6}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <NumberCaptureField
                disabled={!hasRunningBlock || !isCaptureHolder}
                resolve={capture.resolveCandidates}
                onCommit={capture.commitNumber}
                assignment={
                  selectedSplit === null
                    ? null
                    : {
                        splitId: selectedSplit.splitId,
                        attemptLabel:
                          selectedSplit.attemptLabel ??
                          selectedSplit.candidates?.[0]?.attemptLabel ??
                          '',
                      }
                }
                onAssign={assignSelectedSplit}
                onAnonymousSplit={captureAnonymousSplit}
                pendingCount={offlineView.totals.unsentEntries}
                outcomes={capture.captureOutcomes}
              />
            </Col>
            <Col
              xs={24}
              xl={8}
              xxl={6}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <AnonymousSplitQueue
                splits={anonymousSplits}
                selectedSplitId={selectedSplitId}
                onSelect={setSelectedSplitId}
                onCancel={cancelAnonymousSplit}
                canCancel={canOperate}
                onUndo={undoAnonymousSplit}
                canUndo={canOperate && isCaptureHolder}
                selectionDisabled={!isCaptureHolder}
              />
            </Col>
            <Col
              xs={24}
              xl={24}
              xxl={6}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <TimingMetricsPanel surface={surface} />
            </Col>
          </Row>
        </Card>

        {surface.categories.length === 0 && stageGroups.length === 0 ? (
          <Card>
            <Empty description="У мероприятия нет стартов и категорий для хронометража" />
          </Card>
        ) : (
          <>
            <div className="timing-block-rows">
              {renderPackedRows(blockGroups)}
            </div>
            {trailingStageHeaders}
          </>
        )}

        <Modal
          open={splitChoice !== null}
          title="Выберите попытку"
          footer={null}
          onCancel={() => setSplitChoice(null)}
        >
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              Номер подходит нескольким идущим попыткам. Выберите одну.
            </Typography.Text>
            {(splitChoice?.attempts ?? []).map((attempt) => (
              <Button
                key={attempt.attemptId}
                block
                onClick={() => {
                  void chooseSplitAttempt(attempt.attemptId);
                }}
              >
                {attempt.label} · {attempt.passCount}/{attempt.requiredLaps}
              </Button>
            ))}
          </Space>
        </Modal>

        <AttemptRecordDrawer
          open={recordAttemptId !== null}
          title={recordTitle}
          eventId={surface.eventId}
          attemptId={recordAttemptId}
          participantNames={recordParticipantNames}
          canAdminister={canAdminister}
          canOperate={canOperate}
          workstationInstanceId={workstationInstanceId}
          isOnline={capture.isOnline}
          unresolvedEntries={
            recordAttemptId === null
              ? 0
              : (capture.unresolvedByAttempt?.[recordAttemptId] ?? 0)
          }
          onClose={() => {
            setRecordAttemptId(null);
          }}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: surfaceQueryKey });
          }}
        />
      </Space>
    </AppShell>
  );
}

