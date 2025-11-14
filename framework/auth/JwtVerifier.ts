import { createSecretKey, type KeyObject } from 'node:crypto';

import { jwtVerify, type JWTPayload } from 'jose';

import { HttpError } from '../errors/HttpError';

export interface AuthContext {
  userId: string;
  deviceId?: string;
  scopes: string[];
  locale?: string;
}

interface JwtVerifierConfig {
  issuer: string;
  audience: string;
  secret: string;
}

export class JwtVerifier {
  private readonly secretKey: KeyObject;

  constructor(private readonly config: JwtVerifierConfig) {
    this.secretKey = createSecretKey(Buffer.from(config.secret, 'utf8'));
  }

  async verify(token: string): Promise<AuthContext> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['HS256'],
      });

      return this.parsePayload(payload);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new HttpError(401, `JWT verification failed: ${reason}`);
    }
  }

  private parsePayload(payload: JWTPayload): AuthContext {
    const userId = this.extractUserId(payload);
    const scopes = this.parseScopes(payload.scope);
    const deviceId = this.readOptionalStringClaim(payload, ['device_id', 'deviceId']);
    const locale = this.readOptionalStringClaim(payload, ['locale']);

    return {
      userId,
      deviceId,
      scopes,
      locale,
    };
  }

  private parseScopes(scopeClaim: unknown): string[] {
    if (typeof scopeClaim === 'string' && scopeClaim.trim().length > 0) {
      return scopeClaim.trim().split(/\s+/);
    }
    return [];
  }

  private extractUserId(payload: JWTPayload): string {
    if (typeof payload.sub === 'string' && payload.sub.trim().length > 0) {
      return payload.sub;
    }
    const fallback = (payload as Record<string, unknown>).userId;
    if (typeof fallback === 'string' && fallback.trim().length > 0) {
      return fallback;
    }
    throw new HttpError(401, 'JWT payload missing "sub" claim');
  }

  private readOptionalStringClaim(payload: JWTPayload, keys: string[]): string | undefined {
    const record = payload as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
    return undefined;
  }
}

let singleton: JwtVerifier | null = null;

export function getJwtVerifier(): JwtVerifier {
  if (singleton) return singleton;

  const missing: string[] = [];
  const secret = process.env.BFF_JWT_SECRET;
  const audience = process.env.BFF_JWT_AUDIENCE;
  const issuer = process.env.BFF_JWT_ISSUER;

  if (!secret) missing.push('BFF_JWT_SECRET');
  if (!audience) missing.push('BFF_JWT_AUDIENCE');
  if (!issuer) missing.push('BFF_JWT_ISSUER');

  if (missing.length) {
    throw new HttpError(500, `Missing required env vars: ${missing.join(', ')}`);
  }

  singleton = new JwtVerifier({
    secret,
    audience,
    issuer,
  });

  return singleton;
}

export function resetJwtVerifierForTest() {
  singleton = null;
}
