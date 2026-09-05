import { apiClient } from '../../shared/api/ApiClient';
import type { PersonalResponse } from '../../shared/types/personal';

export class PersonalService {
  public async getPersonalData(): Promise<PersonalResponse> {
    return apiClient.get<PersonalResponse>('/personal');
  }
}

export const personalService = new PersonalService();
