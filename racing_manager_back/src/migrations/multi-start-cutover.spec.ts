import {
  CutoverEnrollmentInput,
  CutoverEventSnapshot,
  CutoverResultInput,
  CutoverStartInput,
  CutoverStore,
  CutoverTransaction,
  LegacyRegistration,
  resolveEnrollmentStatus,
  resolveLegacyOutcome,
  resolveStartDistance,
  runMultiStartCutover,
} from './multi-start-cutover';
import { MigrationAnomalyReport } from './anomaly-report';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_EVENT_ID = '99999999-9999-4999-8999-999999999999';
const REGISTRATION_A = '22222222-2222-4222-8222-222222222222';
const REGISTRATION_B = '33333333-3333-4333-8333-333333333333';

type StoredStart = CutoverStartInput & { id: string };
type StoredEnrollment = CutoverEnrollmentInput & { id: string };
type StoredResult = CutoverResultInput & { id: string };

class FakeStore implements CutoverStore {
  readonly events = new Map<string, CutoverEventSnapshot>();
  readonly starts: StoredStart[] = [];
  readonly enrollments: StoredEnrollment[] = [];
  readonly results: StoredResult[] = [];

  addEvent(snapshot: CutoverEventSnapshot): void {
    this.events.set(snapshot.id, snapshot);
  }

  listEventIds(): Promise<string[]> {
    return Promise.resolve([...this.events.keys()]);
  }

  async transaction<T>(
    work: (tx: CutoverTransaction) => Promise<T>,
  ): Promise<T> {
    return work(this.createTransaction());
  }

  private createTransaction(): CutoverTransaction {
    return {
      loadEvent: (eventId) => Promise.resolve(this.events.get(eventId) ?? null),
      createStart: (input) => {
        const start = { ...input, id: `start-${this.starts.length + 1}` };
        this.starts.push(start);
        const snapshot = this.events.get(input.eventId);
        snapshot?.starts.push({ id: start.id, sortOrder: 0 });
        return Promise.resolve({ id: start.id });
      },
      upsertEnrollment: (input) => {
        const existing = this.enrollments.find(
          (row) =>
            row.registrationId === input.registrationId &&
            row.startId === input.startId,
        );
        if (existing) {
          Object.assign(existing, input);
          return Promise.resolve({ id: existing.id });
        }
        const enrollment = {
          ...input,
          id: `enrollment-${this.enrollments.length + 1}`,
        };
        this.enrollments.push(enrollment);
        return Promise.resolve({ id: enrollment.id });
      },
      upsertResult: (input) => {
        const existing = this.results.find(
          (row) => row.registrationId === input.registrationId,
        );
        if (existing) {
          Object.assign(existing, input);
        } else {
          this.results.push({
            ...input,
            id: `result-${this.results.length + 1}`,
          });
        }
        return Promise.resolve();
      },
    };
  }
}

function lap(
  lapNumber: number,
  distanceKm: number,
): { lapNumber: number; distanceKm: number } {
  return { lapNumber, distanceKm };
}

function registration(
  overrides: Partial<LegacyRegistration> = {},
): LegacyRegistration {
  return {
    id: REGISTRATION_A,
    status: 'REGISTERED',
    formatId: 1,
    result: null,
    ...overrides,
  };
}

function eventSnapshot(
  overrides: Partial<CutoverEventSnapshot> = {},
): CutoverEventSnapshot {
  return {
    id: EVENT_ID,
    distanceKm: 10,
    laps: [lap(1, 2), lap(2, 2), lap(3, 2), lap(4, 2), lap(5, 2)],
    formatIds: [1, 2],
    starts: [],
    registrations: [],
    ...overrides,
  };
}

async function runOne(snapshot: CutoverEventSnapshot, store = new FakeStore()) {
  store.addEvent(snapshot);
  const summary = await runMultiStartCutover(store, {
    eventIds: [snapshot.id],
  });
  return { store, summary, event: summary.events[0] };
}

describe('resolveStartDistance', () => {
  it('derives lap count and length from stored laps when distance agrees', () => {
    expect(
      resolveStartDistance(
        [lap(1, 2), lap(2, 2), lap(3, 2), lap(4, 2), lap(5, 2)],
        10,
      ),
    ).toEqual({
      ok: true,
      lapCount: 5,
      lapLengthMeters: 2000,
      legacyEffectiveDistanceM: null,
      unequalLapLengths: false,
    });
  });

  it('sets the override when legacy distance disagrees with derived distance', () => {
    expect(
      resolveStartDistance([lap(1, 2), lap(2, 2), lap(3, 2)], 6.5),
    ).toMatchObject({
      ok: true,
      lapCount: 3,
      lapLengthMeters: 2000,
      legacyEffectiveDistanceM: 6500,
    });
  });

  it('converts km to metres with nearest-metre rounding', () => {
    expect(resolveStartDistance([lap(1, 0.333)], 0.333)).toMatchObject({
      ok: true,
      lapCount: 1,
      lapLengthMeters: 333,
      legacyEffectiveDistanceM: null,
    });
  });

  it('flags unequal legacy lap lengths and keeps the first lap length', () => {
    expect(resolveStartDistance([lap(1, 2), lap(2, 2.5)], 4.5)).toEqual({
      ok: true,
      lapCount: 2,
      lapLengthMeters: 2000,
      legacyEffectiveDistanceM: 4500,
      unequalLapLengths: true,
    });
  });

  it('uses distanceKm as a single lap when the event has no laps', () => {
    expect(resolveStartDistance([], 7.5)).toEqual({
      ok: true,
      lapCount: 1,
      lapLengthMeters: 7500,
      legacyEffectiveDistanceM: null,
      unequalLapLengths: false,
    });
  });

  it('blocks an event with no laps and no distance', () => {
    expect(resolveStartDistance([], null)).toMatchObject({
      ok: false,
      reasonCode: 'MISSING_DISTANCE',
    });
  });
});

describe('resolveEnrollmentStatus and resolveLegacyOutcome', () => {
  it('maps cancelled and withdrawn registrations to WITHDRAWN', () => {
    expect(resolveEnrollmentStatus('CANCELLED')).toBe('WITHDRAWN');
    expect(resolveEnrollmentStatus('WITHDRAWN')).toBe('WITHDRAWN');
    expect(resolveEnrollmentStatus('CONFIRMED')).toBe('REGISTERED');
    expect(resolveEnrollmentStatus('FINISHED')).toBe('REGISTERED');
  });

  it('maps race statuses to outcomes and results to FINISHED', () => {
    expect(resolveLegacyOutcome('DNS', false)).toBe('DNS');
    expect(resolveLegacyOutcome('DNF', false)).toBe('DNF');
    expect(resolveLegacyOutcome('DSQ', false)).toBe('DSQ');
    expect(resolveLegacyOutcome('FINISHED', false)).toBe('FINISHED');
    expect(resolveLegacyOutcome('REGISTERED', true)).toBe('FINISHED');
    expect(resolveLegacyOutcome('REGISTERED', false)).toBeNull();
    expect(resolveLegacyOutcome('CANCELLED', false)).toBeNull();
  });
});

describe('runMultiStartCutover', () => {
  it('creates exactly one start with formats from the legacy event', async () => {
    const { store, event } = await runOne(eventSnapshot());

    expect(event).toMatchObject({ status: 'migrated', startCreated: true });
    expect(store.starts).toHaveLength(1);
    expect(store.starts[0]).toMatchObject({
      lapCount: 5,
      lapLengthMeters: 2000,
      legacyEffectiveDistanceM: null,
      formatIds: [1, 2],
    });
  });

  it('blocks an event with no laps and no distance', async () => {
    const { store, event, summary } = await runOne(
      eventSnapshot({ laps: [], distanceKm: null }),
    );

    expect(event).toMatchObject({
      status: 'blocked',
      blockedReasonCode: 'MISSING_DISTANCE',
      startId: null,
    });
    expect(store.starts).toHaveLength(0);
    expect(summary.anomalies).toEqual([
      expect.objectContaining({
        eventId: EVENT_ID,
        registrationId: null,
        reasonCode: 'MISSING_DISTANCE',
      }),
    ]);
  });

  it('blocks an event with no participation formats', async () => {
    const { store, event } = await runOne(eventSnapshot({ formatIds: [] }));

    expect(event).toMatchObject({
      status: 'blocked',
      blockedReasonCode: 'MISSING_FORMATS',
    });
    expect(store.starts).toHaveLength(0);
  });

  it('reports unequal lap lengths on the migrated start', async () => {
    const { summary, store } = await runOne(
      eventSnapshot({
        laps: [lap(1, 2), lap(2, 2.5)],
        distanceKm: 4.5,
      }),
    );

    expect(store.starts[0]).toMatchObject({
      lapCount: 2,
      lapLengthMeters: 2000,
      legacyEffectiveDistanceM: 4500,
    });
    expect(summary.anomalies).toContainEqual(
      expect.objectContaining({
        eventId: EVENT_ID,
        reasonCode: 'UNEQUAL_LAP_LENGTHS',
        startId: store.starts[0].id,
      }),
    );
  });

  it('migrates an active registration without a result as REGISTERED', async () => {
    const { store } = await runOne(
      eventSnapshot({ registrations: [registration({ status: 'CONFIRMED' })] }),
    );

    expect(store.enrollments).toEqual([
      expect.objectContaining({
        registrationId: REGISTRATION_A,
        status: 'REGISTERED',
        formatId: 1,
      }),
    ]);
    expect(store.results).toHaveLength(0);
  });

  it('migrates a cancelled registration without a result as WITHDRAWN', async () => {
    const { store } = await runOne(
      eventSnapshot({ registrations: [registration({ status: 'CANCELLED' })] }),
    );

    expect(store.enrollments[0]).toMatchObject({ status: 'WITHDRAWN' });
    expect(store.results).toHaveLength(0);
  });

  it('preserves an active FINISHED result with time and place', async () => {
    const { store } = await runOne(
      eventSnapshot({
        registrations: [
          registration({
            status: 'REGISTERED',
            result: {
              id: 'legacy-result',
              timeMilliseconds: 3_600_000,
              place: 2,
            },
          }),
        ],
      }),
    );

    expect(store.results).toHaveLength(1);
    expect(store.results[0]).toMatchObject({
      outcome: 'FINISHED',
      timeMilliseconds: 3_600_000,
      place: 2,
      enrollmentId: store.enrollments[0].id,
    });
  });

  it('reports FINISHED_WITHOUT_TIME and creates no result', async () => {
    const { store, summary } = await runOne(
      eventSnapshot({ registrations: [registration({ status: 'FINISHED' })] }),
    );

    expect(store.results).toHaveLength(0);
    expect(store.enrollments[0]).toMatchObject({ status: 'REGISTERED' });
    expect(summary.anomalies).toContainEqual(
      expect.objectContaining({
        eventId: EVENT_ID,
        registrationId: REGISTRATION_A,
        originalRegistrationStatus: 'FINISHED',
        resultOutcome: 'FINISHED',
        reasonCode: 'FINISHED_WITHOUT_TIME',
      }),
    );
  });

  it('keeps a withdrawn legacy result for history and reports it', async () => {
    const { store, summary } = await runOne(
      eventSnapshot({
        registrations: [
          registration({
            status: 'WITHDRAWN',
            result: {
              id: 'legacy-result',
              timeMilliseconds: 3_600_000,
              place: 1,
            },
          }),
        ],
      }),
    );

    expect(store.enrollments[0]).toMatchObject({ status: 'WITHDRAWN' });
    expect(store.results[0]).toMatchObject({
      outcome: 'FINISHED',
      timeMilliseconds: 3_600_000,
    });
    expect(summary.anomalies).toContainEqual(
      expect.objectContaining({
        registrationId: REGISTRATION_A,
        originalRegistrationStatus: 'WITHDRAWN',
        reasonCode: 'WITHDRAWN_WITH_RESULT',
        legacyResultId: 'legacy-result',
      }),
    );
  });

  it('migrates DNS/DNF/DSQ outcomes with null timing', async () => {
    const { store } = await runOne(
      eventSnapshot({
        registrations: [
          registration({ id: REGISTRATION_A, status: 'DNS' }),
          registration({ id: REGISTRATION_B, status: 'DNF' }),
        ],
      }),
    );

    expect(store.results).toEqual([
      expect.objectContaining({
        registrationId: REGISTRATION_A,
        outcome: 'DNS',
        timeMilliseconds: null,
        place: null,
      }),
      expect.objectContaining({
        registrationId: REGISTRATION_B,
        outcome: 'DNF',
        timeMilliseconds: null,
        place: null,
      }),
    ]);
  });

  it('reports a registration format that is not part of the start', async () => {
    const { store, summary } = await runOne(
      eventSnapshot({
        registrations: [registration({ formatId: 999 })],
      }),
    );

    expect(store.enrollments[0]).toMatchObject({ formatId: 1 });
    expect(summary.anomalies).toContainEqual(
      expect.objectContaining({
        registrationId: REGISTRATION_A,
        reasonCode: 'REGISTRATION_FORMAT_NOT_ON_START',
      }),
    );
  });

  it('is idempotent on re-run for the same eventId', async () => {
    const store = new FakeStore();
    store.addEvent(
      eventSnapshot({
        registrations: [
          registration({
            status: 'REGISTERED',
            result: {
              id: 'legacy-result',
              timeMilliseconds: 3_600_000,
              place: 1,
            },
          }),
        ],
      }),
    );

    const first = await runMultiStartCutover(store, {
      eventIds: [EVENT_ID],
    });
    const second = await runMultiStartCutover(store, {
      eventIds: [EVENT_ID],
    });

    expect(store.starts).toHaveLength(1);
    expect(store.enrollments).toHaveLength(1);
    expect(store.results).toHaveLength(1);
    expect(second.events[0]).toMatchObject({
      status: 'migrated',
      startCreated: false,
    });
    expect(second.anomalies).toEqual(first.anomalies);
  });

  it('reports anomalies in the EARS DTO shape', async () => {
    const { summary } = await runOne(
      eventSnapshot({
        registrations: [
          registration({
            status: 'FINISHED',
            result: { id: 'legacy-result', timeMilliseconds: 0, place: null },
          }),
        ],
      }),
    );

    const anomaly = summary.anomalies[0];
    expect(anomaly).toMatchObject({
      eventId: EVENT_ID,
      registrationId: REGISTRATION_A,
      legacyResultId: 'legacy-result',
      originalRegistrationStatus: 'FINISHED',
      resultOutcome: 'FINISHED',
      reasonCode: 'FINISHED_WITHOUT_TIME',
    });
    expect(typeof anomaly.startId).toBe('string');
    expect(typeof anomaly.enrollmentId).toBe('string');
    expect(typeof anomaly.reason).toBe('string');
  });

  it('runs every event when eventIds are not supplied', async () => {
    const store = new FakeStore();
    store.addEvent(eventSnapshot({ id: EVENT_ID }));
    store.addEvent(eventSnapshot({ id: OTHER_EVENT_ID }));

    const summary = await runMultiStartCutover(store);

    expect(summary.events.map((event) => event.eventId)).toEqual([
      EVENT_ID,
      OTHER_EVENT_ID,
    ]);
    expect(store.starts).toHaveLength(2);
  });

  it('merges anomalies from a supplied report without duplicates', async () => {
    const report = new MigrationAnomalyReport();
    const store = new FakeStore();
    store.addEvent(
      eventSnapshot({
        registrations: [
          registration({
            status: 'FINISHED',
            result: { id: 'legacy-result', timeMilliseconds: 0, place: null },
          }),
        ],
      }),
    );

    await runMultiStartCutover(store, { eventIds: [EVENT_ID], report });
    await runMultiStartCutover(store, { eventIds: [EVENT_ID], report });

    expect(report.size).toBe(1);
  });
});
