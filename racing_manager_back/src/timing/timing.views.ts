import type { RoleCode } from '../auth/role-codes';
import type { ResultResponse } from '../results/results.service';

/**
 * Response-only MANUAL-TIMING shapes, mirroring `ARCHITECTURE.md` §6.
 *
 * No decorators, no Prisma and no Nest types: a view is what the controller
 * returns and what `racing_manager_front/src/features/timing/types.ts` mirrors.
 * New fields stay optional so an older client keeps working.
 */

/** The two protocol genders one attempt covers. */
export const TIMING_GENDERS = ['M', 'F'] as const;

export type TimingGender = (typeof TIMING_GENDERS)[number];

/** Category state, and the state of its newest attempt; `NOT_STARTED` has none. */
export const TIMING_CATEGORY_STATES = [
  'NOT_STARTED',
  'RUNNING',
  'COMPLETED',
  'INCOMPLETE',
  'CANCELLED',
] as const;

export type TimingCategoryState = (typeof TIMING_CATEGORY_STATES)[number];

/** Attempt state once an attempt exists; a category without one is `NOT_STARTED`. */
export const TIMING_ATTEMPT_STATES = [
  'RUNNING',
  'COMPLETED',
  'INCOMPLETE',
  'CANCELLED',
] as const;

export type TimingAttemptState = (typeof TIMING_ATTEMPT_STATES)[number];

/** Participant state on a tile, by PRD §2.4 priority. */
export const TIMING_PARTICIPANT_TILE_STATES = [
  'WAITING',
  'RACING',
  'RECORDED',
  'INCOMPLETE',
  'EXCLUDED',
] as const;

export type TimingParticipantTileState =
  (typeof TIMING_PARTICIPANT_TILE_STATES)[number];

/** Pass state: an official value, an unbound finish, or a withdrawn pass. */
export const TIMING_PASS_STATUSES = ['BOUND', 'PENDING', 'CANCELLED'] as const;

export type TimingPassStatus = (typeof TIMING_PASS_STATUSES)[number];

/** How a capture identified its participant. */
export const TIMING_CAPTURE_KINDS = [
  'NUMBER',
  'TILE',
  'PENDING_FINISH',
] as const;

export type TimingCaptureKind = (typeof TIMING_CAPTURE_KINDS)[number];

/** A role code the user-roles view may report. */

/** One category block of the event-wide timing surface. */
export interface TimingCategoryBlockView {
  startId: string;
  formatId: number;
  gender: TimingGender;
  state: TimingCategoryState;
  lapCount: number;
  attemptId: string | null;
  officialStartedAt: string | null;
  elapsedMs: number | null;
  startControlEnabled: boolean;
  blockReason: string | null;
  participants: TimingParticipantTileView[];
  pendingFinishes: TimingPassView[];
  lastAttempts: TimingAttemptRef[];
}

/** The whole surface of one event: every protocol category plus the lock holder. */
export interface TimingSurfaceView {
  eventId: string;
  captureWorkstationInstanceId: string | null;
  categories: TimingCategoryBlockView[];
}

/** One participant tile: the frozen roster facts and the live capture state. */
export interface TimingParticipantTileView {
  enrollmentId: string;
  registrationId: string;
  startNumber: number;
  fullName: string;
  sectionId: string;
  passCount: number;
  requiredLaps: number;
  lastPassAt: string | null;
  state: TimingParticipantTileState;
  excludedReason: string | null;
}

/** One pass or unbound finish; `passId` is the mark id. */
export interface TimingPassView {
  passId: string;
  attemptId: string;
  enrollmentId: string | null;
  lapNumber: number | null;
  rawCapturedAt: string;
  officialAt: string;
  officialElapsedMs: number;
  status: TimingPassStatus;
}

/** A pointer to one earlier attempt of the same category. */
export interface TimingAttemptRef {
  attemptId: string;
  state: TimingAttemptState;
  officialStartedAt: string | null;
}

/** The closure report frozen on the closed attempt. */
export interface TimingClosureReportView {
  publishedEnrollmentIds: string[];
  unpublishedEnrollmentIds: string[];
  conflictEnrollmentIds: string[];
}

/** One append-only audit row of the attempt. */
export interface TimingAuditView {
  auditId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

/** The attempt record drawer: passes, closure report, results and audit. */
export interface TimingAttemptRecordView {
  attemptId: string;
  state: TimingAttemptState;
  officialStartedAt: string | null;
  passes: TimingPassView[];
  pendingFinishes: TimingPassView[];
  closureReport: TimingClosureReportView | null;
  publishedResults: ResultResponse[];
  audit: TimingAuditView[];
}

/** The client's monotonic clock anchor for one attempt and workstation. */
export interface ClockEpochView {
  epochId: string;
  attemptId: string;
  officialElapsedAnchorMs: number;
  serverNow: string;
}

/** Who holds the event-wide capture lock, if anyone. */
export interface TimingCaptureView {
  eventId: string;
  workstationInstanceId: string | null;
  heldByUserId: string | null;
  heldAt: string | null;
}

/** A Start press answers with the fresh block and the epoch it anchors. */
export interface StartTimingAttemptResult {
  attempt: TimingCategoryBlockView;
  epoch: ClockEpochView;
}

/** One published lap split; `cumulativeMs` of the last lap is the total. */
export interface TimingLapSplitDto {
  lapNumber: number;
  lapTimeMs: number;
  cumulativeMs: number;
}

/** The roles the admin route reports after a grant or a revoke. */
export interface UserRolesView {
  userId: string;
  roles: RoleCode[];
}
