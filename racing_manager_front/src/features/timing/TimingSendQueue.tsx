import { CloseOutlined, SendOutlined } from '@ant-design/icons';
import { Button, Card, Tag, Typography } from 'antd';
import type { CSSProperties } from 'react';
import { formatTimingClock } from './ParticipantTile';
import type { TimingOfflineEntryView } from './timingOffline';

/**
 * The send queue of one device, as the content of the unsent overlay
 * (FR-09, FR-11, FR-12, FR-14, FR-24).
 *
 * The component is rendered inside the non-modal popover the page owns; it
 * never renders in page flow and it never returns `null`. Its frame keeps its
 * position and width while its rows change: the four unsent figures, the
 * connection line, the row area and the action row are all permanently
 * rendered at a fixed height, so a capture that queues, starts sending or
 * drains cannot resize the overlay (S-05, S-07, F-05, F-08).
 *
 * A refusal is not a queue row: the hook reports the refusal once and removes
 * the entry. A capture already on its way is not a row either: the page states
 * it as the «Отправляется: K» figure, so this component lists the waiting
 * entries only, in the capture order the derived view gives them (E-06, F-05).
 *
 * While every unsent entry is sending there is no row to manage, but the frame
 * stays and the send action stays available (S-05). With nothing unsent at all
 * the row area states «Всё отправлено» and the action row keeps its height with
 * no button in it (FR-25).
 */

/** Exact height of the waiting-row area; it never grows with its rows. */
export const TIMING_SEND_QUEUE_AREA_HEIGHT = 260;

const TITLE = 'Очередь отправки';
const LIST_LABEL = 'Очередь отправки';
const ALL_SENT_LABEL = 'Всё отправлено';
const OFFLINE_LABEL = 'Нет связи с сервером';
const UNSENT_LABEL = 'не отправлено';
const FRAME_TEST_ID = 'timing-send-queue-frame';
const FIGURES_TEST_ID = 'timing-send-queue-figures';
const LIST_TEST_ID = 'timing-send-queue-list-area';

/** Width of the overlay frame, never wider than the viewport allows. */
export const TIMING_SEND_QUEUE_FRAME_WIDTH = 'min(480px, calc(100vw - 32px))';

/** Two lines of 16 px: the figures never wrap and never move the frame. */
const FIGURES_HEIGHT = 34;
/** The connection line keeps its place with or without a message. */
const OFFLINE_LINE_HEIGHT = 18;
/** The action row keeps its height whether the button is offered or not. */
const ACTION_ROW_HEIGHT = 40;

const FRAME_STYLE: CSSProperties = {
  width: TIMING_SEND_QUEUE_FRAME_WIDTH,
};

const BODY_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const FIGURES_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: FIGURES_HEIGHT,
  overflow: 'hidden',
};

const FIGURE_LINE_STYLE: CSSProperties = {
  fontSize: 16,
  lineHeight: '16px',
  height: 16,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const OFFLINE_LINE_STYLE: CSSProperties = {
  height: OFFLINE_LINE_HEIGHT,
  lineHeight: `${OFFLINE_LINE_HEIGHT}px`,
  fontSize: 12,
  overflow: 'hidden',
};

const LIST_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  height: TIMING_SEND_QUEUE_AREA_HEIGHT,
  overflowY: 'auto',
  margin: 0,
  padding: 0,
  listStyle: 'none',
};

const ACTION_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: ACTION_ROW_HEIGHT,
  flexShrink: 0,
};

const EMPTY_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '1 1 auto',
  minHeight: 0,
};

const UNSENT_TAG_STYLE: CSSProperties = {
  backgroundColor: '#f9f0ff',
  borderColor: '#722ed1',
  borderStyle: 'dashed',
  color: '#391085',
  marginInlineEnd: 0,
};

const ROW_CARD_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: '1 1 auto',
  minWidth: 0,
  padding: '4px 6px',
  border: '1px solid #f0f0f0',
  borderRadius: 8,
  background: '#ffffff',
};

export interface TimingSendQueueProps {
  /**
   * Unsent entries of every kind, in the capture order of the outbox. An entry
   * with `isSending` is a page figure, never a row (E-06, F-05).
   */
  entries: TimingOfflineEntryView[];
  /** Unsent entries of every kind; the page figure «Не отправлено: N». */
  unsentEntries: number;
  /**
   * Unsent entries whose delivery is already in flight; «Отправляется: K».
   * The page derives it; the overlay only states it (FR-24).
   *
   * The four figure fields below read `0` when a caller omits them. That
   * default exists only so the timing page, which still renders this content
   * in page flow until Wave 3 owns the popover, keeps compiling; Wave 3 passes
   * all of them from `deriveTimingOfflineView`.
   */
  sendingEntries?: number;
  /** Unsent entries still waiting for a delivery; «Ожидают отправки: K». */
  waitingEntries?: number;
  /** Marks among the waiting entries; «из них отметок: M». */
  pendingMarks?: number;
  /** False while the device has no server answer path (AS-4). */
  isOnline: boolean;
  /** True while the page sends the queue; the offer is busy and inert then. */
  isSending: boolean;
  /** Asks the page to replay the queue now (FR-12). */
  onSendNow: () => Promise<void>;
  /**
   * Asks the page to close the overlay that owns this content (FR-14).
   * The page wires the popover in Wave 3 of MANUAL-TIMING-6.
   */
  onClose?: () => void;
}

function wholeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/** `№ 14 Иванов Иван`, with each fact only where the entry has it (FR-12). */
function participantFacts(entry: TimingOfflineEntryView): string | null {
  const parts: string[] = [];
  if (entry.startNumber !== null) parts.push(`№ ${entry.startNumber}`);
  if (entry.fullName !== null) parts.push(entry.fullName);
  return parts.length === 0 ? null : parts.join(' ');
}

/** The capture an unsent withdrawal retires, named on its own row (FR-39). */
function withdrawalFacts(entry: TimingOfflineEntryView): string | null {
  const target = entry.withdraws;
  if (target === null) return null;
  const parts: string[] = [];
  if (target.startNumber !== null) parts.push(`№ ${target.startNumber}`);
  if (target.fullName !== null) parts.push(target.fullName);
  return parts.length === 0
    ? 'Отменяет отметку без номера'
    : `Отменяет отметку: ${parts.join(' ')}`;
}

function EntryRow({ entry }: { entry: TimingOfflineEntryView }) {
  const participant = participantFacts(entry);
  const withdrawal = withdrawalFacts(entry);

  return (
    <li style={{ display: 'flex', gap: 6, alignItems: 'stretch', flexShrink: 0 }}>
      <div style={ROW_CARD_STYLE}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            flexWrap: 'wrap',
            minWidth: 0,
          }}
        >
          <Typography.Text strong style={{ fontSize: 12 }}>
            {entry.kindLabel}
          </Typography.Text>
          {entry.blockKey === null ? null : (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              Блок: {entry.blockKey}
            </Typography.Text>
          )}
          {entry.startNumber === null ? null : (
            <Typography.Text style={{ fontSize: 11 }}>
              № {entry.startNumber}
            </Typography.Text>
          )}
        </div>

        {entry.fullName === null ? null : (
          <Typography.Text
            strong
            title={participant ?? entry.fullName}
            style={{
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.fullName}
          </Typography.Text>
        )}
        {withdrawal === null ? null : (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {withdrawal}
          </Typography.Text>
        )}

        <Typography.Text
          type="secondary"
          style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
        >
          Отметка: {formatTimingClock(entry.pressTime)}
        </Typography.Text>

        <Tag style={UNSENT_TAG_STYLE}>{UNSENT_LABEL}</Tag>
      </div>
    </li>
  );
}

export function TimingSendQueue({
  entries,
  unsentEntries,
  sendingEntries = 0,
  waitingEntries = 0,
  pendingMarks = 0,
  isOnline,
  isSending,
  onSendNow,
  onClose = () => {},
}: TimingSendQueueProps) {
  const unsentCount = wholeCount(unsentEntries);
  const sendingCount = wholeCount(sendingEntries);
  const waitingCount = wholeCount(waitingEntries);
  const marksCount = wholeCount(pendingMarks);
  // The rows the referee can still manage: everything the server has not
  // answered and the outbox is not already delivering (E-06, F-05).
  const waitingRows = entries.filter((entry) => !entry.isSending);
  const everyCaptureSent = unsentCount === 0;

  return (
    <Card
      size="small"
      type="inner"
      title={TITLE}
      style={FRAME_STYLE}
      data-testid={FRAME_TEST_ID}
      extra={
        <Button
          type="text"
          aria-label="Закрыть очередь отправки"
          icon={<CloseOutlined />}
          onClick={onClose}
        />
      }
    >
      <div style={BODY_STYLE}>
        {/* The four page figures, always both lines at 16 px (FR-24). */}
        <div data-testid={FIGURES_TEST_ID} style={FIGURES_STYLE}>
          <div style={FIGURE_LINE_STYLE}>
            {`Не отправлено: ${unsentCount} · Отправляется: ${sendingCount}`}
          </div>
          <div style={FIGURE_LINE_STYLE}>
            {`Ожидают отправки: ${waitingCount} · из них отметок: ${marksCount}`}
          </div>
        </div>

        {/* Reserved line: the connection hint appears without moving anything. */}
        <div style={OFFLINE_LINE_STYLE}>
          {!isOnline && waitingCount > 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {OFFLINE_LABEL}
            </Typography.Text>
          ) : null}
        </div>

        {/* One fixed row area: it scrolls instead of resizing the frame (S-07). */}
        <ul
          aria-label={LIST_LABEL}
          data-testid={LIST_TEST_ID}
          style={LIST_STYLE}
        >
          {waitingRows.length === 0 ? (
            everyCaptureSent ? (
              <li role="status" style={EMPTY_ROW_STYLE}>
                <Typography.Text type="secondary">
                  {ALL_SENT_LABEL}
                </Typography.Text>
              </li>
            ) : null
          ) : (
            waitingRows.map((entry) => <EntryRow key={entry.id} entry={entry} />)
          )}
        </ul>

        {/* The action row never changes height, with or without the offer. */}
        <div style={ACTION_ROW_STYLE}>
          {everyCaptureSent ? null : (
            <Button
              size="small"
              icon={<SendOutlined />}
              loading={isSending}
              disabled={isSending}
              onClick={() => {
                void onSendNow();
              }}
            >
              Отправить сейчас
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
