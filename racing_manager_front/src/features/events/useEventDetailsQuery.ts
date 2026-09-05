import { useQuery } from '@tanstack/react-query';
import type { EventDetails } from '../../shared/types/event';
import { eventsService } from './eventsService';

export function eventDetailsQueryKey(id: string) {
  return ['event', id] as const;
}

export function useEventDetailsQuery(id: string | undefined) {
  return useQuery<EventDetails>({
    queryKey: eventDetailsQueryKey(id ?? ''),
    queryFn: () => eventsService.getById(id as string),
    enabled: Boolean(id),
  });
}
