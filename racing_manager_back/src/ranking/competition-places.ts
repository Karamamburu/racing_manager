export function competitionPlaces<T>(
  sortedByTime: readonly T[],
  timeOf: (item: T) => number,
): number[] {
  const places: number[] = [];
  for (let index = 0; index < sortedByTime.length; index += 1) {
    const time = timeOf(sortedByTime[index]);
    const tiedWithPrevious = index > 0 && time === timeOf(sortedByTime[index - 1]);
    places.push(tiedWithPrevious ? places[index - 1] : index + 1);
  }
  return places;
}
