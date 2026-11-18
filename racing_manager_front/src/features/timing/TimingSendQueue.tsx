import { SendOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag, Typography } from 'antd';
import type { CSSProperties } from 'react';
import { formatTimingClock } from './ParticipantTile';
import type { TimingOfflineEntryView } from './timingOffline';

/**
 * The send queue of one device (FR-11, FR-12, FR-13).
 *
 * A refusal is not a queue row: the hook reports the refusal once and removes
 * the entry. A capture already on its way is not a row either: the page states
 * it as a sending figure, so this component lists the waiting entries only, in
 * the capture order the derived view gives them, with a fixed area whose rows
 * scroll inside it so a capture or an empty queue never moves the number field
 * or a block (S-01, S-02, S-04, S-06).
 *
 * While every unsent entry is sending there is nothing to manage, so the queue
 * is absent instead of an empty card that would flash on an ordinary press
 * (S-02). With nothing unsent at all it keeps its quiet «Всё отправлено» state
 * (MANUAL-TIMING-4, FR-12).
 */

/** Minimum height of the entry area when its column has no spare height. */
export const TIMING_SEND_QUEUE_AREA_HEIGHT = 104;

const TITLE = 'Очередь отправки';
const LIST_LABEL = 'Очередь отправки';
const ALL_SENT_LABEL = 'Всё отправлено';
const OFFLINE_LABEL = 'Нет связи с сервером';
const UNSENT_LABEL = 'не отправлено';

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
  /**
   * Unsent entries of every kind, in the capture order of the outbox. An entry
   * with `isSending` is a page figure, never a row (S-02).
   */
  entries: TimingOfflineEntryView[];
  /** Unsent entries of every kind; the page figure «Не отправлено: N». */
  unsentEntries: number;
  /** False while the device has no server answer path (AS-4). */
  isOnline: boolean;
  /** True while the page sends the queue; the offer is busy and inert then. */
  isSending: boolean;
  /** Asks the page to replay the queue now (FR-13). */
  onSendNow: () => Promise<void>;
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
  isOnline,
  isSending,
  onSendNow,
}: TimingSendQueueProps) {
  const count = wholeCount(unsentEntries);
  // The rows the referee can still manage: everything the server has not
  // answered and the outbox is not already delivering (S-02).
  const waitingEntries = entries.filter((entry) => !entry.isSending);
  const hasUnanswered = count > 0 || entries.length > 0;
  if (hasUnanswered && waitingEntries.length === 0) return null;
  return (
    <Card size="small" type="inner" title={TITLE}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {count > 0 ? (
          <Space wrap size={8} align="center">
            <Tag color="purple" style={{ marginInlineEnd: 0 }}>
              Не отправлено: {count}
            </Tag>
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
          </Space>
        ) : null}

        {!isOnline && waitingEntries.length > 0 ? (
          <Typography.Text type="secondary">{OFFLINE_LABEL}</Typography.Text>
        ) : null}

        <ul aria-label={LIST_LABEL} style={LIST_STYLE}>
          {waitingEntries.length === 0 ? (
            <li style={EMPTY_ROW_STYLE}>
              <Typography.Text type="secondary">
                {ALL_SENT_LABEL}
              </Typography.Text>
            </li>
          ) : (
            waitingEntries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))
          )}
        </ul>
      </Space>
    </Card>
  );
}
