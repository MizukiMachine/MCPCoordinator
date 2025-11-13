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
  private readonly secretKey: Uint8Array;

  constructor(private readonly config: JwtVerifierConfig) {
    this.secretKey = new TextEncoder().encode(config.secret);
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
    const userId = typeof payload.sub === 'string' ? payload.sub : (payload as any).userId;
    if (typeof userId !== 'string' || !userId) {
      throw new HttpError(401, 'JWT payload missing "sub" claim');
    }

    const scopes = this.parseScopes(payload.scope);
    const deviceId = typeof (payload as any).device_id === 'string' ? (payload as any).device_id : undefined;
    const locale = typeof payload.locale === 'string' ? payload.locale : undefined;

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
