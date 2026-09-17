import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Issuer, TokenSet, generators } from 'openid-client';
import type { Request } from 'express';
import type { Session, SessionData } from 'express-session';
import { UsersService } from '../users/users.service';
import {
  mergeConsentRequestMeta,
  readConsentRequestMeta,
} from './consent-request-meta';

type RequestWithSession = Request & {
  session?: Session & Partial<SessionData>;
};

type OidcClaims = {
  sub?: unknown;
  preferred_username?: unknown;
  username?: unknown;
  email?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  birth_date?: unknown;
  gender?: unknown;
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

    req.session.oidc = {
      state,
      nonce,
      codeVerifier,
      requestMeta: readConsentRequestMeta(req),
    };

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

    const { state, nonce, codeVerifier, requestMeta } = req.session.oidc;
    const params = this.client.callbackParams(fullUrl);
    const tokenSet = await this.client.callback(this.getRedirectUri(), params, {
      state,
      nonce,
      code_verifier: codeVerifier,
    });

    const claims = await this.readOidcClaims(
      tokenSet.claims() as OidcClaims,
      tokenSet.access_token,
    );
    const sub = typeof claims.sub === 'string' ? claims.sub : undefined;
    const username =
      typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : typeof claims.username === 'string'
          ? claims.username
          : undefined;
    const email = typeof claims.email === 'string' ? claims.email : undefined;
    const name = typeof claims.name === 'string' ? claims.name : undefined;
    const firstName = readOptionalName(claims.first_name, claims.given_name);
    const lastName = readOptionalName(claims.last_name, claims.family_name);
    const birthDate = parseOptionalBirthDate(claims.birth_date);
    const gender = parseOptionalGender(claims.gender);
    const consentGranted = isOidcConsentGranted(claims.consent);
    const displayName =
      [firstName, lastName].filter(Boolean).join(' ').trim() || name;

    let user: SessionUser | null = null;
    let registrationStatus: 'created' | 'updated' | 'skipped' = 'skipped';
    if (sub && req.session) {
      const registration = await this.users.registerFromOidcProfile({
        sub,
        username,
        email,
        name,
        firstName,
        lastName,
        birthDate,
        gender,
        consentGranted,
        requestMeta: mergeConsentRequestMeta(
          readConsentRequestMeta(req),
          requestMeta,
        ),
      });
      registrationStatus = registration.isNew ? 'created' : 'updated';

      user = { sub, username, email, name: displayName };
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

  getPostLogoutRedirectUri(): string {
    return (
      this.config.get<string>('POST_LOGOUT_REDIRECT_URI') ??
      'http://localhost:5173/'
    );
  }

  private async readOidcClaims(
    claims: OidcClaims,
    accessToken: string | undefined,
  ): Promise<OidcClaims> {
    const needsUserinfo =
      claims.consent === undefined ||
      claims.first_name === undefined ||
      claims.last_name === undefined ||
      claims.birth_date === undefined ||
      claims.gender === undefined;
    if (!needsUserinfo || !accessToken) return claims;
    try {
      const userinfo = (await this.client.userinfo(accessToken)) as OidcClaims;
      return { ...userinfo, ...claims };
    } catch {
      return claims;
    }
  }

  private getRedirectUri(): string {
    return (
      this.config.get<string>('AUTH_CALLBACK_URL') ??
      'http://localhost:4000/auth/callback'
    );
  }
}

const MAX_NAME_LENGTH = 80;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_DOT = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const DATE_SLASH = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const MIN_BIRTH_YEAR = 1900;

function readOptionalName(
  primary: unknown,
  fallback?: unknown,
): string | undefined {
  return readOptionalString(primary) ?? readOptionalString(fallback);
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_NAME_LENGTH);
}

function parseOptionalGender(value: unknown): 'M' | 'F' | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'M' || normalized === 'F') return normalized;
  return undefined;
}

function parseOptionalBirthDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toUtcDateOnly(value);
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let isoDate = '';
  if (DATE_ONLY.test(trimmed)) {
    isoDate = trimmed;
  } else if (trimmed.length >= 10 && DATE_ONLY.test(trimmed.slice(0, 10))) {
    isoDate = trimmed.slice(0, 10);
  } else {
    const dotted = DATE_DOT.exec(trimmed);
    const slashed = DATE_SLASH.exec(trimmed);
    const match = dotted ?? slashed;
    if (!match) return undefined;
    isoDate = `${match[3]}-${match[2]}-${match[1]}`;
  }

  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== isoDate
  ) {
    return undefined;
  }

  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  if (parsed.getUTCFullYear() < MIN_BIRTH_YEAR || parsed.getTime() > todayUtc) {
    return undefined;
  }
  return parsed;
}

function toUtcDateOnly(value: Date): Date | undefined {
  const isoDate = value.toISOString().slice(0, 10);
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
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
