import type {
  TimingCategoryBlockView,
  TimingParticipantTileView,
  TimingSurfaceView,
} from './types';

/** The referee-facing totals of one timing surface read. */
export type TimingMetrics = {
  categoriesTotal: number;
  categoriesFinished: number;
  categoriesNotStarted: number;
  participantsTotal: number;
  participantsFinished: number;
  onCourse: number;
  readyToComplete: number;
  pendingSplits: number;
  pendingFinishes: number;
  remainingPasses: number;
};

function categoryKey(block: TimingCategoryBlockView): string {
  return `${block.startId}:${block.formatId}:${block.gender}`;
}

/**
 * Counts the surface for the referee summary.
 *
 * A category is finished when its block says `finished`; not started when every
 * block of that category is still `NOT_STARTED`. Participants are unique
 * enrollments of the timeable roster: race-section rows are the same people as
 * their heat rows, and withdrawn or already-result rows are outside the timing
 * denominator. A participant finishes by holding all N passes.
 */
export function computeTimingMetrics(
  surface: TimingSurfaceView,
): TimingMetrics {
  const categories = new Map<string, TimingCategoryBlockView[]>();
  for (const block of surface.categories) {
    const key = categoryKey(block);
    const blocks = categories.get(key) ?? [];
    blocks.push(block);
    categories.set(key, blocks);
  }

  let categoriesFinished = 0;
  let categoriesNotStarted = 0;
  for (const blocks of categories.values()) {
    if (blocks.some((block) => block.finished === true)) {
      categoriesFinished += 1;
    }
    if (blocks.every((block) => block.state === 'NOT_STARTED')) {
      categoriesNotStarted += 1;
    }
  }

  const participants = new Map<string, TimingParticipantTileView>();
  for (const block of surface.categories) {
    for (const participant of block.participants) {
      if (participant.excludedReason !== null) continue;
      participants.set(participant.enrollmentId, participant);
    }
  }

  let participantsFinished = 0;
  let onCourse = 0;
  for (const participant of participants.values()) {
    if (participant.passCount === participant.requiredLaps) {
      participantsFinished += 1;
    }
    if (participant.state === 'RACING') {
      onCourse += 1;
    }
  }

  let readyToComplete = 0;
  let pendingFinishes = 0;
  let remainingPasses = 0;
  for (const block of surface.categories) {
    if (block.state === 'RUNNING' && block.capturesComplete === true) {
      readyToComplete += 1;
    }
    pendingFinishes += block.pendingFinishes.length;
    if (block.state !== 'RUNNING') continue;
    const seen = new Set<string>();
    for (const participant of block.participants) {
      if (participant.excludedReason !== null) continue;
      if (seen.has(participant.enrollmentId)) continue;
      seen.add(participant.enrollmentId);
      remainingPasses += Math.max(
        0,
        participant.requiredLaps - participant.passCount,
      );
    }
  }

  return {
    categoriesTotal: categories.size,
    categoriesFinished,
    categoriesNotStarted,
    participantsTotal: participants.size,
    participantsFinished,
    onCourse,
    readyToComplete,
    pendingSplits: surface.anonymousSplits?.length ?? 0,
    pendingFinishes,
    remainingPasses,
  };
}
