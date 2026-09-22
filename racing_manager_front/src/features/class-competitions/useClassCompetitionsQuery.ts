import { useQuery } from '@tanstack/react-query';
import { classCompetitionsService } from './classCompetitionsService';
import type { ClassCompetitionView } from './types';

export function classCompetitionsQueryKey(eventId: string) {
  return ['class-competitions', eventId] as const;
}

export function useClassCompetitionsQuery(eventId: string | undefined) {
  return useQuery<ClassCompetitionView[]>({
    queryKey: classCompetitionsQueryKey(eventId ?? ''),
    queryFn: () => classCompetitionsService.list(eventId as string),
    enabled: Boolean(eventId),
  });
}
