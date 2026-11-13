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
  'ANONYMOUS_SPLIT',
] as const;

export type TimingCaptureKind = (typeof TIMING_CAPTURE_KINDS)[number];

/** Which lifecycle a timing attempt follows: a protocol category or one heat. */
export const TIMING_ATTEMPT_KINDS = ['CATEGORY', 'HEAT'] as const;

export type TimingAttemptKind = (typeof TIMING_ATTEMPT_KINDS)[number];

/** Stage state as the surface reports it; a stage whose heats are not formed is `PENDING`. */
export const TIMING_STAGE_STATES = ['PENDING', 'SEEDED', 'COMPLETED'] as const;

export type TimingStageState = (typeof TIMING_STAGE_STATES)[number];

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
  /**
   * Which lifecycle the block follows; a block without the field is a category
   * block. A heat block adds the heat fields below.
   */
  kind?: TimingAttemptKind;
  /** Stable collapse identity of the block: category + section + race (AD-20). */
  blockKey?: string;
  /** The multi-stage race a heat block belongs to. */
  classCompetitionId?: string;
  /** The CMS stage a heat block belongs to. */
  stageId?: string;
  /** Human-readable stage name, for example the round of a seeded stage. */
  stageLabel?: string;
  stageState?: TimingStageState;
  /** The heat number inside the stage, ascending in render order. */
  heatNumber?: number;
  /** Human-readable heat name. */
  heatLabel?: string;
}

/** One stage header grouping the heat blocks of a multi-stage race. */
export interface TimingStageGroupView {
  /** Stable collapse identity of the stage header (AD-20). */
  blockKey: string;
  /** The multi-stage race; `classCompetitionId` in the CMS view. */
  raceId: string;
  raceTitle: string;
  stageId: string;
  stageLabel: string;
  stageState: TimingStageState;
  /** `blockKey` of every heat block this header groups, in render order. */
  heatBlockKeys: string[];
  blockReason: string | null;
}

/** One queued anonymous split of the event, oldest capture first. */
export interface TimingAnonymousSplitView {
  splitId: string;
  attemptId: string;
  /** `blockKey` of the attempt's block, so the queue can name it. */
  blockKey: string;
  attemptLabel: string;
  /** The press instant, ISO-8601. */
  capturedAt: string;
  /** Elapsed value since the attempt's own official start, integer milliseconds. */
  officialElapsedMs: number;
  status: 'QUEUED';
}

/** The whole surface of one event: every protocol category plus the lock holder. */
export interface TimingSurfaceView {
  eventId: string;
  captureWorkstationInstanceId: string | null;
  categories: TimingCategoryBlockView[];
  /** Stage headers of every multi-stage race; absent on a category-only surface. */
  stageGroups?: TimingStageGroupView[];
  /** The anonymous split queue; absent on a surface read that predates it. */
  anonymousSplits?: TimingAnonymousSplitView[];
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
  /** Heat closure: registrations that received a heat time. */
  publishedRegistrationIds?: string[];
  /** Heat closure: registrations that already gained a heat time elsewhere. */
  conflictRegistrationIds?: string[];
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
