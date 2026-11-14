import { CloseOutlined } from '@ant-design/icons';
import { Button, Card, Input, Modal, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { formatTimingClock } from './ParticipantTile';
import { formatElapsed } from './TimingCategoryBlock';
import type { TimingAnonymousSplitView } from './types';
import { describeTimingError } from './useTimingCapture';

/**
 * The split queue of one event-wide timing surface (AD-17, U-04).
 *
 * The queue is one block pinned above the number field and above every block,
 * with a fixed area whose entries scroll inside it. The header and the count are
 * always on screen and the empty state fills the same area, so an added,
 * assigned, undone or cancelled entry never moves the field or a block (FR-06,
 * S-04). The component renders what the surface returned, in the capture order
 * the API gave (U-05), and reports a selection or a cancellation with its
 * required reason. Every rule and every message of a refusal belongs to the API.
 */

/** Minimum height of the entry area when its column has no spare height. */
export const ANONYMOUS_QUEUE_AREA_HEIGHT = 104;

const LIST_LABEL = 'Очередь неразмеченных сплитов';
const EMPTY_LABEL = 'Очередь пуста: Enter на пустом поле номера добавит сплит';
const REASON_REQUIRED = 'Укажите причину отмены сплита';
const CANCEL_TITLE = 'Отмена неразмеченного сплита';

export interface AnonymousSplitQueueProps {
  /** Queued entries in the capture order of the surface, oldest first. */
  splits: TimingAnonymousSplitView[];
  /** The entry whose number field is in assignment mode, if any (E-04). */
  selectedSplitId: string | null;
  /** Puts the chosen entry into assignment mode (E-04). */
  onSelect: (splitId: string) => void;
  /** Retires one entry with its required reason; the page owns the API call. */
  onCancel: (splitId: string, reason: string) => Promise<void>;
  /** Cancellation is a REFEREE/ADMINISTRATOR correction (E-08, F-07). */
  canCancel?: boolean;
  /** True while the workstation may not take an assignment (no capture lock). */
  selectionDisabled?: boolean;
}

/** One queued entry as the referee reads it: split, attempt, moment, elapsed. */
function entryLabel(entry: TimingAnonymousSplitView, ordinal: number): string {
  const label =
    entry.attemptLabel ?? entry.candidates?.[0]?.attemptLabel ?? '—';
  const elapsed =
    entry.officialElapsedMs ?? entry.candidates?.[0]?.officialElapsedMs ?? 0;
  return `Сплит ${ordinal}: ${label}, отметка ${formatTimingClock(
    entry.capturedAt,
  )}, прошло ${formatElapsed(elapsed)}`;
}

function entryStyle(selected: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: '1 1 auto',
    minWidth: 0,
    padding: '4px 6px',
    border: '1px solid #f0f0f0',
    // The outline marks the selection without changing the box, so a selected
    // entry never resizes the row and never shifts the area around it.
    outline: selected ? '2px solid #1677ff' : 'none',
    borderRadius: 8,
    background: selected ? '#e6f4ff' : '#ffffff',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'left',
  };
}

export function AnonymousSplitQueue({
  splits,
  selectedSplitId,
  onSelect,
  onCancel,
  canCancel = false,
  selectionDisabled = false,
}: AnonymousSplitQueueProps) {
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openCancel = (splitId: string) => {
    setCancelTargetId(splitId);
    setReason('');
    setError(null);
    setBusy(false);
  };

  const closeCancel = () => {
    if (busy) return;
    setCancelTargetId(null);
    setError(null);
  };

  const submitCancel = async () => {
    if (busy || cancelTargetId === null) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(REASON_REQUIRED);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onCancel(cancelTargetId, trimmed);
      // The entry leaves the queue with the refetch the page triggers; the
      // dialog closes only after the API accepted the reason (E-08).
      setCancelTargetId(null);
      setReason('');
    } catch (failure) {
      // Nothing was retired: keep the dialog and its reason for a retry.
      setError(describeTimingError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      size="small"
      title="Неразмеченные сплиты"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        height: '100%',
      }}
      styles={{
        body: {
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        },
      }}
      extra={
        <Tag color={splits.length > 0 ? 'orange' : 'default'}>
          В очереди: {splits.length}
        </Tag>
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        <ul
          aria-label={LIST_LABEL}
          style={{
            flex: 1,
            minHeight: ANONYMOUS_QUEUE_AREA_HEIGHT,
            overflowY: 'auto',
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gridAutoRows: 'min-content',
            alignContent: 'start',
            gap: 6,
          }}
        >
          {splits.length === 0 ? (
            <li
              style={{
                gridColumn: '1 / -1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
              }}
            >
              <Typography.Text type="secondary">{EMPTY_LABEL}</Typography.Text>
            </li>
          ) : (
            splits.map((entry, index) => {
              const ordinal = index + 1;
              const selected = entry.splitId === selectedSplitId;
              return (
                <li
                  key={entry.splitId}
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'stretch',
                    // Rows never shrink into the fixed area: a long queue
                    // scrolls inside it instead of compressing its entries.
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={entryLabel(entry, ordinal)}
                    disabled={selectionDisabled}
                    onClick={() => onSelect(entry.splitId)}
                    style={{
                      ...entryStyle(selected),
                      cursor: selectionDisabled ? 'default' : 'pointer',
                    }}
                  >
                    <Typography.Text strong style={{ fontSize: 12 }}>
                      Сплит {ordinal} ·{' '}
                      {entry.attemptLabel ??
                        entry.candidates?.[0]?.attemptLabel ??
                        '—'}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      Отметка: {formatTimingClock(entry.capturedAt)} · прошло{' '}
                      {formatElapsed(
                        entry.officialElapsedMs ??
                          entry.candidates?.[0]?.officialElapsedMs ??
                          0,
                      )}
                    </Typography.Text>
                  </button>
                  {canCancel ? (
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<CloseOutlined />}
                      aria-label={`Отменить сплит ${ordinal}`}
                      disabled={busy}
                      onClick={() => openCancel(entry.splitId)}
                    />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>

      <Modal
        open={cancelTargetId !== null}
        title={CANCEL_TITLE}
        okText="Отменить сплит"
        cancelText="Отмена"
        confirmLoading={busy}
        maskClosable={!busy}
        closable={!busy}
        onCancel={closeCancel}
        onOk={() => {
          void submitCancel();
        }}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Сплит будет снят с очереди, причина сохранится в записи попытки.
          </Typography.Text>
          <Input.TextArea
            aria-label="Причина отмены сплита"
            placeholder="Причина отмены"
            autoComplete="off"
            rows={2}
            disabled={busy}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
          />
          {error ? (
            <Typography.Text type="danger" role="alert">
              {error}
            </Typography.Text>
          ) : null}
        </Space>
      </Modal>
    </Card>
  );
}
