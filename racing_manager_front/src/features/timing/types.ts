import type { ResultResponse } from '../../shared/types/event';

/**
 * Front mirror of the MANUAL-TIMING HTTP contract.
 *
 * Source of truth: `racing_manager_back/src/timing/timing.views.ts` and
 * `timing.dto.ts`, described by `Tasks/MANUAL-TIMING/ARCHITECTURE.md` §6 and
 * `Tasks/MANUAL-TIMING-2/ARCHITECTURE.md` §6. Dates are ISO-8601 strings and
 * durations are integer milliseconds. No Prisma and no backend runtime types
 * reach this module: only the shapes cross the boundary.
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

/** Participant state on a tile, by the PRD priority. */
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

/** How a capture identified its participant; an anonymous split has none yet. */
export const TIMING_CAPTURE_KINDS = [
  'NUMBER',
  'TILE',
  'PENDING_FINISH',
  'ANONYMOUS_SPLIT',
] as const;

export type TimingCaptureKind = (typeof TIMING_CAPTURE_KINDS)[number];

/** Which lifecycle an attempt follows: a protocol category or one heat. */
export const TIMING_ATTEMPT_KINDS = ['CATEGORY', 'HEAT'] as const;

export type TimingAttemptKind = (typeof TIMING_ATTEMPT_KINDS)[number];

/**
 * Stage state as the surface reports it; a stage whose heats are not formed is
 * `PENDING`.
 */
export const TIMING_STAGE_STATES = ['PENDING', 'SEEDED', 'COMPLETED'] as const;

export type TimingStageState = (typeof TIMING_STAGE_STATES)[number];

/** What an official-time correction moves: the attempt start or one pass. */
export type TimingOfficialTimeTarget = 'START' | 'PASS';

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

/** One published lap split; `cumulativeMs` of the last lap is the total. */
export interface TimingLapSplit {
  lapNumber: number;
  lapTimeMs: number;
  cumulativeMs: number;
}

/** A result the closure published, with its optional split set. */
export interface TimingPublishedResultView extends ResultResponse {
  laps?: TimingLapSplit[];
}

/** The attempt record drawer: passes, closure report, results and audit. */
export interface TimingAttemptRecordView {
  attemptId: string;
  state: TimingAttemptState;
  officialStartedAt: string | null;
  passes: TimingPassView[];
  pendingFinishes: TimingPassView[];
  closureReport: TimingClosureReportView | null;
  publishedResults: TimingPublishedResultView[];
  audit: TimingAuditView[];
}

/** The client's monotonic clock anchor for one attempt and workstation. */
export interface TimingClockEpochView {
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
  epoch: TimingClockEpochView;
}

/** `POST /events/:eventId/timing/attempts` — the Start press. */
export interface StartTimingAttemptRequest {
  startId: string;
  formatId: number;
  gender: TimingGender;
  /** The workstation that pressed Start and must hold the capture lock. */
  workstationInstanceId: string;
  /** Client wall clock of the press, ISO-8601. */
  clientStartedAt: string;
}

/** `POST /events/:eventId/timing/heat-attempts` — the Start press of one heat. */
export interface StartHeatAttemptRequest {
  /** The multi-stage race whose stage heat is timed. */
  classCompetitionId: string;
  /** The CMS stage the heat belongs to; only a `SEEDED` stage starts. */
  stageId: string;
  heatNumber: number;
  /** The workstation that pressed Start and must hold the capture lock. */
  workstationInstanceId: string;
  /** Client wall clock of the press, ISO-8601. */
  clientStartedAt: string;
}

/** `POST /events/:eventId/timing/attempts/:attemptId/clock-epochs`. */
export interface OpenClockEpochRequest {
  workstationInstanceId: string;
}

/** `POST /events/:eventId/timing/passes` — one number, tile, unbound finish or anonymous split. */
export interface CaptureTimingPassRequest {
  attemptId: string;
  /**
   * `ANONYMOUS_SPLIT` sends no participant: `startNumber` and `enrollmentId`
   * stay absent, and the split waits in the queue until it is assigned.
   */
  kind: TimingCaptureKind;
  /** Required for `NUMBER`; absent for `TILE`, `PENDING_FINISH` and `ANONYMOUS_SPLIT`. */
  startNumber?: number;
  /** Required for `TILE`; absent for `NUMBER`, `PENDING_FINISH` and `ANONYMOUS_SPLIT`. */
  enrollmentId?: string;
  /** Client wall clock of the capture, ISO-8601. */
  clientCapturedAt: string;
  /** Raw milliseconds since the epoch anchor; may be zero at the anchor. */
  clientElapsedMs: number;
  clockEpochId: string;
  workstationInstanceId: string;
  /** Monotonic per-workstation capture sequence, starting at 1. */
  deviceSequence: number;
}

/** `POST /events/:eventId/timing/pending-finishes/:pendingFinishId/bind`. */
export interface BindPendingFinishRequest {
  pendingFinishId: string;
  /** Exactly one of `startNumber` and `enrollmentId` is required. */
  startNumber?: number;
  enrollmentId?: string;
  workstationInstanceId: string;
  deviceSequence: number;
}

/** `POST /events/:eventId/timing/pending-finishes/:pendingFinishId/cancel`. */
export interface CancelPendingFinishRequest {
  reason: string;
}

/** `POST /events/:eventId/timing/splits/:splitId/assign` — bind a queued split. */
export interface AssignAnonymousSplitRequest {
  /** Exactly one of `startNumber` and `enrollmentId` is required. */
  startNumber?: number;
  enrollmentId?: string;
  /** The workstation assigning the split; it must hold the capture lock. */
  workstationInstanceId: string;
  deviceSequence: number;
}

/** `POST /events/:eventId/timing/splits/:splitId/cancel`. */
export interface CancelAnonymousSplitRequest {
  reason: string;
}

/** `PATCH /events/:eventId/timing/passes/:passId/official-time`. */
export interface CorrectOfficialTimeRequest {
  targetType: TimingOfficialTimeTarget;
  targetId: string;
  /** The corrected official instant, ISO-8601. */
  officialAt: string;
  reason: string;
}

/** `POST /events/:eventId/timing/passes/:passId/cancel`. */
export interface CancelTimingPassRequest {
  reason: string;
}

/** `POST /events/:eventId/timing/passes/:passId/rebind`. */
export interface RebindTimingPassRequest {
  targetEnrollmentId: string;
  reason: string;
}

/** `POST /events/:eventId/timing/attempts/:attemptId/undo`. */
export interface QuickUndoTimingPassRequest {
  workstationInstanceId: string;
  /** The last sequence this workstation issued and now withdraws. */
  deviceSequence: number;
}

/** `POST /events/:eventId/timing/attempts/:attemptId/complete`. */
export interface CompleteTimingAttemptRequest {
  workstationInstanceId: string;
  /** The highest sequence the workstation issued; zero when it issued none. */
  lastIssuedSequence: number;
}

/** `POST /events/:eventId/timing/attempts/:attemptId/force-complete`. */
export interface ForceCompleteTimingAttemptRequest {
  reason: string;
}

/** `POST /events/:eventId/timing/attempts/:attemptId/cancel`. */
export interface CancelTimingAttemptRequest {
  reason: string;
}

/** `POST /events/:eventId/timing/capture/take`. */
export interface TakeCaptureRequest {
  workstationInstanceId: string;
}

/** `POST /events/:eventId/timing/capture/transfer`. */
export interface TransferCaptureRequest {
  toWorkstationInstanceId: string;
}

/** `POST /events/:eventId/timing/capture/force-release`. */
export interface ForceReleaseCaptureRequest {
  workstationInstanceId: string;
  reason: string;
}
