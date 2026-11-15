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
 * Packs ordered groups into rows of the same width mode, so a row is either
 * three thirds, two halves or one full card and never an uneven mix. A lone
 * half or third stays at its own width instead of stretching to the full row.
 */
export function timingBlockRows<T extends { layout: TimingBlockLayout }>(
  groups: readonly T[],
): T[][] {
  const rows: T[][] = [];
  for (const group of groups) {
    const capacity =
      group.layout === 'full' ? 1 : group.layout === 'half' ? 2 : 3;
    const current = rows[rows.length - 1];
    if (
      group.layout !== 'full' &&
      current !== undefined &&
      current[0].layout === group.layout &&
      current.length < capacity
    ) {
      current.push(group);
    } else {
      rows.push([group]);
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
