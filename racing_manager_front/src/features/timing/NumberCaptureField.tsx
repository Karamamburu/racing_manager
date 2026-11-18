import { Button, Input, Modal, Space, Typography } from 'antd';
import type { InputRef } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { TimingCaptureOutcomeEvent, TimingRefusalNotice } from './types';
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
 * MANUAL-TIMING-5 (AD-7, E-02, E-12, S-05, S-09, F-01, F-03, F-06): a press is
 * accepted the moment it passes local validation, whatever number of earlier
 * captures is still being delivered. There is no submitting guard and no busy
 * row: the field empties, keeps focus and takes the next number at once. The
 * accepted fixed-height slot has two independent regions:
 *
 * - the press region states the newest press and its acceptance, and never
 *   claims a confirmation;
 * - the outcome region states the latest answered capture — a confirmation, an
 *   unsent capture or the visible refusal — and holds each undismissed refusal
 *   until the referee dismisses it, with the number of refusals still open.
 *
 * A refusal changes nothing about the field: the text the referee typed since
 * is kept, the refused number is never written back, and dismissing the notice
 * changes no capture state and no count. Local validation failures keep their
 * typed text and their own message (F-01).
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
   * elapsed from `monotonicMs` (FR-01, FR-14). An `ACCEPTED` answer means the
   * press is recorded and the answer itself arrives later through `outcomes`.
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
  /**
   * Every answer about a recorded capture, in arrival order (AD-7). The field
   * consumes each event once: a `refused` event becomes a refusal the referee
   * dismisses, a `confirmed` or `unsent` event becomes the latest outcome.
   * Absent keeps the field's own awaited answer as its only source.
   */
  outcomes?: readonly TimingCaptureOutcomeEvent[];
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

/** The newest press, stated by the press region (AD-7). */
interface PressStatement {
  /** Local press counter, so an answer settles the press it belongs to. */
  key: number;
  /** What the press is about: «№ 17» or «Отсечка без номера». */
  subject: string;
  /** ISO-8601 press instant, compared with the arrival stamp of an answer. */
  at: string;
  /** The press's own awaited answer already arrived. */
  answered: boolean;
}

/** The latest answered capture, stated by the outcome region (AD-7). */
interface AnswerStatement {
  subject: string;
  tone: 'confirmed' | 'unsent';
  /** ISO-8601 arrival stamp, display order only. */
  at: string;
}

const EMPTY_NUMBER_MESSAGE = 'Введите номер участника цифрами';
const NON_POSITIVE_NUMBER_MESSAGE = 'Номер участника должен быть больше нуля';
const EMPTY_ASSIGNMENT_MESSAGE = 'Введите номер участника для назначения отсечки';
const NO_ASSIGNMENT_TARGET_MESSAGE = 'Назначение недоступно: отсечка не выбрана';
/** A split carries no participant, so its status names no number (E-15). */
const ANONYMOUS_SUBJECT = 'Отсечка без номера';
/** The status still names a refusal when the server sent no message. */
const REJECTION_FALLBACK_REASON = 'сервер не указал причину';
/** The press is accepted and no confirmation has arrived yet (E-02, S-05). */
const PRESS_AWAITING_ANSWER = ', ожидает подтверждения';
/** The visible refusal is dismissed; no capture fact changes (S-09). */
const DISMISS_REFUSAL_LABEL = 'Скрыть отказ';
const DISMISS_REFUSAL_GLYPH = '×';

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
 * The identity of one consumed feed event. The capture id is the first part
 * because one capture can be answered more than once (an unsent delivery that
 * is confirmed later), so its arrival stamp and tone keep the two apart.
 */
function outcomeEventKey(event: TimingCaptureOutcomeEvent): string {
  return [
    event.id,
    event.tone,
    event.at,
    event.reason ?? '',
  ].join('\u0000');
}

/** One refusal the outcome region keeps until the referee dismisses it. */
function refusalFromEvent(event: TimingCaptureOutcomeEvent): TimingRefusalNotice {
  return {
    id: outcomeEventKey(event),
    subject: event.subject,
    reason: event.reason ?? REJECTION_FALLBACK_REASON,
    at: event.at,
  };
}

/**
 * The press region: what was pressed and that it is accepted, plus the fact
 * that no confirmation has arrived while that is still true. It never states a
 * confirmation; the outcome region owns every answer (AD-7).
 */
function describePress(press: PressStatement, settled: boolean): string {
  return settled
    ? `${press.subject} — принято`
    : `${press.subject} — принято${PRESS_AWAITING_ANSWER}`;
}

/**
 * The outcome region for an answered capture. A confirmation names the server,
 * an unsent capture stays on the device and is never a failure (F-03). The
 * unsent total is read at render time so it follows the page figure as the
 * queue drains (FR-11).
 */
function describeAnswer(answer: AnswerStatement, pendingCount: number): string {
  return answer.tone === 'confirmed'
    ? `${answer.subject} — сервер подтвердил отметку`
    : `${answer.subject} — отметка сохранена на устройстве, не отправлено: ${pendingCount}`;
}

/** The refusal line: its own number and the server reason, verbatim (E-12). */
function describeRefusal(notice: TimingRefusalNotice): string {
  return `Отклонено: ${notice.subject} — ${notice.reason}`;
}

/** How many refusals still wait for the referee (S-09). */
function describeUndismissedRefusals(count: number): string {
  return `Не закрыто отказов: ${count}`;
}

export function NumberCaptureField({
  disabled = false,
  resolve,
  onCommit,
  assignment = null,
  onAssign,
  onAnonymousSplit,
  pendingCount = 0,
  outcomes,
  onError,
}: NumberCaptureFieldProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [press, setPress] = useState<PressStatement | null>(null);
  const [answer, setAnswer] = useState<AnswerStatement | null>(null);
  const [notices, setNotices] = useState<TimingRefusalNotice[]>([]);
  const [choice, setChoice] = useState<AmbiguousChoice | null>(null);
  const pressCounter = useRef(0);
  const consumedOutcomes = useRef<Set<string>>(new Set());
  const inputRef = useRef<InputRef>(null);
  const assignmentId = assignment?.splitId ?? null;

  // Entering, leaving or changing assignment mode starts from an empty field:
  // a number typed for one entry must never reach the next one (E-06, E-09).
  // An undismissed refusal stays: only the referee closes it (S-09).
  useEffect(() => {
    setText('');
    setError(null);
    setPress(null);
    setAnswer(null);
    if (assignmentId !== null) {
      inputRef.current?.focus();
    }
  }, [assignmentId]);

  /**
   * Turns the page's answer feed into outcomes (AD-7). Each event is consumed
   * once, so a feed that only grows never re-announces a refusal or rewrites the
   * latest answer. A refused event becomes a notice the referee dismisses; every
   * other event becomes the latest answered outcome.
   */
  useEffect(() => {
    if (outcomes === undefined) return;
    const fresh: TimingCaptureOutcomeEvent[] = [];
    for (const event of outcomes) {
      const key = outcomeEventKey(event);
      if (consumedOutcomes.current.has(key)) continue;
      consumedOutcomes.current.add(key);
      fresh.push(event);
    }
    if (fresh.length === 0) return;

    const refused = fresh.filter((event) => event.tone === 'refused');
    if (refused.length > 0) {
      setNotices((current) => [
        ...current,
        ...refused.map((event) => refusalFromEvent(event)),
      ]);
    }

    const answered = [...fresh]
      .reverse()
      .find((event) => event.tone !== 'refused');
    if (answered !== undefined) {
      setAnswer({
        subject: answered.subject,
        tone: answered.tone === 'confirmed' ? 'confirmed' : 'unsent',
        at: answered.at,
      });
    }
  }, [outcomes]);

  const refuse = (message: string) => {
    setError(message);
    onError?.(message);
  };

  /**
   * Applies what the page answered about one recorded press (FR-15).
   *
   * The field was already cleared and focused at the press, so no answer ever
   * touches the text: a refusal in particular keeps whatever the referee typed
   * since and never writes the refused number back (E-12). An `ACCEPTED` answer
   * adds nothing — the press region already states the acceptance.
   */
  const applyOutcome = (
    subject: string,
    pressKey: number,
    outcome: TimingCaptureOutcome,
  ) => {
    if (outcome.status === 'ACCEPTED') return;
    setPress((current) =>
      current !== null && current.key === pressKey
        ? { ...current, answered: true }
        : current,
    );
    const at = new Date().toISOString();
    if (outcome.status === 'REJECTED') {
      setNotices((current) => [
        ...current,
        {
          id: `press-refusal-${pressKey}`,
          subject,
          reason: outcome.reason ?? REJECTION_FALLBACK_REASON,
          at,
        },
      ]);
      return;
    }
    setAnswer({
      subject,
      tone: outcome.status === 'CONFIRMED' ? 'confirmed' : 'unsent',
      at,
    });
  };

  /**
   * One press, one mutation, no wait. The field clears and keeps focus before
   * the page's promise settles, so any number of earlier captures may still be
   * unresolved (E-02, S-05, F-13). Nothing here refuses a second press.
   */
  const start = (
    subject: string,
    pressAt: string,
    clearsField: boolean,
    work: () => Promise<TimingCaptureOutcome>,
  ) => {
    if (disabled) return;
    pressCounter.current += 1;
    const pressKey = pressCounter.current;
    setError(null);
    if (clearsField) setText('');
    setPress({ key: pressKey, subject, at: pressAt, answered: false });
    inputRef.current?.focus();
    void (async () => {
      try {
        const outcome = await work();
        applyOutcome(subject, pressKey, outcome);
      } catch (failure) {
        // The page owns HTTP errors: keep the newest press statement and the
        // typed text, and leave the message to the surface that sent it.
        console.warn(
          'timing: the field commit was refused; the page reports the API message',
          failure,
        );
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

    if (candidates.length === 1) {
      start(`№ ${startNumber}`, capturedAt, true, () =>
        onCommit({
          startNumber,
          enrollmentId: candidates[0].enrollmentId,
          capturedAt,
          monotonicMs,
        }),
      );
      return;
    }

    setError(null);
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

    start(`№ ${startNumber}`, new Date().toISOString(), true, () =>
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
    // The split consumed no number, so its press never clears typed text.
    start(ANONYMOUS_SUBJECT, new Date().toISOString(), false, () =>
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
    if (disabled) return;

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
    if (choice === null) return;
    const picked: NumberCaptureCommitInput = {
      startNumber: choice.startNumber,
      enrollmentId: candidate.enrollmentId,
      capturedAt: choice.capturedAt,
      monotonicMs: choice.monotonicMs,
    };
    setChoice(null);
    start(`№ ${picked.startNumber}`, picked.capturedAt, true, () =>
      onCommit(picked),
    );
  };

  /** The visible refusal; the rest wait behind it, oldest first (S-09). */
  const visibleNotice: TimingRefusalNotice | null = notices[0] ?? null;

  /**
   * Whether the newest press already has its answer, from its own commit or
   * from a feed event about the same subject at or after the press. Only a
   * confirmation or a refusal settles the press; an unsent capture stays
   * unconfirmed (E-09).
   */
  const pressSettled =
    press !== null &&
    (press.answered ||
      (outcomes?.some(
        (event) =>
          event.tone !== 'unsent' &&
          event.subject === press.subject &&
          Date.parse(event.at) >= Date.parse(press.at),
      ) ??
        false));

  /** Dismissing the visible refusal changes no capture state and no count. */
  const dismissVisibleNotice = () => {
    setNotices((current) => current.slice(1));
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
      {/*
       * One fixed-height slot with two independent regions (AD-7). The press
       * region names the newest press, the outcome region the latest answer or
       * the visible refusal. Both rows always exist, so a press, an answer or a
       * dismissal never moves the field or the blocks below it.
       */}
      <div
        data-testid="timing-field-feedback"
        style={{
          width: '100%',
          height: 44,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          textAlign: 'center',
          overflowY: 'auto',
        }}
      >
        <div
          data-testid="timing-field-press"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 16,
            width: '100%',
          }}
        >
          {error !== null ? (
            <Typography.Text
              type="danger"
              role="alert"
              style={{ fontSize: 12, lineHeight: '16px' }}
            >
              {error}
            </Typography.Text>
          ) : press === null ? null : (
            <Typography.Text
              type="secondary"
              style={{ fontSize: 12, lineHeight: '16px' }}
            >
              {describePress(press, pressSettled)}
            </Typography.Text>
          )}
        </div>
        <div
          data-testid="timing-field-outcome"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            minHeight: 16,
            width: '100%',
          }}
        >
          {visibleNotice !== null ? (
            <>
              <Typography.Text
                role="status"
                type="danger"
                style={{ fontSize: 12, lineHeight: '16px' }}
              >
                {describeRefusal(visibleNotice)}
              </Typography.Text>
              <Typography.Text
                type="secondary"
                style={{ fontSize: 11, lineHeight: '16px' }}
              >
                {describeUndismissedRefusals(notices.length)}
              </Typography.Text>
              <Button
                type="text"
                size="small"
                aria-label={DISMISS_REFUSAL_LABEL}
                onClick={dismissVisibleNotice}
                style={{ height: 16, padding: '0 4px', fontSize: 12 }}
              >
                {DISMISS_REFUSAL_GLYPH}
              </Button>
            </>
          ) : answer === null ? null : (
            <Typography.Text
              role="status"
              type="secondary"
              style={{ fontSize: 12, lineHeight: '16px' }}
            >
              {describeAnswer(answer, pendingCount)}
            </Typography.Text>
          )}
        </div>
      </div>

      <Modal
        open={choice !== null}
        title="Выберите участника"
        footer={null}
        onCancel={() => {
          // Abandoning the picker changes nothing: no pass, text untouched.
          setChoice(null);
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
