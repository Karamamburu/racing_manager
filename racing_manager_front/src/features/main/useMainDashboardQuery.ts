import { useQuery } from '@tanstack/react-query';
import type { MainDashboardResponse } from '../../shared/types/main';
import { mainService } from './mainService';

export function useMainDashboardQuery() {
  return useQuery<MainDashboardResponse>({
    queryKey: ['main-dashboard'],
    queryFn: () => mainService.getDashboardData(),
  });
}
