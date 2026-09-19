import { snakeAssign } from '../../src/domain/seeding/snake';
import { crossAssign } from '../../src/domain/seeding/cross';
import { byOverallRankAssign } from '../../src/domain/seeding/by-overall-rank';
import { assignHeats } from '../../src/domain/seeding/assign-heats';
import { DomainError } from '../../src/domain/errors';
import { makeParticipants, heatSeeds } from './helpers';

describe('seeding', () => {
  const seeds24 = Array.from({ length: 24 }, (_, index) => index + 1);

  it('SNAKE distributes 24 athletes into 4x6 matching the QF fixture', () => {
    expect(snakeAssign(seeds24, 4)).toEqual([
      [1, 8, 9, 16, 17, 24],
      [2, 7, 10, 15, 18, 23],
      [3, 6, 11, 14, 19, 22],
      [4, 5, 12, 13, 20, 21],
    ]);
  });

  it('CROSS spreads 24 athletes without reversing', () => {
    expect(crossAssign(seeds24, 4)).toEqual([
      [1, 5, 9, 13, 17, 21],
      [2, 6, 10, 14, 18, 22],
      [3, 7, 11, 15, 19, 23],
      [4, 8, 12, 16, 20, 24],
    ]);
  });

  it('BY_OVERALL_RANK fills consecutive blocks', () => {
    expect(byOverallRankAssign(seeds24, 4)).toEqual([
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12],
      [13, 14, 15, 16, 17, 18],
      [19, 20, 21, 22, 23, 24],
    ]);
  });

  it('SNAKE keeps heat sizes balanced for 23 athletes', () => {
    const groups = snakeAssign(
      Array.from({ length: 23 }, (_, index) => index + 1),
      4,
    );
    expect(groups.map((group) => group.length).sort()).toEqual([5, 6, 6, 6]);
    expect(groups).toEqual([
      [1, 8, 9, 16, 17],
      [2, 7, 10, 15, 18, 23],
      [3, 6, 11, 14, 19, 22],
      [4, 5, 12, 13, 20, 21],
    ]);
  });

  it('CROSS keeps heat sizes balanced for 23 athletes', () => {
    const groups = crossAssign(
      Array.from({ length: 23 }, (_, index) => index + 1),
      4,
    );
    expect(groups.map((group) => group.length).sort()).toEqual([5, 6, 6, 6]);
  });

  it('BY_OVERALL_RANK puts remainder into the first heats', () => {
    const groups = byOverallRankAssign(
      Array.from({ length: 23 }, (_, index) => index + 1),
      4,
    );
    expect(groups.map((group) => group.length)).toEqual([6, 6, 6, 5]);
    expect(groups[3]).toEqual([19, 20, 21, 22, 23]);
  });

  it('MANUAL assigns provided slots and rejects gaps', () => {
    const participants = makeParticipants(4);
    const heats = assignHeats(
      participants,
      {
        type: 'HEATS',
        remainder: 'BALANCED',
        seeding: { type: 'MANUAL' },
      },
      [
        { heatNumber: 1, participantIds: ['p1', 'p4'] },
        { heatNumber: 2, participantIds: ['p2', 'p3'] },
      ],
    );
    expect(heatSeeds(heats)).toEqual([[1, 4], [2, 3]]);

    expect(() =>
      assignHeats(
        participants,
        {
          type: 'HEATS',
          remainder: 'BALANCED',
          seeding: { type: 'MANUAL' },
        },
        [
          { heatNumber: 1, participantIds: ['p1', 'p2'] },
          { heatNumber: 3, participantIds: ['p3', 'p4'] },
        ],
      ),
    ).toThrow(DomainError);
  });

  it('MANUAL rejects a missing participant', () => {
    expect(() =>
      assignHeats(
        makeParticipants(3),
        {
          type: 'HEATS',
          remainder: 'BALANCED',
          seeding: { type: 'MANUAL' },
        },
        [
          { heatNumber: 1, participantIds: ['p1'] },
          { heatNumber: 2, participantIds: ['p2'] },
        ],
      ),
    ).toThrow(/missing participants: p3/);
  });
});
