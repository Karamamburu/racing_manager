import { Button, Input, Modal, Space, Spin, Typography } from 'antd';
import type { InputRef } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { TimingCaptureOutcome } from './useTimingCapture';

/**
 * The event-wide number field of the timing surface.
 *
 * E-05, E-06, U-19: one Enter or Space press is one commit. The field captures
 * the press instant before it asks the page anything, so an ambiguous number
 * chosen from the picker keeps the instant of the original press instead of the
 * moment of the click. The field resolves nothing itself: the page owns the
 * eligible candidates, the attempt lookup and the API message, and this
 * component only renders what it was told and reports what was typed.
 *
 * AD-17, U-03, U-04: on the empty field Enter and Space are the anonymous-split
 * keys; while a queued split is selected the same keys assign that split
 * instead of capturing a pass, and an empty assignment is refused
 * (E-04, S-02, F-04).
 *
 * MANUAL-TIMING-4 (FR-14, FR-15, FR-16, FR-17, FR-18): the page answers every
 * recorded press with a `TimingCaptureOutcome`. A confirmed or unsent press
 * frees the field for the next number and keeps focus; an unsent press is not a
 * failure. A refused press keeps the text the referee has now and states the
 * number, the refusal and the server reason. Local validation failures keep
 * their typed text and their own message.
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

/** The queued split the field assigns while it is in assignment mode (E-04). */
export interface NumberCaptureAssignment {
  /** The entry the next committed number belongs to. */
  splitId: string;
  /** The entry's own attempt, named on the field so the target is explicit. */
  attemptLabel: string;
}

export interface NumberCaptureFieldProps {
  disabled?: boolean;
  /** Eligible enrollments of that number in the surface; empty means no pass. */
  resolve: (startNumber: number) => NumberCaptureCandidate[];
  /**
   * Records the press and answers with its outcome; the page computes the epoch
   * elapsed from `monotonicMs` (FR-01, FR-14).
   */
  onCommit: (input: NumberCaptureCommitInput) => Promise<TimingCaptureOutcome>;
  /**
   * Set while a queued split is selected: the field names the entry's attempt
   * and a committed number assigns that split instead of capturing a pass.
   */
  assignment?: NumberCaptureAssignment | null;
  /** Sends the assignment of the selected split; used only in assignment mode. */
  onAssign?: (startNumber: number) => Promise<TimingCaptureOutcome>;
  /**
   * Enter or Space on the empty field in normal capture mode records one
   * anonymous split of the page's current attempt. Absent keeps the old
   * empty-field refusal.
   */
  onAnonymousSplit?: () => Promise<TimingCaptureOutcome>;
  /**
   * The entries this device has not sent yet, so the unsent status names the
   * same total as the page figure «Не отправлено: N» (FR-11, FR-15).
   */
  pendingCount?: number;
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

/** What the field says about the last recorded press (FR-15). */
type CaptureStatusTone = 'confirmed' | 'unsent' | 'rejected';

interface CaptureStatus {
  tone: CaptureStatusTone;
  /** What the answer is about: «№ 17» or «Отсечка без номера». */
  subject: string;
  /** The server's message, verbatim; only on `rejected` (E-05). */
  reason?: string;
}

const EMPTY_NUMBER_MESSAGE = 'Введите номер участника цифрами';
const NON_POSITIVE_NUMBER_MESSAGE = 'Номер участника должен быть больше нуля';
const EMPTY_ASSIGNMENT_MESSAGE = 'Введите номер участника для назначения отсечки';
const NO_ASSIGNMENT_TARGET_MESSAGE = 'Назначение недоступно: отсечка не выбрана';
const COMMIT_BUSY_MESSAGE = 'Отправляем отметку…';
const SPLIT_BUSY_MESSAGE = 'Отправляем отсечку…';
const ASSIGN_BUSY_MESSAGE = 'Назначаем отсечку…';
/** A split carries no participant, so its status names no number (E-15). */
const ANONYMOUS_SUBJECT = 'Отсечка без номера';
/** The status still names a refusal when the server sent no message. */
const REJECTION_FALLBACK_REASON = 'сервер не указал причину';

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

/**
 * The status line of one answered press. It names the subject, says whether the
 * entry is confirmed or still on the device, and never reports an unsent press
 * as a failure (FR-15, FR-16). The unsent total is read at render time so it
 * follows the page figure as the queue drains (FR-11).
 */
function describeStatus(status: CaptureStatus, pendingCount: number): string {
  if (status.tone === 'rejected') {
    return `Отклонено: ${status.subject} — ${status.reason ?? REJECTION_FALLBACK_REASON}`;
  }
  if (status.tone === 'confirmed') {
    return `${status.subject} — сервер подтвердил отметку`;
  }
  return `${status.subject} — отметка сохранена на устройстве, не отправлено: ${pendingCount}`;
}

export function NumberCaptureField({
  disabled = false,
  resolve,
  onCommit,
  assignment = null,
  onAssign,
  onAnonymousSplit,
  pendingCount = 0,
  onError,
}: NumberCaptureFieldProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [choice, setChoice] = useState<AmbiguousChoice | null>(null);
  const submitting = useRef(false);
  const inputRef = useRef<InputRef>(null);
  const assignmentId = assignment?.splitId ?? null;

  // Entering, leaving or changing assignment mode starts from an empty field:
  // a number typed for one entry must never reach the next one (E-06, E-09).
  useEffect(() => {
    setText('');
    setError(null);
    setStatus(null);
    if (assignmentId !== null) {
      inputRef.current?.focus();
    }
  }, [assignmentId]);

  const refuse = (message: string) => {
    setError(message);
    onError?.(message);
  };

  /**
   * Applies what the page answered about one recorded press (FR-15).
   *
   * A confirmed or unsent press is recorded, so the field is free for the next
   * number and keeps focus; unsent is not a failed capture (E-02, E-04). A
   * refused press leaves the text exactly as the referee has it now and never
   * writes the refused number back (E-05).
   *
   * `clearsField` is false for an anonymous split: it consumed no typed number,
   * so it must not wipe what the referee typed while it was in flight.
   */
  const settle = (
    subject: string,
    outcome: TimingCaptureOutcome,
    clearsField: boolean,
  ) => {
    if (outcome.status === 'REJECTED') {
      setStatus({ tone: 'rejected', subject, reason: outcome.reason });
      return;
    }
    if (clearsField) {
      setText('');
      setError(null);
    }
    inputRef.current?.focus();
    setStatus({
      tone: outcome.status === 'CONFIRMED' ? 'confirmed' : 'unsent',
      subject,
    });
  };

  /**
   * One press, one mutation. The guard is set before the first await so a burst
   * of keys keeps its order, and a refusal leaves the field as the page left it.
   */
  const start = (
    label: string,
    subject: string,
    clearsField: boolean,
    work: () => Promise<TimingCaptureOutcome>,
  ) => {
    if (disabled || submitting.current) return;
    submitting.current = true;
    setBusyLabel(label);
    void (async () => {
      try {
        const outcome = await work();
        settle(subject, outcome, clearsField);
      } catch (failure) {
        // The page owns HTTP errors: keep the typed number so the referee can
        // retry, and leave the message to the surface that sent the mutation.
        console.warn(
          'timing: the field commit was refused; the page reports the API message',
          failure,
        );
      } finally {
        submitting.current = false;
        setBusyLabel(null);
      }
    })();
  };

  /**
   * A typed number in normal capture mode: one candidate commits directly, a
   * number shared by several running enrollments opens the picker.
   */
  const commitNumber = () => {
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
      start(COMMIT_BUSY_MESSAGE, `№ ${startNumber}`, true, () =>
        onCommit({
          startNumber,
          enrollmentId: candidates[0].enrollmentId,
          capturedAt,
          monotonicMs,
        }),
      );
      return;
    }

    setChoice({ startNumber, capturedAt, monotonicMs, candidates });
  };

  /**
   * A typed number in assignment mode: it belongs to the selected entry's own
   * attempt, so the field sends the number and never resolves a candidate
   * (E-05, U-06). An empty field assigns nothing (F-04).
   */
  const commitAssignment = () => {
    const startNumber = parseStartNumber(text);
    if (startNumber === null) {
      refuse(
        text.trim() ? NON_POSITIVE_NUMBER_MESSAGE : EMPTY_ASSIGNMENT_MESSAGE,
      );
      return;
    }
    if (onAssign === undefined) {
      refuse(NO_ASSIGNMENT_TARGET_MESSAGE);
      return;
    }

    setError(null);
    start(ASSIGN_BUSY_MESSAGE, `№ ${startNumber}`, true, () =>
      onAssign(startNumber),
    );
  };

  /** Enter or Space on the empty field records a split (U-03). */
  const commitAnonymous = () => {
    if (onAnonymousSplit === undefined) {
      // No anonymous route on this surface: keep the old empty-field refusal.
      refuse(EMPTY_NUMBER_MESSAGE);
      return;
    }
    setError(null);
    // The split consumed no number, so its answer never clears typed text.
    start(SPLIT_BUSY_MESSAGE, ANONYMOUS_SUBJECT, false, () =>
      onAnonymousSplit(),
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      event.key !== 'Enter' &&
      event.key !== ' ' &&
      event.key !== 'Spacebar'
    ) {
      return;
    }
    // Enter and Space are commit keys, never text: keep them out of the input.
    event.preventDefault();
    if (disabled || submitting.current) return;

    if (assignment !== null) {
      commitAssignment();
      return;
    }
    if (text.trim() === '') {
      commitAnonymous();
      return;
    }
    commitNumber();
  };

  const choose = (candidate: NumberCaptureCandidate) => {
    if (choice === null || submitting.current) return;
    const picked: NumberCaptureCommitInput = {
      startNumber: choice.startNumber,
      enrollmentId: candidate.enrollmentId,
      capturedAt: choice.capturedAt,
      monotonicMs: choice.monotonicMs,
    };
    setChoice(null);
    start(COMMIT_BUSY_MESSAGE, `№ ${picked.startNumber}`, true, () =>
      onCommit(picked),
    );
  };

  return (
    <Space
      direction="vertical"
      size={6}
      align="center"
      style={{ width: '100%' }}
    >
      <Typography.Text strong>Номер участника</Typography.Text>
      {assignment === null ? (
        <Typography.Text type="secondary" style={{ textAlign: 'center' }}>
          Enter или Space на пустом поле добавят неприсвоенную отсечку
        </Typography.Text>
      ) : null}
      <Input
        ref={inputRef}
        aria-label="Номер участника"
        placeholder="№"
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
        style={{
          width: 264,
          height: 264,
          padding: 0,
          fontSize: 96,
          fontWeight: 700,
          textAlign: 'center',
          borderRadius: 12,
          fontVariantNumeric: 'tabular-nums',
        }}
      />
      {busyLabel === null ? null : (
        <Space size={6}>
          <Spin size="small" />
          <Typography.Text type="secondary">{busyLabel}</Typography.Text>
        </Space>
      )}
      {error ? (
        <Typography.Text type="danger" role="alert" style={{ textAlign: 'center' }}>
          {error}
        </Typography.Text>
      ) : null}
      {status === null ? null : (
        <Typography.Text
          role="status"
          type={status.tone === 'rejected' ? 'danger' : 'secondary'}
          style={{ textAlign: 'center' }}
        >
          {describeStatus(status, pendingCount)}
        </Typography.Text>
      )}

      <Modal
        open={choice !== null}
        title="Выберите участника"
        footer={null}
        closable={busyLabel === null}
        maskClosable={busyLabel === null}
        keyboard={busyLabel === null}
        onCancel={() => {
          // Abandoning the picker changes nothing: no pass, text untouched.
          if (busyLabel === null) setChoice(null);
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
                disabled={busyLabel !== null}
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
