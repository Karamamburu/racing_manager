import { AxiosError } from 'axios';
import { apiClient } from '../../shared/api/ApiClient';
import type {
  CreatedEventResponse,
  CreateEventRequest,
  EventDetails,
  RecentEventRow,
} from '../../shared/types/event';

export class EventsService {
  public async listRecent(): Promise<RecentEventRow[]> {
    return apiClient.get<RecentEventRow[]>('/events');
  }

  public async getById(id: string): Promise<EventDetails> {
    return apiClient.get<EventDetails>(`/events/${id}`);
  }

  public async createEvent(
    payload: CreateEventRequest,
  ): Promise<{ status: number; data: CreatedEventResponse }> {
    return apiClient.postResult<CreatedEventResponse>('/admin/events', payload);
  }

  public async updateEvent(
    id: string,
    payload: CreateEventRequest,
  ): Promise<{ status: number; data: EventDetails }> {
    return apiClient.patchResult<EventDetails>(`/admin/events/${id}`, payload);
  }

  public async cancelEvent(id: string): Promise<{ status: number; data: EventDetails }> {
    return apiClient.postResult<EventDetails>(`/admin/events/${id}/cancel`);
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

export const eventsService = new EventsService();
