import { AxiosError } from 'axios';
import { apiClient } from '../../shared/api/ApiClient';
import type {
  CreateRegistrationRequest,
  RegistrationResponse,
  UpdateRegistrationRequest,
} from '../../shared/types/event';

export class RegistrationsService {
  public async create(
    eventId: string,
    payload?: CreateRegistrationRequest,
  ): Promise<{ status: number; data: RegistrationResponse }> {
    return apiClient.postResult<RegistrationResponse>(
      `/events/${eventId}/registrations`,
      payload ?? {},
    );
  }

  public async cancelOwn(
    eventId: string,
  ): Promise<{ status: number; data: RegistrationResponse }> {
    return apiClient.postResult<RegistrationResponse>(
      `/events/${eventId}/registrations/cancel`,
    );
  }

  public async update(
    eventId: string,
    registrationId: string,
    payload: UpdateRegistrationRequest,
  ): Promise<{ status: number; data: RegistrationResponse }> {
    return apiClient.patchResult<RegistrationResponse>(
      `/events/${eventId}/registrations/${registrationId}`,
      payload,
    );
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

export const registrationsService = new RegistrationsService();
