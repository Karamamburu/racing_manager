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

/**
 * Packs groups into rows of the same width mode, filling an earlier row of the
 * same state before opening a new one, so a later half or third can close a gap
 * left by a full-width group. A row is three thirds, two halves or one full
 * card and never an uneven mix.
 */
export function timingBlockRows<
  T extends { layout: TimingBlockLayout; priority?: number },
>(groups: readonly T[]): T[][] {
  const rows: T[][] = [];
  const capacity = (layout: TimingBlockLayout) =>
    layout === 'full' ? 1 : layout === 'half' ? 2 : 3;
  for (const group of groups) {
    const row = rows.find(
      (candidate) =>
        candidate[0].layout === group.layout &&
        (candidate[0].priority ?? 0) === (group.priority ?? 0) &&
        candidate.length < capacity(group.layout),
    );
    if (row === undefined) {
      rows.push([group]);
    } else {
      row.push(group);
    }
  }
  return rows;
}

/**
 * The flex value of one row item. Two items always split the row exactly, and
 * a lone half keeps half the row; only a single third keeps a third.
 */
export function timingRowItemFlex(
  layout: TimingBlockLayout,
  count: number,
): string {
  if (layout === 'full') return '0 0 100%';
  if (layout === 'half') {
    return count === 1
      ? '0 0 calc((100% - 16px) / 2)'
      : '1 1 calc((100% - 16px) / 2)';
  }
  if (count === 3) return '1 1 calc((100% - 32px) / 3)';
  if (count === 2) return '1 1 calc((100% - 16px) / 2)';
  return '0 0 calc((100% - 32px) / 3)';
}
