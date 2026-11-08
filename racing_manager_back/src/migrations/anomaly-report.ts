export type MigrationAnomalyReasonCode =
  | 'MISSING_DISTANCE'
  | 'MISSING_FORMATS'
  | 'UNEQUAL_LAP_LENGTHS'
  | 'FINISHED_WITHOUT_TIME'
  | 'WITHDRAWN_WITH_RESULT'
  | 'REGISTRATION_FORMAT_NOT_ON_START';

export type MigrationAnomalyReportDto = {
  eventId: string;
  registrationId: string | null;
  startId: string | null;
  enrollmentId?: string;
  legacyResultId?: string;
  originalRegistrationStatus: string | null;
  resultOutcome: string | null;
  reasonCode: MigrationAnomalyReasonCode;
  reason: string;
};

export function migrationAnomalyKey(row: {
  eventId: string;
  registrationId: string | null;
  reasonCode: MigrationAnomalyReasonCode;
}): string {
  return `${row.eventId}|${row.registrationId ?? ''}|${row.reasonCode}`;
}

/**
 * Idempotent, per-event anomaly sink. Rows are upserted on
 * `(eventId, registrationId, reasonCode)` so re-running cutover for the same
 * event refreshes a row instead of duplicating it (T4).
 */
export class MigrationAnomalyReport {
  private readonly rows = new Map<string, MigrationAnomalyReportDto>();

  upsert(row: MigrationAnomalyReportDto): void {
    this.rows.set(migrationAnomalyKey(row), row);
  }

  toArray(): MigrationAnomalyReportDto[] {
    return [...this.rows.values()];
  }

  get size(): number {
    return this.rows.size;
  }

  toJson(space = 2): string {
    return JSON.stringify(this.toArray(), null, space);
  }
}
