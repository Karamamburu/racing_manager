import { Injectable } from '@nestjs/common';
import { type GenderType } from '../../generated/prisma';
import { TimingAttemptsReadRepository } from './timing-attempts-read.repository';

/**
 * The read-only guards of AD-21, as the class-competitions and events modules
 * call them. Each guard answers whether an attempt is running in the scope the
 * caller is about to change; the caller makes the refusal and keeps its own
 * access rules and messages.
 */
@Injectable()
export class TimingAttemptsReadService {
  constructor(private readonly repository: TimingAttemptsReadRepository) {}

  /** Whether this exact heat has a `RUNNING` timing attempt (FR-48). */
  hasRunningHeat(
    classCompetitionId: string,
    stageId: string,
    heatNumber: number,
  ): Promise<boolean> {
    return this.repository.hasRunningHeat(
      classCompetitionId,
      stageId,
      heatNumber,
    );
  }

  /** Whether any heat of the stage has a `RUNNING` attempt (FR-32). */
  hasRunningHeatForStage(
    classCompetitionId: string,
    stageId: string,
  ): Promise<boolean> {
    return this.repository.hasRunningHeatForStage(classCompetitionId, stageId);
  }

  /** Whether any category or heat attempt of the category runs (FR-33). */
  hasRunningAttemptForCategory(
    eventId: string,
    startId: string,
    formatId: number,
    gender: GenderType,
  ): Promise<boolean> {
    return this.repository.hasRunningAttemptForCategory(
      eventId,
      startId,
      formatId,
      gender,
    );
  }

  /** Whether any heat attempt of the race runs (FR-33, FR-49). */
  hasRunningAttemptForRace(
    eventId: string,
    classCompetitionId: string,
  ): Promise<boolean> {
    return this.repository.hasRunningAttemptForRace(
      eventId,
      classCompetitionId,
    );
  }

  /** Whether a running attempt holds this participant in its roster (FR-49). */
  hasRunningAttemptForParticipant(
    eventId: string,
    registrationId: string,
  ): Promise<boolean> {
    return this.repository.hasRunningAttemptForParticipant(
      eventId,
      registrationId,
    );
  }
}
