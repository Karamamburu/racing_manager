import { Button, Input, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { TimingCaptureView } from './types';

/**
 * The event-wide capture holder, transfer and force-release controls.
 *
 * AD-5, E-10: one row per event and no lease timeout, so the surface only ever
 * reports the holder the API returned. This component never claims a hold
 * optimistically: the badge follows `capture`, and a refused take leaves it
 * untouched. Transfer is offered to the holder and force-release is an
 * administrator action with a required reason.
 *
 * Transfer is the online-only action this surface owns (S-09, F-04, FR-33,
 * FR-43, FR-48). While this device has an unsent entry, or the page has no
 * connection, the input and the button are not offered and the reason is
 * stated in words, so it never depends on colour (U-04). Both facts can hold
 * at once and each keeps its own sentence. Take-capture, force-release and the
 * holder tag are unaffected by these gates (U-06, E-21).
 */

export interface CaptureControlsProps {
  /** The lock row, or `null` before the surface has loaded; then it reads free. */
  capture: TimingCaptureView | null;
  /** The workstation instance of this browser tab. */
  workstationInstanceId: string;
  /** Administrator only: force-release an abandoned hold. */
  canAdminister: boolean;
  /** False while the page has no server answer path; defaults to online. */
  isOnline?: boolean;
  /** Unsent entries of this device; transfer waits for them (FR-33). */
  unsentEntries?: number;
  onTake: () => Promise<void>;
  onTransfer: (toWorkstationInstanceId: string) => Promise<void>;
  onForceRelease: (reason: string) => Promise<void>;
}

type CaptureAction = 'TAKE' | 'TRANSFER' | 'RELEASE';

/** The transfer is withheld while this device has entries the server has not answered. */
const TRANSFER_UNSENT_REASON =
  'Передача захвата недоступна: есть неотправленные записи.';

/** The transfer is withheld while the page has no connection (F-04). */
const TRANSFER_OFFLINE_REASON = 'Нужна связь с сервером.';

/**
 * A count the page derived from the outbox. A local negative or fractional
 * value can only come from a defect; the gate never invents an entry from it.
 */
function wholeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/** The API message when the failure carries one; never a status-code sentence. */
function describeFailure(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const text = error.message.trim();
    if (
      text &&
      !text.startsWith('Request failed') &&
      text !== 'Network Error'
    ) {
      return text;
    }
  }
  return fallback;
}

export function CaptureControls({
  capture,
  workstationInstanceId,
  canAdminister,
  isOnline = true,
  unsentEntries = 0,
  onTake,
  onTransfer,
  onForceRelease,
}: CaptureControlsProps) {
  const [busy, setBusy] = useState<CaptureAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');

  const holderId = capture?.workstationInstanceId ?? null;
  const holdsHere = holderId !== null && holderId === workstationInstanceId;
  const holderLabel = holdsHere
    ? 'Захват у этого устройства'
    : holderId === null
      ? 'Захват свободен'
      : `Захват у устройства ${holderId}`;

  const unsentCount = wholeCount(unsentEntries);
  const hasUnsent = unsentCount > 0;
  // Transfer is online-only and waits for every recorded entry to have an
  // answer; both reasons stay readable while both facts hold (S-09, F-04).
  const transferWithheld = !isOnline || hasUnsent;

  const run = async (
    action: CaptureAction,
    work: () => Promise<void>,
    fallback: string,
  ) => {
    if (busy !== null) return;
    setBusy(action);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(describeFailure(failure, fallback));
    } finally {
      setBusy(null);
    }
  };

  const take = () =>
    run('TAKE', onTake, 'Не удалось взять захват хронометража');

  const transfer = () => {
    const trimmed = target.trim();
    if (!trimmed) {
      setError('Укажите устройство назначения');
      return;
    }
    if (trimmed === workstationInstanceId) {
      setError('Это устройство уже удерживает захват');
      return;
    }
    void run(
      'TRANSFER',
      async () => {
        await onTransfer(trimmed);
        setTarget('');
      },
      'Не удалось передать захват хронометража',
    );
  };

  const release = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Укажите причину освобождения');
      return;
    }
    void run(
      'RELEASE',
      async () => {
        await onForceRelease(trimmed);
        setReason('');
      },
      'Не удалось освободить захват хронометража',
    );
  };

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space wrap size={8} align="center">
        <Tag color={holdsHere ? 'green' : holderId === null ? 'default' : 'orange'}>
          {holderLabel}
        </Tag>
        {holdsHere ? null : (
          <Button
            loading={busy === 'TAKE'}
            disabled={busy !== null}
            onClick={() => {
              void take();
            }}
          >
            Взять захват
          </Button>
        )}
      </Space>

      {error ? (
        <Typography.Text type="danger" role="alert">
          {error}
        </Typography.Text>
      ) : null}

      {holdsHere ? (
        transferWithheld ? (
          <Space direction="vertical" size={2}>
            {hasUnsent ? (
              <Typography.Text type="warning" style={{ fontSize: 12 }}>
                {TRANSFER_UNSENT_REASON}
              </Typography.Text>
            ) : null}
            {isOnline ? null : (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {TRANSFER_OFFLINE_REASON}
              </Typography.Text>
            )}
          </Space>
        ) : (
          <Space wrap size={8} align="center">
            <Input
              aria-label="Устройство назначения"
              placeholder="Устройство назначения"
              autoComplete="off"
              value={target}
              disabled={busy !== null}
              onChange={(event) => {
                setTarget(event.target.value);
                setError(null);
              }}
              onPressEnter={transfer}
              style={{ maxWidth: 260 }}
            />
            <Button
              loading={busy === 'TRANSFER'}
              disabled={busy !== null}
              onClick={transfer}
            >
              Передать захват
            </Button>
          </Space>
        )
      ) : null}

      {canAdminister ? (
        <Space wrap size={8} align="center">
          <Input
            aria-label="Причина освобождения"
            placeholder="Причина освобождения"
            autoComplete="off"
            value={reason}
            disabled={busy !== null}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            onPressEnter={release}
            style={{ maxWidth: 320 }}
          />
          <Button
            danger
            loading={busy === 'RELEASE'}
            disabled={busy !== null}
            onClick={release}
          >
            Освободить
          </Button>
        </Space>
      ) : null}
    </Space>
  );
}
