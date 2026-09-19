import { Participant } from '../../src/domain/types';

export function makeParticipants(count: number): Participant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    seed: index + 1,
  }));
}

export function heatSeeds(
  heats: Array<{ slots: Array<{ participant: Participant }> }>,
): number[][] {
  return heats.map((heat) => heat.slots.map((slot) => slot.participant.seed));
}
