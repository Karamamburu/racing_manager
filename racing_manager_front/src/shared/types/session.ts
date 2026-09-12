export type AuthSession = {
  authenticated: boolean;
  userId: string | null;
  roles: string[];
};
