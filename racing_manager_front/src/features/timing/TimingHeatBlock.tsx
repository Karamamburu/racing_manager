import { TimingCategoryBlock } from './TimingCategoryBlock';
import type {
  TimingCategoryBlockView,
  TimingParticipantTileView,
} from './types';

/** The heat title a surface without a label still renders. */
function heatTitle(block: TimingCategoryBlockView): string {
  const label = block.heatLabel?.trim() ?? '';
  if (label.length > 0) return label;
  return block.heatNumber === undefined ? 'Заезд' : `Заезд ${block.heatNumber}`;
}

/**
 * One heat block of the event-wide timing surface (FR-17, T11).
 *
 * A heat is a variant of a category block, not a second capture screen: this
 * wrapper only names the stage and the heat, then hands every control and the
 * frozen roster to `TimingCategoryBlock`. The Start press, the tiles, the
 * pending finishes and the record therefore behave exactly as in a category,
 * and no capture logic exists twice.
 *
 * The block itself decides whether Start is offered: a stage whose heats are
 * not formed, or a closed stage, shows its reason and no Start (F-12, S-07).
 *
 * The unsent marks of the device outbox reach a heat exactly as they reach a
 * category: this wrapper forwards both figures untouched, so a heat never
 * invents or drops a pending count (FR-10, FR-37).
 */
export function TimingHeatBlock({
  block,
  raceTitle,
  isCaptureHolder,
  onStart,
  onTakeCapture,
  onParticipantClick,
  onOpenRecord,
  pendingMarksByParticipant,
  pendingMarkCount,
}: {
  /** A block whose `kind` is `HEAT`: it carries the stage and heat fields. */
  block: TimingCategoryBlockView;
  /** The multi-stage race the heat belongs to, so the block names its race. */
  raceTitle?: string;
  isCaptureHolder: boolean;
  onStart: () => void;
  onTakeCapture?: () => void;
  onParticipantClick?: (participant: TimingParticipantTileView) => void;
  /** Opens the record of the block's current or last attempt; absent hides it. */
  onOpenRecord?: () => void;
  /** Unsent marks per `enrollmentId`, straight from the page's outbox view. */
  pendingMarksByParticipant?: ReadonlyMap<string, number>;
  /** Unsent marks of this heat, straight from the page's outbox view. */
  pendingMarkCount?: number;
}) {
  return (
    <TimingCategoryBlock
      block={block}
      title={heatTitle(block)}
      subtitle={raceTitle}
      isCaptureHolder={isCaptureHolder}
      onStart={onStart}
      onTakeCapture={onTakeCapture}
      onParticipantClick={onParticipantClick}
      onOpenRecord={onOpenRecord}
      pendingMarksByParticipant={pendingMarksByParticipant}
      pendingMarkCount={pendingMarkCount}
    />
  );
}
