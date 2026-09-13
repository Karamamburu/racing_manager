import { useQuery } from '@tanstack/react-query';
import type { PlatformStats } from '../../shared/types/main';
import { mainService } from './mainService';

export const platformStatsQueryKey = ['platform-stats'] as const;

export function usePlatformStatsQuery() {
  return useQuery<PlatformStats>({
    queryKey: platformStatsQueryKey,
    queryFn: () => mainService.getStats(),
  });
}
