import { useQuery } from '@tanstack/react-query';
import { personalService } from '../personal/personalService';
import type { PersonalResponse } from '../../shared/types/personal';

export const personalQueryKey = ['personal'] as const;

type UsePersonalQueryOptions = {
  enabled?: boolean;
};

export function usePersonalQuery(options?: UsePersonalQueryOptions) {
  return useQuery<PersonalResponse>({
    queryKey: personalQueryKey,
    queryFn: () => personalService.getPersonalData(),
    enabled: options?.enabled ?? true,
  });
}
