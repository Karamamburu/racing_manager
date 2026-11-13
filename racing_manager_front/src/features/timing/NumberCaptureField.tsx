import { Button, Input, Modal, Space, Spin, Typography } from 'antd';
import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * The event-wide number field of the timing surface.
 *
 * E-05, E-06, U-19: one Enter or Space press is one commit. The field captures
 * the press instant before it asks the page anything, so an ambiguous number
 * chosen from the picker keeps the instant of the original press instead of the
 * moment of the click. The field resolves nothing itself: the page owns the
 * eligible candidates, the attempt lookup and the API message, and this
 * component only renders what it was told and reports what was typed.
 */

/** One enrollment the page resolved for a typed start number. */
export interface NumberCaptureCandidate {
  enrollmentId: string;
  /** The running attempt the enrollment belongs to; the page routes the commit. */
  attemptId: string;
  /** What the ambiguity picker shows for this candidate. */
  label: string;
}

/** One commit, with the press instant already captured. */
export interface NumberCaptureCommitInput {
  startNumber: number;
  /** Absent only when the page has to route a number itself; one candidate always has it. */
  enrollmentId?: string;
  /** Client wall clock of the press, ISO-8601, captured once. */
  capturedAt: string;
  /** `performance.now()` of the press, captured once. */
  monotonicMs: number;
}

export interface NumberCaptureFieldProps {
  disabled?: boolean;
  /** Eligible enrollments of that number in the surface; empty means no pass. */
  resolve: (startNumber: number) => NumberCaptureCandidate[];
  /** Sends the mutation; the page computes the epoch elapsed from `monotonicMs`. */
  onCommit: (input: NumberCaptureCommitInput) => Promise<void>;
  /** Optional notice hook; the field also shows the message next to itself. */
  onError?: (message: string) => void;
}

/** A number that matched several running enrollments and awaits a choice. */
interface AmbiguousChoice {
  startNumber: number;
  capturedAt: string;
  monotonicMs: number;
  candidates: NumberCaptureCandidate[];
}

const EMPTY_NUMBER_MESSAGE = 'Введите номер участника цифрами';
const NON_POSITIVE_NUMBER_MESSAGE = 'Номер участника должен быть больше нуля';

/** Digits only: a pasted `12 3` reads as `123`, never as a space or a sign. */
function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/**
 * A positive safe integer, or `null` when the text is empty, non-numeric or
 * zero. The field refuses the commit; the API still owns the real routing rule.
 */
function parseStartNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function NumberCaptureField({
  disabled = false,
  resolve,
  onCommit,
  onError,
}: NumberCaptureFieldProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<AmbiguousChoice | null>(null);
  const submitting = useRef(false);

  const refuse = (message: string) => {
    setError(message);
    onError?.(message);
  };

  const runCommit = async (input: NumberCaptureCommitInput) => {
    try {
      await onCommit(input);
      setText('');
      setError(null);
    } catch (failure) {
      // The page owns HTTP errors: keep the typed number so the referee can
      // retry, and leave the message to the surface that sent the mutation.
      console.warn(
        'timing: capture commit was refused; the page reports the API message',
        failure,
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const submit = (input: NumberCaptureCommitInput) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    void runCommit(input);
  };

  const commit = () => {
    if (disabled || submitting.current) return;

    const startNumber = parseStartNumber(text);
    if (startNumber === null) {
      refuse(text.trim() ? NON_POSITIVE_NUMBER_MESSAGE : EMPTY_NUMBER_MESSAGE);
      return;
    }

    // Capture the press instant once, before the field does any work: a burst
    // of commits must keep its order and an ambiguity choice must keep its
    // original moment.
    const capturedAt = new Date().toISOString();
    const monotonicMs = performance.now();

    const candidates = resolve(startNumber);
    if (candidates.length === 0) {
      refuse(
        `Участник с номером ${startNumber} не найден среди идущих заездов`,
      );
      return;
    }

    setError(null);
    if (candidates.length === 1) {
      submit({
        startNumber,
        enrollmentId: candidates[0].enrollmentId,
        capturedAt,
        monotonicMs,
      });
      return;
    }

    setChoice({ startNumber, capturedAt, monotonicMs, candidates });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      // Space is a commit key, never text: keep it out of the input.
      event.preventDefault();
      commit();
    }
  };

  const choose = (candidate: NumberCaptureCandidate) => {
    if (!choice || submitting.current) return;
    const picked: NumberCaptureCommitInput = {
      startNumber: choice.startNumber,
      enrollmentId: candidate.enrollmentId,
      capturedAt: choice.capturedAt,
      monotonicMs: choice.monotonicMs,
    };
    setChoice(null);
    submit(picked);
  };

  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      <Typography.Text strong>Номер участника</Typography.Text>
      <Input
        aria-label="Номер участника"
        placeholder="Номер"
        inputMode="numeric"
        autoComplete="off"
        status={error ? 'error' : undefined}
        disabled={disabled}
        value={text}
        onChange={(event) => {
          setText(digitsOnly(event.target.value));
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        style={{ maxWidth: 180 }}
      />
      {busy ? (
        <Space size={6}>
          <Spin size="small" />
          <Typography.Text type="secondary">Отправляем отметку…</Typography.Text>
        </Space>
      ) : null}
      {error ? (
        <Typography.Text type="danger" role="alert">
          {error}
        </Typography.Text>
      ) : null}

      <Modal
        open={choice !== null}
        title="Выберите участника"
        footer={null}
        closable={!busy}
        maskClosable={!busy}
        keyboard={!busy}
        onCancel={() => {
          // Abandoning the picker changes nothing: no pass, text untouched.
          if (!busy) setChoice(null);
        }}
      >
        {choice === null ? null : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              {`Номер ${choice.startNumber} подходит нескольким участникам идущих заездов.`}
            </Typography.Text>
            {choice.candidates.map((candidate) => (
              <Button
                key={candidate.enrollmentId}
                block
                disabled={busy}
                onClick={() => choose(candidate)}
              >
                {candidate.label}
              </Button>
            ))}
          </Space>
        )}
      </Modal>
    </Space>
  );
}
