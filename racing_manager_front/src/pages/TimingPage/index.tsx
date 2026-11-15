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
  TimingCategoryState,
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
import {
  timingBlockLayout,
  timingBlockRows,
  timingRowItemFlex,
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
  const [anonymousNotice, setAnonymousNotice] = useState<string | null>(null);
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

  /** The Start press of one block; a refusal leaves capture state untouched. */
  const startBlock = (block: TimingCategoryBlockView) => {
    void capture.startAttempt(block).then(
      () => {
        setAnonymousNotice(null);
      },
      (failure: unknown) => {
        console.warn('timing: the Start press was refused', failure);
      },
    );
  };

  /** Enter on the empty field: one anonymous split of the current attempt. */
  const captureAnonymousSplit = async () => {
    await capture.captureAnonymous();
    setAnonymousNotice(null);
  };

  /** A committed number in assignment mode belongs to the selected entry. */
  const assignSelectedSplit = async (startNumber: number) => {
    if (selectedSplit === null) return;
    try {
      await capture.assignAnonymousSplit(selectedSplit.splitId, startNumber);
      // Accepted: the entry leaves the queue and the field returns to capture.
      setSelectedSplitId(null);
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
        const labels = selectedSplit.candidates ?? [];
        setSplitChoice({
          splitId: selectedSplit.splitId,
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
        return;
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
  const blockGroups = orderedGroups.map((group) => {
    const nodes: ReactNode[] = [];
    for (const block of group.blocks) {
      if (block.kind !== 'HEAT') {
        nodes.push(renderBlock(block));
        continue;
      }
      const raceId = heatRaceIdentity(block);
      if (renderedRaces.has(raceId)) continue;
      renderedRaces.add(raceId);
      const renderedHeatKeys = new Set<string>();
      for (const stage of stageGroupsByRace.get(raceId) ?? []) {
        renderedStageKeys.add(stage.blockKey);
        nodes.push(<StageHeader key={stage.blockKey} group={stage} />);
        for (const key of stage.heatBlockKeys) {
          const heat = heatBlocksByKey.get(key);
          if (heat === undefined || renderedHeatKeys.has(key)) continue;
          renderedHeatKeys.add(key);
          nodes.push(renderBlock(heat));
        }
      }
      // A heat block its stage header did not group still renders (FR-17).
      for (const heat of heatBlocksByRace.get(raceId) ?? []) {
        const key = blockIdentity(heat);
        if (renderedHeatKeys.has(key)) continue;
        renderedHeatKeys.add(key);
        nodes.push(renderBlock(heat));
      }
    }
    return {
      key: blockCategoryKey(group.blocks[0]),
      layout: timingBlockLayout(group.blocks),
      nodes,
    };
  });
  const trailingStageHeaders = stageGroups
    .filter((group) => !renderedStageKeys.has(group.blockKey))
    .map((group) => <StageHeader key={group.blockKey} group={group} />);
  const blockRows = timingBlockRows(blockGroups);

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
          <Row gutter={[16, 12]}>
            <Col
              xs={24}
              xl={8}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <Space
                direction="vertical"
                size={10}
                style={{ width: '100%', flex: 1 }}
              >
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

                {anonymousNotice === null ? null : (
                  <Alert type="warning" showIcon message={anonymousNotice} />
                )}

              </Space>
            </Col>
            <Col
              xs={24}
              xl={8}
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
              />
            </Col>
            <Col
              xs={24}
              xl={8}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <AnonymousSplitQueue
                splits={anonymousSplits}
                selectedSplitId={selectedSplitId}
                onSelect={setSelectedSplitId}
                onCancel={cancelAnonymousSplit}
                canCancel={canOperate}
                onUndo={capture.undoAnonymousSplit}
                canUndo={canOperate && isCaptureHolder}
                selectionDisabled={!isCaptureHolder}
              />
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
              {blockRows.map((row) => (
                <div key={row[0].key} className="timing-block-row">
                  {row.map((group) => (
                    <div
                      key={group.key}
                      className="timing-block-row__item"
                      data-layout={group.layout}
                      style={{
                        flex: timingRowItemFlex(group.layout, row.length),
                      }}
                    >
                      <Space
                        direction="vertical"
                        size={16}
                        style={{ width: '100%' }}
                      >
                        {group.nodes}
                      </Space>
                    </div>
                  ))}
                </div>
              ))}
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

