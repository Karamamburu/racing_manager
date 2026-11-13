import { AxiosError } from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Result, Skeleton, Space, message } from 'antd';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { useEventDetailsQuery } from '../../features/events/useEventDetailsQuery';
import { TimingCategoryBlock } from '../../features/timing/TimingCategoryBlock';
import { timingService } from '../../features/timing/timingService';
import type {
  TimingCategoryBlockView,
  TimingSurfaceView,
} from '../../features/timing/types';
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
 * The event-wide read-only timing surface (AD-9).
 *
 * One block per timeable protocol category in the backend order, each with its
 * own state, start time and elapsed value. The Start press and the capture
 * hand-over are the only writes of this wave; number capture, pending finishes,
 * the attempt record and corrections arrive later.
 */
export function TimingPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const eventQuery = useEventDetailsQuery(id);
  const [workstationInstanceId] = useState(readWorkstationInstanceId);

  const roles = sessionQuery.data?.roles ?? [];
  const canOperateTiming =
    roles.includes('REFEREE') || roles.includes('ADMINISTRATOR');

  const surfaceQueryKey = ['timing-surface', id ?? ''] as const;
  const surfaceQuery = useQuery<TimingSurfaceView>({
    queryKey: surfaceQueryKey,
    queryFn: () => timingService.getSurface(id as string),
    enabled: Boolean(id) && canOperateTiming,
    refetchInterval: (query) =>
      query.state.data?.categories.some((block) => block.state === 'RUNNING')
        ? RUNNING_SURFACE_REFRESH_MS
        : false,
  });

  const event = eventQuery.data;
  const subtitle = event
    ? `${event.name} · ${formatDateTime(event.eventDate)}`
    : 'Загружаем мероприятие...';

  const handleStart = async (block: TimingCategoryBlockView) => {
    if (!id) return;
    try {
      await timingService.startAttempt(id, {
        startId: block.startId,
        formatId: block.formatId,
        gender: block.gender,
        workstationInstanceId,
        clientStartedAt: new Date().toISOString(),
      });
      await queryClient.invalidateQueries({ queryKey: surfaceQueryKey });
    } catch (error) {
      message.error(describeError(error));
    }
  };

  const handleTakeCapture = async () => {
    if (!id) return;
    try {
      await timingService.takeCapture(id, { workstationInstanceId });
      await queryClient.invalidateQueries({ queryKey: surfaceQueryKey });
    } catch (error) {
      message.error(describeError(error));
    }
  };

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

  if (!canOperateTiming) {
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

  const isCaptureHolder =
    surface.captureWorkstationInstanceId === workstationInstanceId;

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

        {surface.categories.length === 0 ? (
          <Card>
            <Empty description="У мероприятия нет стартов и категорий для хронометража" />
          </Card>
        ) : (
          surface.categories.map((block) => {
            const view = describeBlock(block, event);
            return (
              <TimingCategoryBlock
                key={`${block.startId}:${block.formatId}:${block.gender}`}
                block={block}
                title={view.title}
                subtitle={view.subtitle}
                isCaptureHolder={isCaptureHolder}
                onStart={() => {
                  void handleStart(block);
                }}
                onTakeCapture={
                  surface.captureWorkstationInstanceId === null
                    ? () => {
                        void handleTakeCapture();
                      }
                    : undefined
                }
              />
            );
          })
        )}
      </Space>
    </AppShell>
  );
}
