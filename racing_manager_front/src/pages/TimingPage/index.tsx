import { AxiosError } from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Empty,
  Result,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
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
import { timingService } from '../../features/timing/timingService';
import type {
  TimingAnonymousSplitView,
  TimingCaptureView,
  TimingCategoryBlockView,
  TimingParticipantTileView,
  TimingStageGroupView,
  TimingStageState,
  TimingSurfaceView,
} from '../../features/timing/types';
import {
  timingSurfaceQueryKey,
  useTimingCapture,
} from '../../features/timing/useTimingCapture';
import { formatDateTime } from '../../shared/formatDateTime';
import { AppShell } from '../../shared/layout';
import type { EventDetails } from '../../shared/types/event';

/** Session key of the workstation instance that owns this browser tab. */
const WORKSTATION_STORAGE_KEY = 'timing-workstation-instance';

/** How often a surface with a running attempt is refreshed to advance clocks. */
const RUNNING_SURFACE_REFRESH_MS = 5000;

/** Why an empty Enter created nothing: no current block has a running attempt. */
const NO_CURRENT_BLOCK_MESSAGE =
  'Не выбран текущий блок: Enter на пустом поле не создаёт сплит';

const GENDER_LABELS: Record<string, string> = {
  M: 'Мужчины',
  F: 'Женщины',
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
 * The label of one block in the current-block selector. A heat is named by its
 * race, its stage and its heat, so it never reads as the category block it is
 * grouped with (FR-17, FR-51).
 */
function describeBlockOption(
  block: TimingCategoryBlockView,
  event: EventDetails | undefined,
  raceTitle: string | undefined,
): string {
  if (block.kind !== 'HEAT') {
    const view = describeBlock(block, event);
    return `${view.title} · ${view.subtitle}`;
  }
  const heat =
    block.heatLabel?.trim() ||
    (block.heatNumber === undefined ? 'Заезд' : `Заезд ${block.heatNumber}`);
  return [raceTitle, block.stageLabel, heat]
    .filter((part): part is string => (part ?? '').trim().length > 0)
    .join(' · ');
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
 */
export function TimingPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const eventQuery = useEventDetailsQuery(id);
  const [workstationInstanceId] = useState(readWorkstationInstanceId);
  // The record the drawer reads, and the `enrollmentId → fullName` map of the
  // block that supplied the attempt, so a pass names its participant without a
  // second request per row.
  const [recordAttemptId, setRecordAttemptId] = useState<string | null>(null);
  const [recordParticipantNames, setRecordParticipantNames] = useState<
    Record<string, string>
  >({});
  // The queued split in assignment mode and the block that is current; both
  // are page-session display state (AD-17, E-02).
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const [currentBlockKey, setCurrentBlockKey] = useState<string | null>(null);
  const [anonymousNotice, setAnonymousNotice] = useState<string | null>(null);

  const roles = sessionQuery.data?.roles ?? [];
  const canOperate = canOperateTiming(roles);
  const canAdminister = canAdministerTiming(roles);

  const surfaceQueryKey = timingSurfaceQueryKey(id);
  const surfaceQuery = useQuery<TimingSurfaceView>({
    queryKey: surfaceQueryKey,
    queryFn: () => timingService.getSurface(id as string),
    enabled: Boolean(id) && canOperate,
    refetchInterval: (query) =>
      query.state.data?.categories.some((block) => block.state === 'RUNNING')
        ? RUNNING_SURFACE_REFRESH_MS
        : false,
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
      <AppShell title="Хронометраж" subtitle={subtitle}>
        <Card>
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      </AppShell>
    );
  }

  if (!canOperate) {
    return (
      <AppShell title="Хронометраж" subtitle={subtitle}>
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
      <AppShell title="Хронометраж" subtitle={subtitle}>
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      </AppShell>
    );
  }

  if (surfaceQuery.isError) {
    return (
      <AppShell title="Хронометраж" subtitle={subtitle}>
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
      <AppShell title="Хронометраж" subtitle={subtitle}>
        <Card>
          <Empty description="Поверхность хронометража пуста" />
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
    ? 'эта станция'
    : surface.captureWorkstationInstanceId === null
      ? 'свободен'
      : `станция ${surface.captureWorkstationInstanceId}`;
  const hasRunningBlock = surface.categories.some(
    (block) => block.state === 'RUNNING',
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
  const heatBlocksByRace = new Map<string, TimingCategoryBlockView[]>();
  for (const group of stageGroups) {
    const groups = stageGroupsByRace.get(group.raceId) ?? [];
    groups.push(group);
    stageGroupsByRace.set(group.raceId, groups);
  }
  for (const block of surface.categories) {
    if (block.kind !== 'HEAT') continue;
    heatBlocksByKey.set(blockIdentity(block), block);
    const raceId = heatRaceIdentity(block);
    const blocks = heatBlocksByRace.get(raceId) ?? [];
    blocks.push(block);
    heatBlocksByRace.set(raceId, blocks);
  }
  const raceTitleOf = (raceId: string): string | undefined =>
    stageGroups.find((group) => group.raceId === raceId)?.raceTitle;

  // Only a running attempt accepts an anonymous split, so only those blocks are
  // offered as the current one (E-01, F-01). A running heat is offered with the
  // same attempt identity a category block uses (E-02, FR-22).
  const runningBlocks = surface.categories.filter(
    (block) => block.state === 'RUNNING' && block.attemptId !== null,
  );
  const blockOptions = runningBlocks.map((block) => ({
    key: blockIdentity(block),
    label: describeBlockOption(
      block,
      event,
      block.kind === 'HEAT' ? raceTitleOf(heatRaceIdentity(block)) : undefined,
    ),
  }));
  const currentBlock =
    runningBlocks.find((block) => blockIdentity(block) === currentBlockKey) ??
    null;
  const currentAttemptId = currentBlock?.attemptId ?? null;
  const currentBlockLabel =
    blockOptions.find((option) => option.key === currentBlockKey)?.label ?? null;

  /**
   * The Start press of one block also makes it current, so the first empty
   * Enter after a start needs no second click (E-02). A refused start leaves
   * the current block as it was and the hook reports the API message.
   */
  const startBlock = (block: TimingCategoryBlockView) => {
    void capture.startAttempt(block).then(
      () => {
        setCurrentBlockKey(blockIdentity(block));
        setAnonymousNotice(null);
      },
      (failure: unknown) => {
        console.warn('timing: the Start press was refused', failure);
      },
    );
  };

  /** Enter on the empty field: one anonymous split of the current attempt. */
  const captureAnonymousSplit = async () => {
    if (currentAttemptId === null) {
      setAnonymousNotice(NO_CURRENT_BLOCK_MESSAGE);
      throw new Error(NO_CURRENT_BLOCK_MESSAGE);
    }
    await capture.captureAnonymous(currentAttemptId);
    setAnonymousNotice(null);
  };

  /** A committed number in assignment mode belongs to the selected entry. */
  const assignSelectedSplit = async (startNumber: number) => {
    if (selectedSplit === null) return;
    await capture.assignAnonymousSplit(selectedSplit.splitId, startNumber);
    // Accepted: the entry leaves the queue and the field returns to capture.
    setSelectedSplitId(null);
  };

  /** A cancelled entry leaves the queue at once; the page clears the mode. */
  const cancelAnonymousSplit = async (splitId: string, reason: string) => {
    await capture.cancelAnonymousSplit(splitId, reason);
    setSelectedSplitId((current) => (current === splitId ? null : current));
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
          />
        )}

        {block.pendingFinishes.length > 0 ? (
          <PendingFinishBar
            pending={block.pendingFinishes}
            onBind={capture.bindPending}
          />
        ) : null}
      </Space>
    );
  };

  // The surface is rendered in the backend order: a category block, then the
  // stage headers and heat blocks of its own start, format and gender (U-13,
  // U-14, FR-51). A stage header is emitted once, before the first heat block
  // of its race; a race whose stages carry no heat block keeps its headers.
  const renderedRaces = new Set<string>();
  const renderedStageKeys = new Set<string>();
  const surfaceNodes: ReactNode[] = [];
  for (const block of surface.categories) {
    if (block.kind !== 'HEAT') {
      surfaceNodes.push(renderBlock(block));
      continue;
    }
    const raceId = heatRaceIdentity(block);
    if (renderedRaces.has(raceId)) continue;
    renderedRaces.add(raceId);
    const renderedHeatKeys = new Set<string>();
    for (const group of stageGroupsByRace.get(raceId) ?? []) {
      renderedStageKeys.add(group.blockKey);
      surfaceNodes.push(<StageHeader key={group.blockKey} group={group} />);
      for (const key of group.heatBlockKeys) {
        const heat = heatBlocksByKey.get(key);
        if (heat === undefined || renderedHeatKeys.has(key)) continue;
        renderedHeatKeys.add(key);
        surfaceNodes.push(renderBlock(heat));
      }
    }
    // A heat block its stage header did not group still renders (FR-17).
    for (const heat of heatBlocksByRace.get(raceId) ?? []) {
      const key = blockIdentity(heat);
      if (renderedHeatKeys.has(key)) continue;
      renderedHeatKeys.add(key);
      surfaceNodes.push(renderBlock(heat));
    }
  }
  for (const group of stageGroups) {
    if (renderedStageKeys.has(group.blockKey)) continue;
    surfaceNodes.push(<StageHeader key={group.blockKey} group={group} />);
  }

  return (
    <AppShell title="Хронометраж" subtitle={subtitle}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {isCaptureHolder ? null : (
          <Alert
            type="info"
            showIcon
            message={
              surface.captureWorkstationInstanceId === null
                ? 'Захват хронометража свободен. Возьмите его на этой станции, чтобы начинать категории.'
                : 'Поверхность открыта только для чтения: захват хронометража удерживает другая станция.'
            }
          />
        )}

        <Card size="small">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap size={16} align="center">
              <Typography.Text>Захват: {holderLabel}</Typography.Text>
              <Typography.Text type="secondary">
                Станция: {workstationInstanceId}
              </Typography.Text>
              <Typography.Text
                type={capture.pendingCount > 0 ? 'warning' : 'secondary'}
              >
                Не синхронизировано: {capture.pendingCount}
              </Typography.Text>
              <Button
                size="small"
                onClick={() => {
                  void queryClient.invalidateQueries({
                    queryKey: surfaceQueryKey,
                  });
                }}
              >
                Обновить
              </Button>
            </Space>

            <CaptureControls
              capture={captureView}
              workstationInstanceId={workstationInstanceId}
              canAdminister={canAdminister}
              onTake={capture.takeCapture}
              onTransfer={capture.transferCapture}
              onForceRelease={capture.forceRelease}
            />

            <AnonymousSplitQueue
              splits={anonymousSplits}
              selectedSplitId={selectedSplitId}
              onSelect={setSelectedSplitId}
              onCancel={cancelAnonymousSplit}
              canCancel={canOperate}
              selectionDisabled={!isCaptureHolder}
            />

            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Typography.Text strong>Текущий блок</Typography.Text>
              <Select
                aria-label="Текущий блок"
                placeholder="Блок не выбран"
                allowClear
                style={{ maxWidth: 420 }}
                value={currentBlock === null ? undefined : currentBlockKey ?? undefined}
                options={blockOptions.map((option) => ({
                  value: option.key,
                  label: option.label,
                }))}
                onChange={(value: string | undefined) => {
                  setCurrentBlockKey(value ?? null);
                  setAnonymousNotice(null);
                }}
              />
              <Typography.Text type="secondary">
                Текущая попытка: {currentBlockLabel ?? 'не выбрана'}
              </Typography.Text>
              {anonymousNotice === null ? null : (
                <Alert type="warning" showIcon message={anonymousNotice} />
              )}
            </Space>

            <NumberCaptureField
              disabled={!hasRunningBlock || !isCaptureHolder}
              resolve={capture.resolveCandidates}
              onCommit={capture.commitNumber}
              assignment={
                selectedSplit === null
                  ? null
                  : {
                      splitId: selectedSplit.splitId,
                      attemptLabel: selectedSplit.attemptLabel,
                    }
              }
              onAssign={assignSelectedSplit}
              onAnonymousSplit={captureAnonymousSplit}
            />
          </Space>
        </Card>

        {surface.categories.length === 0 && stageGroups.length === 0 ? (
          <Card>
            <Empty description="У мероприятия нет стартов и категорий для хронометража" />
          </Card>
        ) : (
          surfaceNodes
        )}

        <AttemptRecordDrawer
          open={recordAttemptId !== null}
          eventId={surface.eventId}
          attemptId={recordAttemptId}
          participantNames={recordParticipantNames}
          canAdminister={canAdminister}
          canOperate={canOperate}
          workstationInstanceId={workstationInstanceId}
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

