import { Button, Card, Input, Space, Typography } from 'antd';
import { useRef, useState } from 'react';
import { formatTimingClock } from './ParticipantTile';
import type { TimingPassView } from './types';

/**
 * The unbound-finish queue of one event-wide timing surface.
 *
 * E-08, F-13, F-14: a pending finish keeps the instant it was captured at and
 * is bound only when the referee types a number. A refusal from the API leaves
 * the row and the typed number in place, so the finish is never lost and never
 * becomes an unreported failure: the page owns the HTTP message and shows it.
 */

export interface PendingFinishBarProps {
  /** Pending finishes in the order the API returned them, oldest first. */
  pending: TimingPassView[];
  /** Sends the bind mutation; a rejection keeps the row queued. */
  onBind: (pendingId: string, startNumber: number) => Promise<void>;
  /** Offered only once the administrator cancel dialog exists. */
  onCancel?: (pendingId: string) => void;
  disabled?: boolean;
}

/** A positive safe integer, or `null` for an empty, non-numeric or zero value. */
function parseStartNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function PendingFinishBar({
  pending,
  onBind,
  onCancel,
  disabled = false,
}: PendingFinishBarProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const inFlight = useRef<Set<string>>(new Set());

  const markBusy = (pendingId: string, value: boolean) => {
    setBusy((previous) => {
      const next = { ...previous };
      if (value) next[pendingId] = true;
      else delete next[pendingId];
      return next;
    });
  };

  const bind = async (item: TimingPassView) => {
    if (disabled || inFlight.current.has(item.passId)) return;
    const draft = drafts[item.passId] ?? '';
    const startNumber = parseStartNumber(draft);
    if (startNumber === null) {
      setErrors((previous) => ({
        ...previous,
        [item.passId]: 'Введите номер участника больше нуля',
      }));
      return;
    }

    setErrors((previous) => ({ ...previous, [item.passId]: null }));
    inFlight.current.add(item.passId);
    markBusy(item.passId, true);
    try {
      await onBind(item.passId, startNumber);
      setDrafts((previous) => ({ ...previous, [item.passId]: '' }));
    } catch (failure) {
      // Keep the row and the typed number: the page reports the API message.
      console.error(
        'timing: the pending finish was not bound; the page reports the API message',
        failure,
      );
    } finally {
      inFlight.current.delete(item.passId);
      markBusy(item.passId, false);
    }
  };

  return (
    <Card size="small" title="Непривязанные финиши">
      {pending.length === 0 ? (
        <Typography.Text type="secondary">
          Нет непривязанных финишей
        </Typography.Text>
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {pending.map((item) => {
            const time = formatTimingClock(item.rawCapturedAt);
            const rowBusy = busy[item.passId] === true;
            const rowError = errors[item.passId] ?? null;
            return (
              <div
                key={item.passId}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 8,
                  padding: 8,
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                }}
              >
                <Typography.Text strong style={{ minWidth: 160 }}>
                  Финиш {time}
                </Typography.Text>
                <Input
                  aria-label={`Номер участника для финиша ${time}`}
                  placeholder="Номер"
                  inputMode="numeric"
                  autoComplete="off"
                  status={rowError ? 'error' : undefined}
                  disabled={disabled || rowBusy}
                  value={drafts[item.passId] ?? ''}
                  onChange={(event) => {
                    setDrafts((previous) => ({
                      ...previous,
                      [item.passId]: event.target.value.replace(/[^0-9]/g, ''),
                    }));
                    setErrors((previous) =>
                      previous[item.passId]
                        ? { ...previous, [item.passId]: null }
                        : previous,
                    );
                  }}
                  onPressEnter={() => {
                    void bind(item);
                  }}
                  style={{ maxWidth: 140 }}
                />
                <Button
                  type="primary"
                  aria-label={`Привязать финиш ${time}`}
                  loading={rowBusy}
                  disabled={disabled || rowBusy}
                  onClick={() => {
                    void bind(item);
                  }}
                >
                  Привязать
                </Button>
                {onCancel ? (
                  <Button
                    aria-label={`Отменить финиш ${time}`}
                    disabled={disabled || rowBusy}
                    onClick={() => onCancel(item.passId)}
                  >
                    Отменить
                  </Button>
                ) : null}
                {rowError ? (
                  <Typography.Text type="danger" role="alert">
                    {rowError}
                  </Typography.Text>
                ) : null}
              </div>
            );
          })}
        </Space>
      )}
    </Card>
  );
}
