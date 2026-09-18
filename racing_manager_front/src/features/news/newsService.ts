import { AxiosError } from 'axios';
import { apiClient } from '../../shared/api/ApiClient';
import type { NewsArticle, NewsListItem, SaveNewsRequest } from '../../shared/types/news';

export class NewsService {
  public async list(trackId?: string): Promise<NewsListItem[]> {
    return apiClient.get<NewsListItem[]>('/news', {
      params: trackId ? { trackId } : undefined,
    });
  }

  public async getById(id: string): Promise<NewsArticle> {
    return apiClient.get<NewsArticle>(`/news/${id}`);
  }

  public async create(
    payload: SaveNewsRequest,
  ): Promise<{ status: number; data: NewsArticle }> {
    return apiClient.postResult<NewsArticle>('/admin/news', payload);
  }

  public async update(
    id: string,
    payload: SaveNewsRequest,
  ): Promise<{ status: number; data: NewsArticle }> {
    return apiClient.patchResult<NewsArticle>(`/admin/news/${id}`, payload);
  }

  public async remove(id: string): Promise<{ status: number }> {
    return apiClient.deleteResult(`/admin/news/${id}`);
  }

  public async uploadMedia(
    file: File,
  ): Promise<{ url: string; contentType: string; key: string; size: number }> {
    const data = new FormData();
    data.append('file', file);
    return apiClient.post('/admin/news/media', data, {
      timeout: 120_000,
    });
  }

  public getStatus(error: unknown): number | undefined {
    if (error instanceof AxiosError) return error.response?.status;
    return undefined;
  }

  public getErrorMessage(error: unknown): string {
    if (error instanceof AxiosError) {
      const payload = error.response?.data as { message?: string | string[] } | undefined;
      const message = payload?.message;
      if (typeof message === 'string' && message.trim()) return message;
      if (Array.isArray(message) && message.length) return message.join(' ');
    }
    return 'Не удалось выполнить запрос';
  }
}

export const newsService = new NewsService();
