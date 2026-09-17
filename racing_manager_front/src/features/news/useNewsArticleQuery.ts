import { useQuery } from '@tanstack/react-query';
import type { NewsArticle } from '../../shared/types/news';
import { newsService } from './newsService';

export function newsArticleQueryKey(id: string) {
  return ['news-article', id] as const;
}

export function useNewsArticleQuery(id: string | undefined) {
  return useQuery<NewsArticle>({
    queryKey: newsArticleQueryKey(id ?? ''),
    queryFn: () => newsService.getById(id as string),
    enabled: Boolean(id),
  });
}
