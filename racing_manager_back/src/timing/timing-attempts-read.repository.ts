import { Injectable } from '@nestjs/common';
import { type GenderType } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-only existence checks over `timing_sessions` for the modules that must
 * refuse a manual write while a timing attempt runs (AD-21).
 *
 * Each method answers one question and returns a boolean: no write, no
 * transaction, no rule beyond the scope it names. The two kinds share the
 * event, start, format and gender of their protocol category, so a heat is
 * inside its category (AD-14); the race and stage scopes read the heat fields
 * only.
 */
@Injectable()
export class TimingAttemptsReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Whether this exact heat of this race and stage has a `RUNNING` attempt. */
  async hasRunningHeat(
    classCompetitionId: string,
    stageId: string,
    heatNumber: number,
  ): Promise<boolean> {
    const row = await this.prisma.timingSession.findFirst({
      where: {
        attemptKind: 'HEAT',
        classCompetitionId,
        stageId,
        heatNumber,
        status: 'RUNNING',
      },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Whether any heat of the stage has a `RUNNING` attempt. The heat number is
   * deliberately absent: a stage commitment or a structural stage change
   * spans every heat of the stage.
   */
  async hasRunningHeatForStage(
    classCompetitionId: string,
    stageId: string,
  ): Promise<boolean> {
    const row = await this.prisma.timingSession.findFirst({
      where: {
        attemptKind: 'HEAT',
        classCompetitionId,
        stageId,
        status: 'RUNNING',
      },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Whether any attempt of the protocol category runs. Both kinds count: a
   * heat attempt carries its category's event, start, format and gender, so a
   * running heat also keeps its category open.
   */
  async hasRunningAttemptForCategory(
    eventId: string,
    startId: string,
    formatId: number,
    gender: GenderType,
  ): Promise<boolean> {
    const row = await this.prisma.timingSession.findFirst({
      where: {
        eventId,
        startId,
        formatId,
        gender,
        attemptKind: { in: ['CATEGORY', 'HEAT'] },
        status: 'RUNNING',
      },
      select: { id: true },
    });
    return row !== null;
  }

  /** Whether any heat attempt of the race runs, on any stage or heat. */
  async hasRunningAttemptForRace(
    eventId: string,
    classCompetitionId: string,
  ): Promise<boolean> {
    const row = await this.prisma.timingSession.findFirst({
      where: {
        eventId,
        classCompetitionId,
        attemptKind: 'HEAT',
        status: 'RUNNING',
      },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Whether any running attempt of the event has this registration in its
   * frozen roster. A start number and a race field are frozen at Start, so both
   * kinds of running attempt hold their participants still.
   */
  async hasRunningAttemptForParticipant(
    eventId: string,
    registrationId: string,
  ): Promise<boolean> {
    const row = await this.prisma.timingSessionParticipant.findFirst({
      where: {
        registrationId,
        session: { eventId, status: 'RUNNING' },
      },
      select: { sessionId: true },
    });
    return row !== null;
  }
}
