import { mainResponseMock } from '../../mocks/main';
import type { MainDashboardResponse } from '../../shared/types/main';

const MAIN_MOCK_DELAY_MS = 450;

export class MainService {
  public async getDashboardData(): Promise<MainDashboardResponse> {
    return new Promise((resolve) => {
      window.setTimeout(() => resolve(mainResponseMock), MAIN_MOCK_DELAY_MS);
    });
  }
}

export const mainService = new MainService();
