import { apiClient } from '../../shared/api/ApiClient';
import type { CatalogTrack } from '../../shared/types/news';

export class TracksService {
  public async listActive(): Promise<CatalogTrack[]> {
    return apiClient.get<CatalogTrack[]>('/tracks');
  }
}

export const tracksService = new TracksService();
