import { useQuery } from '@tanstack/react-query';
import { sessionQueryKey, sessionService } from './sessionService';
import type { AuthSession } from '../../shared/types/session';

export function useSessionQuery() {
  return useQuery<AuthSession>({
    queryKey: sessionQueryKey,
    queryFn: () => sessionService.getSession(),
  });
}
