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
 */

export interface CaptureControlsProps {
  /** The lock row, or `null` before the surface has loaded; then it reads free. */
  capture: TimingCaptureView | null;
  /** The workstation instance of this browser tab. */
  workstationInstanceId: string;
  /** Administrator only: force-release an abandoned hold. */
  canAdminister: boolean;
  onTake: () => Promise<void>;
  onTransfer: (toWorkstationInstanceId: string) => Promise<void>;
  onForceRelease: (reason: string) => Promise<void>;
}

type CaptureAction = 'TAKE' | 'TRANSFER' | 'RELEASE';

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
    ? 'Захват у этой станции'
    : holderId === null
      ? 'Захват свободен'
      : `Захват у станции ${holderId}`;

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
      setError('Укажите станцию назначения');
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
        <Space wrap size={8} align="center">
          <Input
            aria-label="Станция назначения"
            placeholder="Станция назначения"
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
