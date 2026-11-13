import {
  FileTextOutlined,
  PlayCircleOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Col, Row, Space, Tag, Typography } from 'antd';
import { ParticipantTile, formatTimingClock } from './ParticipantTile';
import type {
  TimingCategoryBlockView,
  TimingCategoryState,
  TimingParticipantTileView,
} from './types';
import { useElapsedClock } from './useElapsedClock';

const STATE_LABELS: Record<TimingCategoryState, string> = {
  NOT_STARTED: 'Не начат',
  RUNNING: 'Идёт',
  COMPLETED: 'Завершён',
  INCOMPLETE: 'Неполный',
  CANCELLED: 'Отменён',
};

const STATE_COLORS: Record<TimingCategoryState, string> = {
  NOT_STARTED: 'default',
  RUNNING: 'blue',
  COMPLETED: 'green',
  INCOMPLETE: 'orange',
  CANCELLED: 'red',
};

/**
 * One elapsed duration as `mm:ss.mmm`, or `h:mm:ss.mmm` from one hour up.
 *
 * Display only: the value comes from the API and nothing here re-derives a time
 * or decides whether a participant finished.
 */
export function formatElapsed(elapsedMs: number): string {
  const safe = Math.max(0, Math.trunc(elapsedMs));
  const milliseconds = safe % 1000;
  const totalSeconds = Math.floor(safe / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const pad = (input: number, size: number) => String(input).padStart(size, '0');
  const tail = `${pad(seconds, 2)}.${pad(milliseconds, 3)}`;
  return hours > 0
    ? `${hours}:${pad(minutes, 2)}:${tail}`
    : `${pad(minutes, 2)}:${tail}`;
}

/**
 * Whether the block renders its Start control at all.
 *
 * A heat of a stage whose heats are not formed, or of a closed stage, offers no
 * Start: the block reason states why and the press is not available (F-12,
 * S-07). A category keeps its disabled Start, so a reader still sees the
 * control and the reason beside it.
 */
function showsStartControl(block: TimingCategoryBlockView): boolean {
  if (block.kind !== 'HEAT') return true;
  return block.stageState === undefined || block.stageState === 'SEEDED';
}

/**
 * One timeable protocol category or one heat of a multi-stage race.
 *
 * This wave renders the read-only block, the Start press, the capture
 * hand-over and the entry to the record of its current or last attempt. Number
 * capture, pending-finish binding and corrections belong to other components:
 * the record drawer owns every correction control (U-29).
 *
 * A heat block is the same block with `kind: 'HEAT'`: it adds a kind tag and
 * its stage name, so it never reads as the category block it is grouped with
 * (FR-17). Start, tiles, pending finishes and the record behave identically.
 */
export function TimingCategoryBlock({
  block,
  title,
  subtitle,
  isCaptureHolder,
  onStart,
  onTakeCapture,
  onParticipantClick,
  onOpenRecord,
}: {
  block: TimingCategoryBlockView;
  title: string;
  subtitle?: string;
  isCaptureHolder: boolean;
  onStart: () => void;
  onTakeCapture?: () => void;
  onParticipantClick?: (participant: TimingParticipantTileView) => void;
  /** Opens the record of the block's current or last attempt; absent hides it. */
  onOpenRecord?: () => void;
}) {
  const canStart = block.startControlEnabled && isCaptureHolder;
  const showsTakeCapture = !isCaptureHolder && onTakeCapture !== undefined;
  // An attempt exists only once the category has started, so a category that
  // never ran offers no record to read (U-29).
  const showsRecord = block.attemptId !== null && onOpenRecord !== undefined;
  const showsStart = showsStartControl(block);
  const isHeat = block.kind === 'HEAT';
  // A running block advances locally from its official start; a closed or
  // unstarted block keeps the surface value untouched (AD-19, O-04).
  const displayedElapsedMs = useElapsedClock({
    state: block.state,
    officialStartedAt: block.officialStartedAt,
    elapsedMs: block.elapsedMs,
  });

  return (
    <Card
      size="small"
      title={
        <Space wrap size={8}>
          {isHeat ? <Tag color="geekblue">Заезд</Tag> : null}
          <Typography.Text strong>{title}</Typography.Text>
          <Tag color={STATE_COLORS[block.state]}>{STATE_LABELS[block.state]}</Tag>
        </Space>
      }
      extra={
        <Space wrap size={8}>
          {showsStart ? (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              disabled={!canStart}
              onClick={onStart}
            >
              Старт
            </Button>
          ) : null}
          {showsRecord ? (
            <Button icon={<FileTextOutlined />} onClick={onOpenRecord}>
              Запись
            </Button>
          ) : null}
          {showsTakeCapture ? (
            <Button icon={<UnlockOutlined />} onClick={onTakeCapture}>
              Взять захват
            </Button>
          ) : null}
          {!isCaptureHolder && !showsTakeCapture ? (
            <Typography.Text type="secondary">
              Захват у другой станции
            </Typography.Text>
          ) : null}
        </Space>
      }
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {subtitle ? (
          <Typography.Text type="secondary">{subtitle}</Typography.Text>
        ) : null}
        {isHeat && block.stageLabel ? (
          <Typography.Text type="secondary">
            Этап: {block.stageLabel}
          </Typography.Text>
        ) : null}

        <Space wrap size={[16, 4]}>
          <Typography.Text>Круги: {block.lapCount}</Typography.Text>
          <Typography.Text>
            Старт: {formatTimingClock(block.officialStartedAt)}
          </Typography.Text>
          {displayedElapsedMs === null ? null : (
            <Typography.Text>
              Время: {formatElapsed(displayedElapsedMs)}
            </Typography.Text>
          )}
          <Typography.Text>Участники: {block.participants.length}</Typography.Text>
        </Space>

        {block.blockReason ? (
          <Alert type="warning" showIcon message={block.blockReason} />
        ) : null}

        {block.pendingFinishes.length > 0 ? (
          <Tag color="orange">
            Непривязанных финишей: {block.pendingFinishes.length}
          </Tag>
        ) : null}

        {block.participants.length === 0 ? (
          <Typography.Text type="secondary">
            В категории нет участников для хронометража
          </Typography.Text>
        ) : (
          <Row gutter={[8, 8]}>
            {block.participants.map((participant) => (
              <Col
                key={participant.enrollmentId}
                xs={24}
                sm={12}
                md={8}
                xl={6}
              >
                <ParticipantTile
                  participant={participant}
                  onClick={
                    onParticipantClick === undefined
                      ? undefined
                      : () => onParticipantClick(participant)
                  }
                />
              </Col>
            ))}
          </Row>
        )}
      </Space>
    </Card>
  );
}
