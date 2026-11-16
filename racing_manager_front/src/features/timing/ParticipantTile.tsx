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

/** The unsent cue shares no colour with exclusion or a participant state (U-04). */
const UNSENT_OUTLINE_COLOUR = '#722ed1';
const UNSENT_BADGE_BACKGROUND = '#f9f0ff';
const UNSENT_BADGE_TEXT = '#391085';
const UNSENT_BADGE_BORDER = '#d3adf7';

/**
 * The unsent lap line is bold and dotted: the `+N` token names the unsent part
 * and the type marks the figure, so no colour carries the meaning (S-01, U-04).
 */
const UNSENT_MARK_STYLE: CSSProperties = {
  fontWeight: 700,
  textDecorationLine: 'underline',
  textDecorationStyle: 'dotted',
};

/** The badge that names the unsent marks in words, never by colour alone. */
const UNSENT_BADGE_STYLE: CSSProperties = {
  alignSelf: 'flex-start',
  maxWidth: '100%',
  marginTop: 1,
  padding: '1px 4px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: UNSENT_BADGE_BORDER,
  borderRadius: 4,
  backgroundColor: UNSENT_BADGE_BACKGROUND,
  color: UNSENT_BADGE_TEXT,
  fontSize: 9,
  fontWeight: 600,
  lineHeight: 1.15,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function displayNumber(startNumber: number): string {
  return Number.isFinite(startNumber) && startNumber > 0
    ? String(startNumber)
    : '—';
}

function tileStyle(
  state: TimingParticipantTileState,
  interactive: boolean,
  hasUnsent: boolean,
): CSSProperties {
  return {
    display: 'block',
    boxSizing: 'border-box',
    width: '100%',
    // A fixed 4:3 landscape card is easier to aim at and looks the same in
    // every block, whatever the number of columns (U-04).
    aspectRatio: '4 / 3',
    padding: '4px 6px',
    border: '1px solid',
    borderRadius: 6,
    ...STATE_STYLES[state],
    // The dashed outline is the second, non-colour signal of an unsent mark
    // (S-02, U-04); the state border and fill stay untouched (FR-34).
    ...(hasUnsent
      ? {
          outlineWidth: 2,
          outlineStyle: 'dashed',
          outlineColor: UNSENT_OUTLINE_COLOUR,
          outlineOffset: 1,
        }
      : {}),
    cursor: interactive ? 'pointer' : 'default',
    textAlign: 'left',
    font: 'inherit',
  };
}

/**
 * The accessible name of a tile: number and name, plus both lap counts in words
 * while marks are unsent (S-01, FR-07). A tile without pending marks keeps the
 * bare number and name it has today.
 */
function tileAccessibleName(
  number: string,
  participant: TimingParticipantTileView,
  pendingMarks: number,
): string {
  const base = `${number} ${participant.fullName}`;
  if (pendingMarks === 0) return base;
  const confirmed = `кругов подтверждено: ${participant.passCount}`;
  return `${base}, ${confirmed}, не отправлено: ${pendingMarks}`;
}

/**
 * One participant of a category block.
 *
 * The tile is a compact, read-only view of the frozen roster facts and the live
 * capture state. Its whole surface carries the state colour and keeps a fixed
 * 4:3 shape, so a running or finished participant is readable at a glance and
 * the whole card is an easy click target. It carries no capture logic: a tile
 * click is reported to the caller, and the capture wave decides what it means.
 * An excluded participant is never a control.
 *
 * MANUAL-TIMING-4 (S-01, S-02, FR-07, FR-08, FR-09, FR-34): `pendingMarks` is
 * the count the page derived from the device outbox, never a server fact. While
 * it is positive the lap line reads `confirmed+pending/required` instead of a
 * sum, the tile gains a dashed violet outline and a light badge that names the
 * unsent marks in words, and the accessible name states both counts. The state
 * fill, state label, size and click handling stay exactly as they are, and a
 * tile told nothing is pending renders as it did before.
 */
export function ParticipantTile({
  participant,
  pendingMarks = 0,
  onClick,
}: {
  participant: TimingParticipantTileView;
  /** Unsent marks this tile shows; `0` renders today's confirmed-only tile. */
  pendingMarks?: number;
  onClick?: () => void;
}) {
  const state = participant.state;
  const excluded = state === 'EXCLUDED';
  const interactive = onClick !== undefined && !excluded;
  const number = displayNumber(participant.startNumber);
  // The queue is local and may hand back a negative or fractional figure only
  // through a defect; the tile never invents a count from it.
  const unsentMarks =
    Number.isFinite(pendingMarks) && pendingMarks > 0
      ? Math.trunc(pendingMarks)
      : 0;
  const hasUnsent = unsentMarks > 0;

  const lapLine = hasUnsent ? (
    <span
      title={`Круги: ${participant.passCount} из ${participant.requiredLaps}, не отправлено: ${unsentMarks}`}
      style={{
        fontSize: 12,
        lineHeight: 1.15,
        fontVariantNumeric: 'tabular-nums',
        ...UNSENT_MARK_STYLE,
      }}
    >
      {`${participant.passCount}+${unsentMarks}/${participant.requiredLaps}`}
    </span>
  ) : (
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
  );

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        gap: 4,
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
        <span style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>
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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          minWidth: 0,
        }}
      >
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
        {lapLine}
        {hasUnsent ? (
          <span
            title={`не отправлено: ${unsentMarks}`}
            style={UNSENT_BADGE_STYLE}
          >
            не отправлено: {unsentMarks}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={tileAccessibleName(number, participant, unsentMarks)}
        style={tileStyle(state, true, hasUnsent)}
      >
        {content}
      </button>
    );
  }

  // A tile that is not a control still has to name its unsent marks; the group
  // role gives the label a place to live, and `0` keeps the plain tile (S-01).
  return (
    <div
      role={hasUnsent ? 'group' : undefined}
      aria-label={
        hasUnsent
          ? tileAccessibleName(number, participant, unsentMarks)
          : undefined
      }
      style={tileStyle(state, false, hasUnsent)}
    >
      {content}
    </div>
  );
}
