import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiClient } from '../../shared/api/ApiClient';
import { personalService } from '../personal/personalService';
import type { PersonalResponse } from '../../shared/types/personal';
import { useAuthStore } from './authStore';

export function usePersonalQuery() {
  const setStatus = useAuthStore((state) => state.setStatus);

  const query = useQuery<PersonalResponse>({
    queryKey: ['personal'],
    queryFn: () => personalService.getPersonalData(),
  });

  useEffect(() => {
    if (query.isSuccess) {
      setStatus(query.data.authenticated ? 'authenticated' : 'guest');
      return;
    }

    if (query.isError) {
      setStatus(apiClient.isUnauthorized(query.error) ? 'guest' : 'unknown');
    }
  }, [query.data, query.error, query.isError, query.isSuccess, setStatus]);

  return query;
}
