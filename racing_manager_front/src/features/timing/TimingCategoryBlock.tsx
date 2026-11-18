import {
  DownOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
  RightOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Space, Tag, Typography } from 'antd';
import type { CSSProperties } from 'react';
import { useState } from 'react';
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
 * The one reserved header status area of a block (U-01, U-02, U-03).
 *
 * The area is always rendered, so the unsent chip, the ready chip and the
 * empty state all occupy the same single line and cost no layout. Its width is
 * sized for «Отметок не отправлено: 999»; a four-digit count may grow beyond it
 * and the title yields instead (S-10).
 */
const STATUS_AREA_STYLE: CSSProperties = {
  display: 'inline-block',
  flex: 'none',
  minWidth: 190,
  whiteSpace: 'nowrap',
  overflow: 'visible',
};

/** A header item that keeps its width while the title yields space. */
const HEADER_ITEM_STYLE: CSSProperties = { flex: 'none' };

/** The only shrinkable header item: the block title (U-04). */
const HEADER_TITLE_STYLE: CSSProperties = {
  display: 'inline-block',
  flex: '0 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/**
 * The unsent cue shares no colour with exclusion or a participant state (U-04).
 * It repeats the violet accent the participant tiles already use (S-02).
 */
const UNSENT_TAG_STYLE: CSSProperties = {
  backgroundColor: '#f9f0ff',
  borderColor: '#722ed1',
  borderStyle: 'dashed',
  color: '#391085',
  marginInlineEnd: 0,
};

/** The block marks the page derived from its device outbox; never a server fact. */
const NO_PENDING_MARKS: ReadonlyMap<string, number> = new Map();

/**
 * The Russian plural form of a whole count: `0` for 1, `1` for 2–4 and `2` for
 * 0 and 5+, with the 11–14 teens on the third form (S-03).
 */
function pluralForm(count: number): 0 | 1 | 2 {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 0;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
  return 2;
}

/** The three agreement forms of the unsent sentence, keyed by `pluralForm`. */
const UNSENT_NOTICE_FORMS = [
  { marks: 'отметка', recorded: 'записана', sent: 'не отправлена' },
  { marks: 'отметки', recorded: 'записаны', sent: 'не отправлены' },
  { marks: 'отметок', recorded: 'записаны', sent: 'не отправлены' },
] as const;

/**
 * The sentence that replaces the ready prompt while marks are unsent (S-03).
 *
 * It agrees with the count, so «1 отметка записана … не отправлена» reads as
 * naturally as «5 отметок записаны … не отправлены».
 */
function unsentNotice(pendingMarks: number): string {
  const form = UNSENT_NOTICE_FORMS[pluralForm(pendingMarks)];
  return `${pendingMarks} ${form.marks} ${form.recorded} на устройстве и ещё ${form.sent}. Завершить можно после отправки.`;
}

/**
 * A pending figure the surface handed over, clamped to a whole count.
 *
 * The queue is local and may only return a negative or fractional value through
 * a defect; the block never invents a count from it (FR-10, FR-37, U-05).
 */
function pendingMarks(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0;
}

/** The finished-category fallback when the API sent no reason of its own. */
const FINISHED_FALLBACK =
  'Гонка в этой категории завершена. Результаты менять нельзя.';

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
 * A block whose start has already been given has no Start to press, so a
 * running or closed block hides the control instead of keeping it disabled. An
 * unstarted block, and a block whose attempt was cancelled (the accepted
 * re-time), keep it. A heat of a stage whose heats are not formed, or of a
 * closed stage, offers no Start: the block reason states why and the press is
 * not available (F-12, S-07). An unstarted category keeps its disabled Start,
 * so a reader still sees the control and the reason beside it.
 */
function showsStartControl(block: TimingCategoryBlockView): boolean {
  if (block.state !== 'NOT_STARTED' && block.state !== 'CANCELLED') {
    return false;
  }
  if (block.kind !== 'HEAT') return true;
  return block.stageState === undefined || block.stageState === 'SEEDED';
}

/** A pastel card tint for quick gender identification on a busy surface. */
function genderClassName(gender: string): string | undefined {
  if (gender === 'M') return 'timing-gender-m';
  if (gender === 'F') return 'timing-gender-f';
  return undefined;
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
 *
 * MANUAL-TIMING-4 (FR-10, FR-37, S-03) / MANUAL-TIMING-6 (§2.3): `pendingMarkCount`
 * is the block total and `pendingMarksByParticipant` carries each tile's own
 * share, both derived by the page from the device outbox. One permanently
 * reserved single-line area of the header holds the only block-level cue:
 * «Отметок не отправлено: N» while the total is positive, «Можно завершить»
 * once a running block has every capture collected and nothing is unsent, and
 * nothing otherwise. The cue uses the tiles' violet accent and states the count
 * in words; its accessible description carries the long explanation that the
 * block cannot be closed while marks are unsent. State tags, tiles, block order
 * and the capture controls stay untouched.
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
  pendingMarksByParticipant = NO_PENDING_MARKS,
  pendingMarkCount = 0,
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
  /** Unsent marks per `enrollmentId`; a missing id shows a confirmed-only tile. */
  pendingMarksByParticipant?: ReadonlyMap<string, number>;
  /** Unsent marks of the whole block; `0` renders the block as it was. */
  pendingMarkCount?: number;
}) {
  const canStart = block.startControlEnabled && isCaptureHolder;
  const showsTakeCapture = !isCaptureHolder && onTakeCapture !== undefined;
  // An attempt exists only once the category has started, so a category that
  // never ran offers no record to read (U-29).
  const showsRecord = block.attemptId !== null && onOpenRecord !== undefined;
  const showsStart = showsStartControl(block);
  const isHeat = block.kind === 'HEAT';
  const unsentMarkTotal = pendingMarks(pendingMarkCount);
  const hasUnsentMarks = unsentMarkTotal > 0;
  // One area, one cue, one precedence: unsent wins, readiness needs a running
  // block with every capture collected, and a closed block is never ready
  // (§2.3 rule 4, S-01, S-02, S-03).
  const showsReadyCue =
    !hasUnsentMarks &&
    block.state === 'RUNNING' &&
    block.capturesComplete === true &&
    block.finished !== true;
  // Race-captured participants are timeable in their heat blocks, not in the
  // category attempt. Render them as one compact note instead of a wall of
  // EXCLUDED RACE_SECTION tiles (MANUAL-TIMING-2 UX fix).
  const raceSectionExcluded = block.participants.filter(
    (participant) => participant.excludedReason === 'RACE_SECTION',
  );
  const visibleParticipants = block.participants.filter(
    (participant) => participant.excludedReason !== 'RACE_SECTION',
  );
  const allInRaces =
    visibleParticipants.length === 0 && raceSectionExcluded.length > 0;
  // A running block advances locally from its official start; a closed or
  // unstarted block keeps the surface value untouched (AD-19, O-04).
  const displayedElapsedMs = useElapsedClock({
    state: block.state,
    officialStartedAt: block.officialStartedAt,
    elapsedMs: block.elapsedMs,
  });
  // Every rendered block collapses independently: the header, the state tag and
  // the actions stay visible, and only this block's body folds away. The state
  // is page-session local and keyed by the component instance (U-04).
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Card
      size="small"
      className={genderClassName(block.gender)}
      title={
        <Space
          wrap={false}
          size={6}
          align="baseline"
          style={{
            width: '100%',
            flexWrap: 'nowrap',
            minWidth: 0,
            alignItems: 'baseline',
          }}
        >
          <Button
            type="text"
            size="small"
            style={HEADER_ITEM_STYLE}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Развернуть блок' : 'Свернуть блок'}
            title={collapsed ? 'Развернуть блок' : 'Свернуть блок'}
            icon={collapsed ? <RightOutlined /> : <DownOutlined />}
            onClick={() => setCollapsed((current) => !current)}
          />
          {isHeat ? (
            <Tag color="geekblue" style={HEADER_ITEM_STYLE}>
              Заезд
            </Tag>
          ) : null}
          <Typography.Text strong style={HEADER_TITLE_STYLE}>
            {title}
          </Typography.Text>
          <Tag color={STATE_COLORS[block.state]} style={HEADER_ITEM_STYLE}>
            {STATE_LABELS[block.state]}
          </Tag>
          {/* One permanently reserved single-line status area: the unsent chip,
              the ready chip or nothing, never both (U-01, U-02, §2.3 rule 4). */}
          <span data-testid="timing-block-status" style={STATUS_AREA_STYLE}>
            {hasUnsentMarks ? (
              <Tag
                style={{ ...UNSENT_TAG_STYLE, flex: 'none' }}
                title={unsentNotice(unsentMarkTotal)}
                aria-label={unsentNotice(unsentMarkTotal)}
              >
                {`Отметок не отправлено: ${unsentMarkTotal}`}
              </Tag>
            ) : showsReadyCue ? (
              <Tag color="green" style={HEADER_ITEM_STYLE}>
                Можно завершить
              </Tag>
            ) : null}
          </span>
        </Space>
      }
      extra={
        <Space wrap size={8} style={HEADER_ITEM_STYLE}>
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
              Захват у другого устройства
            </Typography.Text>
          ) : null}
        </Space>
      }
    >
      {collapsed ? null : (
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
              <Typography.Text
                style={{
                  display: 'inline-block',
                  minWidth: 118,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Время: {formatElapsed(displayedElapsedMs)}
              </Typography.Text>
            )}
            <Typography.Text>Участники: {visibleParticipants.length}</Typography.Text>
          </Space>

          {raceSectionExcluded.length > 0 ? (
            <Typography.Text type="secondary">
              В заездах гонки: {raceSectionExcluded.length}. Время фиксируется в
              блоках заездов ниже.
            </Typography.Text>
          ) : null}

          {/* The block body states only the accepted long-lived facts. The
              unsent count and the ready prompt live in the header status area,
              so neither a sentence nor an alert is inserted here by a capture
              (U-05, F-09, §2.6). */}
          {block.finished ? (
            <Alert
              type="success"
              showIcon
              message={block.blockReason ?? FINISHED_FALLBACK}
            />
          ) : block.blockReason && !allInRaces ? (
            <Alert type="warning" showIcon message={block.blockReason} />
          ) : null}

          {block.pendingFinishes.length > 0 ? (
            <Tag color="orange">
              Непривязанных финишей: {block.pendingFinishes.length}
            </Tag>
          ) : null}

          {visibleParticipants.length === 0 ? (
            <Typography.Text type="secondary">
              {allInRaces
                ? 'Все участники категории проводятся по заездам.'
                : 'В категории нет участников для хронометража'}
            </Typography.Text>
          ) : (
            <div className="timing-participant-grid">
              {visibleParticipants.map((participant) => (
                <ParticipantTile
                  key={participant.enrollmentId}
                  participant={participant}
                  pendingMarks={pendingMarks(
                    pendingMarksByParticipant.get(participant.enrollmentId),
                  )}
                  onClick={
                    onParticipantClick === undefined
                      ? undefined
                      : () => onParticipantClick(participant)
                  }
                />
              ))}
            </div>
          )}
        </Space>
      )}
    </Card>
  );
}
