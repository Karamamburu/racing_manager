import { useQuery } from '@tanstack/react-query';
import type { MainPageResponse } from '../../shared/types/main';
import { mainService } from './mainService';

export function useMainDashboardQuery() {
  return useQuery<MainPageResponse>({
    queryKey: ['main-dashboard'],
    queryFn: () => mainService.getDashboardData(),
  });
}
