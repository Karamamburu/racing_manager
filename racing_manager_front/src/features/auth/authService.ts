export class AuthService {
  public startLoginFlow(): void {
    window.location.assign('/api/auth/login');
  }

  public logout(): void {
    window.location.assign('/api/auth/logout');
  }
}

export const authService = new AuthService();
