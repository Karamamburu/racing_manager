import { apiClient } from '../../shared/api/ApiClient';
import type { MainPageResponse, PlatformStats } from '../../shared/types/main';

export class MainService {
  public async getDashboardData(): Promise<MainPageResponse> {
    return apiClient.get<MainPageResponse>('/');
  }

  public async getStats(): Promise<PlatformStats> {
    return apiClient.get<PlatformStats>('/stats');
  }
}

export const mainService = new MainService();
