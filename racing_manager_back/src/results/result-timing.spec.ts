import type { Prisma } from '../../generated/prisma';
import { isCompleteResult } from '../events/rank-registrations';

describe('result timing nullability', () => {
  it('accepts a non-FINISHED result without timing in the Prisma model', () => {
    const create: Prisma.ResultCreateInput = {
      registration: { connect: { id: 'registration-1' } },
      outcome: 'DNS',
      timeMilliseconds: null,
    };

    expect(create.timeMilliseconds).toBeNull();
  });

  it('does not rank a result that has no timing', () => {
    expect(
      isCompleteResult(
        {
          id: 'registration-1',
          formatId: 1,
          gender: 'M',
          startNumber: 1,
          status: 'FINISHED',
          registeredAt: new Date(),
          result: {
            timeMilliseconds: null,
            laps: { length: 0 },
          },
        },
        0,
      ),
    ).toBe(false);
  });
});
