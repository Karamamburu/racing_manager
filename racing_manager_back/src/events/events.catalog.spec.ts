import { EventsService } from './events.service';
import { EventStatusSyncService } from './event-status-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../auth/roles.service';
import { UsersService } from '../users/users.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const START_A = '22222222-2222-4222-8222-222222222222';
const START_B = '33333333-3333-4333-8333-333333333333';

function makeHarness() {
  const prisma = {
    event: {
      findMany: jest.fn(() =>
        Promise.resolve([
          {
            id: EVENT_ID,
            name: 'Кубок',
            eventDate: new Date('2026-11-07T00:00:00.000Z'),
            distanceKm: { toString: () => '10' },
            status: 'PLANNED',
            track: { name: 'Алёшкино' },
            _count: { registrations: 12 },
            starts: [
              {
                id: START_B,
                purposeType: 'CONTROL_TRAINING',
                lapCount: 1,
                lapLengthMeters: 1000,
                displayName: 'Разминка',
                sortOrder: 1,
                legacyEffectiveDistanceM: null,
                routeColor: 'CYAN',
                _count: { enrollments: 3 },
                formats: [
                  { format: { id: 1, code: '5K', name: '5 км', sortOrder: 1 } },
                ],
              },
              {
                id: START_A,
                purposeType: 'CUP_RACE',
                lapCount: 5,
                lapLengthMeters: 2000,
                displayName: null,
                sortOrder: 0,
                legacyEffectiveDistanceM: null,
                routeColor: null,
                _count: { enrollments: 5 },
                formats: [
                  {
                    format: { id: 2, code: '10K', name: '10 км', sortOrder: 2 },
                  },
                ],
              },
            ],
          },
        ]),
      ),
    },
  };
  const roles = { assertAdminAccess: jest.fn(), assertHasAnyRole: jest.fn() };
  const users = { findBySub: jest.fn() };
  const sync = { syncDueStatuses: jest.fn(() => Promise.resolve(undefined)) };

  const service = new EventsService(
    prisma as unknown as PrismaService,
    roles as unknown as RolesService,
    users as unknown as UsersService,
    sync as unknown as EventStatusSyncService,
  );

  return { service };
}

describe('EventsService.listRecent', () => {
  it('returns starts ordered by sortOrder for every catalog row', async () => {
    const { service } = makeHarness();

    const rows = await service.listRecent();

    expect(rows).toHaveLength(1);
    expect(rows[0].starts.map((start) => start.id)).toEqual([START_A, START_B]);
    expect(rows[0].starts[0]).toMatchObject({
      purposeType: 'CUP_RACE',
      lapCount: 5,
      lapLengthMeters: 2000,
      resolvedLabel: 'Кубковая гонка — 10 км',
      displayedDistanceMeters: 10000,
      routeColor: null,
      registeredCount: 5,
    });
    expect(rows[0].starts[1]).toMatchObject({
      resolvedLabel: 'Разминка',
      displayedDistanceMeters: 1000,
      routeColor: 'CYAN',
      registeredCount: 3,
    });
  });
});
