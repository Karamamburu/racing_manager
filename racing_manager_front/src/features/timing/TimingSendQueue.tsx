import { CloseOutlined, SendOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { formatTimingClock } from './ParticipantTile';
import type { TimingOfflineEntryView } from './timingOffline';
import { describeTimingError } from './useTimingCapture';

/**
 * The send queue of one device (FR-11, FR-12, FR-13, FR-20, FR-21).
 *
 * The queue lists every entry the device recorded and the server has not
 * answered, plus every refusal the referee has not dismissed yet. It is one
 * compact block above the capture controls, with a fixed area whose rows scroll
 * inside it, so a capture, a refusal or a dismissal never moves the number
 * field or a block (S-04, S-06).
 *
 * The component owns no product rule: the page derives the rows and the two
 * figures from the device outbox, and this component renders them and reports
 * the two presses. A rejected entry is never counted as unsent and is never
 * offered for sending again (FR-20); a dismissal only removes the row, it never
 * touches a lap, a participant state, a pass or a result (FR-21).
 *
 * The unsent word and the violet accent carry the state together, so a reader
 * never needs colour: an unsent row says «не отправлено», a refused row says
 * «Отклонено» with the server's reason, and the empty queue says
 * «Всё отправлено» (U-04, FR-09).
 */

/** Minimum height of the entry area when its column has no spare height. */
export const TIMING_SEND_QUEUE_AREA_HEIGHT = 104;

const TITLE = 'Очередь отправки';
const LIST_LABEL = 'Очередь отправки';
const ALL_SENT_LABEL = 'Всё отправлено';
const OFFLINE_LABEL = 'Нет связи с сервером';
const UNSENT_LABEL = 'не отправлено';
const REJECTED_LABEL = 'Отклонено';
/** A refusal still names a reason when the server sent none. */
const REJECTION_FALLBACK_REASON = 'сервер не указал причину';

/**
 * The unsent cue repeats the violet accent the tiles and block headers already
 * use, never the exclusion red and never a participant state colour (U-04).
 */
const UNSENT_TAG_STYLE: CSSProperties = {
  backgroundColor: '#f9f0ff',
  borderColor: '#722ed1',
  borderStyle: 'dashed',
  color: '#391085',
  marginInlineEnd: 0,
};

const LIST_STYLE: CSSProperties = {
  flex: 1,
  minHeight: TIMING_SEND_QUEUE_AREA_HEIGHT,
  overflowY: 'auto',
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gridAutoRows: 'min-content',
  alignContent: 'start',
  gap: 6,
};

const EMPTY_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
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
  /** Every unsent and rejected entry, in the capture order of the outbox. */
  entries: TimingOfflineEntryView[];
  /** Unsent entries of every kind; the page figure «Не отправлено: N». */
  unsentEntries: number;
  /** Undismissed rejections; they stay listed but are never unsent (FR-20). */
  rejectedEntries: number;
  /** False while the device has no server answer path (AS-4). */
  isOnline: boolean;
  /** True while the page sends the queue; the offer is busy and inert then. */
  isSending: boolean;
  /** Asks the page to replay the queue now (FR-13). */
  onSendNow: () => Promise<void>;
  /** Removes one rejected row; the page owns the request (FR-21). */
  onDismiss: (id: string) => Promise<void>;
}

/**
 * A figure the page computed from the outbox. A local negative or fractional
 * value can only come from a defect; the queue never invents a count from it.
 */
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

function EntryRow({
  entry,
  ordinal,
  dismissing,
  dismissBusy,
  onDismiss,
}: {
  entry: TimingOfflineEntryView;
  ordinal: number;
  /** This row's dismissal is in flight. */
  dismissing: boolean;
  /** Some dismissal is in flight, so no row offers a second one. */
  dismissBusy: boolean;
  onDismiss: () => void;
}) {
  const participant = participantFacts(entry);
  const withdrawal = withdrawalFacts(entry);
  const stateLabel = entry.rejected
    ? REJECTED_LABEL
    : entry.unsent
      ? UNSENT_LABEL
      : null;

  return (
    <li
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'stretch',
        // Rows never shrink into the fixed area: a long queue scrolls inside
        // it instead of compressing its entries.
        flexShrink: 0,
      }}
    >
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

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {stateLabel === null ? null : entry.rejected ? (
            <Tag color="red" style={{ marginInlineEnd: 0 }}>
              {stateLabel}
            </Tag>
          ) : (
            <Tag style={UNSENT_TAG_STYLE}>{stateLabel}</Tag>
          )}
          {entry.rejected ? (
            <Typography.Text type="danger" style={{ fontSize: 11 }}>
              {'Причина: '}
              <span>{entry.reason ?? REJECTION_FALLBACK_REASON}</span>
            </Typography.Text>
          ) : null}
        </div>
      </div>

      {entry.rejected ? (
        <Button
          size="small"
          type="text"
          danger
          icon={<CloseOutlined />}
          aria-label={`Убрать отклонённую запись ${ordinal}`}
          loading={dismissing}
          disabled={dismissBusy}
          onClick={onDismiss}
        />
      ) : null}
    </li>
  );
}

export function TimingSendQueue({
  entries,
  unsentEntries,
  rejectedEntries,
  isOnline,
  isSending,
  onSendNow,
  onDismiss,
}: TimingSendQueueProps) {
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const unsentCount = wholeCount(unsentEntries);
  const rejectedCount = wholeCount(rejectedEntries);
  const hasUnsent = unsentCount > 0;
  const hasRejected = rejectedCount > 0;
  const allClear = !hasUnsent && !hasRejected;
  // The hint is part of the unsent report and disappears with a resolved queue
  // (UC-04); an empty queue is a quiet fact, never an error state (E-04).
  const showsOffline = !isOnline && !allClear;

  const sendNow = async () => {
    if (isSending) return;
    setFailure(null);
    try {
      await onSendNow();
    } catch (error) {
      // Nothing was answered: the rows stay and the page states why.
      setFailure(describeTimingError(error));
    }
  };

  const dismiss = async (id: string) => {
    if (dismissingId !== null) return;
    setDismissingId(id);
    setFailure(null);
    try {
      await onDismiss(id);
    } catch (error) {
      // The row stays in the queue and the refusal is readable (FR-21).
      setFailure(describeTimingError(error));
    } finally {
      setDismissingId(null);
    }
  };

  return (
    <Card
      size="small"
      title={TITLE}
      style={{ display: 'flex', flexDirection: 'column' }}
      styles={{
        body: {
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        },
      }}
      extra={
        <Space wrap size={8}>
          {hasUnsent || hasRejected ? (
            <Tag style={hasUnsent ? UNSENT_TAG_STYLE : undefined}>
              {`Не отправлено: ${unsentCount}`}
            </Tag>
          ) : null}
          {hasUnsent ? (
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={isSending}
              disabled={isSending}
              onClick={() => {
                void sendNow();
              }}
            >
              Отправить сейчас
            </Button>
          ) : null}
        </Space>
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          flex: 1,
          minHeight: 0,
        }}
      >
        {showsOffline ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {OFFLINE_LABEL}
          </Typography.Text>
        ) : null}
        {failure === null ? null : (
          <Typography.Text type="danger" role="alert" style={{ fontSize: 12 }}>
            {failure}
          </Typography.Text>
        )}

        <ul aria-label={LIST_LABEL} style={LIST_STYLE}>
          {entries.length === 0 ? (
            <li style={EMPTY_ROW_STYLE}>
              {allClear ? (
                <Typography.Text type="secondary">
                  {ALL_SENT_LABEL}
                </Typography.Text>
              ) : null}
            </li>
          ) : (
            entries.map((entry, index) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                ordinal={index + 1}
                dismissing={dismissingId === entry.id}
                dismissBusy={dismissingId !== null}
                onDismiss={() => {
                  void dismiss(entry.id);
                }}
              />
            ))
          )}
        </ul>
      </div>
    </Card>
  );
}
