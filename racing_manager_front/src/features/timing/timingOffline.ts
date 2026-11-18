/**
 * The device outbox as the referee sees it, derived and never stored.
 *
 * MANUAL-TIMING-4 reports the captures the device has recorded but the server
 * has not answered yet. No server read model carries that fact (AS-2), so this
 * module turns the existing `TimingQueueItem[]` outbox plus the latest
 * `TimingSurfaceView` into the page's views:
 *
 * - the send-queue rows of the unsent and the rejected entries (FR-12);
 * - the pending marks of each participant tile and each block (FR-07, FR-10,
 *   FR-37);
 * - the page totals «Не отправлено: N», «Отправляется: K», «Ожидают отправки: K»
 *   and «из них отметок: K» (FR-11, FR-32, FR-46).
 *
 * Rules the derivation keeps, all of them accepted product facts:
 *
 * - One entry is one capture: two presses are two marks and are never merged
 *   (U-02, FR-04).
 * - An entry the server has not answered adds one mark; an anonymous split, an
 *   unbound finish capture and a withdrawal add none (FR-38).
 * - A split assignment and a pending-finish bind add their mark to the target
 *   participant's tile and block (FR-37).
 * - A capture and its withdrawal that are both unsent are one withdrawn press:
 *   no mark, no tile or block marker, both rows adjacent in capture order, and
 *   both still counted in the entry total (FR-39).
 * - A withdrawal of a capture the server already confirmed retires one
 *   confirmed lap. It is reported as a separate derived fact and never as a
 *   lowered confirmed count, because the tile shows the server's count (FR-41).
 * - A rejected entry is listed with its server reason and is never unsent.
 * - An unsent entry whose delivery is in flight is marked `SENT` and reported as
 *   sending; the entries still waiting as recorded are `PENDING`. The two
 *   figures are counted from the same rows as the entry list, so a row and the
 *   page total can never disagree (S-01, S-04).
 *
 * The page figure «из них отметок» is the sum of the tile marks, so the two can
 * never disagree (U-08). Everything here is display-only: nothing is written
 * back to the surface, a pass, a split or a result. The figures count entries,
 * never marks.
 *
 * The function is pure and framework-free. It never fetches, never reads
 * storage and never sorts its input in place.
 */

import type {
  TimingMutationOperation,
  TimingMutationStatus,
  TimingQueueItem,
} from './timingQueue';
import type {
  TimingCaptureKind,
  TimingCategoryBlockView,
  TimingParticipantTileView,
  TimingSurfaceView,
} from './types';

/** What one send-queue row is: a capture kind, or the outbox operation. */
export const TIMING_OFFLINE_ENTRY_KINDS = [
  'NUMBER',
  'TILE',
  'PENDING_FINISH',
  'ANONYMOUS_SPLIT',
  'PASS',
  'BIND',
  'UNDO',
  'ANONYMOUS_ASSIGN',
  'START',
] as const;

export type TimingOfflineEntryKind = (typeof TIMING_OFFLINE_ENTRY_KINDS)[number];

/** The row labels of the send queue, in the page language. */
export const TIMING_OFFLINE_ENTRY_KIND_LABELS: Record<
  TimingOfflineEntryKind,
  string
> = {
  NUMBER: 'Отметка по номеру',
  TILE: 'Отметка по плитке',
  PENDING_FINISH: 'Непривязанный финиш',
  ANONYMOUS_SPLIT: 'Отсечка без номера',
  PASS: 'Отметка',
  BIND: 'Привязка финиша',
  UNDO: 'Отмена отметки',
  ANONYMOUS_ASSIGN: 'Присвоение отсечки',
  START: 'Старт категории',
};

/**
 * The states the send queue lists: the entries the server has not answered
 * (`PENDING`, `SENT`) and the refusals. An `APPLIED` entry is confirmed and
 * stays out of every derived view.
 */
export type TimingOfflineEntryStatus = Extract<
  TimingMutationStatus,
  'PENDING' | 'SENT' | 'REJECTED'
>;

/** How one queue entry relates to the other half of a capture/withdrawal pair. */
export type TimingOfflinePairRole = 'CAPTURE' | 'WITHDRAWAL';

/** The capture an unsent withdrawal retires. */
export interface TimingOfflineWithdrawalTargetView {
  /** The outbox id of the capture, when the outbox still holds it. */
  entryId: string | null;
  startNumber: number | null;
  fullName: string | null;
  blockKey: string | null;
  /** The server already confirmed the capture, so this withdrawal retires a lap. */
  confirmed: boolean;
}

/** One row of the send queue: an unsent or a rejected entry. */
export interface TimingOfflineEntryView {
  /** The outbox id, which is also the request's idempotency key. */
  id: string;
  kind: TimingOfflineEntryKind;
  /** The row label of `kind`. */
  kindLabel: string;
  operation: TimingMutationOperation;
  status: TimingOfflineEntryStatus;
  /** The server has not answered this entry yet. */
  unsent: boolean;
  /** The server refused this entry; `reason` carries its message. */
  rejected: boolean;
  /** The outbox holds an in-flight delivery for this entry (status `SENT`). */
  isSending: boolean;
  /**
   * The press instant, ISO-8601. An assignment shows the instant of the split it
   * binds; a withdrawal or a bind carries no press of its own and falls back to
   * the moment it entered the outbox.
   */
  pressTime: string;
  attemptId: string | null;
  /** The block the row belongs to, whenever the entry names an attempt. */
  blockKey: string | null;
  enrollmentId: string | null;
  startNumber: number | null;
  fullName: string | null;
  sectionId: string | null;
  /** The marks this entry adds to a tile while it is unsent: 0 or 1. */
  pendingMarks: number;
  /** The confirmed laps this unsent withdrawal retires: 0 or 1. */
  confirmedLapsRetired: number;
  /** The capture a withdrawal retires; `null` for every other kind. */
  withdraws: TimingOfflineWithdrawalTargetView | null;
  /** Stable id of the capture/withdrawal pair this row belongs to. */
  pairId: string | null;
  pairRole: TimingOfflinePairRole | null;
  /** The server's refusal message, verbatim, or `null`. */
  reason: string | null;
  /** The outbox sequence of the capture, when the entry has one. */
  deviceSequence: number;
  /** The attempt that anchored a local split's clock, when recorded. */
  localAnchorAttemptId: string | null;
  /** The raw elapsed value carried by the capture payload, when present. */
  elapsedMs: number | null;
  /** The split capture sequence an assignment names, when present. */
  captureDeviceSequence: number | null;
}

/** The pending marks of one participant tile. */
export interface TimingOfflineParticipantMarksView {
  blockKey: string;
  attemptId: string | null;
  enrollmentId: string;
  startNumber: number;
  fullName: string;
  /** The server's confirmed count, unchanged (FR-41 shows it as it is). */
  confirmedPassCount: number;
  /** Unsent marks this tile shows. */
  pendingMarks: number;
  /** Confirmed laps an unsent withdrawal will retire from this tile. */
  confirmedLapsRetiring: number;
}

/** The pending marks of one block header. */
export interface TimingOfflineBlockMarksView {
  blockKey: string;
  attemptId: string | null;
  pendingMarks: number;
  confirmedLapsRetiring: number;
}

/** The page figures of the offline outbox. */
export interface TimingOfflineTotalsView {
  /** One per unsent entry of every kind («Не отправлено: N»). */
  unsentEntries: number;
  /**
   * The unsent entries with an outstanding delivery («Отправляется: K»). A
   * sending entry is a figure, not a send-queue row (S-01, S-02).
   */
  sendingEntries: number;
  /** The unsent entries still waiting as recorded («Ожидают отправки: K»). */
  waitingEntries: number;
  unsentByKind: Record<TimingOfflineEntryKind, number>;
  /** The sum of the tile marks, so the page and the tiles agree (U-08). */
  pendingMarks: number;
  /**
   * Marks of unsent entries whose participant the surface no longer holds. They
   * stay listed as unsent but cannot be shown on a tile.
   */
  unattributedPendingMarks: number;
  /** Every unsent withdrawal of a confirmed capture. */
  confirmedLapsRetiring: number;
  rejectedEntries: number;
  hasUnsent: boolean;
  hasRejected: boolean;
}

/** Everything the timing page derives from the outbox of one device. */
export interface TimingOfflineView {
  /** Every unsent and rejected entry, capture order, pairs kept adjacent. */
  entries: TimingOfflineEntryView[];
  /** The unsent rows of `entries`. */
  unsentEntries: TimingOfflineEntryView[];
  /** The rejected rows of `entries`. */
  rejectedEntries: TimingOfflineEntryView[];
  /** Tiles with at least one unsent effect, in surface order. */
  participantMarks: TimingOfflineParticipantMarksView[];
  /** Blocks with at least one unsent effect, in surface order. */
  blockMarks: TimingOfflineBlockMarksView[];
  totals: TimingOfflineTotalsView;
}

/** One participant row of the surface, with the block it is rendered in. */
interface SurfaceParticipantRow {
  participant: TimingParticipantTileView;
  blockKey: string;
  attemptId: string | null;
  blockState: TimingCategoryBlockView['state'];
  /** Position in surface order, so resolution never depends on hashing. */
  order: number;
}

/** One block of the surface, with the identity the page renders by. */
interface SurfaceBlockRow {
  block: TimingCategoryBlockView;
  blockKey: string;
  attemptId: string | null;
  index: number;
}

/** A queue item with the facts the derivation reads out of its payload. */
interface QueuedEntry {
  item: TimingQueueItem;
  kind: TimingOfflineEntryKind;
  attemptId: string | null;
  /** The block the entry belongs to; filled once the surface is searched. */
  blockKey: string | null;
  enrollmentId: string | null;
  startNumber: number | null;
  /** The entry adds a mark to a tile while it is unsent and unpaired. */
  addsMark: boolean;
  pressTime: string;
  /** The tile the entry belongs to, when the surface still holds it. */
  location: SurfaceParticipantRow | undefined;
}

/** What one entry does to the display, whatever its kind. */
interface EntryEffect {
  pendingMarks: number;
  confirmedLapsRetired: number;
}

interface ListedRow {
  record: QueuedEntry;
  status: TimingOfflineEntryStatus;
  effect: EntryEffect;
}

interface TileTotal {
  location: SurfaceParticipantRow;
  pendingMarks: number;
  confirmedLapsRetiring: number;
}

interface BlockTotal {
  blockKey: string;
  attemptId: string | null;
  index: number;
  pendingMarks: number;
  confirmedLapsRetiring: number;
}

/**
 * The stable identity of one block on the surface: the API's `blockKey` when it
 * is present, otherwise the same fallback the timing page renders by.
 */
export function timingOfflineBlockKey(block: TimingCategoryBlockView): string {
  if (block.blockKey !== undefined) return block.blockKey;
  if (block.kind === 'HEAT') {
    return `heat:${block.classCompetitionId ?? block.startId}:${
      block.stageId ?? ''
    }:${String(block.heatNumber ?? 0)}`;
  }
  return `${block.startId}:${block.formatId}:${block.gender}`;
}

/**
 * Derives the offline views of one device.
 *
 * @param items The outbox of the device; order does not matter and the input is
 *   not mutated. Applied entries may be present and are ignored.
 * @param surface The latest surface read; it supplies block identity, the
 *   participant name of a capture, and the press clock of an assignment.
 */
export function deriveTimingOfflineView(
  items: readonly TimingQueueItem[],
  surface: TimingSurfaceView,
): TimingOfflineView {
  const blocks = indexBlocks(surface);
  const participants = indexParticipants(blocks);
  const splitPressTimes = indexSplitPressTimes(surface);

  // Capture order: the order the outbox replays in, derived from the same key
  // the queue sorts by.
  const records = [...items]
    // A refused Start is kept only as the tombstone of its invalid clock epoch;
    // its refusal was reported once and it is not a queue row (AD-11).
    .filter((item) => !(item.operation === 'START' && item.status === 'REJECTED'))
    .sort(compareQueueItems)
    .map((item) => describeEntry(item, splitPressTimes));

  // A withdrawal retires the newest capture of its own attempt and workstation
  // that is not withdrawn yet, exactly as the accepted quick undo applies.
  const withdrawalOf = new Map<string, QueuedEntry>();
  const withdrawnBy = new Map<string, QueuedEntry>();
  const openCaptures = new Map<string, QueuedEntry[]>();
  for (const record of records) {
    const scope = `${record.item.attemptId}:${record.item.workstationInstanceId}`;
    if (record.item.operation === 'PASS') {
      const stack = openCaptures.get(scope) ?? [];
      stack.push(record);
      openCaptures.set(scope, stack);
      continue;
    }
    if (record.item.operation !== 'UNDO') continue;
    const capture = openCaptures.get(scope)?.pop();
    if (capture === undefined) continue;
    withdrawalOf.set(record.item.id, capture);
    withdrawnBy.set(capture.item.id, record);
  }

  for (const record of records) {
    record.location = locateParticipant(
      participants,
      record.attemptId,
      record.enrollmentId,
      record.startNumber,
    );
    record.blockKey =
      record.location?.blockKey ??
      blockKeyOfAttempt(blocks, record.attemptId);
  }

  // A withdrawal names the capture it retires, so its row carries that
  // capture's participant and block.
  for (const record of records) {
    if (record.kind !== 'UNDO') continue;
    const capture = withdrawalOf.get(record.item.id);
    if (capture === undefined) continue;
    record.location = capture.location;
    record.blockKey = capture.blockKey;
    record.enrollmentId =
      capture.enrollmentId ??
      capture.location?.participant.enrollmentId ??
      null;
    record.startNumber =
      capture.startNumber ??
      capture.location?.participant.startNumber ??
      null;
  }

  const listed: ListedRow[] = [];
  for (const record of records) {
    const status = record.item.status;
    if (!isListedStatus(status)) continue;
    listed.push({
      record,
      status,
      effect: entryEffect(record, withdrawalOf, withdrawnBy),
    });
  }

  const rowById = new Map(listed.map((row) => [row.record.item.id, row]));
  const entries: TimingOfflineEntryView[] = [];
  const emitted = new Set<string>();
  for (const row of listed) {
    if (emitted.has(row.record.item.id)) continue;
    for (const member of pairOrder(
      row,
      withdrawalOf,
      withdrawnBy,
      rowById,
    )) {
      if (emitted.has(member.record.item.id)) continue;
      emitted.add(member.record.item.id);
      entries.push(
        toEntryView(
          member,
          withdrawalOf.get(member.record.item.id),
          withdrawnBy.get(member.record.item.id),
        ),
      );
    }
  }

  const unsentByKind = emptyKindCounts();
  const tiles = new Map<string, TileTotal>();
  const blockTotals = new Map<string, BlockTotal>();
  let unsentEntries = 0;
  let sendingEntries = 0;
  let waitingEntries = 0;
  let rejectedEntries = 0;
  let pendingMarks = 0;
  let unattributedPendingMarks = 0;
  let confirmedLapsRetiring = 0;

  for (const row of listed) {
    if (row.status === 'REJECTED') {
      rejectedEntries += 1;
    } else {
      unsentEntries += 1;
      unsentByKind[row.record.kind] += 1;
      // One figure per unsent entry, from the status that also marks its row,
      // so `sendingEntries + waitingEntries` is always `unsentEntries`.
      if (row.status === 'SENT') {
        sendingEntries += 1;
      } else {
        waitingEntries += 1;
      }
    }

    const { pendingMarks: marks, confirmedLapsRetired } = row.effect;
    confirmedLapsRetiring += confirmedLapsRetired;
    if (marks === 0 && confirmedLapsRetired === 0) continue;

    const location = row.record.location;
    if (location === undefined) {
      unattributedPendingMarks += marks;
      continue;
    }

    pendingMarks += marks;
    accumulateTile(tiles, location, marks, confirmedLapsRetired);
    accumulateBlock(
      blockTotals,
      location,
      blocks,
      marks,
      confirmedLapsRetired,
    );
  }

  const participantMarks: TimingOfflineParticipantMarksView[] = [...tiles.values()]
    .sort((first, second) => first.location.order - second.location.order)
    .map((total) => ({
      blockKey: total.location.blockKey,
      attemptId: total.location.attemptId,
      enrollmentId: total.location.participant.enrollmentId,
      startNumber: total.location.participant.startNumber,
      fullName: total.location.participant.fullName,
      confirmedPassCount: total.location.participant.passCount,
      pendingMarks: total.pendingMarks,
      confirmedLapsRetiring: total.confirmedLapsRetiring,
    }));

  const blockMarks: TimingOfflineBlockMarksView[] = [...blockTotals.values()]
    .sort((first, second) => first.index - second.index)
    .map((total) => ({
      blockKey: total.blockKey,
      attemptId: total.attemptId,
      pendingMarks: total.pendingMarks,
      confirmedLapsRetiring: total.confirmedLapsRetiring,
    }));

  return {
    entries,
    unsentEntries: entries.filter((entry) => entry.unsent),
    rejectedEntries: entries.filter((entry) => entry.rejected),
    participantMarks,
    blockMarks,
    totals: {
      unsentEntries,
      sendingEntries,
      waitingEntries,
      unsentByKind,
      pendingMarks,
      unattributedPendingMarks,
      confirmedLapsRetiring,
      rejectedEntries,
      hasUnsent: unsentEntries > 0,
      hasRejected: rejectedEntries > 0,
    },
  };
}

function compareQueueItems(
  first: TimingQueueItem,
  second: TimingQueueItem,
): number {
  if (first.createdAt !== second.createdAt) {
    return first.createdAt < second.createdAt ? -1 : 1;
  }
  return first.deviceSequence - second.deviceSequence;
}

function isUnsentStatus(status: TimingMutationStatus): boolean {
  return status === 'PENDING' || status === 'SENT';
}

function isListedStatus(
  status: TimingMutationStatus,
): status is TimingOfflineEntryStatus {
  return status === 'PENDING' || status === 'SENT' || status === 'REJECTED';
}

function emptyKindCounts(): Record<TimingOfflineEntryKind, number> {
  return {
    NUMBER: 0,
    TILE: 0,
    PENDING_FINISH: 0,
    ANONYMOUS_SPLIT: 0,
    PASS: 0,
    BIND: 0,
    UNDO: 0,
    ANONYMOUS_ASSIGN: 0,
    START: 0,
  };
}

function indexBlocks(surface: TimingSurfaceView): SurfaceBlockRow[] {
  return surface.categories.map((block, index) => ({
    block,
    blockKey: timingOfflineBlockKey(block),
    attemptId: block.attemptId,
    index,
  }));
}

function indexParticipants(
  blocks: readonly SurfaceBlockRow[],
): SurfaceParticipantRow[] {
  const rows: SurfaceParticipantRow[] = [];
  for (const entry of blocks) {
    for (const participant of entry.block.participants) {
      rows.push({
        participant,
        blockKey: entry.blockKey,
        attemptId: entry.attemptId,
        blockState: entry.block.state,
        order: rows.length,
      });
    }
  }
  return rows;
}

function indexSplitPressTimes(
  surface: TimingSurfaceView,
): Map<string, string> {
  const times = new Map<string, string>();
  for (const split of surface.anonymousSplits ?? []) {
    times.set(split.splitId, split.capturedAt);
  }
  return times;
}

function blockKeyOfAttempt(
  blocks: readonly SurfaceBlockRow[],
  attemptId: string | null,
): string | null {
  if (attemptId === null) return null;
  return (
    blocks.find((entry) => entry.attemptId === attemptId)?.blockKey ?? null
  );
}

/**
 * The participant a payload names. A capture routed to an attempt is resolved
 * inside that attempt's block only, so a stale surface can never put a mark on
 * another block's tile. A split assignment names no attempt, so it prefers a
 * running block and then the surface order.
 */
function locateParticipant(
  participants: readonly SurfaceParticipantRow[],
  attemptId: string | null,
  enrollmentId: string | null,
  startNumber: number | null,
): SurfaceParticipantRow | undefined {
  if (attemptId !== null) {
    const scoped = participants.filter(
      (row) => row.attemptId === attemptId,
    );
    if (scoped.length > 0) {
      return findParticipant(scoped, enrollmentId, startNumber);
    }
  }
  const running = participants.filter((row) => row.blockState === 'RUNNING');
  return (
    findParticipant(running, enrollmentId, startNumber) ??
    findParticipant(participants, enrollmentId, startNumber)
  );
}

function findParticipant(
  scope: readonly SurfaceParticipantRow[],
  enrollmentId: string | null,
  startNumber: number | null,
): SurfaceParticipantRow | undefined {
  if (enrollmentId !== null) {
    const byEnrollment = scope.find(
      (row) => row.participant.enrollmentId === enrollmentId,
    );
    if (byEnrollment !== undefined) return byEnrollment;
  }
  if (startNumber !== null) {
    return scope.find((row) => row.participant.startNumber === startNumber);
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

function readNumber(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readCaptureKind(
  source: Record<string, unknown>,
): TimingCaptureKind | null {
  switch (source.kind) {
    case 'NUMBER':
      return 'NUMBER';
    case 'TILE':
      return 'TILE';
    case 'PENDING_FINISH':
      return 'PENDING_FINISH';
    case 'ANONYMOUS_SPLIT':
      return 'ANONYMOUS_SPLIT';
    default:
      return null;
  }
}

/**
 * Reads one outbox item into the facts the display needs. A payload the product
 * did not write is still listed, but it never invents a mark.
 */
function describeEntry(
  item: TimingQueueItem,
  splitPressTimes: ReadonlyMap<string, string>,
): QueuedEntry {
  const payload = asRecord(item.payload);
  switch (item.operation) {
    case 'PASS': {
      const captureKind = readCaptureKind(payload);
      const pressTime = readString(payload, 'clientCapturedAt') ?? item.createdAt;
      if (captureKind === 'ANONYMOUS_SPLIT') {
        return {
          item,
          kind: 'ANONYMOUS_SPLIT',
          attemptId: null,
          blockKey: null,
          enrollmentId: null,
          startNumber: null,
          addsMark: false,
          pressTime,
          location: undefined,
        };
      }
      if (captureKind === null) {
        return {
          item,
          kind: 'PASS',
          attemptId: readString(payload, 'attemptId'),
          blockKey: null,
          enrollmentId: readString(payload, 'enrollmentId'),
          startNumber: readNumber(payload, 'startNumber'),
          addsMark: false,
          pressTime,
          location: undefined,
        };
      }
      return {
        item,
        kind: captureKind,
        attemptId: readString(payload, 'attemptId') ?? item.attemptId,
        blockKey: null,
        enrollmentId: readString(payload, 'enrollmentId'),
        startNumber: readNumber(payload, 'startNumber'),
        // An unbound finish has no participant yet: its bind carries the mark.
        addsMark: captureKind === 'NUMBER' || captureKind === 'TILE',
        pressTime,
        location: undefined,
      };
    }
    case 'BIND':
      return {
        item,
        kind: 'BIND',
        attemptId: item.attemptId,
        blockKey: null,
        enrollmentId: readString(payload, 'enrollmentId'),
        startNumber: readNumber(payload, 'startNumber'),
        addsMark: true,
        pressTime: item.createdAt,
        location: undefined,
      };
    case 'ANONYMOUS_ASSIGN': {
      const request = asRecord(payload.request);
      const splitId = readString(payload, 'splitId');
      return {
        item,
        kind: 'ANONYMOUS_ASSIGN',
        attemptId: readString(request, 'chosenAttemptId'),
        blockKey: null,
        enrollmentId: readString(request, 'enrollmentId'),
        startNumber: readNumber(request, 'startNumber'),
        addsMark: true,
        pressTime:
          (splitId === null ? undefined : splitPressTimes.get(splitId)) ??
          item.createdAt,
        location: undefined,
      };
    }
    case 'UNDO':
      return {
        item,
        kind: 'UNDO',
        attemptId: item.attemptId,
        blockKey: null,
        enrollmentId: null,
        startNumber: null,
        addsMark: false,
        pressTime: item.createdAt,
        location: undefined,
      };
    case 'START':
      return {
        item,
        kind: 'START',
        attemptId: item.attemptId,
        blockKey: null,
        enrollmentId: null,
        startNumber: null,
        addsMark: false,
        pressTime: readString(payload, 'officialStartedAt') ?? item.createdAt,
        location: undefined,
      };
  }
}

/**
 * What one entry does to the display. A capture whose withdrawal is unsent is
 * one withdrawn press and adds nothing; a withdrawal of a confirmed capture
 * retires one lap instead of adding a mark.
 */
function entryEffect(
  record: QueuedEntry,
  withdrawalOf: ReadonlyMap<string, QueuedEntry>,
  withdrawnBy: ReadonlyMap<string, QueuedEntry>,
): EntryEffect {
  if (!isUnsentStatus(record.item.status)) {
    return { pendingMarks: 0, confirmedLapsRetired: 0 };
  }

  if (record.kind === 'UNDO') {
    const capture = withdrawalOf.get(record.item.id);
    if (capture === undefined) {
      // The outbox no longer holds the capture, so it was confirmed and the
      // withdrawal retires that lap.
      return { pendingMarks: 0, confirmedLapsRetired: 1 };
    }
    const retires =
      capture.item.status === 'APPLIED' && capture.addsMark ? 1 : 0;
    return { pendingMarks: 0, confirmedLapsRetired: retires };
  }

  const withdrawal = withdrawnBy.get(record.item.id);
  const withdrawnWhileUnsent =
    withdrawal !== undefined && isUnsentStatus(withdrawal.item.status);
  return {
    pendingMarks: record.addsMark && !withdrawnWhileUnsent ? 1 : 0,
    confirmedLapsRetired: 0,
  };
}

/**
 * The rows to emit when the walk reaches `row`: a pair always emits its capture
 * first and then its withdrawal, so the two stay adjacent (FR-39).
 */
function pairOrder(
  row: ListedRow,
  withdrawalOf: ReadonlyMap<string, QueuedEntry>,
  withdrawnBy: ReadonlyMap<string, QueuedEntry>,
  rowById: ReadonlyMap<string, ListedRow>,
): ListedRow[] {
  if (row.record.kind === 'UNDO') {
    const capture = withdrawalOf.get(row.record.item.id);
    const captureRow =
      capture === undefined ? undefined : rowById.get(capture.item.id);
    return captureRow === undefined ? [row] : [captureRow, row];
  }
  const withdrawal = withdrawnBy.get(row.record.item.id);
  const withdrawalRow =
    withdrawal === undefined ? undefined : rowById.get(withdrawal.item.id);
  return withdrawalRow === undefined ? [row] : [row, withdrawalRow];
}

function toEntryView(
  row: ListedRow,
  capture: QueuedEntry | undefined,
  withdrawal: QueuedEntry | undefined,
): TimingOfflineEntryView {
  const record = row.record;
  const participant = record.location?.participant;
  const isWithdrawal = record.kind === 'UNDO';
  // The payload names the participant its kind carries; the surface names the
  // rest. A tile press sends the enrollment and no number, and a number press
  // sends the number and no enrollment, so the row completes both.
  const enrollmentId =
    record.enrollmentId ?? participant?.enrollmentId ?? null;
  const startNumber = record.startNumber ?? participant?.startNumber ?? null;

  let pairRole: TimingOfflinePairRole | null = null;
  let pairId: string | null = null;
  if (isWithdrawal) {
    pairRole = capture === undefined ? null : 'WITHDRAWAL';
    pairId = capture?.item.id ?? null;
  } else if (
    withdrawal !== undefined &&
    isListedStatus(withdrawal.item.status)
  ) {
    pairRole = 'CAPTURE';
    pairId = record.item.id;
  }

  const withdraws: TimingOfflineWithdrawalTargetView | null = isWithdrawal
    ? {
        entryId: capture?.item.id ?? null,
        startNumber,
        fullName: participant?.fullName ?? null,
        blockKey: record.blockKey,
        confirmed: capture === undefined || capture.item.status === 'APPLIED',
      }
    : null;

  return {
    id: record.item.id,
    kind: record.kind,
    kindLabel: TIMING_OFFLINE_ENTRY_KIND_LABELS[record.kind],
    operation: record.item.operation,
    status: row.status,
    unsent: isUnsentStatus(row.status),
    rejected: row.status === 'REJECTED',
    isSending: row.status === 'SENT',
    pressTime: record.pressTime,
    attemptId: record.attemptId,
    blockKey: record.blockKey,
    enrollmentId,
    startNumber,
    fullName: participant?.fullName ?? null,
    sectionId: participant?.sectionId ?? null,
    pendingMarks: row.effect.pendingMarks,
    confirmedLapsRetired: row.effect.confirmedLapsRetired,
    withdraws,
    pairId,
    pairRole,
    reason: row.status === 'REJECTED' ? (record.item.error ?? null) : null,
    deviceSequence: record.item.deviceSequence,
    localAnchorAttemptId: record.item.localAnchorAttemptId ?? null,
    elapsedMs: readNumber(asRecord(record.item.payload), 'clientElapsedMs'),
    captureDeviceSequence: readNumber(
      asRecord(record.item.payload),
      'captureDeviceSequence',
    ),
  };
}

function accumulateTile(
  tiles: Map<string, TileTotal>,
  location: SurfaceParticipantRow,
  marks: number,
  confirmedLapsRetired: number,
): void {
  const key = `${location.blockKey}:${location.participant.enrollmentId}`;
  const total = tiles.get(key) ?? {
    location,
    pendingMarks: 0,
    confirmedLapsRetiring: 0,
  };
  total.pendingMarks += marks;
  total.confirmedLapsRetiring += confirmedLapsRetired;
  tiles.set(key, total);
}

function accumulateBlock(
  totals: Map<string, BlockTotal>,
  location: SurfaceParticipantRow,
  blocks: readonly SurfaceBlockRow[],
  marks: number,
  confirmedLapsRetired: number,
): void {
  const total = totals.get(location.blockKey) ?? {
    blockKey: location.blockKey,
    attemptId: location.attemptId,
    index:
      blocks.find((entry) => entry.blockKey === location.blockKey)?.index ??
      blocks.length,
    pendingMarks: 0,
    confirmedLapsRetiring: 0,
  };
  total.pendingMarks += marks;
  total.confirmedLapsRetiring += confirmedLapsRetired;
  totals.set(location.blockKey, total);
}
