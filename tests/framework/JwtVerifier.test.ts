// @vitest-environment node

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { JwtVerifier } from '../../framework/auth/JwtVerifier';

const config = {
  issuer: 'test-issuer',
  audience: 'test-audience',
  secret: 'unit-test-secret',
};

const verifier = new JwtVerifier(config);

const signToken = (
  claims: Record<string, unknown>,
  options: { subject?: string; includeSubject?: boolean } = {},
) => {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: config.issuer,
    aud: config.audience,
    iat: now,
    exp: now + 60,
    ...claims,
  };

  const includeSubject = options.includeSubject ?? true;
  if (includeSubject) {
    payload.sub = options.subject ?? 'user-123';
  }

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = createHmac('sha256', config.secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
};

const base64UrlEncode = (input: string) => Buffer.from(input).toString('base64url');

describe('JwtVerifier', () => {
  it('includes optional device and locale claims while parsing scopes', async () => {
    const token = signToken({ device_id: 'device-42', locale: 'ja-JP', scope: 'voice:write files:read' }, {
      subject: 'user-xyz',
    });

    const context = await verifier.verify(token);

    expect(context).toEqual({
      userId: 'user-xyz',
      deviceId: 'device-42',
      locale: 'ja-JP',
      scopes: ['voice:write', 'files:read'],
    });
  });

  it('falls back to userId claim when subject is not provided', async () => {
    const token = signToken({ userId: 'legacy-user', scope: 'profile:read' }, { includeSubject: false });

    const context = await verifier.verify(token);

    expect(context.userId).toBe('legacy-user');
    expect(context.scopes).toEqual(['profile:read']);
    expect(context.deviceId).toBeUndefined();
  });

  it('throws when subject and userId are missing', async () => {
    const token = signToken({}, { includeSubject: false });

    await expect(verifier.verify(token)).rejects.toThrow(/missing "sub"/i);
  });
});
