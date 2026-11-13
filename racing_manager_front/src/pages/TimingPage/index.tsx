import { AxiosError } from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Empty,
  Result,
  Skeleton,
  Space,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { useEventDetailsQuery } from '../../features/events/useEventDetailsQuery';
import { AttemptRecordDrawer } from '../../features/timing/AttemptRecordDrawer';
import {
  canAdministerTiming,
  canOperateTiming,
} from '../../features/timing/capabilities';
import { CaptureControls } from '../../features/timing/CaptureControls';
import { NumberCaptureField } from '../../features/timing/NumberCaptureField';
import { PendingFinishBar } from '../../features/timing/PendingFinishBar';
import { TimingCategoryBlock } from '../../features/timing/TimingCategoryBlock';
import { timingService } from '../../features/timing/timingService';
import type {
  TimingCaptureView,
  TimingCategoryBlockView,
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

const GENDER_LABELS: Record<string, string> = {
  M: 'Мужчины',
  F: 'Женщины',
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
 * The event-wide timing surface (AD-9).
 *
 * One block per timeable protocol category in the backend order. The page only
 * renders: `useTimingCapture` owns the clock anchor, the capture outbox and
 * every mutation, so this component wires the controls to that hook and never
 * talks to the API for a write itself. The attempt record drawer owns every
 * correction control (T13), so the page only decides which attempt it reads and
 * which block supplies the participant names (U-29).
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

            <NumberCaptureField
              disabled={!hasRunningBlock || !isCaptureHolder}
              resolve={capture.resolveCandidates}
              onCommit={capture.commitNumber}
            />
          </Space>
        </Card>

        {surface.categories.length === 0 ? (
          <Card>
            <Empty description="У мероприятия нет стартов и категорий для хронометража" />
          </Card>
        ) : (
          surface.categories.map((block) => {
            const view = describeBlock(block, event);
            // Narrowed once, because the attempt id must stay non-null inside
            // the tile callback (E-07: a tile routes to its own attempt).
            const attemptId =
              block.state === 'RUNNING' ? block.attemptId : null;
            return (
              <Space
                key={`${block.startId}:${block.formatId}:${block.gender}`}
                direction="vertical"
                size={8}
                style={{ width: '100%' }}
              >
                <TimingCategoryBlock
                  block={block}
                  title={view.title}
                  subtitle={view.subtitle}
                  isCaptureHolder={isCaptureHolder}
                  onStart={() => {
                    void capture.startAttempt(block);
                  }}
                  // The block keeps its capture hand-over only while the lock
                  // is free; the global controls above own take, transfer and
                  // force-release in every other case (AD-5).
                  onTakeCapture={
                    surface.captureWorkstationInstanceId === null
                      ? () => {
                          void capture.takeCapture();
                        }
                      : undefined
                  }
                  onParticipantClick={
                    attemptId === null
                      ? undefined
                      : (participant) => {
                          void capture.commitTile(participant, attemptId);
                        }
                  }
                  // The record is readable without the capture lock: reading
                  // never writes. A category without an attempt has nothing to
                  // open, so the block hides the control (U-29).
                  onOpenRecord={
                    block.attemptId === null
                      ? undefined
                      : () => openRecord(block)
                  }
                />

                {block.pendingFinishes.length > 0 ? (
                  <PendingFinishBar
                    pending={block.pendingFinishes}
                    onBind={capture.bindPending}
                  />
                ) : null}
              </Space>
            );
          })
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
