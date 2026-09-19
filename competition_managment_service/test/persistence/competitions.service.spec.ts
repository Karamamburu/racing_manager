import { CompetitionFormat } from '../../src/domain/types';
import { CompetitionsService } from '../../src/persistence/competitions.service';
import { PrismaService } from '../../src/persistence/prisma.service';

const miniFormat: CompetitionFormat = {
  stages: [
    {
      id: 'prologue',
      kind: 'PROLOGUE',
      heats: { type: 'NONE' },
      ranking: { type: 'BY_TIME' },
      advancement: {
        type: 'ROUTES',
        routes: [
          {
            cut: { type: 'TOP_PERCENT', percent: 50 },
            toStageId: 'qf',
          },
        ],
      },
    },
    {
      id: 'qf',
      kind: 'QUARTERFINAL',
      heats: { type: 'NONE' },
      ranking: { type: 'BY_TIME' },
      advancement: { type: 'NONE' },
    },
  ],
};

const competitionId = '11111111-1111-4111-8111-111111111111';

function participant(externalId: string, seed: number, uuid: string) {
  return {
    id: uuid,
    competitionId,
    externalId,
    seed,
    meta: null,
    createdAt: new Date(),
  };
}

describe('CompetitionsService.advanceStage', () => {
  it('persists the two prologue qualifiers onto the next stage', async () => {
    const p1 = participant('p1', 1, '21111111-1111-4111-8111-111111111111');
    const p2 = participant('p2', 2, '22111111-1111-4111-8111-111111111111');
    const p3 = participant('p3', 3, '23111111-1111-4111-8111-111111111111');
    const p4 = participant('p4', 4, '24111111-1111-4111-8111-111111111111');
    const participants = [p1, p2, p3, p4];

    const loaded = {
      id: competitionId,
      name: 'Mini',
      status: 'IN_PROGRESS',
      formatId: null,
      formatSnapshot: miniFormat,
      createdAt: new Date(),
      updatedAt: new Date(),
      participants,
      stageEntries: participants.map((row) => ({
        id: `entry-${row.externalId}`,
        competitionId,
        stageId: 'prologue',
        participantId: row.id,
        seed: row.seed,
        eliminated: false,
        participant: row,
      })),
      stageRuns: [
        {
          id: 'run-prologue',
          competitionId,
          stageId: 'prologue',
          status: 'SEEDED',
          createdAt: new Date(),
          updatedAt: new Date(),
          rankings: [],
          heats: [
            {
              id: 'heat-1',
              stageRunId: 'run-prologue',
              heatNumber: 1,
              slots: participants.map((row, index) => ({
                id: `slot-${row.externalId}`,
                heatId: 'heat-1',
                position: index + 1,
                participantId: row.id,
                participant: row,
                result: {
                  id: `result-${row.externalId}`,
                  heatSlotId: `slot-${row.externalId}`,
                  status: 'OK',
                  timeMilliseconds: row.seed * 1000,
                  placeInHeat: index + 1,
                },
              })),
            },
          ],
        },
        {
          id: 'run-qf',
          competitionId,
          stageId: 'qf',
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
          rankings: [],
          heats: [],
        },
      ],
    };

    const createdEntries: Array<{ stageId: string; participantId: string; seed: number }> =
      [];
    const tx = {
      stageEntry: {
        updateMany: jest.fn(),
        createMany: jest.fn(({ data }: { data: typeof createdEntries }) => {
          createdEntries.push(...data);
          return { count: data.length };
        }),
      },
      stageRanking: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      stageRun: { update: jest.fn() },
      heat: { deleteMany: jest.fn(), create: jest.fn() },
      competition: { update: jest.fn() },
    };
    const prisma = {
      competition: {
        findUnique: jest.fn().mockResolvedValue(loaded),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) =>
        fn(tx),
      ),
    };

    const service = new CompetitionsService(prisma as unknown as PrismaService);
    await service.advanceStage(competitionId, 'prologue');

    expect(createdEntries.map((row) => row.stageId)).toEqual(['qf', 'qf']);
    expect(createdEntries.map((row) => row.participantId).sort()).toEqual(
      [p1.id, p2.id].sort(),
    );
    expect(tx.stageEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { eliminated: true },
        where: expect.objectContaining({
          participant: { externalId: { in: ['p3', 'p4'] } },
        }),
      }),
    );
    expect(tx.heat.create).toHaveBeenCalled();
    expect(tx.stageRun.update).toHaveBeenCalledWith({
      where: { id: 'run-prologue' },
      data: { status: 'COMPLETED' },
    });
  });
});
