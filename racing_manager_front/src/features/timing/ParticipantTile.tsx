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

/** The whole tile is filled with its state colour (U-04 compact tiles). */
const STATE_STYLES: Record<
  TimingParticipantTileState,
  Pick<CSSProperties, 'background' | 'borderColor' | 'color'>
> = {
  WAITING: { background: '#f0f0f0', borderColor: '#d9d9d9', color: '#262626' },
  RACING: { background: '#1677ff', borderColor: '#1677ff', color: '#ffffff' },
  RECORDED: {
    background: '#389e0d',
    borderColor: '#389e0d',
    color: '#ffffff',
  },
  INCOMPLETE: {
    background: '#d46b08',
    borderColor: '#d46b08',
    color: '#ffffff',
  },
  EXCLUDED: { background: '#cf1322', borderColor: '#cf1322', color: '#ffffff' },
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

function tileStyle(
  state: TimingParticipantTileState,
  interactive: boolean,
): CSSProperties {
  return {
    display: 'block',
    boxSizing: 'border-box',
    width: '100%',
    height: '100%',
    padding: '6px 8px',
    border: '1px solid',
    borderRadius: 6,
    ...STATE_STYLES[state],
    cursor: interactive ? 'pointer' : 'default',
    textAlign: 'left',
    font: 'inherit',
  };
}

/**
 * One participant of a category block.
 *
 * The tile is a compact, read-only view of the frozen roster facts and the live
 * capture state. Its whole surface carries the state colour, so a running or
 * finished participant is readable at a glance and more tiles fit on screen.
 * It carries no capture logic: a tile click is reported to the caller, and the
 * capture wave decides what it means. An excluded participant keeps its reason
 * on screen and is never a control.
 */
export function ParticipantTile({
  participant,
  onClick,
}: {
  participant: TimingParticipantTileView;
  onClick?: () => void;
}) {
  const state = participant.state;
  const excluded = state === 'EXCLUDED';
  const interactive = onClick !== undefined && !excluded;
  const number = displayNumber(participant.startNumber);

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.05 }}>
          {number}
        </span>
        <span
          style={{
            fontSize: 10,
            lineHeight: 1.2,
            opacity: 0.9,
            textAlign: 'right',
          }}
        >
          {STATE_LABELS[state]}
        </span>
      </div>
      <span
        title={participant.fullName}
        style={{
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {participant.fullName}
      </span>
      <span
        title={`Круги: ${participant.passCount} из ${participant.requiredLaps}`}
        style={{
          fontSize: 12,
          lineHeight: 1.15,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {participant.passCount}/{participant.requiredLaps}
      </span>
    </div>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${number} ${participant.fullName}`}
        style={tileStyle(state, true)}
      >
        {content}
      </button>
    );
  }

  return <div style={tileStyle(state, false)}>{content}</div>;
}
