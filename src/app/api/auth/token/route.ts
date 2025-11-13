import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && process.env.BFF_ALLOW_DEV_TOKENS !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  try {
    const body = await safeJson(request);
    const token = await issueToken({
      userId: (body.userId as string) ?? 'dev-user',
      deviceId: (body.deviceId as string) ?? 'dev-device',
      scopes: Array.isArray(body.scopes) ? (body.scopes as string[]) : ['voice:session'],
      locale: typeof body.locale === 'string' ? body.locale : undefined,
    });

    return NextResponse.json({ token, expiresInSeconds: 15 * 60 });
  } catch (error) {
    console.error('Failed to issue dev token', error);
    return NextResponse.json({ error: 'Failed to issue token' }, { status: 500 });
  }
}

async function safeJson(request: NextRequest) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

async function issueToken(params: {
  userId: string;
  deviceId: string;
  scopes: string[];
  locale?: string;
}) {
  const secret = process.env.BFF_JWT_SECRET;
  const audience = process.env.BFF_JWT_AUDIENCE;
  const issuer = process.env.BFF_JWT_ISSUER;

  if (!secret || !audience || !issuer) {
    throw new Error('JWT environment variables are not configured');
  }

  const encoder = new TextEncoder();
  const payload: Record<string, unknown> = {
    scope: params.scopes.join(' '),
    device_id: params.deviceId,
  };
  if (params.locale) {
    payload.locale = params.locale;
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(params.userId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime('15m')
    .sign(encoder.encode(secret));
}
