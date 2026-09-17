import { useQuery } from '@tanstack/react-query';
import type { CatalogTrack } from '../../shared/types/news';
import { tracksService } from './tracksService';

export const catalogTracksQueryKey = ['catalog-tracks'] as const;

export function useCatalogTracksQuery() {
  return useQuery<CatalogTrack[]>({
    queryKey: catalogTracksQueryKey,
    queryFn: () => tracksService.listActive(),
  });
}
