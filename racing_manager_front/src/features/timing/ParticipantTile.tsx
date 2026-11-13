import { Tag, Typography } from 'antd';
import type { CSSProperties } from 'react';
import type {
  TimingParticipantTileState,
  TimingParticipantTileView,
} from './types';

const STATE_LABELS: Record<TimingParticipantTileState, string> = {
  WAITING: 'Ожидает',
  RACING: 'На дистанции',
  RECORDED: 'Отметки собраны',
  INCOMPLETE: 'Не завершил',
  EXCLUDED: 'Исключён',
};

const STATE_COLORS: Record<TimingParticipantTileState, string> = {
  WAITING: 'default',
  RACING: 'blue',
  RECORDED: 'green',
  INCOMPLETE: 'orange',
  EXCLUDED: 'red',
};

/**
 * One capture instant as a local wall clock with milliseconds.
 *
 * The PRD requires a resolution fine enough to separate two consecutive presses
 * of one referee, so the millisecond part stays visible on the tile and in a
 * category header. A missing or unparsable value reads as a dash.
 */
export function formatTimingClock(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (input: number, size: number) => String(input).padStart(size, '0');
  const hours = pad(date.getHours(), 2);
  const minutes = pad(date.getMinutes(), 2);
  const seconds = pad(date.getSeconds(), 2);
  const milliseconds = pad(date.getMilliseconds(), 3);
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function displayNumber(startNumber: number): string {
  return Number.isFinite(startNumber) && startNumber > 0
    ? String(startNumber)
    : '—';
}

function tileStyle(excluded: boolean): CSSProperties {
  return {
    display: 'block',
    boxSizing: 'border-box',
    width: '100%',
    height: '100%',
    padding: 12,
    border: excluded ? '1px dashed #d9d9d9' : '1px solid #f0f0f0',
    borderRadius: 8,
    background: excluded ? '#fafafa' : '#ffffff',
    opacity: excluded ? 0.65 : 1,
    textAlign: 'left',
    font: 'inherit',
    color: 'inherit',
  };
}

/**
 * One participant of a category block.
 *
 * The tile is a read-only view of the frozen roster facts and the live capture
 * state. It carries no capture logic: a tile click is reported to the caller,
 * and the capture wave decides what it means. An excluded participant keeps its
 * reason on screen and is never a control.
 */
export function ParticipantTile({
  participant,
  onClick,
}: {
  participant: TimingParticipantTileView;
  onClick?: () => void;
}) {
  const excluded = participant.state === 'EXCLUDED';
  const interactive = onClick !== undefined && !excluded;
  const number = displayNumber(participant.startNumber);

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Typography.Text strong style={{ fontSize: 20 }}>
          {number}
        </Typography.Text>
        <Tag color={STATE_COLORS[participant.state]}>
          {STATE_LABELS[participant.state]}
        </Tag>
      </div>
      <Typography.Text strong>{participant.fullName}</Typography.Text>
      <Typography.Text type="secondary">
        Раздел: {participant.sectionId || '—'}
      </Typography.Text>
      <Typography.Text>
        Круги: {participant.passCount} / {participant.requiredLaps}
      </Typography.Text>
      <Typography.Text>
        Последняя отметка: {formatTimingClock(participant.lastPassAt)}
      </Typography.Text>
      {excluded && participant.excludedReason ? (
        <Typography.Text type="danger">
          Причина: {participant.excludedReason}
        </Typography.Text>
      ) : null}
    </div>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${number} ${participant.fullName}`}
        style={{ ...tileStyle(false), cursor: 'pointer' }}
      >
        {content}
      </button>
    );
  }

  return <div style={tileStyle(excluded)}>{content}</div>;
}
