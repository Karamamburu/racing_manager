import 'express-session';

export type SessionUser = {
  sub: string;
  username?: string;
  email?: string;
  name?: string;
};

declare module 'express-session' {
  interface SessionData {
    oidc?: {
      state: string;
      nonce: string;
      codeVerifier: string;
      requestMeta?: {
        ip: string | null;
        userAgent: string | null;
      };
    };
    tokens?: {
      idToken?: string;
      accessToken?: string;
    };
    userSub?: string;
    user?: SessionUser;
  }
}
