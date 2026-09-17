import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Issuer, TokenSet, generators } from 'openid-client';
import type { Request } from 'express';
import type { Session, SessionData } from 'express-session';
import { UsersService } from '../users/users.service';
import { readConsentRequestMeta } from './consent-request-meta';

type RequestWithSession = Request & {
  session?: Session & Partial<SessionData>;
};

type OidcClaims = {
  sub?: unknown;
  preferred_username?: unknown;
  username?: unknown;
  email?: unknown;
  name?: unknown;
  consent?: unknown;
};

type UsersServicePort = Pick<UsersService, 'registerFromOidcProfile'>;
type SessionUser = {
  sub: string;
  username?: string;
  email?: string;
  name?: string;
};

@Injectable()
export class AuthService implements OnModuleInit {
  private client: Client;

  constructor(
    private readonly config: ConfigService,
    @Inject(UsersService) private readonly users: UsersServicePort,
  ) {}

  async onModuleInit() {
    const clientId = this.config.get<string>('CLIENT_ID');
    const clientSecret = this.config.get<string>('CLIENT_SECRET');
    const issuerUrl =
      this.config.get<string>('AUTHENTIK_ISSUER_URL') ??
      'http://localhost:9000/application/o/racing-manager/';

    if (!clientId) throw new Error('CLIENT_ID is not defined');
    if (!clientSecret) throw new Error('CLIENT_SECRET is not defined');

    const issuer = await Issuer.discover(issuerUrl);
    this.client = new issuer.Client({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: [this.getRedirectUri()],
      response_types: ['code'],
    });
  }

  getAuthorizationUrl(req: RequestWithSession): string {
    if (!req.session) {
      throw new Error(
        'Session is not initialized. Configure express-session before routes.',
      );
    }

    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    req.session.oidc = { state, nonce, codeVerifier };

    return this.client.authorizationUrl({
      scope: 'openid profile email consent',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
  }

  async handleCallback(
    req: RequestWithSession,
    fullUrl: string,
  ): Promise<{
    tokenSet: TokenSet;
    user: SessionUser | null;
    registrationStatus: 'created' | 'updated' | 'skipped';
  }> {
    if (!req.session?.oidc) {
      throw new Error(
        'OIDC session data not found. Start auth flow with /auth/login.',
      );
    }

    const { state, nonce, codeVerifier } = req.session.oidc;
    const params = this.client.callbackParams(fullUrl);
    const tokenSet = await this.client.callback(this.getRedirectUri(), params, {
      state,
      nonce,
      code_verifier: codeVerifier,
    });

    const claims = tokenSet.claims() as OidcClaims;
    const sub = typeof claims.sub === 'string' ? claims.sub : undefined;
    const username =
      typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : typeof claims.username === 'string'
          ? claims.username
          : undefined;
    const email = typeof claims.email === 'string' ? claims.email : undefined;
    const name = typeof claims.name === 'string' ? claims.name : undefined;
    const consentGranted = isOidcConsentGranted(
      await this.readConsentClaim(claims, tokenSet.access_token),
    );

    let user: SessionUser | null = null;
    let registrationStatus: 'created' | 'updated' | 'skipped' = 'skipped';
    if (sub && req.session) {
      const registration = await this.users.registerFromOidcProfile({
        sub,
        username,
        email,
        name,
        consentGranted,
        requestMeta: readConsentRequestMeta(req),
      });
      registrationStatus = registration.isNew ? 'created' : 'updated';

      user = { sub, username, email, name };
      req.session.userSub = sub;
      req.session.user = user;
      req.session.tokens = {
        idToken: tokenSet.id_token,
        accessToken: tokenSet.access_token,
      };
    }

    delete req.session.oidc;

    return { tokenSet, user, registrationStatus };
  }

  getEndSessionUrl(req: RequestWithSession): string | null {
    const endSessionEndpoint = this.client.issuer.metadata.end_session_endpoint;
    if (typeof endSessionEndpoint !== 'string' || !endSessionEndpoint) {
      return null;
    }

    const postLogoutRedirectUri =
      this.config.get<string>('POST_LOGOUT_REDIRECT_URI') ??
      'http://localhost:4000/';

    const idTokenHint = (() => {
      const sessionUnknown: unknown = req.session;
      if (!sessionUnknown || typeof sessionUnknown !== 'object') {
        return undefined;
      }

      const tokensUnknown = (sessionUnknown as Record<string, unknown>).tokens;
      if (!tokensUnknown || typeof tokensUnknown !== 'object') {
        return undefined;
      }

      const idTokenUnknown = (tokensUnknown as Record<string, unknown>).idToken;
      return typeof idTokenUnknown === 'string' ? idTokenUnknown : undefined;
    })();

    const url = new URL(endSessionEndpoint);
    if (idTokenHint) url.searchParams.set('id_token_hint', idTokenHint);
    url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
    return url.toString();
  }

  private async readConsentClaim(
    claims: OidcClaims,
    accessToken: string | undefined,
  ): Promise<unknown> {
    if (claims.consent !== undefined) return claims.consent;
    if (!accessToken) return undefined;
    try {
      const userinfo = (await this.client.userinfo(accessToken)) as OidcClaims;
      return userinfo.consent;
    } catch {
      return undefined;
    }
  }

  private getRedirectUri(): string {
    return (
      this.config.get<string>('AUTH_CALLBACK_URL') ??
      'http://localhost:4000/auth/callback'
    );
  }
}

function isOidcConsentGranted(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (
      normalized === 'false' ||
      normalized === '0' ||
      normalized === 'no' ||
      normalized === 'off'
    ) {
      return false;
    }
    return true;
  }
  return false;
}
