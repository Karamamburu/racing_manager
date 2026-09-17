import { useQuery } from '@tanstack/react-query';
import type { NewsListItem } from '../../shared/types/news';
import { newsService } from './newsService';

export const newsListQueryKey = ['news'] as const;

export function useNewsListQuery(trackId?: string) {
  return useQuery<NewsListItem[]>({
    queryKey: trackId ? [...newsListQueryKey, trackId] : newsListQueryKey,
    queryFn: () => newsService.list(trackId),
  });
}
