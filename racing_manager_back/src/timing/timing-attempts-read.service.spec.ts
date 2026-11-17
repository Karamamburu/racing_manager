import type { GenderType } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import { TimingAttemptsReadRepository } from './timing-attempts-read.repository';
import { TimingAttemptsReadService } from './timing-attempts-read.service';

/**
 * Unit tests for the read-only timing guards (AD-21). The service spec uses a
 * fake repository, the repository spec a fake Prisma client: no Prisma, no
 * database, no HTTP. The query shapes are asserted because the scope of each
 * guard is exactly its `where` clause.
 */

const EVENT_ID = 'event-a';
const RACE_ID = 'race-a';
const STAGE_ID = 'stage-1';
const HEAT_NUMBER = 2;
const START_ID = 'start-a';
const FORMAT_ID = 3;
const GENDER: GenderType = 'M';
const REGISTRATION_ID = 'registration-a';

function createRepositoryFake() {
  return {
    hasRunningHeat: jest.fn((): Promise<boolean> => Promise.resolve(false)),
    hasRunningHeatForStage: jest.fn(
      (): Promise<boolean> => Promise.resolve(false),
    ),
    hasRunningAttemptForCategory: jest.fn(
      (): Promise<boolean> => Promise.resolve(false),
    ),
    hasRunningAttemptForRace: jest.fn(
      (): Promise<boolean> => Promise.resolve(false),
    ),
    hasRunningAttemptForParticipant: jest.fn(
      (): Promise<boolean> => Promise.resolve(false),
    ),
  };
}

function createService(repository: ReturnType<typeof createRepositoryFake>) {
  return new TimingAttemptsReadService(
    repository as unknown as TimingAttemptsReadRepository,
  );
}

describe('TimingAttemptsReadService', () => {
  describe('hasRunningHeat', () => {
    it('refuses the heat whose attempt runs', async () => {
      const repository = createRepositoryFake();
      repository.hasRunningHeat.mockResolvedValue(true);
      const service = createService(repository);

      await expect(
        service.hasRunningHeat(RACE_ID, STAGE_ID, HEAT_NUMBER),
      ).resolves.toBe(true);
      expect(repository.hasRunningHeat).toHaveBeenCalledWith(
        RACE_ID,
        STAGE_ID,
        HEAT_NUMBER,
      );
    });

    it('lets the other heats of the stage through', async () => {
      const repository = createRepositoryFake();
      const service = createService(repository);

      await expect(
        service.hasRunningHeat(RACE_ID, STAGE_ID, HEAT_NUMBER),
      ).resolves.toBe(false);
      expect(repository.hasRunningHeat).toHaveBeenCalledWith(
        RACE_ID,
        STAGE_ID,
        HEAT_NUMBER,
      );
    });
  });

  describe('hasRunningHeatForStage', () => {
    it('refuses a stage change while one of its heats runs', async () => {
      const repository = createRepositoryFake();
      repository.hasRunningHeatForStage.mockResolvedValue(true);
      const service = createService(repository);

      await expect(
        service.hasRunningHeatForStage(RACE_ID, STAGE_ID),
      ).resolves.toBe(true);
      expect(repository.hasRunningHeatForStage).toHaveBeenCalledWith(
        RACE_ID,
        STAGE_ID,
      );
    });

    it('lets a stage change through when no heat of it runs', async () => {
      const repository = createRepositoryFake();
      const service = createService(repository);

      await expect(
        service.hasRunningHeatForStage(RACE_ID, STAGE_ID),
      ).resolves.toBe(false);
      expect(repository.hasRunningHeatForStage).toHaveBeenCalledWith(
        RACE_ID,
        STAGE_ID,
      );
    });
  });

  describe('hasRunningAttemptForCategory', () => {
    it('refuses the category finish while a category or heat attempt runs', async () => {
      const repository = createRepositoryFake();
      repository.hasRunningAttemptForCategory.mockResolvedValue(true);
      const service = createService(repository);

      await expect(
        service.hasRunningAttemptForCategory(
          EVENT_ID,
          START_ID,
          FORMAT_ID,
          GENDER,
        ),
      ).resolves.toBe(true);
      expect(repository.hasRunningAttemptForCategory).toHaveBeenCalledWith(
        EVENT_ID,
        START_ID,
        FORMAT_ID,
        GENDER,
      );
    });

    it('lets the category finish through when nothing of it runs', async () => {
      const repository = createRepositoryFake();
      const service = createService(repository);

      await expect(
        service.hasRunningAttemptForCategory(
          EVENT_ID,
          START_ID,
          FORMAT_ID,
          GENDER,
        ),
      ).resolves.toBe(false);
      expect(repository.hasRunningAttemptForCategory).toHaveBeenCalledWith(
        EVENT_ID,
        START_ID,
        FORMAT_ID,
        GENDER,
      );
    });
  });

  describe('hasRunningAttemptForRace', () => {
    it('refuses the race while any of its heat attempts runs', async () => {
      const repository = createRepositoryFake();
      repository.hasRunningAttemptForRace.mockResolvedValue(true);
      const service = createService(repository);

      await expect(
        service.hasRunningAttemptForRace(EVENT_ID, RACE_ID),
      ).resolves.toBe(true);
      expect(repository.hasRunningAttemptForRace).toHaveBeenCalledWith(
        EVENT_ID,
        RACE_ID,
      );
    });

    it('lets a race without a running heat attempt through', async () => {
      const repository = createRepositoryFake();
      const service = createService(repository);

      await expect(
        service.hasRunningAttemptForRace(EVENT_ID, RACE_ID),
      ).resolves.toBe(false);
      expect(repository.hasRunningAttemptForRace).toHaveBeenCalledWith(
        EVENT_ID,
        RACE_ID,
      );
    });
  });

  describe('hasRunningAttemptForParticipant', () => {
    it('refuses a participant of a running attempt', async () => {
      const repository = createRepositoryFake();
      repository.hasRunningAttemptForParticipant.mockResolvedValue(true);
      const service = createService(repository);

      await expect(
        service.hasRunningAttemptForParticipant(EVENT_ID, REGISTRATION_ID),
      ).resolves.toBe(true);
      expect(repository.hasRunningAttemptForParticipant).toHaveBeenCalledWith(
        EVENT_ID,
        REGISTRATION_ID,
      );
    });

    it('lets a participant of no running attempt through', async () => {
      const repository = createRepositoryFake();
      const service = createService(repository);

      await expect(
        service.hasRunningAttemptForParticipant(EVENT_ID, REGISTRATION_ID),
      ).resolves.toBe(false);
      expect(repository.hasRunningAttemptForParticipant).toHaveBeenCalledWith(
        EVENT_ID,
        REGISTRATION_ID,
      );
    });
  });
});

function createPrismaFake() {
  const timingSession = { findFirst: jest.fn() };
  const timingSessionParticipant = { findFirst: jest.fn() };
  return { timingSession, timingSessionParticipant };
}

function createReadRepository(prisma: ReturnType<typeof createPrismaFake>) {
  return new TimingAttemptsReadRepository(prisma as unknown as PrismaService);
}

describe('TimingAttemptsReadRepository', () => {
  it('reads one exact heat, not the stage or the other heats', async () => {
    const prisma = createPrismaFake();
    prisma.timingSession.findFirst.mockResolvedValue({ id: 'attempt-a' });
    const repository = createReadRepository(prisma);

    await expect(
      repository.hasRunningHeat(RACE_ID, STAGE_ID, HEAT_NUMBER),
    ).resolves.toBe(true);
    expect(prisma.timingSession.findFirst).toHaveBeenCalledWith({
      where: {
        attemptKind: 'HEAT',
        classCompetitionId: RACE_ID,
        stageId: STAGE_ID,
        heatNumber: HEAT_NUMBER,
        status: 'RUNNING',
      },
      select: { id: true },
    });
  });

  it('reads no heat as absent', async () => {
    const prisma = createPrismaFake();
    prisma.timingSession.findFirst.mockResolvedValue(null);
    const repository = createReadRepository(prisma);

    await expect(
      repository.hasRunningHeat(RACE_ID, STAGE_ID, HEAT_NUMBER),
    ).resolves.toBe(false);
  });

  it('reads the stage-wide heat guard without a heat number', async () => {
    const prisma = createPrismaFake();
    prisma.timingSession.findFirst.mockResolvedValue({ id: 'attempt-a' });
    const repository = createReadRepository(prisma);

    await expect(
      repository.hasRunningHeatForStage(RACE_ID, STAGE_ID),
    ).resolves.toBe(true);
    expect(prisma.timingSession.findFirst).toHaveBeenCalledWith({
      where: {
        attemptKind: 'HEAT',
        classCompetitionId: RACE_ID,
        stageId: STAGE_ID,
        status: 'RUNNING',
      },
      select: { id: true },
    });
  });

  it('reads the category guard over both attempt kinds', async () => {
    const prisma = createPrismaFake();
    prisma.timingSession.findFirst.mockResolvedValue({ id: 'attempt-a' });
    const repository = createReadRepository(prisma);

    await expect(
      repository.hasRunningAttemptForCategory(
        EVENT_ID,
        START_ID,
        FORMAT_ID,
        GENDER,
      ),
    ).resolves.toBe(true);
    expect(prisma.timingSession.findFirst).toHaveBeenCalledWith({
      where: {
        eventId: EVENT_ID,
        startId: START_ID,
        formatId: FORMAT_ID,
        gender: GENDER,
        attemptKind: { in: ['CATEGORY', 'HEAT'] },
        status: 'RUNNING',
      },
      select: { id: true },
    });
  });

  it('reads the race guard over its heat attempts only', async () => {
    const prisma = createPrismaFake();
    prisma.timingSession.findFirst.mockResolvedValue(null);
    const repository = createReadRepository(prisma);

    await expect(
      repository.hasRunningAttemptForRace(EVENT_ID, RACE_ID),
    ).resolves.toBe(false);
    expect(prisma.timingSession.findFirst).toHaveBeenCalledWith({
      where: {
        eventId: EVENT_ID,
        classCompetitionId: RACE_ID,
        attemptKind: 'HEAT',
        status: 'RUNNING',
      },
      select: { id: true },
    });
  });

  it('reads the participant guard through the frozen roster', async () => {
    const prisma = createPrismaFake();
    prisma.timingSessionParticipant.findFirst.mockResolvedValue({
      sessionId: 'attempt-a',
    });
    const repository = createReadRepository(prisma);

    await expect(
      repository.hasRunningAttemptForParticipant(EVENT_ID, REGISTRATION_ID),
    ).resolves.toBe(true);
    expect(prisma.timingSessionParticipant.findFirst).toHaveBeenCalledWith({
      where: {
        registrationId: REGISTRATION_ID,
        session: { eventId: EVENT_ID, status: 'RUNNING' },
      },
      select: { sessionId: true },
    });
  });

  it('reads a participant of no running attempt as absent', async () => {
    const prisma = createPrismaFake();
    prisma.timingSessionParticipant.findFirst.mockResolvedValue(null);
    const repository = createReadRepository(prisma);

    await expect(
      repository.hasRunningAttemptForParticipant(EVENT_ID, REGISTRATION_ID),
    ).resolves.toBe(false);
  });
});
