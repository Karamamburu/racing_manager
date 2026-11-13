import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { useState } from 'react';
import { CorrectionDialog } from './CorrectionDialogs';
import type { CorrectionMode } from './CorrectionDialogs';
import { formatTimingClock } from './ParticipantTile';
import { newTimingMutationKey, openTimingQueue } from './timingQueue';
import { formatElapsed } from './TimingCategoryBlock';
import { timingService } from './timingService';
import { describeTimingError } from './useTimingCapture';
import type {
  TimingAttemptRecordView,
  TimingAttemptState,
  TimingLapSplit,
  TimingPassView,
} from './types';

/**
 * The attempt record drawer: passes, unbound finishes, the closure report, the
 * published results and the append-only audit of one attempt.
 *
 * AD-11, E-15..E-19, F-16, F-17: the record is read-only evidence of what the
 * API captured. Capture and quick undo are offered to a timing operator;
 * corrections, rebinds, cancellations and a force-complete belong to an
 * administrator and always carry a reason. A cancelled attempt is shown as
 * non-authoritative, and a closed attempt says plainly that it is read-only.
 * Nothing here re-derives a time or applies a business rule of its own.
 */

const STATE_LABELS: Record<TimingAttemptState, string> = {
  RUNNING: 'Идёт',
  COMPLETED: 'Завершён',
  INCOMPLETE: 'Неполный',
  CANCELLED: 'Отменён',
};

const STATE_COLORS: Record<TimingAttemptState, string> = {
  RUNNING: 'blue',
  COMPLETED: 'green',
  INCOMPLETE: 'orange',
  CANCELLED: 'red',
};

const PASS_STATUS_LABELS: Record<TimingPassView['status'], string> = {
  BOUND: 'Официальная',
  PENDING: 'Непривязан',
  CANCELLED: 'Отменена',
};

const PASS_STATUS_COLORS: Record<TimingPassView['status'], string> = {
  BOUND: 'green',
  PENDING: 'orange',
  CANCELLED: 'red',
};

/** One correction the drawer has open; `null` while the drawer shows no dialog. */
interface CorrectionState {
  mode: CorrectionMode;
  passId?: string;
  pendingFinishId?: string;
}

export interface AttemptRecordDrawerProps {
  open: boolean;
  eventId: string;
  attemptId: string | null;
  /** Enrollment id to a human label; a missing entry shows the id instead. */
  participantNames: Record<string, string>;
  canAdminister: boolean;
  canOperate: boolean;
  /** The workstation that would complete or undo the attempt. */
  workstationInstanceId: string;
  onClose: () => void;
  /** Called after every successful mutation so the surface refreshes its reads. */
  onChanged: () => void;
}

function attemptRecordQueryKey(eventId: string, attemptId: string | null) {
  return ['timing-attempt-record', eventId, attemptId ?? ''] as const;
}

/** The official instant of a pass as a sortable number; an unparsable value sorts first. */
function officialInstant(pass: TimingPassView): number {
  const parsed = new Date(pass.officialAt).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * The passes in official-instant order, which is the order the API renumbers
 * laps in. Ties keep a stable order by elapsed time and pass id.
 */
function orderedPasses(passes: TimingPassView[]): TimingPassView[] {
  return [...passes].sort((left, right) => {
    const byInstant = officialInstant(left) - officialInstant(right);
    if (byInstant !== 0) return byInstant;
    const byElapsed = left.officialElapsedMs - right.officialElapsedMs;
    if (byElapsed !== 0) return byElapsed;
    return left.passId.localeCompare(right.passId);
  });
}

function formatValues(values: Record<string, unknown> | null): string {
  if (values === null) return '—';
  const text = JSON.stringify(values);
  return text === undefined ? '—' : text;
}

export function AttemptRecordDrawer({
  open,
  eventId,
  attemptId,
  participantNames,
  canAdminister,
  canOperate,
  workstationInstanceId,
  onClose,
  onChanged,
}: AttemptRecordDrawerProps) {
  const queryClient = useQueryClient();
  const recordQueryKey = attemptRecordQueryKey(eventId, attemptId);
  const recordQuery = useQuery<TimingAttemptRecordView>({
    queryKey: recordQueryKey,
    queryFn: () => {
      if (attemptId === null) {
        throw new Error('Попытка не выбрана');
      }
      return timingService.getAttemptRecord(eventId, attemptId);
    },
    enabled: open && attemptId !== null,
  });

  const [busyAction, setBusyAction] = useState<'COMPLETE' | 'UNDO' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [correction, setCorrection] = useState<CorrectionState | null>(null);

  const describeParticipant = (
    enrollmentId: string | null,
  ): { name: string; id: string | null } => {
    if (enrollmentId === null) return { name: '—', id: null };
    const known = participantNames[enrollmentId];
    return known === undefined
      ? { name: enrollmentId, id: null }
      : { name: known, id: enrollmentId };
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: recordQueryKey });
    onChanged();
  };

  const runAttemptAction = async (action: 'COMPLETE' | 'UNDO') => {
    if (attemptId === null || busyAction !== null) return;
    setBusyAction(action);
    setActionError(null);
    try {
      const queue = await openTimingQueue();
      if (action === 'COMPLETE') {
        const lastIssuedSequence = await queue.lastSequence(
          attemptId,
          workstationInstanceId,
        );
        await timingService.completeAttempt(
          eventId,
          attemptId,
          { workstationInstanceId, lastIssuedSequence },
          newTimingMutationKey(),
        );
      } else {
        const deviceSequence = await queue.nextSequence(
          attemptId,
          workstationInstanceId,
        );
        await timingService.quickUndo(
          eventId,
          attemptId,
          { workstationInstanceId, deviceSequence },
          newTimingMutationKey(),
        );
      }
      await refresh();
    } catch (failure) {
      setActionError(describeTimingError(failure));
    } finally {
      setBusyAction(null);
    }
  };

  const record = recordQuery.data;

  const passColumns: TableColumnsType<TimingPassView> = [
    {
      title: 'Круг',
      key: 'lap',
      width: 72,
      render: (_value: unknown, pass: TimingPassView) => pass.lapNumber ?? '—',
    },
    {
      title: 'Участник',
      key: 'participant',
      render: (_value: unknown, pass: TimingPassView) => {
        const participant = describeParticipant(pass.enrollmentId);
        return (
          <Space direction="vertical" size={0}>
            <Typography.Text>{participant.name}</Typography.Text>
            {participant.id === null ? null : (
              <Typography.Text type="secondary">
                {participant.id}
              </Typography.Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Официальное время',
      key: 'officialAt',
      render: (_value: unknown, pass: TimingPassView) =>
        formatTimingClock(pass.officialAt),
    },
    {
      title: 'От времени старта',
      key: 'elapsed',
      render: (_value: unknown, pass: TimingPassView) =>
        formatElapsed(pass.officialElapsedMs),
    },
    {
      title: 'Статус',
      key: 'status',
      render: (_value: unknown, pass: TimingPassView) => (
        <Tag color={PASS_STATUS_COLORS[pass.status]}>
          {PASS_STATUS_LABELS[pass.status]}
        </Tag>
      ),
    },
  ];

  if (record !== undefined && canAdminister && record.state !== 'CANCELLED') {
    passColumns.push({
      title: 'Действия',
      key: 'actions',
      render: (_value: unknown, pass: TimingPassView) => {
        const clock = formatTimingClock(pass.officialAt);
        const running = record.state === 'RUNNING';
        return (
          <Space size={4} wrap>
            <Button
              size="small"
              aria-label={`Скорректировать отсечку ${clock}`}
              disabled={busyAction !== null}
              onClick={() =>
                setCorrection({ mode: 'OFFICIAL_TIME', passId: pass.passId })
              }
            >
              Время
            </Button>
            {running && pass.status === 'BOUND' ? (
              <>
                <Button
                  size="small"
                  aria-label={`Перепривязать отсечку ${clock}`}
                  disabled={busyAction !== null}
                  onClick={() =>
                    setCorrection({ mode: 'REBIND_PASS', passId: pass.passId })
                  }
                >
                  Перепривязать
                </Button>
                <Button
                  size="small"
                  danger
                  aria-label={`Отменить отсечку ${clock}`}
                  disabled={busyAction !== null}
                  onClick={() =>
                    setCorrection({ mode: 'CANCEL_PASS', passId: pass.passId })
                  }
                >
                  Отменить
                </Button>
              </>
            ) : null}
          </Space>
        );
      },
    });
  }

  const pendingColumns: TableColumnsType<TimingPassView> = [
    {
      title: 'Захвачен',
      key: 'captured',
      render: (_value: unknown, pass: TimingPassView) =>
        formatTimingClock(pass.rawCapturedAt),
    },
    {
      title: 'Официальное время',
      key: 'officialAt',
      render: (_value: unknown, pass: TimingPassView) =>
        formatTimingClock(pass.officialAt),
    },
    {
      title: 'От времени старта',
      key: 'elapsed',
      render: (_value: unknown, pass: TimingPassView) =>
        formatElapsed(pass.officialElapsedMs),
    },
  ];

  if (record !== undefined && canAdminister && record.state === 'RUNNING') {
    pendingColumns.push({
      title: 'Действия',
      key: 'actions',
      render: (_value: unknown, pass: TimingPassView) => (
        <Button
          size="small"
          danger
          aria-label={`Отменить финиш ${formatTimingClock(pass.rawCapturedAt)}`}
          disabled={busyAction !== null}
          onClick={() =>
            setCorrection({
              mode: 'CANCEL_PENDING',
              pendingFinishId: pass.passId,
            })
          }
        >
          Отменить
        </Button>
      ),
    });
  }

  const splitColumns: TableColumnsType<TimingLapSplit> = [
    { title: 'Круг', dataIndex: 'lapNumber', key: 'lap' },
    {
      title: 'Отсечка',
      key: 'lapTime',
      render: (_value: unknown, split: TimingLapSplit) =>
        formatElapsed(split.lapTimeMs),
    },
    {
      title: 'Суммарно',
      key: 'cumulative',
      render: (_value: unknown, split: TimingLapSplit) =>
        formatElapsed(split.cumulativeMs),
    },
  ];

  const auditColumns: TableColumnsType<TimingAttemptRecordView['audit'][number]> =
    [
      {
        title: 'Момент',
        key: 'createdAt',
        render: (_value: unknown, row: TimingAttemptRecordView['audit'][number]) =>
          formatTimingClock(row.createdAt),
      },
      {
        title: 'Автор',
        key: 'actor',
        render: (_value: unknown, row: TimingAttemptRecordView['audit'][number]) =>
          row.actorUserId,
      },
      {
        title: 'Действие',
        dataIndex: 'action',
        key: 'action',
      },
      {
        title: 'Объект',
        key: 'target',
        render: (_value: unknown, row: TimingAttemptRecordView['audit'][number]) =>
          `${row.targetType} · ${row.targetId}`,
      },
      {
        title: 'Было',
        key: 'oldValues',
        render: (_value: unknown, row: TimingAttemptRecordView['audit'][number]) =>
          formatValues(row.oldValues),
      },
      {
        title: 'Стало',
        key: 'newValues',
        render: (_value: unknown, row: TimingAttemptRecordView['audit'][number]) =>
          formatValues(row.newValues),
      },
      {
        title: 'Причина',
        key: 'reason',
        render: (_value: unknown, row: TimingAttemptRecordView['audit'][number]) =>
          row.reason ?? '—',
      },
    ];

  const participants = Object.entries(participantNames).map(
    ([enrollmentId, label]) => ({ enrollmentId, label }),
  );

  return (
    <Drawer
      title="Запись попытки"
      width={880}
      open={open}
      onClose={onClose}
    >
      {recordQuery.isLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : null}

      {recordQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message="Не удалось загрузить запись попытки"
          description={describeTimingError(recordQuery.error)}
          action={
            <Button size="small" onClick={() => void recordQuery.refetch()}>
              Повторить
            </Button>
          }
        />
      ) : null}

      {!recordQuery.isLoading && !recordQuery.isError && record === undefined ? (
        <Empty description="Запись попытки пуста" />
      ) : null}

      {record === undefined ? null : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap size={12} align="center">
            <Tag color={STATE_COLORS[record.state]}>
              {STATE_LABELS[record.state]}
            </Tag>
            <Typography.Text>
              Официальный старт: {formatTimingClock(record.officialStartedAt)}
            </Typography.Text>
            <Typography.Text type="secondary">
              Попытка: {record.attemptId}
            </Typography.Text>
          </Space>

          {record.state === 'CANCELLED' ? (
            <Alert
              type="warning"
              showIcon
              message="Попытка отменена"
              description="Отметки этой попытки не являются официальными: результаты не опубликованы и не влияют на протокол."
            />
          ) : null}

          {record.state !== 'RUNNING' ? (
            <Alert
              type="info"
              showIcon
              message="Попытка закрыта"
              description="Запись доступна только для чтения: захват, привязка и отмена отсечек закрыты. Официальные времена можно скорректировать с причиной."
            />
          ) : null}

          <Space wrap size={8}>
            {canOperate && record.state === 'RUNNING' ? (
              <>
                <Button
                  type="primary"
                  loading={busyAction === 'COMPLETE'}
                  disabled={busyAction !== null}
                  onClick={() => {
                    void runAttemptAction('COMPLETE');
                  }}
                >
                  Завершить попытку
                </Button>
                <Button
                  loading={busyAction === 'UNDO'}
                  disabled={busyAction !== null}
                  onClick={() => {
                    void runAttemptAction('UNDO');
                  }}
                >
                  Отменить последнюю отметку
                </Button>
              </>
            ) : null}

            {canAdminister && record.state !== 'CANCELLED' ? (
              <Button
                disabled={busyAction !== null}
                onClick={() => setCorrection({ mode: 'OFFICIAL_TIME' })}
              >
                Скорректировать старт
              </Button>
            ) : null}

            {canAdminister && record.state === 'RUNNING' ? (
              <>
                <Button
                  danger
                  disabled={busyAction !== null}
                  onClick={() => setCorrection({ mode: 'FORCE_COMPLETE' })}
                >
                  Завершить принудительно
                </Button>
                <Button
                  danger
                  disabled={busyAction !== null}
                  onClick={() => setCorrection({ mode: 'CANCEL_ATTEMPT' })}
                >
                  Отменить попытку
                </Button>
              </>
            ) : null}
          </Space>

          {actionError ? (
            <Typography.Text type="danger" role="alert">
              {actionError}
            </Typography.Text>
          ) : null}

          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text strong>Отсечки</Typography.Text>
            {record.passes.length === 0 ? (
              <Typography.Text type="secondary">Отсечек нет</Typography.Text>
            ) : (
              <Table<TimingPassView>
                size="small"
                rowKey="passId"
                pagination={false}
                columns={passColumns}
                dataSource={orderedPasses(record.passes)}
              />
            )}
          </Space>

          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text strong>Непривязанные финиши</Typography.Text>
            {record.pendingFinishes.length === 0 ? (
              <Typography.Text type="secondary">
                Нет непривязанных финишей
              </Typography.Text>
            ) : (
              <Table<TimingPassView>
                size="small"
                rowKey="passId"
                pagination={false}
                columns={pendingColumns}
                dataSource={record.pendingFinishes}
              />
            )}
          </Space>

          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text strong>Отчёт о закрытии</Typography.Text>
            {record.closureReport === null ? (
              <Typography.Text type="secondary">
                Попытка ещё не закрыта
              </Typography.Text>
            ) : (
              <Space direction="vertical" size={4}>
                <Typography.Text>
                  Опубликовано: {record.closureReport.publishedEnrollmentIds.length}
                </Typography.Text>
                <Space wrap size={4}>
                  {record.closureReport.publishedEnrollmentIds.map(
                    (enrollmentId) => (
                      <Tag key={enrollmentId} title={enrollmentId}>
                        {enrollmentId}
                      </Tag>
                    ),
                  )}
                </Space>
                <Typography.Text>
                  Не опубликовано:{' '}
                  {record.closureReport.unpublishedEnrollmentIds.length}
                </Typography.Text>
                <Space wrap size={4}>
                  {record.closureReport.unpublishedEnrollmentIds.map(
                    (enrollmentId) => (
                      <Tag key={enrollmentId} title={enrollmentId}>
                        {enrollmentId}
                      </Tag>
                    ),
                  )}
                </Space>
                <Typography.Text>
                  Конфликты: {record.closureReport.conflictEnrollmentIds.length}
                </Typography.Text>
                <Space wrap size={4}>
                  {record.closureReport.conflictEnrollmentIds.map(
                    (enrollmentId) => (
                      <Tag key={enrollmentId} title={enrollmentId} color="red">
                        {enrollmentId}
                      </Tag>
                    ),
                  )}
                </Space>
              </Space>
            )}
          </Space>

          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text strong>Опубликованные результаты</Typography.Text>
            {record.publishedResults.length === 0 ? (
              <Typography.Text type="secondary">
                Результатов нет
              </Typography.Text>
            ) : (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {record.publishedResults.map((result) => (
                  <div key={result.id}>
                    <Space wrap size={8} align="center">
                      <Typography.Text strong>
                        {describeParticipant(result.enrollmentId).name}
                      </Typography.Text>
                      <Tag>{result.outcome}</Tag>
                      <Typography.Text>
                        Итог:{' '}
                        {result.timeMilliseconds === null
                          ? '—'
                          : formatElapsed(result.timeMilliseconds)}
                      </Typography.Text>
                    </Space>
                    {result.laps === undefined || result.laps.length === 0 ? (
                      <Typography.Text type="secondary">
                        Отсечки не опубликованы
                      </Typography.Text>
                    ) : (
                      <Table<TimingLapSplit>
                        size="small"
                        rowKey="lapNumber"
                        pagination={false}
                        columns={splitColumns}
                        dataSource={result.laps}
                      />
                    )}
                  </div>
                ))}
              </Space>
            )}
          </Space>

          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text strong>Аудит</Typography.Text>
            {record.audit.length === 0 ? (
              <Typography.Text type="secondary">
                Записей аудита нет
              </Typography.Text>
            ) : (
              <Table<TimingAttemptRecordView['audit'][number]>
                size="small"
                rowKey="auditId"
                pagination={false}
                columns={auditColumns}
                dataSource={record.audit}
              />
            )}
          </Space>

          <CorrectionDialog
            mode={correction?.mode ?? 'FORCE_COMPLETE'}
            open={correction !== null}
            eventId={eventId}
            attemptId={record.attemptId}
            passId={correction?.passId}
            pendingFinishId={correction?.pendingFinishId}
            participants={participants}
            onClose={() => setCorrection(null)}
            onChanged={() => {
              void refresh();
            }}
          />
        </Space>
      )}
    </Drawer>
  );
}
