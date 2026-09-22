import { balancedHeatSizes } from './heat-sizes';

export function byOverallRankAssign<T>(ordered: T[], heatCount: number): T[][] {
  const sizes = balancedHeatSizes(ordered.length, heatCount);
  const heats: T[][] = [];
  let offset = 0;
  for (const size of sizes) {
    heats.push(ordered.slice(offset, offset + size));
    offset += size;
  }
  return heats;
}
