import { apiClient } from '../../shared/api/ApiClient';
import type { PersonalResponse } from '../../shared/types/personal';

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
}

export const personalService = new PersonalService();
