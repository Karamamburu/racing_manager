import { AxiosError } from 'axios';
import { apiClient } from '../../shared/api/ApiClient';
import type { AddableStageKind, ClassCompetitionView, HeatResultStatus } from './types';

export class ClassCompetitionsService {
  public list(eventId: string): Promise<ClassCompetitionView[]> {
    return apiClient.get<ClassCompetitionView[]>(`/events/${eventId}/class-competitions`);
  }

  public async create(
    eventId: string,
    body: { formatId: number | null; gender: 'M' | 'F' },
  ): Promise<ClassCompetitionView> {
    const result = await apiClient.postResult<ClassCompetitionView>(
      `/events/${eventId}/class-competitions`,
      body,
    );
    return result.data;
  }

  public async updatePlan(
    eventId: string,
    classCompetitionId: string,
    body: { removeStageIds: string[] } | { addStage: AddableStageKind },
  ): Promise<ClassCompetitionView> {
    const result = await apiClient.patchResult<ClassCompetitionView>(
      `/events/${eventId}/class-competitions/${classCompetitionId}/plan`,
      body,
    );
    return result.data;
  }

  public async seedStage(
    eventId: string,
    classCompetitionId: string,
    stageId: string,
  ): Promise<ClassCompetitionView> {
    const result = await apiClient.postResult<ClassCompetitionView>(
      `/events/${eventId}/class-competitions/${classCompetitionId}/stages/${stageId}/start-lists`,
    );
    return result.data;
  }

  public async reassignHeats(
    eventId: string,
    classCompetitionId: string,
    stageId: string,
    heats: Array<{ heatNumber: number; registrationIds: string[] }>,
  ): Promise<ClassCompetitionView> {
    const result = await apiClient.putResult<ClassCompetitionView>(
      `/events/${eventId}/class-competitions/${classCompetitionId}/stages/${stageId}/heats`,
      { heats },
    );
    return result.data;
  }

  public async recordHeatTimes(
    eventId: string,
    classCompetitionId: string,
    stageId: string,
    body: {
      commit: boolean;
      entries: Array<{
        registrationId: string;
        heatNumber: number;
        status: HeatResultStatus;
        timeMilliseconds?: number;
      }>;
    },
  ): Promise<ClassCompetitionView> {
    const result = await apiClient.putResult<ClassCompetitionView>(
      `/events/${eventId}/class-competitions/${classCompetitionId}/stages/${stageId}/heat-times`,
      body,
    );
    return result.data;
  }

  public getStatus(error: unknown): number | undefined {
    if (error instanceof AxiosError) return error.response?.status;
    return undefined;
  }

  public getErrorMessage(error: unknown): string {
    if (error instanceof AxiosError) {
      const payload = error.response?.data as { message?: string | string[] } | undefined;
      const message = payload?.message;
      if (typeof message === 'string' && message.trim()) return message;
      if (Array.isArray(message) && message.length) return message.join(' ');
    }
    return 'Не удалось выполнить запрос';
  }
}

export const classCompetitionsService = new ClassCompetitionsService();
