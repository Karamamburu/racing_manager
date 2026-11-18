import type {
  TimingAnonymousSplitCandidateView,
  TimingAnonymousSplitView,
  TimingCategoryBlockView,
  TimingLocalAttemptView,
  TimingSurfaceView,
} from './types';
import type {
  TimingOfflineEntryView,
  TimingOfflineView,
} from './timingOffline';

/**
 * The anonymous-split queue as the page shows it: the server's unassigned
 * splits plus the device's own splits that are not applied yet (AD-1, AD-8).
 *
 * A local split is a first-class queue entry with a device identity, its official
 * capture time and the candidates known on the last surface. The official
 * capture time is the anchor attempt's official start plus the capture's elapsed
 * value, so it is stable across a reload. The candidate set is advisory; the
 * server resolves the real set when the split is created.
 *
 * A local split whose capture is in flight is marked «отправляется»; a split
 * that a queued assignment already names is marked assigned and is not offered
 * for a second assignment. An applied split is no longer local: the server's
 * own row replaces it, and the merge keeps at most one row per split identity.
 *
 * The module is pure and framework-free.
 */

export interface TimingLocalSplitsInput {
  /** The server surface (or the merged view); its split list is the server's. */
  surface: TimingSurfaceView;
  /** The device outbox derivation. */
  offline: TimingOfflineView;
  /** The local attempts created by offline Starts. */
  localAttempts: readonly TimingLocalAttemptView[];
  /** A human label for one attempt id, when the page knows the event. */
  labelFor?: (attemptId: string) => string;
}

export interface TimingLocalSplitsResult {
  /** Server and local rows in capture order. */
  splits: TimingAnonymousSplitView[];
  /** Local splits that are not applied and not named by a queued assignment. */
  localUnassignedCount: number;
}

type AttemptCandidate = {
  attemptId: string;
  blockKey: string;
  label: string;
  officialStartedAt: string;
};

function defaultLabel(block: TimingCategoryBlockView): string {
  if (block.kind === 'HEAT') {
    return block.heatLabel ?? 'Заезд';
  }
  return `${block.formatId} · ${block.gender}`;
}

function serverAttempts(
  surface: TimingSurfaceView,
  labelFor?: (attemptId: string) => string,
): AttemptCandidate[] {
  const attempts: AttemptCandidate[] = [];
  for (const block of surface.categories) {
    // A local block is added from the outbox below, once, with its own clock.
    if (block.local === true) continue;
    if (block.state !== 'RUNNING' || block.attemptId === null) continue;
    if (block.officialStartedAt === null) continue;
    attempts.push({
      attemptId: block.attemptId,
      blockKey: block.blockKey ?? block.attemptId,
      label: labelFor?.(block.attemptId) ?? defaultLabel(block),
      officialStartedAt: block.officialStartedAt,
    });
  }
  return attempts;
}

function localAttemptCandidates(
  surface: TimingSurfaceView,
  localAttempts: readonly TimingLocalAttemptView[],
  labelFor?: (attemptId: string) => string,
): AttemptCandidate[] {
  return localAttempts.map((local) => {
    const block = surface.categories.find(
      (candidate) =>
        candidate.startId === local.startId &&
        candidate.formatId === local.formatId &&
        candidate.gender === local.gender,
    );
    return {
      attemptId: local.localAttemptId,
      blockKey: block?.blockKey ?? local.localAttemptId,
      label:
        labelFor?.(local.localAttemptId) ??
        (block === undefined ? local.localAttemptId : defaultLabel(block)),
      officialStartedAt: local.officialStartedAt,
    };
  });
}

function officialCaptureAt(
  entry: TimingOfflineEntryView,
  attempts: readonly AttemptCandidate[],
): string {
  const anchor = attempts.find(
    (candidate) => candidate.attemptId === entry.localAnchorAttemptId,
  );
  if (anchor === undefined || entry.elapsedMs === null) {
    return entry.pressTime;
  }
  return new Date(
    Date.parse(anchor.officialStartedAt) + entry.elapsedMs,
  ).toISOString();
}

function candidatesAt(
  attempts: readonly AttemptCandidate[],
  captureAt: string,
): TimingAnonymousSplitCandidateView[] {
  const captureMs = Date.parse(captureAt);
  return attempts
    .filter((candidate) => Date.parse(candidate.officialStartedAt) < captureMs)
    .map((candidate) => ({
      attemptId: candidate.attemptId,
      blockKey: candidate.blockKey,
      attemptLabel: candidate.label,
      officialElapsedMs: captureMs - Date.parse(candidate.officialStartedAt),
    }));
}

function assignedCaptureSequences(
  entries: readonly TimingOfflineEntryView[],
): Set<number> {
  const sequences = new Set<number>();
  for (const entry of entries) {
    if (entry.operation !== 'ANONYMOUS_ASSIGN') continue;
    if (!entry.unsent || entry.rejected) continue;
    if (entry.captureDeviceSequence === null) continue;
    sequences.add(entry.captureDeviceSequence);
  }
  return sequences;
}

function localSplits(
  input: TimingLocalSplitsInput,
  attempts: readonly AttemptCandidate[],
  assigned: ReadonlySet<number>,
): TimingAnonymousSplitView[] {
  return input.offline.entries
    .filter(
      (entry) =>
        entry.kind === 'ANONYMOUS_SPLIT' &&
        entry.unsent &&
        !entry.rejected &&
        entry.pairRole !== 'CAPTURE',
    )
    .map((entry) => {
      const captureAt = officialCaptureAt(entry, attempts);
      return {
        splitId: entry.id,
        localSplitId: entry.id,
        attemptId: null,
        capturedAt: captureAt,
        status: 'QUEUED' as const,
        candidates: candidatesAt(attempts, captureAt),
        captureDeviceSequence: entry.deviceSequence,
        // A local split is not on the server yet, in flight or not.
        unsent: true,
        sending: entry.isSending,
        assigned: assigned.has(entry.deviceSequence),
      };
    });
}

function serverSplits(
  surface: TimingSurfaceView,
  assigned: ReadonlySet<number>,
): TimingAnonymousSplitView[] {
  return (surface.anonymousSplits ?? []).map((split) => ({
    ...split,
    ...(split.captureDeviceSequence !== null &&
    split.captureDeviceSequence !== undefined &&
    assigned.has(split.captureDeviceSequence)
      ? { assigned: true }
      : {}),
  }));
}

export function deriveLocalSplits(
  input: TimingLocalSplitsInput,
): TimingLocalSplitsResult {
  const attempts = [
    ...serverAttempts(input.surface, input.labelFor),
    ...localAttemptCandidates(input.surface, input.localAttempts, input.labelFor),
  ];
  const assigned = assignedCaptureSequences(input.offline.entries);
  const local = localSplits(input, attempts, assigned);
  const splits = [...serverSplits(input.surface, assigned), ...local].sort(
    (left, right) =>
      Date.parse(left.capturedAt) - Date.parse(right.capturedAt) ||
      (left.splitId < right.splitId ? -1 : 1),
  );
  return {
    splits,
    localUnassignedCount: local.filter((split) => split.assigned !== true)
      .length,
  };
}
