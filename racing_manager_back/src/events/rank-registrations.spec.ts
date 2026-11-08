import {
  compareEnrollmentsByResult,
  isComparableFinish,
  rankEnrollments,
  type RankableEnrollment,
} from './rank-registrations';

const START_A = '11111111-1111-4111-8111-111111111111';
const START_B = '22222222-2222-4222-8222-222222222222';

function enrollment(
  overrides: Partial<RankableEnrollment> = {},
): RankableEnrollment {
  return {
    enrollmentId: 'enrollment-1',
    registrationId: 'registration-1',
    startId: START_A,
    formatId: 1,
    gender: 'M',
    startNumber: 1,
    registeredAt: new Date('2026-11-07T00:00:00.000Z'),
    outcome: 'FINISHED',
    timeMilliseconds: 3_600_000,
    enrollmentStatus: 'REGISTERED',
    ...overrides,
  };
}

describe('isComparableFinish', () => {
  it('requires REGISTERED, FINISHED and a positive time', () => {
    expect(isComparableFinish(enrollment())).toBe(true);
    expect(
      isComparableFinish(enrollment({ enrollmentStatus: 'WITHDRAWN' })),
    ).toBe(false);
    expect(isComparableFinish(enrollment({ outcome: 'DNS' }))).toBe(false);
    expect(isComparableFinish(enrollment({ timeMilliseconds: null }))).toBe(
      false,
    );
    expect(isComparableFinish(enrollment({ timeMilliseconds: 0 }))).toBe(false);
  });
});

describe('compareEnrollmentsByResult', () => {
  it('orders comparable finishes by time then start number', () => {
    const slower = enrollment({
      enrollmentId: 'slow',
      timeMilliseconds: 4_000_000,
      startNumber: 1,
    });
    const faster = enrollment({
      enrollmentId: 'fast',
      timeMilliseconds: 3_000_000,
      startNumber: 9,
    });

    expect(compareEnrollmentsByResult(faster, slower)).toBeLessThan(0);
    expect(
      compareEnrollmentsByResult(
        enrollment({ enrollmentId: 'a', startNumber: 2 }),
        enrollment({ enrollmentId: 'b', startNumber: 3 }),
      ),
    ).toBeLessThan(0);
  });
});

describe('rankEnrollments', () => {
  it('computes place for FINISHED and leaves DNS/DNF/DSQ without place', () => {
    const ranked = rankEnrollments([
      enrollment({
        enrollmentId: 'finish',
        timeMilliseconds: 3_600_000,
      }),
      enrollment({
        enrollmentId: 'dns',
        outcome: 'DNS',
        timeMilliseconds: null,
      }),
      enrollment({
        enrollmentId: 'dnf',
        outcome: 'DNF',
        timeMilliseconds: null,
      }),
      enrollment({
        enrollmentId: 'dsq',
        outcome: 'DSQ',
        timeMilliseconds: null,
      }),
    ]);

    const placeById = new Map(
      ranked.map((row) => [row.enrollment.enrollmentId, row.place]),
    );
    expect(placeById.get('finish')).toBe(1);
    expect(placeById.get('dns')).toBeNull();
    expect(placeById.get('dnf')).toBeNull();
    expect(placeById.get('dsq')).toBeNull();
  });

  it('leaves REGISTERED without a result without a place', () => {
    const ranked = rankEnrollments([
      enrollment({
        enrollmentId: 'finished',
        timeMilliseconds: 3_600_000,
      }),
      enrollment({
        enrollmentId: 'waiting',
        outcome: null,
        timeMilliseconds: null,
      }),
    ]);

    expect(
      ranked.find((row) => row.enrollment.enrollmentId === 'waiting')?.place,
    ).toBeNull();
  });

  it('excludes WITHDRAWN enrollments from place earning', () => {
    const ranked = rankEnrollments([
      enrollment({
        enrollmentId: 'withdrawn',
        enrollmentStatus: 'WITHDRAWN',
        timeMilliseconds: 3_000_000,
      }),
      enrollment({
        enrollmentId: 'active',
        timeMilliseconds: 3_600_000,
      }),
    ]);

    const placeById = new Map(
      ranked.map((row) => [row.enrollment.enrollmentId, row.place]),
    );
    expect(placeById.get('withdrawn')).toBeNull();
    expect(placeById.get('active')).toBe(1);
  });

  it('ranks each start and format as a separate category', () => {
    const ranked = rankEnrollments([
      enrollment({
        enrollmentId: 'a',
        startId: START_A,
        timeMilliseconds: 3_600_000,
      }),
      enrollment({
        enrollmentId: 'b',
        startId: START_B,
        timeMilliseconds: 3_600_000,
      }),
      enrollment({
        enrollmentId: 'c',
        startId: START_A,
        formatId: 2,
        timeMilliseconds: 3_600_000,
      }),
    ]);

    const placeById = new Map(
      ranked.map((row) => [row.enrollment.enrollmentId, row.place]),
    );
    expect(placeById.get('a')).toBe(1);
    expect(placeById.get('b')).toBe(1);
    expect(placeById.get('c')).toBe(1);
  });

  it('recomputes places when a faster peer is added', () => {
    const first = enrollment({
      enrollmentId: 'first',
      timeMilliseconds: 3_600_000,
    });
    expect(rankEnrollments([first])[0].place).toBe(1);

    const second = enrollment({
      enrollmentId: 'second',
      timeMilliseconds: 3_000_000,
    });
    const ranked = rankEnrollments([first, second]);
    const placeById = new Map(
      ranked.map((row) => [row.enrollment.enrollmentId, row.place]),
    );
    expect(placeById.get('second')).toBe(1);
    expect(placeById.get('first')).toBe(2);
  });
});
