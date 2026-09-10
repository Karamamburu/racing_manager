import { apiClient } from '../../shared/api/ApiClient';
import type { MainPageResponse } from '../../shared/types/main';

export class MainService {
  public async getDashboardData(): Promise<MainPageResponse> {
    return apiClient.get<MainPageResponse>('/');
  }
}

export const mainService = new MainService();
