import { AxiosError } from 'axios';
import { apiClient } from '../../shared/api/ApiClient';
import type { PersonalResponse, UpdatePersonalRequest } from '../../shared/types/personal';

function isPersonalResponse(value: unknown): value is PersonalResponse {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const payload = value as Partial<PersonalResponse>;
  return (
    typeof payload.authenticated === 'boolean' &&
    payload.user !== null &&
    typeof payload.user === 'object'
  );
}

export class PersonalService {
  public async getPersonalData(): Promise<PersonalResponse> {
    const data: unknown = await apiClient.get<unknown>('/personal');
    if (!isPersonalResponse(data)) {
      throw new Error('Personal endpoint returned an invalid payload');
    }
    return data;
  }

  public async updatePersonal(
    payload: UpdatePersonalRequest,
  ): Promise<{ status: number; data: PersonalResponse }> {
    const result = await apiClient.patchResult<unknown>('/personal', payload);
    if (!isPersonalResponse(result.data)) {
      throw new Error('Personal endpoint returned an invalid payload');
    }
    return { status: result.status, data: result.data };
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

export const personalService = new PersonalService();
