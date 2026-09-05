import { useQuery } from '@tanstack/react-query';
import type { RecentEventRow } from '../../shared/types/event';
import { eventsService } from './eventsService';

export const recentEventsQueryKey = ['recent-events'] as const;

export function useRecentEventsQuery() {
  return useQuery<RecentEventRow[]>({
    queryKey: recentEventsQueryKey,
    queryFn: () => eventsService.listRecent(),
  });
}
