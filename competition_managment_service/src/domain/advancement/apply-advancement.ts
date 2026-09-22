import { DomainError, ErrorCodes } from '../errors';
import { isEligible } from '../ranking/rank-stage';
import { AdvancementCut, AdvancementRoute, RankedEntry } from '../types';

function sliceTop(eligible: RankedEntry[], count: number): RankedEntry[] {
  if (count <= 0) {
    return [];
  }
  return eligible.slice(0, count);
}

function applyCut(
  cut: AdvancementCut,
  eligible: RankedEntry[],
  fieldSize: number,
): RankedEntry[] {
  switch (cut.type) {
    case 'TOP_PERCENT':
      return sliceTop(eligible, Math.floor((fieldSize * cut.percent) / 100));
    case 'TOP_FRACTION':
      return sliceTop(
        eligible,
        Math.floor((fieldSize * cut.numerator) / cut.denominator),
      );
    case 'TOP_N':
      return sliceTop(eligible, cut.n);
    case 'RANK_RANGE':
      return eligible.slice(cut.from - 1, cut.to);
    case 'FIRST_HALF':
      return sliceTop(eligible, Math.ceil(fieldSize / 2));
    case 'SECOND_HALF':
      return eligible.slice(Math.ceil(fieldSize / 2));
    case 'TOP_PER_HEAT': {
      const byHeat = new Map<number, RankedEntry[]>();
      for (const entry of eligible) {
        const bucket = byHeat.get(entry.heatNumber) ?? [];
        bucket.push(entry);
        byHeat.set(entry.heatNumber, bucket);
      }
      const selected: RankedEntry[] = [];
      const heatNumbers = [...byHeat.keys()].sort((a, b) => a - b);
      for (const heatNumber of heatNumbers) {
        const heatEligible = byHeat.get(heatNumber) ?? [];
        selected.push(...heatEligible.slice(0, cut.n));
      }
      return selected.sort((a, b) => a.rank - b.rank);
    }
    default:
      throw new DomainError(
        ErrorCodes.ADVANCEMENT_INVALID,
        `Unknown cut type "${String((cut as { type: string }).type)}".`,
        'advancement',
      );
  }
}

export type RoutedEntries = {
  toStageId: string;
  entries: RankedEntry[];
};

export function applyAdvancement(
  routes: AdvancementRoute[],
  ranking: RankedEntry[],
  fieldSize: number,
): { routes: RoutedEntries[]; eliminated: RankedEntry[] } {
  const eligible = ranking.filter(isEligible);

  if (routes.length === 0) {
    return { routes: [], eliminated: [] };
  }

  const taken = new Set<string>();
  const routed: RoutedEntries[] = [];

  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    const entries = applyCut(route.cut, eligible, fieldSize);
    for (const entry of entries) {
      if (taken.has(entry.participant.id)) {
        throw new DomainError(
          ErrorCodes.ADVANCEMENT_INVALID,
          `Participant "${entry.participant.id}" is routed to more than one stage.`,
          `advancement.routes[${index}]`,
        );
      }
      taken.add(entry.participant.id);
    }
    routed.push({ toStageId: route.toStageId, entries });
  }

  const eliminated = ranking.filter((entry) => !taken.has(entry.participant.id));
  return { routes: routed, eliminated };
}
