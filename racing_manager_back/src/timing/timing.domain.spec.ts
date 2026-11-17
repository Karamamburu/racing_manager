import {
  TIMING_MAX_TOTAL_MS,
  assertCanAddPass,
  assertWithinBounds,
  assignLapNumbers,
  canComplete,
  canCorrectOfficialTime,
  canRebindOrCancelPass,
  canStartAttempt,
  classifyParticipantState,
  classifyRouting,
  computeSplits,
  isEligibleForCapture,
  nextAttemptNumber,
  normalizeReason,
  orderByOfficialInstant,
  resolveElapsedMs,
  type TimingAttemptStatus,
  type TimingParticipantFacts,
  type TimingRoutingCandidate,
  type TimingStartAttemptCheck,
  type TimingStateContext,
} from './timing.domain';
import {
  TimingDomainError,
  TimingErrorCode,
  timingError,
} from './timing.errors';

const START = '2026-11-13T10:00:00.000Z';

function expectTimingError(
  run: () => void,
  code: TimingErrorCode,
): TimingDomainError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(TimingDomainError);
    const domainError = error as TimingDomainError;
    expect(domainError.code).toBe(code);
    return domainError;
  }
  throw new Error(`Expected a TimingDomainError with code ${code}.`);
}

function participantFacts(
  overrides: Partial<TimingParticipantFacts> = {},
): TimingParticipantFacts {
  return {
    attemptStatus: 'RUNNING',
    passCount: 0,
    requiredLaps: 3,
    excludedReason: null,
    ...overrides,
  };
}

function routingCandidate(
  enrollmentId: string,
  overrides: Partial<TimingParticipantFacts> = {},
): TimingRoutingCandidate {
  return { enrollmentId, ...participantFacts(overrides) };
}

function startCheck(
  overrides: Partial<TimingStartAttemptCheck> = {},
): TimingStartAttemptCheck {
  return {
    eventRecordable: true,
    categoryFinished: false,
    participantCount: 3,
    participantsWithoutNumber: 0,
    previousAttemptStatus: null,
    captureHeldByThisWorkstation: true,
    ...overrides,
  };
}

function stateContext(
  attemptStatus: TimingAttemptStatus,
  categoryFinished = false,
): TimingStateContext {
  return { attemptStatus, categoryFinished };
}

describe('resolveElapsedMs', () => {
  it('measures the official instant from the official start', () => {
    expect(
      resolveElapsedMs('2026-11-13T10:00:45.000Z', '2026-11-13T10:00:00.000Z'),
    ).toBe(45_000);
  });

  it('accepts a Date for either side of the subtraction', () => {
    const startedAt = new Date(START);

    expect(
      resolveElapsedMs(new Date('2026-11-13T10:00:01.500Z'), startedAt),
    ).toBe(1_500);
  });

  it('returns zero for the same instant', () => {
    expect(resolveElapsedMs(START, START)).toBe(0);
  });

  it('refuses an unparseable instant instead of writing NaN', () => {
    expectTimingError(
      () => resolveElapsedMs('not-a-date', START),
      TimingErrorCode.INVALID_STATE,
    );
  });
});

describe('assertWithinBounds', () => {
  it('accepts a pass strictly after the start', () => {
    expect(() =>
      assertWithinBounds(START, '2026-11-13T10:00:45.000Z'),
    ).not.toThrow();
  });

  it('accepts exactly 24 hours', () => {
    const atBound = new Date(
      Date.parse(START) + TIMING_MAX_TOTAL_MS,
    ).toISOString();

    expect(() => assertWithinBounds(START, atBound)).not.toThrow();
  });

  it('refuses a pass at the official start', () => {
    expectTimingError(
      () => assertWithinBounds(START, START),
      TimingErrorCode.OUT_OF_BOUNDS,
    );
  });

  it('refuses a pass before the official start', () => {
    expectTimingError(
      () => assertWithinBounds(START, '2026-11-13T09:59:59.999Z'),
      TimingErrorCode.OUT_OF_BOUNDS,
    );
  });

  it('refuses a total one millisecond above the bound', () => {
    const aboveBound = new Date(
      Date.parse(START) + TIMING_MAX_TOTAL_MS + 1,
    ).toISOString();

    expectTimingError(
      () => assertWithinBounds(START, aboveBound),
      TimingErrorCode.OUT_OF_BOUNDS,
    );
  });

  it('honours a narrower bound supplied by the caller', () => {
    const afterOneSecond = new Date(Date.parse(START) + 1_000).toISOString();

    expect(() =>
      assertWithinBounds(START, afterOneSecond, 1_000),
    ).not.toThrow();
    expectTimingError(
      () => assertWithinBounds(START, afterOneSecond, 999),
      TimingErrorCode.OUT_OF_BOUNDS,
    );
  });

  it('keeps the bound in the error details', () => {
    const error = expectTimingError(
      () => assertWithinBounds(START, START),
      TimingErrorCode.OUT_OF_BOUNDS,
    );

    expect(error.details).toEqual({
      elapsedMs: 0,
      maxTotalMs: TIMING_MAX_TOTAL_MS,
    });
  });
});

describe('orderByOfficialInstant', () => {
  it('orders by official instant rather than input order', () => {
    const passes = [
      { passId: 'pass-3', officialAt: '2026-11-13T10:00:20.000Z' },
      { passId: 'pass-1', officialAt: '2026-11-13T10:00:05.000Z' },
      { passId: 'pass-2', officialAt: '2026-11-13T10:00:12.000Z' },
    ];

    expect(orderByOfficialInstant(passes).map((pass) => pass.passId)).toEqual([
      'pass-1',
      'pass-2',
      'pass-3',
    ]);
  });

  it('breaks a tie by pass id, not by input order', () => {
    const passes = [
      { passId: 'pass-b', officialAt: '2026-11-13T10:00:05.000Z' },
      { passId: 'pass-a', officialAt: '2026-11-13T10:00:05.000Z' },
    ];

    expect(orderByOfficialInstant(passes).map((pass) => pass.passId)).toEqual([
      'pass-a',
      'pass-b',
    ]);
  });

  it('orders Date instants mixed with ISO strings', () => {
    const passes = [
      { passId: 'late', officialAt: new Date('2026-11-13T10:00:30.000Z') },
      { passId: 'early', officialAt: '2026-11-13T10:00:01.000Z' },
    ];

    expect(orderByOfficialInstant(passes).map((pass) => pass.passId)).toEqual([
      'early',
      'late',
    ]);
  });

  it('does not mutate the input array', () => {
    const passes = [
      { passId: 'pass-2', officialAt: '2026-11-13T10:00:20.000Z' },
      { passId: 'pass-1', officialAt: '2026-11-13T10:00:05.000Z' },
    ];

    orderByOfficialInstant(passes);

    expect(passes.map((pass) => pass.passId)).toEqual(['pass-2', 'pass-1']);
  });
});

describe('assignLapNumbers', () => {
  it('numbers laps 1..k in official-instant order', () => {
    const passes = [
      { passId: 'third', officialAt: '2026-11-13T10:00:25.000Z' },
      { passId: 'first', officialAt: '2026-11-13T10:00:05.000Z' },
      { passId: 'second', officialAt: '2026-11-13T10:00:15.000Z' },
    ];

    expect(assignLapNumbers(passes)).toEqual([
      { passId: 'first', lapNumber: 1 },
      { passId: 'second', lapNumber: 2 },
      { passId: 'third', lapNumber: 3 },
    ]);
  });

  it('returns no laps for an empty pass set', () => {
    expect(assignLapNumbers([])).toEqual([]);
  });
});

describe('computeSplits', () => {
  it('computes lap times and cumulative values whose last value is the total', () => {
    const passes = [
      { passId: 'lap-3', officialAt: '2026-11-13T10:20:00.000Z' },
      { passId: 'lap-1', officialAt: '2026-11-13T10:05:00.000Z' },
      { passId: 'lap-2', officialAt: '2026-11-13T10:12:00.000Z' },
    ];

    const splits = computeSplits(START, passes);

    expect(splits).toEqual([
      { lapNumber: 1, lapTimeMs: 300_000, cumulativeMs: 300_000 },
      { lapNumber: 2, lapTimeMs: 420_000, cumulativeMs: 720_000 },
      { lapNumber: 3, lapTimeMs: 480_000, cumulativeMs: 1_200_000 },
    ]);
    expect(splits[splits.length - 1].cumulativeMs).toBe(
      resolveElapsedMs(passes[0].officialAt, START),
    );
    expect(splits.reduce((sum, split) => sum + split.lapTimeMs, 0)).toBe(
      splits[splits.length - 1].cumulativeMs,
    );
  });

  it('measures a single lap from the official start', () => {
    expect(
      computeSplits(START, [
        { passId: 'only', officialAt: '2026-11-13T10:02:30.000Z' },
      ]),
    ).toEqual([{ lapNumber: 1, lapTimeMs: 150_000, cumulativeMs: 150_000 }]);
  });

  it('returns no splits for an empty pass set', () => {
    expect(computeSplits(START, [])).toEqual([]);
  });

  it('refuses a pass at the official start', () => {
    expectTimingError(
      () => computeSplits(START, [{ passId: 'zero', officialAt: START }]),
      TimingErrorCode.OUT_OF_BOUNDS,
    );
  });

  it('refuses a pass before the official start', () => {
    expectTimingError(
      () =>
        computeSplits(START, [
          { passId: 'before', officialAt: '2026-11-13T09:59:00.000Z' },
        ]),
      TimingErrorCode.OUT_OF_BOUNDS,
    );
  });

  it('refuses two passes at one instant because the second lap is empty', () => {
    const error = expectTimingError(
      () =>
        computeSplits(START, [
          { passId: 'a', officialAt: '2026-11-13T10:01:00.000Z' },
          { passId: 'b', officialAt: '2026-11-13T10:01:00.000Z' },
        ]),
      TimingErrorCode.OUT_OF_BOUNDS,
    );

    expect(error.details).toEqual({
      passId: 'b',
      lapNumber: 2,
      lapTimeMs: 0,
      cumulativeMs: 60_000,
    });
  });

  it('accepts a total of exactly 24 hours', () => {
    const atBound = new Date(
      Date.parse(START) + TIMING_MAX_TOTAL_MS,
    ).toISOString();

    expect(
      computeSplits(START, [{ passId: 'bound', officialAt: atBound }]),
    ).toEqual([
      {
        lapNumber: 1,
        lapTimeMs: TIMING_MAX_TOTAL_MS,
        cumulativeMs: TIMING_MAX_TOTAL_MS,
      },
    ]);
  });

  it('refuses a total one millisecond above 24 hours', () => {
    const aboveBound = new Date(
      Date.parse(START) + TIMING_MAX_TOTAL_MS + 1,
    ).toISOString();

    expectTimingError(
      () => computeSplits(START, [{ passId: 'late', officialAt: aboveBound }]),
      TimingErrorCode.OUT_OF_BOUNDS,
    );
  });
});

describe('classifyParticipantState', () => {
  it('reports an excluded participant even when it already holds N passes', () => {
    expect(
      classifyParticipantState({
        attemptStatus: 'COMPLETED',
        passCount: 3,
        requiredLaps: 3,
        excludedReason: 'WITHDRAWN',
      }),
    ).toBe('EXCLUDED');
  });

  it('reports a participant holding N passes as recorded', () => {
    expect(
      classifyParticipantState({
        attemptStatus: 'RUNNING',
        passCount: 3,
        requiredLaps: 3,
        excludedReason: null,
      }),
    ).toBe('RECORDED');
  });

  it('reports a closed participant below N as incomplete', () => {
    expect(
      classifyParticipantState({
        attemptStatus: 'INCOMPLETE',
        passCount: 2,
        requiredLaps: 3,
        excludedReason: null,
      }),
    ).toBe('INCOMPLETE');
  });

  it('reports a participant with some passes as racing', () => {
    expect(
      classifyParticipantState({
        attemptStatus: 'RUNNING',
        passCount: 2,
        requiredLaps: 3,
        excludedReason: null,
      }),
    ).toBe('RACING');
  });

  it('reports a participant without passes as waiting', () => {
    expect(
      classifyParticipantState({
        attemptStatus: 'RUNNING',
        passCount: 0,
        requiredLaps: 3,
        excludedReason: null,
      }),
    ).toBe('WAITING');
  });
});

describe('isEligibleForCapture', () => {
  it('accepts a running, non-excluded participant below N', () => {
    expect(isEligibleForCapture(routingCandidate('enrollment-1'))).toBe(true);
  });

  it('refuses a closed attempt, an excluded participant and a participant at N', () => {
    expect(
      isEligibleForCapture(
        routingCandidate('enrollment-1', { attemptStatus: 'COMPLETED' }),
      ),
    ).toBe(false);
    expect(
      isEligibleForCapture(
        routingCandidate('enrollment-1', { excludedReason: 'RACE_SECTION' }),
      ),
    ).toBe(false);
    expect(
      isEligibleForCapture(routingCandidate('enrollment-1', { passCount: 3 })),
    ).toBe(false);
  });
});

describe('classifyRouting', () => {
  it('reports an unknown number when nothing resolves', () => {
    expect(classifyRouting([])).toEqual({
      kind: 'NONE',
      reason: 'UNKNOWN_NUMBER',
    });
  });

  it('routes one eligible enrollment without a question', () => {
    expect(
      classifyRouting([
        routingCandidate('enrollment-1'),
        routingCandidate('enrollment-2', { attemptStatus: 'CANCELLED' }),
      ]),
    ).toEqual({ kind: 'SINGLE', enrollmentId: 'enrollment-1' });
  });

  it('asks for a choice when two enrollments are eligible', () => {
    expect(
      classifyRouting([
        routingCandidate('enrollment-1'),
        routingCandidate('enrollment-2', { passCount: 1 }),
      ]),
    ).toEqual({
      kind: 'AMBIGUOUS',
      enrollmentIds: ['enrollment-1', 'enrollment-2'],
    });
  });

  it('refuses a participant whose attempt has not started or is closed', () => {
    expect(
      classifyRouting([
        routingCandidate('enrollment-1', { attemptStatus: 'CANCELLED' }),
        routingCandidate('enrollment-2', { attemptStatus: 'COMPLETED' }),
      ]),
    ).toEqual({ kind: 'NONE', reason: 'NOT_RUNNING' });
  });

  it('refuses an excluded participant', () => {
    expect(
      classifyRouting([
        routingCandidate('enrollment-1', { excludedReason: 'WITHDRAWN' }),
      ]),
    ).toEqual({ kind: 'NONE', reason: 'EXCLUDED' });
  });

  it('refuses a participant already holding N passes', () => {
    expect(
      classifyRouting([
        routingCandidate('enrollment-1', { passCount: 3, requiredLaps: 3 }),
      ]),
    ).toEqual({ kind: 'NONE', reason: 'ALREADY_N' });
  });

  it('reports exclusion before the at-N refusal for one participant', () => {
    expect(
      classifyRouting([
        routingCandidate('enrollment-1', {
          passCount: 3,
          requiredLaps: 3,
          excludedReason: 'WITHDRAWN',
        }),
      ]),
    ).toEqual({ kind: 'NONE', reason: 'EXCLUDED' });
  });

  it('keeps a closed candidate out of an ambiguity over a running one', () => {
    expect(
      classifyRouting([
        routingCandidate('enrollment-1'),
        routingCandidate('enrollment-2', {
          attemptStatus: 'COMPLETED',
          passCount: 0,
        }),
      ]),
    ).toEqual({ kind: 'SINGLE', enrollmentId: 'enrollment-1' });
  });
});

describe('canStartAttempt', () => {
  it('allows a start press when no blocker applies', () => {
    expect(canStartAttempt(startCheck())).toBeNull();
  });

  it('allows a re-time after a cancelled attempt', () => {
    expect(
      canStartAttempt(startCheck({ previousAttemptStatus: 'CANCELLED' })),
    ).toBeNull();
  });

  it('refuses a cancelled or locked event', () => {
    expect(canStartAttempt(startCheck({ eventRecordable: false }))).toBe(
      TimingErrorCode.NOT_AVAILABLE,
    );
  });

  it('refuses a finished protocol category', () => {
    expect(canStartAttempt(startCheck({ categoryFinished: true }))).toBe(
      TimingErrorCode.CATEGORY_FINISHED,
    );
  });

  it('refuses a category with no timeable participant', () => {
    expect(canStartAttempt(startCheck({ participantCount: 0 }))).toBe(
      TimingErrorCode.NO_TIMEABLE_PARTICIPANT,
    );
  });

  it('refuses a participant without an event-unique number', () => {
    expect(canStartAttempt(startCheck({ participantsWithoutNumber: 1 }))).toBe(
      TimingErrorCode.MISSING_START_NUMBER,
    );
  });

  it('refuses a second start press while the category runs', () => {
    expect(
      canStartAttempt(startCheck({ previousAttemptStatus: 'RUNNING' })),
    ).toBe(TimingErrorCode.ATTEMPT_RUNNING);
  });

  it('refuses a re-time after a completed or force-completed attempt', () => {
    expect(
      canStartAttempt(startCheck({ previousAttemptStatus: 'COMPLETED' })),
    ).toBe(TimingErrorCode.ATTEMPT_CLOSED);
    expect(
      canStartAttempt(startCheck({ previousAttemptStatus: 'INCOMPLETE' })),
    ).toBe(TimingErrorCode.ATTEMPT_CLOSED);
  });

  it('refuses a start from a workstation without capture', () => {
    expect(
      canStartAttempt(startCheck({ captureHeldByThisWorkstation: false })),
    ).toBe(TimingErrorCode.CAPTURE_NOT_HELD);
  });

  it('names the category blocker before the capture blocker', () => {
    expect(
      canStartAttempt(
        startCheck({
          categoryFinished: true,
          captureHeldByThisWorkstation: false,
        }),
      ),
    ).toBe(TimingErrorCode.CATEGORY_FINISHED);
  });

  it('names the running attempt before the capture blocker', () => {
    expect(
      canStartAttempt(
        startCheck({
          previousAttemptStatus: 'RUNNING',
          captureHeldByThisWorkstation: false,
        }),
      ),
    ).toBe(TimingErrorCode.ATTEMPT_RUNNING);
  });
});

describe('canComplete', () => {
  it('allows completion when every gate holds', () => {
    expect(
      canComplete({
        pendingFinishCount: 0,
        unconfirmedMutationCount: 0,
        participantsBelowRequiredLaps: 0,
      }),
    ).toBeNull();
  });

  it('refuses completion while a pending finish is unbound', () => {
    expect(
      canComplete({
        pendingFinishCount: 1,
        unconfirmedMutationCount: 0,
        participantsBelowRequiredLaps: 0,
      }),
    ).toBe(TimingErrorCode.PENDING_REMAINS);
  });

  it('refuses completion while a workstation mutation is unconfirmed', () => {
    expect(
      canComplete({
        pendingFinishCount: 0,
        unconfirmedMutationCount: 2,
        participantsBelowRequiredLaps: 0,
      }),
    ).toBe(TimingErrorCode.UNCONFIRMED_MUTATIONS);
  });

  it('refuses completion while a non-excluded participant is below N', () => {
    expect(
      canComplete({
        pendingFinishCount: 0,
        unconfirmedMutationCount: 0,
        participantsBelowRequiredLaps: 1,
      }),
    ).toBe(TimingErrorCode.PARTICIPANTS_BELOW_LAPS);
  });

  it('names the pending finish first when several gates fail', () => {
    expect(
      canComplete({
        pendingFinishCount: 1,
        unconfirmedMutationCount: 1,
        participantsBelowRequiredLaps: 1,
      }),
    ).toBe(TimingErrorCode.PENDING_REMAINS);
    expect(
      canComplete({
        pendingFinishCount: 0,
        unconfirmedMutationCount: 1,
        participantsBelowRequiredLaps: 1,
      }),
    ).toBe(TimingErrorCode.UNCONFIRMED_MUTATIONS);
  });
});

describe('canCorrectOfficialTime', () => {
  it('allows a correction while the attempt runs and the category is unfinished', () => {
    expect(canCorrectOfficialTime(stateContext('RUNNING'))).toBeNull();
  });

  it('allows a correction on a closed attempt while the category is unfinished', () => {
    expect(canCorrectOfficialTime(stateContext('COMPLETED'))).toBeNull();
    expect(canCorrectOfficialTime(stateContext('INCOMPLETE'))).toBeNull();
  });

  it('refuses a correction on a cancelled attempt', () => {
    expect(canCorrectOfficialTime(stateContext('CANCELLED'))).toBe(
      TimingErrorCode.INVALID_STATE,
    );
  });

  it('refuses every correction after the category finish', () => {
    expect(canCorrectOfficialTime(stateContext('COMPLETED', true))).toBe(
      TimingErrorCode.CATEGORY_FINISHED,
    );
    expect(canCorrectOfficialTime(stateContext('CANCELLED', true))).toBe(
      TimingErrorCode.CATEGORY_FINISHED,
    );
  });
});

describe('canRebindOrCancelPass', () => {
  it('allows a rebind or pass cancellation while the attempt runs', () => {
    expect(canRebindOrCancelPass(stateContext('RUNNING'))).toBeNull();
  });

  it('refuses a rebind or pass cancellation after closure', () => {
    expect(canRebindOrCancelPass(stateContext('COMPLETED'))).toBe(
      TimingErrorCode.ATTEMPT_CLOSED,
    );
    expect(canRebindOrCancelPass(stateContext('INCOMPLETE'))).toBe(
      TimingErrorCode.ATTEMPT_CLOSED,
    );
  });

  it('refuses a rebind or pass cancellation on a cancelled attempt', () => {
    expect(canRebindOrCancelPass(stateContext('CANCELLED'))).toBe(
      TimingErrorCode.INVALID_STATE,
    );
  });

  it('refuses both after the category finish', () => {
    expect(canRebindOrCancelPass(stateContext('RUNNING', true))).toBe(
      TimingErrorCode.CATEGORY_FINISHED,
    );
  });
});

describe('normalizeReason', () => {
  it('trims a supplied reason', () => {
    expect(normalizeReason('  late press  ')).toBe('late press');
  });

  it('refuses an empty, blank, null or missing reason', () => {
    for (const reason of ['', '   ', null, undefined]) {
      expectTimingError(
        () => normalizeReason(reason),
        TimingErrorCode.REASON_REQUIRED,
      );
    }
  });
});

describe('assertCanAddPass', () => {
  it('allows a pass below N', () => {
    expect(() => assertCanAddPass(0, 3)).not.toThrow();
    expect(() => assertCanAddPass(2, 3)).not.toThrow();
  });

  it('refuses a pass at or above N', () => {
    const atN = expectTimingError(
      () => assertCanAddPass(3, 3),
      TimingErrorCode.ALREADY_N_PASSES,
    );
    expect(atN.details).toEqual({ passCount: 3, requiredLaps: 3 });
    expectTimingError(
      () => assertCanAddPass(4, 3),
      TimingErrorCode.ALREADY_N_PASSES,
    );
  });
});

describe('nextAttemptNumber', () => {
  it('starts at 1 for a category with no previous attempt', () => {
    expect(nextAttemptNumber([])).toBe(1);
  });

  it('returns max + 1 whatever the history order', () => {
    expect(nextAttemptNumber([1])).toBe(2);
    expect(nextAttemptNumber([1, 2, 3])).toBe(4);
    expect(nextAttemptNumber([2, 5, 1])).toBe(6);
  });

  it('does not mutate the supplied history', () => {
    const history = [2, 5, 1];

    nextAttemptNumber(history);

    expect(history).toEqual([2, 5, 1]);
  });
});

describe('timingError', () => {
  it('builds a domain error with its code, message and details', () => {
    const error = timingError(TimingErrorCode.CONFLICT, 'Outcome changed.', {
      enrollmentId: 'enrollment-1',
    });

    expect(error).toBeInstanceOf(TimingDomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TimingDomainError');
    expect(error.code).toBe(TimingErrorCode.CONFLICT);
    expect(error.message).toBe('Outcome changed.');
    expect(error.details).toEqual({ enrollmentId: 'enrollment-1' });
  });

  it('keeps details optional', () => {
    expect(timingError(TimingErrorCode.NOT_FOUND, 'No attempt.').details).toBe(
      undefined,
    );
  });
});
