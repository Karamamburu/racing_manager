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
 * One timeable protocol category of the event-wide timing surface.
 *
 * This wave renders the read-only block, the category Start press, the capture
 * hand-over and the entry to the record of its current or last attempt. Number
 * capture, pending-finish binding and corrections belong to other components:
 * the record drawer owns every correction control (U-29).
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

  return (
    <Card
      size="small"
      title={
        <Space wrap size={8}>
          <Typography.Text strong>{title}</Typography.Text>
          <Tag color={STATE_COLORS[block.state]}>{STATE_LABELS[block.state]}</Tag>
        </Space>
      }
      extra={
        <Space wrap size={8}>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            disabled={!canStart}
            onClick={onStart}
          >
            Старт
          </Button>
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

        <Space wrap size={[16, 4]}>
          <Typography.Text>Круги: {block.lapCount}</Typography.Text>
          <Typography.Text>
            Старт: {formatTimingClock(block.officialStartedAt)}
          </Typography.Text>
          {block.elapsedMs === null ? null : (
            <Typography.Text>Время: {formatElapsed(block.elapsedMs)}</Typography.Text>
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
