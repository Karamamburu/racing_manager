export function crossAssign<T>(ordered: T[], heatCount: number): T[][] {
  const heats: T[][] = Array.from({ length: heatCount }, () => []);
  for (let index = 0; index < ordered.length; index += 1) {
    heats[index % heatCount].push(ordered[index]);
  }
  return heats;
}
