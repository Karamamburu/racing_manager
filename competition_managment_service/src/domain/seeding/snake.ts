export function snakeAssign<T>(ordered: T[], heatCount: number): T[][] {
  const heats: T[][] = Array.from({ length: heatCount }, () => []);
  let index = 0;
  let round = 0;
  while (index < ordered.length) {
    if (round % 2 === 0) {
      for (let heat = 0; heat < heatCount && index < ordered.length; heat += 1) {
        heats[heat].push(ordered[index]);
        index += 1;
      }
    } else {
      for (let heat = heatCount - 1; heat >= 0 && index < ordered.length; heat -= 1) {
        heats[heat].push(ordered[index]);
        index += 1;
      }
    }
    round += 1;
  }
  return heats;
}
