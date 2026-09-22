import { CompetitionFormat } from '../../src/domain/types';
import { CompetitionsService } from '../../src/persistence/competitions.service';
import { PrismaService } from '../../src/persistence/prisma.service';

const miniFormat: CompetitionFormat = {
  stages: [
    {
      id: 'prologue',
      kind: 'PROLOGUE',
      heats: { type: 'NONE' },
      ranking: { type: 'BY_PLACE' },
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
      ranking: { type: 'BY_PLACE' },
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
                  place: row.seed,
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

  it('completes a terminal final and marks the competition DONE', async () => {
    const people = [p1Fixture(), p2Fixture()];
    const finalFormat: CompetitionFormat = {
      stages: [
        {
          id: 'final',
          kind: 'FINAL',
          heats: {
            type: 'HEATS',
            heatCount: 1,
            remainder: 'BALANCED',
            seeding: { type: 'BY_OVERALL_RANK' },
          },
          ranking: { type: 'BY_PLACE' },
          advancement: { type: 'NONE' },
        },
      ],
    };
    const loaded = {
      id: competitionId,
      name: 'Final only',
      status: 'IN_PROGRESS',
      formatId: null,
      formatSnapshot: finalFormat,
      createdAt: new Date(),
      updatedAt: new Date(),
      participants: people,
      stageEntries: people.map((row) => ({
        id: `entry-${row.externalId}`,
        competitionId,
        stageId: 'final',
        participantId: row.id,
        seed: row.seed,
        eliminated: false,
        participant: row,
      })),
      stageRuns: [
        {
          id: 'run-final',
          competitionId,
          stageId: 'final',
          status: 'SEEDED',
          createdAt: new Date(),
          updatedAt: new Date(),
          rankings: [],
          heats: [
            {
              id: 'heat-1',
              stageRunId: 'run-final',
              heatNumber: 1,
              slots: people.map((row, index) => ({
                id: `slot-${row.externalId}`,
                heatId: 'heat-1',
                position: index + 1,
                participantId: row.id,
                participant: row,
                result: {
                  id: `result-${row.externalId}`,
                  heatSlotId: `slot-${row.externalId}`,
                  status: 'OK',
                  place: row.seed,
                },
              })),
            },
          ],
        },
      ],
    };

    const tx = {
      stageEntry: { updateMany: jest.fn(), createMany: jest.fn() },
      stageRanking: { deleteMany: jest.fn(), createMany: jest.fn() },
      stageRun: { update: jest.fn() },
      heat: { deleteMany: jest.fn(), create: jest.fn() },
      competition: { update: jest.fn() },
    };
    const prisma = {
      competition: { findUnique: jest.fn().mockResolvedValue(loaded) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) =>
        fn(tx),
      ),
    };

    const service = new CompetitionsService(prisma as unknown as PrismaService);
    await service.advanceStage(competitionId, 'final');

    expect(tx.stageEntry.updateMany).not.toHaveBeenCalled();
    expect(tx.stageRanking.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ rank: 1, participantId: people[0].id }),
          expect.objectContaining({ rank: 2, participantId: people[1].id }),
        ]),
      }),
    );
    expect(tx.stageRun.update).toHaveBeenCalledWith({
      where: { id: 'run-final' },
      data: { status: 'COMPLETED' },
    });
    expect(tx.competition.update).toHaveBeenCalledWith({
      where: { id: competitionId },
      data: { status: 'DONE' },
    });
  });
});

describe('CompetitionsService.create', () => {
  it('proposes a single final when created without a preset for 5 people', async () => {
    const people = [1, 2, 3, 4, 5].map((seed) =>
      participant(`p${seed}`, seed, `2${seed}111111-1111-4111-8111-111111111111`),
    );
    let storedFormat: CompetitionFormat = miniFormat;
    const prisma = {
      competition: {
        create: jest.fn(async ({ data }: { data: { formatSnapshot: CompetitionFormat; name: string | null } }) => {
          storedFormat = data.formatSnapshot;
          return {
            id: competitionId,
            name: data.name,
            participants: people,
          };
        }),
        findUnique: jest.fn(async () => ({
          id: competitionId,
          name: 'Five',
          status: 'DRAFT',
          formatId: null,
          formatSnapshot: storedFormat,
          createdAt: new Date(),
          updatedAt: new Date(),
          participants: people,
          stageEntries: people.map((row) => ({
            id: `entry-${row.externalId}`,
            competitionId,
            stageId: 'prologue',
            participantId: row.id,
            seed: row.seed,
            eliminated: false,
            participant: row,
          })),
          stageRuns: storedFormat.stages.map((stage) => ({
            id: `run-${stage.id}`,
            competitionId,
            stageId: stage.id,
            status: 'PENDING',
            createdAt: new Date(),
            updatedAt: new Date(),
            rankings: [],
            heats: [],
          })),
        })),
      },
      stageEntry: { createMany: jest.fn() },
    };

    const service = new CompetitionsService(prisma as unknown as PrismaService);
    await service.create({
      name: 'Five',
      participants: people.map((row) => ({ id: row.externalId, seed: row.seed })),
    });

    expect(storedFormat.stages.map((stage) => stage.id)).toEqual(['prologue', 'final']);
    expect(prisma.competition.create).toHaveBeenCalled();
  });
});

describe('CompetitionsService.updatePlan', () => {
  it('rejects removing a SEEDED stage', async () => {
    const people = [p1Fixture(), p2Fixture(), p3Fixture(), p4Fixture()];
    const loaded = {
      id: competitionId,
      name: 'Mini',
      status: 'IN_PROGRESS',
      formatId: null,
      formatSnapshot: miniFormat,
      createdAt: new Date(),
      updatedAt: new Date(),
      participants: people,
      stageEntries: people.map((row) => ({
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
          heats: [],
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

    const prisma = {
      competition: { findUnique: jest.fn().mockResolvedValue(loaded) },
      $transaction: jest.fn(),
    };
    const service = new CompetitionsService(prisma as unknown as PrismaService);
    await expect(
      service.updatePlan(competitionId, { removeStageIds: ['prologue'] }),
    ).rejects.toThrow(/SEEDED/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CompetitionsService.reassignHeats', () => {
  it('replaces slots on a seeded stage that has no results', async () => {
    const people = [p1Fixture(), p2Fixture(), p3Fixture(), p4Fixture()];
    const loaded = seededPrologue(people);
    const created: Array<{ heatNumber: number; slots: { create: Array<{ participantId: string }> } }> = [];
    const tx = {
      heat: {
        deleteMany: jest.fn(),
        create: jest.fn(({ data }: { data: (typeof created)[number] }) => {
          created.push(data);
        }),
      },
    };
    const prisma = {
      competition: { findUnique: jest.fn().mockResolvedValue(loaded) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
    };
    const service = new CompetitionsService(prisma as unknown as PrismaService);

    await service.reassignHeats(competitionId, 'prologue', [
      { heatNumber: 1, participantIds: ['p1', 'p3'] },
      { heatNumber: 2, participantIds: ['p2', 'p4'] },
    ]);

    expect(tx.heat.deleteMany).toHaveBeenCalledWith({ where: { stageRunId: 'run-prologue' } });
    expect(created.map((heat) => heat.heatNumber)).toEqual([1, 2]);
    expect(created[0].slots.create.map((slot) => slot.participantId)).toEqual([
      people[0].id,
      people[2].id,
    ]);
    expect(prisma.competition.findUnique).toHaveBeenCalledTimes(2);
  });

  it('rejects reassignment after a result is recorded', async () => {
    const people = [p1Fixture(), p2Fixture()];
    const loaded = seededPrologue(people);
    loaded.stageRuns[0].heats[0].slots[0].result = {
      id: 'result-p1',
      heatSlotId: 'slot-p1',
      status: 'OK',
      place: 1,
    };
    const prisma = {
      competition: { findUnique: jest.fn().mockResolvedValue(loaded) },
      $transaction: jest.fn(),
    };
    const service = new CompetitionsService(prisma as unknown as PrismaService);

    await expect(
      service.reassignHeats(competitionId, 'prologue', [
        { heatNumber: 1, participantIds: ['p1', 'p2'] },
      ]),
    ).rejects.toThrow(/results/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function seededPrologue(
  people: ReturnType<typeof p1Fixture>[],
) {
  return {
    id: competitionId,
    name: 'Mini',
    status: 'IN_PROGRESS',
    formatId: null,
    formatSnapshot: miniFormat,
    createdAt: new Date(),
    updatedAt: new Date(),
    participants: people,
    stageEntries: people.map((row) => ({
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
        status: 'SEEDED' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        rankings: [],
        heats: [
          {
            id: 'heat-1',
            stageRunId: 'run-prologue',
            heatNumber: 1,
            slots: people.map((row, index) => ({
              id: `slot-${row.externalId}`,
              heatId: 'heat-1',
              position: index + 1,
              participantId: row.id,
              participant: row,
              result: null as {
                id: string;
                heatSlotId: string;
                status: string;
                place: number;
              } | null,
            })),
          },
        ],
      },
    ],
  };
}

describe('CompetitionsService.getStageProposal', () => {
  it('proposes a single final after 4 OK prologue results', async () => {
    const people = [p1Fixture(), p2Fixture(), p3Fixture(), p4Fixture()];
    const loaded = {
      id: competitionId,
      name: 'Mini',
      status: 'IN_PROGRESS',
      formatId: null,
      formatSnapshot: miniFormat,
      createdAt: new Date(),
      updatedAt: new Date(),
      participants: people,
      stageEntries: people.map((row) => ({
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
              slots: people.map((row, index) => ({
                id: `slot-${row.externalId}`,
                heatId: 'heat-1',
                position: index + 1,
                participantId: row.id,
                participant: row,
                result: {
                  id: `result-${row.externalId}`,
                  heatSlotId: `slot-${row.externalId}`,
                  status: 'OK',
                  place: row.seed,
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
    const prisma = {
      competition: { findUnique: jest.fn().mockResolvedValue(loaded) },
    };
    const service = new CompetitionsService(prisma as unknown as PrismaService);
    const proposal = await service.getStageProposal(competitionId, 'prologue');
    expect(proposal.fromStageId).toBe('prologue');
    expect(proposal.participantCount).toBe(4);
    expect(proposal.format.stages.map((stage) => stage.id)).toEqual(['prologue', 'final']);
  });
});

function p1Fixture() {
  return participant('p1', 1, '21111111-1111-4111-8111-111111111111');
}
function p2Fixture() {
  return participant('p2', 2, '22111111-1111-4111-8111-111111111111');
}
function p3Fixture() {
  return participant('p3', 3, '23111111-1111-4111-8111-111111111111');
}
function p4Fixture() {
  return participant('p4', 4, '24111111-1111-4111-8111-111111111111');
}
