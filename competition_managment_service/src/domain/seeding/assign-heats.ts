import { DomainError, ErrorCodes } from '../errors';
import { Heat, HeatLayout, ManualHeatAssignment, Participant } from '../types';
import { byOverallRankAssign } from './by-overall-rank';
import { crossAssign } from './cross';
import { resolveHeatCount } from './heat-sizes';
import { assignManualHeats } from './manual';
import { snakeAssign } from './snake';

function groupsToHeats(groups: Participant[][]): Heat[] {
  return groups.map((items, index) => ({
    heatNumber: index + 1,
    slots: items.map((participant, position) => ({
      position: position + 1,
      participant,
    })),
  }));
}

export function assignHeats(
  participants: Participant[],
  layout: Extract<HeatLayout, { type: 'HEATS' }>,
  manualHeats?: ManualHeatAssignment[],
): Heat[] {
  if (layout.seeding.type === 'MANUAL') {
    return assignManualHeats(participants, manualHeats, layout.heatCount);
  }

  const heatCount = resolveHeatCount(
    participants.length,
    layout.heatCount,
    layout.heatSize,
  );

  switch (layout.seeding.type) {
    case 'SNAKE':
      return groupsToHeats(snakeAssign(participants, heatCount));
    case 'CROSS':
      return groupsToHeats(crossAssign(participants, heatCount));
    case 'BY_OVERALL_RANK':
      return groupsToHeats(byOverallRankAssign(participants, heatCount));
    default:
      throw new DomainError(
        ErrorCodes.SEEDING_INVALID,
        `Unsupported seeding type "${String((layout.seeding as { type: string }).type)}".`,
        'heats.seeding.type',
      );
  }
}

export function singleHeat(participants: Participant[]): Heat[] {
  return [
    {
      heatNumber: 1,
      slots: participants.map((participant, index) => ({
        position: index + 1,
        participant,
      })),
    },
  ];
}
