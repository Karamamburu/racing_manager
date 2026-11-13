import { Input, Modal, Radio, Select, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { timingService } from './timingService';
import type { TimingOfficialTimeTarget } from './types';
import { describeTimingError } from './useTimingCapture';

/**
 * One administrator correction of a timing attempt.
 *
 * AD-11, F-16, U-30: the API owns every rule and every message. This dialog only
 * collects the reason the API requires, the corrected value and the target, then
 * shows the refusal it received inside the modal. Nothing is written
 * optimistically: a success closes the dialog and reports the change to the
 * caller, a failure keeps the values on screen so the administrator can retry.
 */

export type CorrectionMode =
  | 'OFFICIAL_TIME'
  | 'CANCEL_PASS'
  | 'REBIND_PASS'
  | 'CANCEL_PENDING'
  | 'FORCE_COMPLETE'
  | 'CANCEL_ATTEMPT';

/** One enrollment offered as a rebind target. */
export interface CorrectionParticipant {
  enrollmentId: string;
  label: string;
}

export interface CorrectionDialogProps {
  /** Which correction the dialog collects; the mode fixes the form. */
  mode: CorrectionMode;
  open: boolean;
  eventId: string;
  attemptId: string;
  /** The pass an official-time correction, cancellation or rebind addresses. */
  passId?: string;
  /** The unbound finish a pending cancellation addresses. */
  pendingFinishId?: string;
  /** Every enrollment a pass may be rebound to. */
  participants: CorrectionParticipant[];
  onClose: () => void;
  /** Called after a successful mutation so the caller refreshes its reads. */
  onChanged: () => void;
}

const MODE_TITLES: Record<CorrectionMode, string> = {
  OFFICIAL_TIME: 'Коррекция официального времени',
  CANCEL_PASS: 'Отмена отсечки',
  REBIND_PASS: 'Перепривязка отсечки',
  CANCEL_PENDING: 'Отмена непривязанного финиша',
  FORCE_COMPLETE: 'Принудительное завершение попытки',
  CANCEL_ATTEMPT: 'Отмена попытки',
};

const REASON_REQUIRED = 'Укажите причину';
const OFFICIAL_TIME_REQUIRED = 'Укажите официальное время';
const OFFICIAL_TIME_INVALID =
  'Введите дату и время в формате ISO 8601, например 2026-11-13T09:00:00.000Z';
const REBIND_TARGET_REQUIRED = 'Выберите участника для перепривязки';
const TARGET_REQUIRED = 'Не выбран объект коррекции';
const APPLY_LABEL = 'Применить';

/** The ISO instant the API accepts, or `null` when the text is not a date. */
function parseOfficialAt(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function CorrectionDialog({
  mode,
  open,
  eventId,
  attemptId,
  passId,
  pendingFinishId,
  participants,
  onClose,
  onChanged,
}: CorrectionDialogProps) {
  const [reason, setReason] = useState('');
  const [targetType, setTargetType] =
    useState<TimingOfficialTimeTarget>('START');
  const [officialAt, setOfficialAt] = useState('');
  const [targetEnrollmentId, setTargetEnrollmentId] = useState<
    string | undefined
  >(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Every opening starts from a clean form: no reason or value of a previous
  // correction may leak into the next one.
  useEffect(() => {
    if (!open) return;
    setReason('');
    setTargetType(passId === undefined ? 'START' : 'PASS');
    setOfficialAt('');
    setTargetEnrollmentId(undefined);
    setError(null);
    setBusy(false);
  }, [open, mode, attemptId, passId, pendingFinishId]);

  const close = () => {
    if (busy) return;
    onClose();
  };

  /**
   * The mutation of the current mode, after every local input has passed. A
   * missing target or value is refused here; every business refusal stays with
   * the API and its message is shown unchanged.
   */
  const buildCall = (): (() => Promise<unknown>) | null => {
    switch (mode) {
      case 'OFFICIAL_TIME': {
        const targetId = targetType === 'PASS' ? passId : attemptId;
        if (targetId === undefined) {
          setError(TARGET_REQUIRED);
          return null;
        }
        const officialIso = parseOfficialAt(officialAt);
        if (officialIso === null) {
          setError(
            officialAt.trim() ? OFFICIAL_TIME_INVALID : OFFICIAL_TIME_REQUIRED,
          );
          return null;
        }
        return () =>
          timingService.correctOfficialTime(
            eventId,
            passId ?? attemptId,
            {
              targetType,
              targetId,
              officialAt: officialIso,
              reason: reason.trim(),
            },
          );
      }
      case 'CANCEL_PASS': {
        if (passId === undefined) {
          setError(TARGET_REQUIRED);
          return null;
        }
        return () =>
          timingService.cancelPass(eventId, passId, { reason: reason.trim() });
      }
      case 'REBIND_PASS': {
        if (passId === undefined) {
          setError(TARGET_REQUIRED);
          return null;
        }
        if (targetEnrollmentId === undefined) {
          setError(REBIND_TARGET_REQUIRED);
          return null;
        }
        return () =>
          timingService.rebindPass(eventId, passId, {
            targetEnrollmentId,
            reason: reason.trim(),
          });
      }
      case 'CANCEL_PENDING': {
        if (pendingFinishId === undefined) {
          setError(TARGET_REQUIRED);
          return null;
        }
        return () =>
          timingService.cancelPendingFinish(eventId, pendingFinishId, {
            reason: reason.trim(),
          });
      }
      case 'FORCE_COMPLETE':
        return () =>
          timingService.forceCompleteAttempt(eventId, attemptId, {
            reason: reason.trim(),
          });
      case 'CANCEL_ATTEMPT':
        return () =>
          timingService.cancelAttempt(eventId, attemptId, {
            reason: reason.trim(),
          });
      default:
        return null;
    }
  };

  const submit = async () => {
    if (busy) return;
    if (!reason.trim()) {
      setError(REASON_REQUIRED);
      return;
    }
    const call = buildCall();
    if (call === null) return;

    setError(null);
    setBusy(true);
    try {
      await call();
      onChanged();
      onClose();
    } catch (failure) {
      // The refusal belongs on the form that caused it; nothing was written.
      setError(describeTimingError(failure));
    } finally {
      setBusy(false);
    }
  };

  const showsTargetChoice = mode === 'OFFICIAL_TIME';
  const showsOfficialAt = mode === 'OFFICIAL_TIME';
  const showsParticipants = mode === 'REBIND_PASS';

  return (
    <Modal
      open={open}
      title={MODE_TITLES[mode]}
      okText={APPLY_LABEL}
      cancelText="Отмена"
      confirmLoading={busy}
      maskClosable={!busy}
      closable={!busy}
      onCancel={close}
      onOk={() => {
        void submit();
      }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {showsTargetChoice ? (
          <Space direction="vertical" size={4}>
            <Typography.Text strong>Объект коррекции</Typography.Text>
            <Radio.Group
              value={targetType}
              onChange={(event) => {
                const next: unknown = event.target.value;
                if (next === 'START' || next === 'PASS') {
                  setTargetType(next);
                  setError(null);
                }
              }}
            >
              <Radio value="START">Официальный старт</Radio>
              <Radio value="PASS" disabled={passId === undefined}>
                Отсечка участника
              </Radio>
            </Radio.Group>
          </Space>
        ) : null}

        {showsOfficialAt ? (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Typography.Text strong>
              Официальное время (ISO 8601)
            </Typography.Text>
            <Input
              aria-label="Официальное время (ISO 8601)"
              placeholder="2026-11-13T09:00:00.000Z"
              autoComplete="off"
              value={officialAt}
              disabled={busy}
              onChange={(event) => {
                setOfficialAt(event.target.value);
                setError(null);
              }}
            />
          </Space>
        ) : null}

        {showsParticipants ? (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Typography.Text strong>Новый участник</Typography.Text>
            <Select
              aria-label="Новый участник"
              placeholder="Выберите участника"
              style={{ width: '100%' }}
              disabled={busy}
              value={targetEnrollmentId}
              options={participants.map((participant) => ({
                value: participant.enrollmentId,
                label: participant.label,
              }))}
              onChange={(value: string) => {
                setTargetEnrollmentId(value);
                setError(null);
              }}
            />
          </Space>
        ) : null}

        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Typography.Text strong>Причина</Typography.Text>
          <Input.TextArea
            aria-label="Причина"
            placeholder="Причина коррекции"
            autoComplete="off"
            rows={2}
            value={reason}
            disabled={busy}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
          />
        </Space>

        {error ? (
          <Typography.Text type="danger" role="alert">
            {error}
          </Typography.Text>
        ) : null}
      </Space>
    </Modal>
  );
}
