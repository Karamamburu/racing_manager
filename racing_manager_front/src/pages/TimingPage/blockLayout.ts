import type { TimingCategoryBlockView } from '../../features/timing/types';

/**
 * How many categories share one row.
 *
 * At a typical 1920 px workstation a third of the content area fits about four
 * 128 px tiles per row and a half fits about seven, so both limits keep a
 * category within two tile rows. A category above the second limit takes the
 * whole width, where it fits roughly fifteen tiles per row.
 */
export const TIMING_THREE_COLUMN_MAX_PARTICIPANTS = 6;
export const TIMING_TWO_COLUMN_MAX_PARTICIPANTS = 12;

export type TimingBlockLayout = 'third' | 'half' | 'full';

/** The tiles a block actually shows; race-section rows collapse into a note. */
function visibleParticipantCount(block: TimingCategoryBlockView): number {
  return block.participants.filter(
    (participant) => participant.excludedReason !== 'RACE_SECTION',
  ).length;
}

/**
 * The width one category group needs. A multi-stage race is sized by its
 * widest block, because its category and heat cards share the same column.
 */
export function timingBlockLayout(
  blocks: readonly TimingCategoryBlockView[],
): TimingBlockLayout {
  const participants = blocks.reduce(
    (widest, block) => Math.max(widest, visibleParticipantCount(block)),
    0,
  );
  if (participants <= TIMING_THREE_COLUMN_MAX_PARTICIPANTS) return 'third';
  if (participants <= TIMING_TWO_COLUMN_MAX_PARTICIPANTS) return 'half';
  return 'full';
}
