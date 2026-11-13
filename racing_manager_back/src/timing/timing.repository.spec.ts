import {
  buildMarkUpdate,
  toCaptureLockRow,
  toClosureReport,
  toJsonRecord,
} from './timing.repository';

/**
 * Unit tests for the pure row helpers of the timing repository. The SQL paths
 * are covered by the integration suite against a real database; nothing here
 * mocks Prisma.
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
