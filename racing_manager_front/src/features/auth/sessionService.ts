import { apiClient } from '../../shared/api/ApiClient';
import type { AuthSession } from '../../shared/types/session';

export const sessionQueryKey = ['auth-session'] as const;

function isAuthSession(value: unknown): value is AuthSession {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const payload = value as Partial<AuthSession>;
  return (
    typeof payload.authenticated === 'boolean' &&
    (payload.userId === null || typeof payload.userId === 'string') &&
    Array.isArray(payload.roles) &&
    payload.roles.every((role) => typeof role === 'string')
  );
}

export class SessionService {
  public async getSession(): Promise<AuthSession> {
    const data: unknown = await apiClient.get<unknown>('/auth/session');
    if (!isAuthSession(data)) {
      throw new Error('Session endpoint returned an invalid payload');
    }
    return data;
  }
}

export const sessionService = new SessionService();
