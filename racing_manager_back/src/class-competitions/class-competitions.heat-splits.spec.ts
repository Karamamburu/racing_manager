import { heatLapSplits } from './class-competitions.service';

function lap(lapNumber: number, timeMilliseconds: number) {
  return { timeMilliseconds, eventLap: { lapNumber } };
}

describe('heatLapSplits', () => {
  it('runs the cumulative value over the laps in lap order', () => {
    expect(heatLapSplits([lap(2, 12_000), lap(1, 10_000)])).toEqual([
      { lapNumber: 1, lapTimeMs: 10_000, cumulativeMs: 10_000 },
      { lapNumber: 2, lapTimeMs: 12_000, cumulativeMs: 22_000 },
    ]);
  });

  it('exposes no split for a heat time without lap rows', () => {
    expect(heatLapSplits([])).toEqual([]);
  });

  it('keeps one split per stored lap even when the total was hand-entered', () => {
    expect(heatLapSplits([lap(1, 30_000)])).toEqual([
      { lapNumber: 1, lapTimeMs: 30_000, cumulativeMs: 30_000 },
    ]);
  });
});
