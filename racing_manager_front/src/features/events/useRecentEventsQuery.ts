import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { RecentEventRow } from '../../shared/types/event';
import type { EventListRange } from './eventsService';
import { eventsService } from './eventsService';

export const recentEventsQueryKey = ['recent-events'] as const;

export function useRecentEventsQuery(range?: EventListRange) {
  return useQuery<RecentEventRow[]>({
    queryKey: range ? [...recentEventsQueryKey, range.from, range.to] : recentEventsQueryKey,
    queryFn: () => eventsService.listRecent(range),
    placeholderData: range ? keepPreviousData : undefined,
  });
}
