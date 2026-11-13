import {
  TimingRepository,
  buildAnonymousSplitAssignment,
  buildAnonymousSplitCancellation,
  buildAnonymousSplitCreate,
  buildAttemptCreateData,
  buildHeatTimeCreateData,
  buildMarkUpdate,
  toAnonymousSplitRow,
  toAttemptRow,
  toCaptureLockRow,
  toClosureReport,
  toHeatRosterEnrollmentRow,
  toJsonRecord,
  toRejectedReceiptInput,
  type AnonymousSplitQueryRow,
  type AttemptQueryRow,
  type HeatEnrollmentQueryRow,
  type TimingTx,
} from './timing.repository';

/**
 * Unit tests for the pure row helpers of the timing repository and for the one
 * raw SQL call whose result shape Prisma cannot read (`lockCategory`). The
 * remaining SQL paths are covered by the integration suite against a real
 * database.
 */

describe('toClosureReport', () => {
  const report = {
    publishedEnrollmentIds: ['enrollment-a'],
    unpublishedEnrollmentIds: ['enrollment-b', 'enrollment-c'],
    conflictEnrollmentIds: [],
  };

  it('reads the three id lists of a stored closure report', () => {
    expect(toClosureReport(report)).toEqual(report);
  });

  it('reads a legacy category report without inventing heat lists', () => {
    const mapped = toClosureReport(report);

    expect(mapped).toEqual(report);
    expect(mapped).not.toHaveProperty('publishedRegistrationIds');
    expect(mapped).not.toHaveProperty('conflictRegistrationIds');
  });

  it('preserves both additive heat registration lists on read', () => {
    const heatReport = {
      publishedEnrollmentIds: [],
      unpublishedEnrollmentIds: ['enrollment-a'],
      conflictEnrollmentIds: [],
      publishedRegistrationIds: [
        'registration-enrollment-b',
        'registration-enrollment-c',
      ],
      conflictRegistrationIds: ['registration-enrollment-d'],
    };

    expect(toClosureReport(heatReport)).toEqual(heatReport);
  });

  it('preserves empty heat registration lists instead of dropping them', () => {
    const heatReport = {
      publishedEnrollmentIds: [],
      unpublishedEnrollmentIds: [],
      conflictEnrollmentIds: [],
      publishedRegistrationIds: [],
      conflictRegistrationIds: [],
    };

    const mapped = toClosureReport(heatReport);

    expect(mapped).toEqual(heatReport);
    expect(mapped?.publishedRegistrationIds).toEqual([]);
    expect(mapped?.conflictRegistrationIds).toEqual([]);
  });

  it('reads a malformed heat registration list as null', () => {
    expect(
      toClosureReport({ ...report, publishedRegistrationIds: [42] }),
    ).toBeNull();
    expect(
      toClosureReport({ ...report, conflictRegistrationIds: 'none' }),
    ).toBeNull();
  });

  it('reads a missing report as null', () => {
    expect(toClosureReport(null)).toBeNull();
  });

  it('reads a non-object report as null', () => {
    expect(toClosureReport('published')).toBeNull();
    expect(toClosureReport(['enrollment-a'])).toBeNull();
  });

  it('reads a report with a missing or malformed list as null', () => {
    expect(
      toClosureReport({
        unpublishedEnrollmentIds: report.unpublishedEnrollmentIds,
        conflictEnrollmentIds: report.conflictEnrollmentIds,
      }),
    ).toBeNull();
    expect(
      toClosureReport({ ...report, conflictEnrollmentIds: [42] }),
    ).toBeNull();
  });
});

describe('toJsonRecord', () => {
  it('keeps a JSON object as a plain record', () => {
    expect(toJsonRecord({ reason: 'typo', lapNumber: 2 })).toEqual({
      reason: 'typo',
      lapNumber: 2,
    });
  });

  it('reads null and a JSON scalar or array as null', () => {
    expect(toJsonRecord(null)).toBeNull();
    expect(toJsonRecord('text')).toBeNull();
    expect(toJsonRecord(7)).toBeNull();
    expect(toJsonRecord([{ lapNumber: 1 }])).toBeNull();
  });
});

describe('buildMarkUpdate', () => {
  it('writes only the delivered fields', () => {
    const officialAt = new Date('2026-11-13T10:00:05.000Z');
    expect(
      buildMarkUpdate({ lapNumber: 3, officialAt, officialElapsedMs: 5000 }),
    ).toEqual({ lapNumber: 3, officialAt, officialElapsedMs: 5000 });
  });

  it('clears a nullable field only when null is delivered', () => {
    expect(buildMarkUpdate({ enrollmentId: null, startNumber: null })).toEqual({
      enrollmentId: null,
      startNumber: null,
    });
  });

  it('keeps a field absent when it is not delivered', () => {
    expect(buildMarkUpdate({ status: 'CANCELLED' })).toEqual({
      status: 'CANCELLED',
    });
    expect(buildMarkUpdate({})).toEqual({});
  });

  it('carries a bind and a sequence change together', () => {
    expect(
      buildMarkUpdate({
        enrollmentId: 'enrollment-a',
        registrationId: 'registration-a',
        startNumber: 12,
        status: 'BOUND',
        deviceSequence: 4,
      }),
    ).toEqual({
      enrollmentId: 'enrollment-a',
      registrationId: 'registration-a',
      startNumber: 12,
      status: 'BOUND',
      deviceSequence: 4,
    });
  });

  it('turns a bound pending finish into a pass without its raw capture', () => {
    const update = buildMarkUpdate({
      enrollmentId: 'enrollment-a',
      registrationId: 'registration-a',
      startNumber: 12,
      kind: 'PASS',
      status: 'BOUND',
    });

    expect(update).toEqual({
      enrollmentId: 'enrollment-a',
      registrationId: 'registration-a',
      startNumber: 12,
      kind: 'PASS',
      status: 'BOUND',
    });
    // The raw capture, its official instant and its creation sequence stay.
    expect(update).not.toHaveProperty('officialAt');
    expect(update).not.toHaveProperty('officialElapsedMs');
    expect(update).not.toHaveProperty('deviceSequence');
  });
});

describe('toCaptureLockRow', () => {
  it('renames the raw capture-lock columns', () => {
    const acquiredAt = new Date('2026-11-13T09:00:00.000Z');
    const lastSeenAt = new Date('2026-11-13T09:05:00.000Z');
    expect(
      toCaptureLockRow({
        event_id: 'event-a',
        workstation_instance_id: 'workstation-a',
        lock_token: 'token-a',
        held_by_user_id: 'user-a',
        acquired_at: acquiredAt,
        last_seen_at: lastSeenAt,
      }),
    ).toEqual({
      eventId: 'event-a',
      workstationInstanceId: 'workstation-a',
      lockToken: 'token-a',
      heldByUserId: 'user-a',
      acquiredAt,
      lastSeenAt,
    });
  });
});

describe('TimingRepository.lockCategory', () => {
  it('executes the advisory lock without querying its void result', async () => {
    const executeRaw = jest.fn().mockResolvedValue(1);
    const queryRaw = jest.fn();
    const tx = {
      $executeRaw: executeRaw,
      $queryRaw: queryRaw,
    } as unknown as TimingTx;
    const repository = new TimingRepository({} as never);

    await repository.lockCategory(tx, 'event:start:format:gender');

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

const NOW = new Date('2026-11-13T10:00:00.000Z');

function attemptQueryRow(overrides: Partial<AttemptQueryRow>): AttemptQueryRow {
  return {
    id: 'attempt-a',
    eventId: 'event-a',
    startId: 'start-a',
    formatId: 1,
    gender: 'M',
    attemptNumber: 1,
    attemptKind: 'CATEGORY',
    classCompetitionId: null,
    stageId: null,
    heatNumber: null,
    status: 'RUNNING',
    officialStartedAt: NOW,
    clientStartedAt: NOW,
    startedByUserId: null,
    closedAt: null,
    closedByUserId: null,
    closureReport: null,
    createdAt: NOW,
    updatedAt: NOW,
    _count: { participants: 3 },
    ...overrides,
  };
}

function anonymousSplitQueryRow(
  overrides: Partial<AnonymousSplitQueryRow>,
): AnonymousSplitQueryRow {
  return {
    id: 'split-a',
    sessionId: 'attempt-a',
    clockEpochId: 'epoch-a',
    officialAt: NOW,
    officialElapsedMs: 4500,
    status: 'PENDING',
    session: {
      attemptKind: 'HEAT',
      status: 'RUNNING',
      eventId: 'event-a',
      startId: 'start-a',
      formatId: 1,
      gender: 'M',
      classCompetitionId: 'race-a',
      stageId: 'stage-1',
      heatNumber: 2,
      officialStartedAt: NOW,
    },
    ...overrides,
  };
}

describe('toAttemptRow', () => {
  it('maps a heat attempt with its race, stage and heat identity', () => {
    expect(
      toAttemptRow(
        attemptQueryRow({
          attemptKind: 'HEAT',
          classCompetitionId: 'race-a',
          stageId: 'stage-1',
          heatNumber: 2,
        }),
      ),
    ).toMatchObject({
      attemptKind: 'HEAT',
      classCompetitionId: 'race-a',
      stageId: 'stage-1',
      heatNumber: 2,
      participantCount: 3,
    });
  });

  it('maps a category attempt with null heat fields', () => {
    const row = toAttemptRow(attemptQueryRow({ id: 'attempt-category' }));

    expect(row.attemptKind).toBe('CATEGORY');
    expect(row.classCompetitionId).toBeNull();
    expect(row.stageId).toBeNull();
    expect(row.heatNumber).toBeNull();
  });
});

describe('buildAttemptCreateData', () => {
  const participants = [
    {
      enrollmentId: 'enrollment-a',
      registrationId: 'registration-a',
      startNumber: 7,
      sectionId: 'CATEGORY_1',
      requiredLaps: 3,
      initialOutcome: null,
    },
  ];

  it('defaults a start press to a category attempt with null heat fields', () => {
    const data = buildAttemptCreateData({
      eventId: 'event-a',
      startId: 'start-a',
      formatId: 1,
      gender: 'M',
      attemptNumber: 2,
      officialStartedAt: NOW,
      clientStartedAt: NOW,
      startedByUserId: null,
      participants,
    });

    expect(data).toMatchObject({
      attemptKind: 'CATEGORY',
      classCompetitionId: null,
      stageId: null,
      heatNumber: null,
      status: 'RUNNING',
    });
    expect(data.participants).toEqual({
      create: [{ ...participants[0], excludedReason: null }],
    });
  });

  it('writes a heat attempt when the start names a race, stage and heat', () => {
    const data = buildAttemptCreateData({
      eventId: 'event-a',
      startId: 'start-a',
      formatId: 1,
      gender: 'M',
      attemptNumber: 1,
      attemptKind: 'HEAT',
      classCompetitionId: 'race-a',
      stageId: 'stage-1',
      heatNumber: 2,
      officialStartedAt: NOW,
      clientStartedAt: NOW,
      startedByUserId: null,
      participants,
    });

    expect(data).toMatchObject({
      attemptKind: 'HEAT',
      classCompetitionId: 'race-a',
      stageId: 'stage-1',
      heatNumber: 2,
    });
  });
});

describe('buildHeatTimeCreateData', () => {
  it('writes the total elapsed value with OK and no lap row', () => {
    const data = buildHeatTimeCreateData({
      classCompetitionId: 'race-a',
      stageId: 'stage-1',
      heatNumber: 2,
      registrationId: 'registration-a',
      timeMilliseconds: 75432,
    });

    expect(data).toEqual({
      classCompetitionId: 'race-a',
      stageId: 'stage-1',
      heatNumber: 2,
      registrationId: 'registration-a',
      timeMilliseconds: 75432,
      status: 'OK',
    });
    expect(data).not.toHaveProperty('laps');
    expect(data).not.toHaveProperty('qualificationStatus');
  });
});

describe('buildAnonymousSplitCreate', () => {
  it('writes a pending anonymous mark with no identity, participant or lap', () => {
    const rawCapturedAt = new Date('2026-11-13T10:00:01.000Z');
    const officialAt = new Date('2026-11-13T10:00:01.050Z');

    expect(
      buildAnonymousSplitCreate({
        attemptId: 'attempt-a',
        clockEpochId: 'epoch-a',
        rawCapturedAt,
        rawElapsedMs: 1000,
        officialAt,
        officialElapsedMs: 1050,
        workstationInstanceId: 'workstation-a',
        deviceSequence: 4,
        idempotencyKey: 'key-a',
      }),
    ).toEqual({
      attemptId: 'attempt-a',
      clockEpochId: 'epoch-a',
      enrollmentId: null,
      registrationId: null,
      startNumber: null,
      kind: 'ANONYMOUS_SPLIT',
      rawCapturedAt,
      rawElapsedMs: 1000,
      officialAt,
      officialElapsedMs: 1050,
      lapNumber: null,
      status: 'PENDING',
      workstationInstanceId: 'workstation-a',
      deviceSequence: 4,
      idempotencyKey: 'key-a',
    });
  });
});

describe('toAnonymousSplitRow', () => {
  it('renames the mark and carries its attempt and heat facts', () => {
    expect(toAnonymousSplitRow(anonymousSplitQueryRow({}))).toEqual({
      splitId: 'split-a',
      attemptId: 'attempt-a',
      attemptKind: 'HEAT',
      attemptStatus: 'RUNNING',
      eventId: 'event-a',
      startId: 'start-a',
      formatId: 1,
      gender: 'M',
      classCompetitionId: 'race-a',
      stageId: 'stage-1',
      heatNumber: 2,
      officialStartedAt: NOW,
      clockEpochId: 'epoch-a',
      capturedAt: NOW,
      officialElapsedMs: 4500,
      status: 'PENDING',
    });
  });
});

describe('buildAnonymousSplitAssignment', () => {
  it('turns the split into a bound pass of the participant', () => {
    const update = buildAnonymousSplitAssignment({
      enrollmentId: 'enrollment-a',
      registrationId: 'registration-a',
      startNumber: 12,
      deviceSequence: 5,
    });

    expect(update).toEqual({
      enrollmentId: 'enrollment-a',
      registrationId: 'registration-a',
      startNumber: 12,
      kind: 'PASS',
      status: 'BOUND',
      deviceSequence: 5,
    });
    // The raw capture and the official instant stay untouched.
    expect(update).not.toHaveProperty('officialAt');
    expect(update).not.toHaveProperty('officialElapsedMs');
  });
});

describe('buildAnonymousSplitCancellation', () => {
  it('retires the split without moving its kind or identity', () => {
    expect(buildAnonymousSplitCancellation()).toEqual({ status: 'CANCELLED' });
  });
});

describe('toRejectedReceiptInput', () => {
  it('records the refusal as a final rejected receipt with its reason', () => {
    expect(
      toRejectedReceiptInput({
        attemptId: 'attempt-a',
        workstationInstanceId: 'workstation-a',
        deviceSequence: 9,
        reason: 'unknown start number',
      }),
    ).toEqual({
      attemptId: 'attempt-a',
      workstationInstanceId: 'workstation-a',
      deviceSequence: 9,
      status: 'REJECTED',
      reason: 'unknown start number',
    });
  });
});

describe('toHeatRosterEnrollmentRow', () => {
  it('reads the active enrollment, its number and both statuses', () => {
    const row: HeatEnrollmentQueryRow = {
      id: 'enrollment-a',
      registrationId: 'registration-a',
      status: 'REGISTERED',
      registration: { startNumber: 7, status: 'CONFIRMED' },
    };

    expect(toHeatRosterEnrollmentRow(row)).toEqual({
      enrollmentId: 'enrollment-a',
      registrationId: 'registration-a',
      startNumber: 7,
      enrollmentStatus: 'REGISTERED',
      registrationStatus: 'CONFIRMED',
    });
  });
});
