import type { TimingQueueItem } from './timingQueue';
import type { TimingOfflineEntryView, TimingOfflineView } from './timingOffline';
import type {
  StartOfflineTimingAttemptRequest,
  TimingCategoryBlockView,
  TimingLocalAttemptView,
  TimingParticipantTileView,
  TimingSurfaceView,
} from './types';

/**
 * The device-local category attempt of an offline Start (AD-2, AD-8, AD-10).
 *
 * The server surface and the device outbox are merged into one running block:
 * the frozen roster comes from the Start snapshot, the participant states and
 * pass counts from the local passes, and the elapsed display from the press
 * instant. The server surface is never mutated; the page and the capture hook
 * read the returned merged view. A Start item already mapped or applied is not
 * local any more — the server attempt replaces it on the next surface read.
 *
 * The module is pure and framework-free. `nowMs` is injected by the caller.
 */

export interface TimingLocalAttemptsInput {
  /** The server surface (before the local block is merged). */
  surface: TimingSurfaceView;
  /** The device outbox derivation. */
  offline: TimingOfflineView;
  /** The outbox snapshot; only `START` items are read. */
  startItems: readonly TimingQueueItem[];
  /** The caller's clock for the elapsed display. */
  nowMs: number;
}

export interface TimingLocalAttemptsResult {
  attempts: TimingLocalAttemptView[];
  /** The surface with each local running block replacing its server block. */
  mergedSurface: TimingSurfaceView;
}

type LocalPassTotal = { count: number; lastPassAt: string | null };

function sameCategory(
  block: Pick<
    TimingCategoryBlockView,
    'startId' | 'formatId' | 'gender'
  >,
  candidate: Pick<
    TimingCategoryBlockView,
    'startId' | 'formatId' | 'gender'
  >,
): boolean {
  return (
    block.startId === candidate.startId &&
    block.formatId === candidate.formatId &&
    block.gender === candidate.gender
  );
}

function localPassCounts(
  entries: readonly TimingOfflineEntryView[],
  localAttemptId: string,
  startNumbers: ReadonlyMap<number, string>,
): Map<string, LocalPassTotal> {
  const totals = new Map<string, LocalPassTotal>();
  for (const entry of entries) {
    if (entry.operation !== 'PASS') continue;
    if (entry.kind !== 'NUMBER' && entry.kind !== 'TILE') continue;
    if (entry.attemptId !== localAttemptId) continue;
    if (!entry.unsent || entry.rejected) continue;
    if (entry.pairRole === 'CAPTURE') continue;
    const enrollmentId =
      entry.enrollmentId ??
      (entry.startNumber === null
        ? undefined
        : startNumbers.get(entry.startNumber));
    if (enrollmentId === undefined) continue;
    const total = totals.get(enrollmentId) ?? { count: 0, lastPassAt: null };
    total.count += 1;
    total.lastPassAt = entry.pressTime;
    totals.set(enrollmentId, total);
  }
  return totals;
}

function participantState(
  passCount: number,
  requiredLaps: number,
  excludedReason: string | null,
): TimingParticipantTileView['state'] {
  if (excludedReason !== null) return 'EXCLUDED';
  if (passCount >= requiredLaps) return 'RECORDED';
  if (passCount > 0) return 'RACING';
  return 'WAITING';
}

function localBlock(
  startItem: TimingQueueItem,
  payload: StartOfflineTimingAttemptRequest,
  serverBlock: TimingCategoryBlockView | undefined,
  offline: TimingOfflineView,
  nowMs: number,
): TimingCategoryBlockView {
  const startNumbers = new Map<number, string>();
  for (const row of payload.roster) {
    if (row.startNumber !== null && row.startNumber !== undefined) {
      startNumbers.set(row.startNumber, row.enrollmentId);
    }
  }
  const counts = localPassCounts(
    offline.entries,
    payload.localAttemptId,
    startNumbers,
  );
  const localNames = new Map(
    (startItem.localRoster ?? []).map((row) => [row.enrollmentId, row]),
  );
  const serverParticipants = new Map(
    (serverBlock?.participants ?? []).map((row) => [row.enrollmentId, row]),
  );
  const participants: TimingParticipantTileView[] = payload.roster.map(
    (row) => {
      const local = localNames.get(row.enrollmentId);
      const known = serverParticipants.get(row.enrollmentId);
      const total = counts.get(row.enrollmentId);
      const passCount = total?.count ?? 0;
      const excludedReason =
        row.excludedReason ??
        (row.initialOutcome === null || row.initialOutcome === undefined
          ? null
          : 'EXISTING_OUTCOME');
      return {
        enrollmentId: row.enrollmentId,
        registrationId: row.registrationId,
        startNumber: row.startNumber ?? 0,
        fullName:
          local?.fullName ??
          known?.fullName ??
          row.registrationId,
        sectionId: row.sectionId,
        passCount,
        requiredLaps: row.requiredLaps,
        lastPassAt: total?.lastPassAt ?? null,
        state: participantState(passCount, row.requiredLaps, excludedReason),
        excludedReason,
      };
    },
  );
  const lapCount = payload.roster[0]?.requiredLaps ?? serverBlock?.lapCount ?? 0;
  return {
    ...(serverBlock ?? {
      startControlEnabled: false,
      blockReason: null,
      participants: [],
      pendingFinishes: [],
      lastAttempts: [],
    }),
    startId: payload.startId,
    formatId: payload.formatId,
    gender: payload.gender,
    state: 'RUNNING',
    lapCount,
    attemptId: payload.localAttemptId,
    officialStartedAt: payload.officialStartedAt,
    elapsedMs: Math.max(0, nowMs - Date.parse(payload.officialStartedAt)),
    startControlEnabled: false,
    blockReason: null,
    capturesComplete: false,
    finished: false,
    participants,
    pendingFinishes: [],
    lastAttempts: [],
    blockKey: serverBlock?.blockKey ?? `local:${payload.localAttemptId}`,
    local: true,
    localAttemptId: payload.localAttemptId,
    localClockEpochId: payload.localClockEpochId,
  };
}

export function deriveLocalAttempts(
  input: TimingLocalAttemptsInput,
): TimingLocalAttemptsResult {
  const starts = input.startItems.filter(
    (item) =>
      item.operation === 'START' &&
      (item.status === 'PENDING' || item.status === 'SENT'),
  );
  const attempts: TimingLocalAttemptView[] = [];
  const localBlocks = new Map<string, TimingCategoryBlockView>();
  for (const startItem of starts) {
    const payload = startItem.payload as StartOfflineTimingAttemptRequest;
    const serverBlock = input.surface.categories.find(
      (block) => block.kind !== 'HEAT' && sameCategory(block, payload),
    );
    attempts.push({
      localAttemptId: payload.localAttemptId,
      localClockEpochId: payload.localClockEpochId,
      startId: payload.startId,
      formatId: payload.formatId,
      gender: payload.gender,
      officialStartedAt: payload.officialStartedAt,
      lapCount:
        payload.roster[0]?.requiredLaps ?? serverBlock?.lapCount ?? 0,
      roster: payload.roster,
      deviceSequence: startItem.deviceSequence,
    });
    const key = `${payload.startId}:${payload.formatId}:${payload.gender}`;
    localBlocks.set(
      key,
      localBlock(startItem, payload, serverBlock, input.offline, input.nowMs),
    );
  }

  if (localBlocks.size === 0) {
    return { attempts, mergedSurface: input.surface };
  }

  const categories: TimingCategoryBlockView[] = [];
  const used = new Set<string>();
  for (const block of input.surface.categories) {
    const key = `${block.startId}:${block.formatId}:${block.gender}`;
    const local = localBlocks.get(key);
    if (local !== undefined && !used.has(key)) {
      categories.push(local);
      used.add(key);
      continue;
    }
    categories.push(block);
  }
  for (const [key, local] of localBlocks) {
    if (used.has(key)) continue;
    categories.push(local);
  }
  return {
    attempts,
    mergedSurface: { ...input.surface, categories },
  };
}
