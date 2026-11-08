import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import {
  MigrationAnomalyReport,
  MigrationAnomalyReportDto,
  MigrationAnomalyReasonCode,
} from './anomaly-report';

export type ResultOutcomeCode = 'FINISHED' | 'DNS' | 'DNF' | 'DSQ';
export type EnrollmentStatusCode = 'REGISTERED' | 'WITHDRAWN';

const CANCELLED_REGISTRATION_STATUSES = new Set(['CANCELLED', 'WITHDRAWN']);
const RACE_OUTCOME_STATUSES = new Set<ResultOutcomeCode>([
  'FINISHED',
  'DNS',
  'DNF',
  'DSQ',
]);

export type LegacyLap = { lapNumber: number; distanceKm: number };

export type LegacyResult = {
  id: string;
  timeMilliseconds: number | null;
  place: number | null;
};

export type LegacyRegistration = {
  id: string;
  status: string;
  formatId: number | null;
  result: LegacyResult | null;
};

export type CutoverEventSnapshot = {
  id: string;
  distanceKm: number | null;
  laps: LegacyLap[];
  formatIds: number[];
  starts: { id: string; sortOrder: number }[];
  registrations: LegacyRegistration[];
};

export type CutoverEnrollmentInput = {
  eventId: string;
  registrationId: string;
  startId: string;
  formatId: number;
  status: EnrollmentStatusCode;
};

export type CutoverResultInput = {
  registrationId: string;
  enrollmentId: string;
  outcome: ResultOutcomeCode;
  timeMilliseconds: number | null;
  place: number | null;
};

export type CutoverStartInput = {
  eventId: string;
  lapCount: number;
  lapLengthMeters: number;
  legacyEffectiveDistanceM: number | null;
  formatIds: number[];
};

export interface CutoverTransaction {
  loadEvent(eventId: string): Promise<CutoverEventSnapshot | null>;
  createStart(input: CutoverStartInput): Promise<{ id: string }>;
  upsertEnrollment(input: CutoverEnrollmentInput): Promise<{ id: string }>;
  upsertResult(input: CutoverResultInput): Promise<void>;
}

export interface CutoverStore {
  listEventIds(): Promise<string[]>;
  transaction<T>(work: (tx: CutoverTransaction) => Promise<T>): Promise<T>;
}

export type ResolvedStartDistance = {
  ok: true;
  lapCount: number;
  lapLengthMeters: number;
  legacyEffectiveDistanceM: number | null;
  unequalLapLengths: boolean;
};

export type BlockedStartDistance = {
  ok: false;
  reasonCode: 'MISSING_DISTANCE';
  reason: string;
};

export function kmToMeters(km: number): number {
  return Math.round(km * 1000);
}

/**
 * Legacy distance migration table (EARS "Legacy distance migration").
 * Preserves stored lap count/length and only records an override when the
 * legacy `distanceKm` disagrees with lapCount × lapLength.
 */
export function resolveStartDistance(
  laps: LegacyLap[],
  distanceKm: number | null,
): ResolvedStartDistance | BlockedStartDistance {
  const legacyEffectiveDistanceM =
    distanceKm === null ? null : kmToMeters(distanceKm);

  if (laps.length === 0) {
    if (legacyEffectiveDistanceM === null || legacyEffectiveDistanceM <= 0) {
      return {
        ok: false,
        reasonCode: 'MISSING_DISTANCE',
        reason:
          'Event has no laps and no positive distanceKm; cannot invent a positive lap setup.',
      };
    }
    return {
      ok: true,
      lapCount: 1,
      lapLengthMeters: legacyEffectiveDistanceM,
      legacyEffectiveDistanceM: null,
      unequalLapLengths: false,
    };
  }

  const lapLengthMeters = kmToMeters(laps[0].distanceKm);
  if (lapLengthMeters <= 0) {
    return {
      ok: false,
      reasonCode: 'MISSING_DISTANCE',
      reason:
        'First legacy lap has a non-positive distanceKm; cannot persist a positive lap length.',
    };
  }

  const lapCount = laps.length;
  const derivedDistanceM = lapCount * lapLengthMeters;
  const override =
    legacyEffectiveDistanceM !== null &&
    legacyEffectiveDistanceM !== derivedDistanceM
      ? legacyEffectiveDistanceM
      : null;
  const distinctLengths = new Set(
    laps.map((lap) => kmToMeters(lap.distanceKm)),
  );

  return {
    ok: true,
    lapCount,
    lapLengthMeters,
    legacyEffectiveDistanceM: override,
    unequalLapLengths: distinctLengths.size > 1,
  };
}

export function resolveEnrollmentStatus(
  registrationStatus: string,
): EnrollmentStatusCode {
  return CANCELLED_REGISTRATION_STATUSES.has(registrationStatus)
    ? 'WITHDRAWN'
    : 'REGISTERED';
}

export function resolveLegacyOutcome(
  registrationStatus: string,
  hasLegacyResult: boolean,
): ResultOutcomeCode | null {
  if (RACE_OUTCOME_STATUSES.has(registrationStatus as ResultOutcomeCode)) {
    return registrationStatus as ResultOutcomeCode;
  }
  return hasLegacyResult ? 'FINISHED' : null;
}

export type CutoverEventStatus = 'migrated' | 'blocked';

export type CutoverEventResult = {
  eventId: string;
  status: CutoverEventStatus;
  startId: string | null;
  startCreated: boolean;
  blockedReasonCode?: MigrationAnomalyReasonCode;
  blockedReason?: string;
};

export type CutoverRunSummary = {
  events: CutoverEventResult[];
  anomalies: MigrationAnomalyReportDto[];
};

export type CutoverRunOptions = {
  eventIds?: string[];
  report?: MigrationAnomalyReport;
};

/**
 * Idempotent per-`eventId` cutover (T4). One transaction per event: either the
 * event is fully migrated or nothing is written. Re-running the same event
 * reuses its existing start and upserts enrollments/results.
 */
export async function runMultiStartCutover(
  store: CutoverStore,
  options: CutoverRunOptions = {},
): Promise<CutoverRunSummary> {
  const report = options.report ?? new MigrationAnomalyReport();
  const eventIds = options.eventIds ?? (await store.listEventIds());
  const events: CutoverEventResult[] = [];

  for (const eventId of eventIds) {
    const eventReport = new MigrationAnomalyReport();
    const result = await store.transaction(async (tx) => {
      const snapshot = await tx.loadEvent(eventId);
      if (!snapshot) {
        throw new Error(`Event ${eventId} not found.`);
      }
      return migrateEvent(tx, snapshot, eventReport);
    });
    for (const row of eventReport.toArray()) {
      report.upsert(row);
    }
    events.push(result);
  }

  return { events, anomalies: report.toArray() };
}

async function migrateEvent(
  tx: CutoverTransaction,
  event: CutoverEventSnapshot,
  report: MigrationAnomalyReport,
): Promise<CutoverEventResult> {
  const distance = resolveStartDistance(event.laps, event.distanceKm);
  if (!distance.ok) {
    report.upsert({
      eventId: event.id,
      registrationId: null,
      startId: null,
      originalRegistrationStatus: null,
      resultOutcome: null,
      reasonCode: distance.reasonCode,
      reason: distance.reason,
    });
    return {
      eventId: event.id,
      status: 'blocked',
      startId: null,
      startCreated: false,
      blockedReasonCode: distance.reasonCode,
      blockedReason: distance.reason,
    };
  }

  if (event.formatIds.length === 0) {
    const reason =
      'Event has no participation formats; a start requires a non-empty format set.';
    report.upsert({
      eventId: event.id,
      registrationId: null,
      startId: null,
      originalRegistrationStatus: null,
      resultOutcome: null,
      reasonCode: 'MISSING_FORMATS',
      reason,
    });
    return {
      eventId: event.id,
      status: 'blocked',
      startId: null,
      startCreated: false,
      blockedReasonCode: 'MISSING_FORMATS',
      blockedReason: reason,
    };
  }

  const existingStart = [...event.starts].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )[0];
  const start = existingStart
    ? { id: existingStart.id, created: false }
    : {
        id: (
          await tx.createStart({
            eventId: event.id,
            lapCount: distance.lapCount,
            lapLengthMeters: distance.lapLengthMeters,
            legacyEffectiveDistanceM: distance.legacyEffectiveDistanceM,
            formatIds: event.formatIds,
          })
        ).id,
        created: true,
      };

  if (distance.unequalLapLengths) {
    report.upsert({
      eventId: event.id,
      registrationId: null,
      startId: start.id,
      originalRegistrationStatus: null,
      resultOutcome: null,
      reasonCode: 'UNEQUAL_LAP_LENGTHS',
      reason:
        'Legacy event has per-lap distances that differ; migrates the first lap length and keeps the override rules.',
    });
  }

  for (const registration of event.registrations) {
    const enrollmentStatus = resolveEnrollmentStatus(registration.status);
    const formatId = resolveEnrollmentFormat(
      event.id,
      registration,
      event.formatIds,
      start.id,
      report,
    );

    const enrollment = await tx.upsertEnrollment({
      eventId: event.id,
      registrationId: registration.id,
      startId: start.id,
      formatId,
      status: enrollmentStatus,
    });

    if (enrollmentStatus === 'WITHDRAWN' && registration.result) {
      report.upsert({
        eventId: event.id,
        registrationId: registration.id,
        startId: start.id,
        enrollmentId: enrollment.id,
        legacyResultId: registration.result.id,
        originalRegistrationStatus: registration.status,
        resultOutcome: resolveLegacyOutcome(registration.status, true),
        reasonCode: 'WITHDRAWN_WITH_RESULT',
        reason:
          'Cancelled/withdrawn registration still has a legacy Result; kept for history only and excluded from active protocol.',
      });
    }

    const outcome = resolveLegacyOutcome(
      registration.status,
      registration.result !== null,
    );
    if (outcome === null) {
      continue;
    }

    if (outcome === 'FINISHED') {
      const timeMilliseconds = registration.result?.timeMilliseconds ?? null;
      if (timeMilliseconds === null || timeMilliseconds <= 0) {
        report.upsert({
          eventId: event.id,
          registrationId: registration.id,
          startId: start.id,
          enrollmentId: enrollment.id,
          legacyResultId: registration.result?.id,
          originalRegistrationStatus: registration.status,
          resultOutcome: 'FINISHED',
          reasonCode: 'FINISHED_WITHOUT_TIME',
          reason:
            'Legacy FINISHED registration has no positive result time; no FINISHED Result is created.',
        });
        continue;
      }
      await tx.upsertResult({
        registrationId: registration.id,
        enrollmentId: enrollment.id,
        outcome: 'FINISHED',
        timeMilliseconds,
        place: registration.result?.place ?? null,
      });
      continue;
    }

    await tx.upsertResult({
      registrationId: registration.id,
      enrollmentId: enrollment.id,
      outcome,
      timeMilliseconds: null,
      place: null,
    });
  }

  return {
    eventId: event.id,
    status: 'migrated',
    startId: start.id,
    startCreated: start.created,
  };
}

function resolveEnrollmentFormat(
  eventId: string,
  registration: LegacyRegistration,
  formatIds: number[],
  startId: string,
  report: MigrationAnomalyReport,
): number {
  const fallback = formatIds[0];
  if (registration.formatId === null) {
    return fallback;
  }
  if (formatIds.includes(registration.formatId)) {
    return registration.formatId;
  }
  report.upsert({
    eventId,
    registrationId: registration.id,
    startId,
    legacyResultId: registration.result?.id,
    originalRegistrationStatus: registration.status,
    resultOutcome: null,
    reasonCode: 'REGISTRATION_FORMAT_NOT_ON_START',
    reason:
      'Legacy registration format is not part of the event format set; the start default format is used.',
  });
  return fallback;
}

/**
 * Prisma-backed store for the cutover runner. Result upserts use SQL because
 * the expand-phase Prisma client types `time_milliseconds` as non-null while
 * non-FINISHED outcomes require null timing after the T7 contract migration.
 */
export function createPrismaCutoverStore(prisma: PrismaService): CutoverStore {
  return {
    async listEventIds() {
      const rows = await prisma.event.findMany({
        select: { id: true },
        orderBy: { eventDate: 'asc' },
      });
      return rows.map((row) => row.id);
    },
    async transaction<T>(work: (tx: CutoverTransaction) => Promise<T>) {
      return prisma.$transaction(async (tx) => {
        const adapter = createPrismaTransaction(tx);
        return work(adapter);
      });
    },
  };
}

function createPrismaTransaction(
  tx: Prisma.TransactionClient,
): CutoverTransaction {
  return {
    async loadEvent(eventId) {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          distanceKm: true,
          laps: {
            select: { lapNumber: true, distanceKm: true },
            orderBy: { lapNumber: 'asc' },
          },
          eventFormats: { select: { formatId: true } },
          starts: {
            select: { id: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
          },
          registrations: {
            select: {
              id: true,
              status: true,
              formatId: true,
              result: {
                select: { id: true, timeMilliseconds: true, place: true },
              },
            },
          },
        },
      });
      if (!event) {
        return null;
      }
      return {
        id: event.id,
        distanceKm: event.distanceKm === null ? null : Number(event.distanceKm),
        laps: event.laps.map((lap) => ({
          lapNumber: lap.lapNumber,
          distanceKm: Number(lap.distanceKm),
        })),
        formatIds: event.eventFormats.map((row) => row.formatId),
        starts: event.starts,
        registrations: event.registrations.map((registration) => ({
          id: registration.id,
          status: registration.status,
          formatId: registration.formatId,
          result: registration.result,
        })),
      };
    },
    async createStart(input) {
      const start = await tx.start.create({
        data: {
          eventId: input.eventId,
          purposeType: 'CUP_RACE',
          lapCount: input.lapCount,
          lapLengthMeters: input.lapLengthMeters,
          displayName: null,
          sortOrder: 0,
          legacyEffectiveDistanceM: input.legacyEffectiveDistanceM,
          formats: {
            create: input.formatIds.map((formatId) => ({ formatId })),
          },
        },
        select: { id: true },
      });
      return { id: start.id };
    },
    async upsertEnrollment(input) {
      const enrollment = await tx.enrollment.upsert({
        where: {
          registrationId_startId: {
            registrationId: input.registrationId,
            startId: input.startId,
          },
        },
        create: {
          eventId: input.eventId,
          registrationId: input.registrationId,
          startId: input.startId,
          formatId: input.formatId,
          status: input.status,
        },
        update: {
          formatId: input.formatId,
          status: input.status,
        },
        select: { id: true },
      });
      return { id: enrollment.id };
    },
    async upsertResult(input) {
      if (input.timeMilliseconds === null) {
        await assertNullableResultTiming(tx);
      }

      // A pre-cutover Result is keyed by registration_id and has no
      // enrollment_id. Adopt that row first; the contract patch drops the
      // registration_id uniqueness, so ON CONFLICT must target enrollment_id.
      const legacy = await tx.result.findFirst({
        where: {
          registrationId: input.registrationId,
          enrollmentId: null,
        },
        select: { id: true },
      });
      if (legacy) {
        await tx.$executeRaw`
          UPDATE results SET
            enrollment_id = ${input.enrollmentId}::uuid,
            outcome = ${input.outcome}::result_outcome,
            time_milliseconds = ${input.timeMilliseconds},
            place = ${input.place},
            updated_at = now()
          WHERE id = ${legacy.id}::uuid
        `;
        return;
      }

      await tx.$executeRaw`
        INSERT INTO results (
          registration_id,
          enrollment_id,
          outcome,
          time_milliseconds,
          place
        )
        VALUES (
          ${input.registrationId}::uuid,
          ${input.enrollmentId}::uuid,
          ${input.outcome}::result_outcome,
          ${input.timeMilliseconds},
          ${input.place}
        )
        ON CONFLICT (enrollment_id) DO UPDATE SET
          outcome = EXCLUDED.outcome,
          time_milliseconds = EXCLUDED.time_milliseconds,
          place = EXCLUDED.place
      `;
    },
  };
}

async function assertNullableResultTiming(
  tx: Prisma.TransactionClient,
): Promise<void> {
  const rows = await tx.$queryRaw<{ is_nullable: string }[]>`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_name = 'results' AND column_name = 'time_milliseconds'
  `;
  if (rows[0]?.is_nullable !== 'YES') {
    throw new Error(
      'results.time_milliseconds is NOT NULL. Apply the T7 result timing contract migration before cutover: non-FINISHED outcomes require null timing.',
    );
  }
}
