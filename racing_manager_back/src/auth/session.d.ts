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
    };
    tokens?: {
      idToken?: string;
      accessToken?: string;
    };
    userSub?: string;
    user?: SessionUser;
  }
}
