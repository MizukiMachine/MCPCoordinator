import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { defaultAgentSetKey } from '@/app/agentConfigs';
import { getJwtVerifier } from '../../../../framework/auth';
import { HttpError } from '../../../../framework/errors/HttpError';
import { requireBearerToken } from '../../../../framework/http/headers';
import { getSessionManager } from '../../../../services/realtime/sessionManagerSingleton';

const createSessionSchema = z.object({
  agentKey: z.string().optional(),
  locale: z.string().optional(),
  deviceInfo: z.record(z.any()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const token = requireBearerToken(request.headers.get('authorization'));
    const auth = await getJwtVerifier().verify(token);
    const payload = createSessionSchema.parse(await request.json());

    const handle = await getSessionManager().createSession({
      agentKey: payload.agentKey ?? defaultAgentSetKey,
      auth,
      locale: payload.locale,
      deviceInfo: payload.deviceInfo,
    });

    const base = new URL(request.url);
    const relativeStreamPath = `/api/session/${handle.sessionId}/stream`;
    const relativeEventPath = `/api/session/${handle.sessionId}/event`;

    return NextResponse.json({
      sessionId: handle.sessionId,
      expiresAt: handle.expiresAt.toISOString(),
      streamPath: relativeStreamPath,
      eventPath: relativeEventPath,
      absoluteStreamUrl: absolutify(base, relativeStreamPath, true),
      absoluteEventUrl: absolutify(base, relativeEventPath, false),
    });
  } catch (error) {
    return respondWithError(error);
  }
}

function absolutify(base: URL, relativePath: string, preferWebSocket: boolean) {
  const url = new URL(relativePath, base.origin);
  if (preferWebSocket && url.protocol.startsWith('http')) {
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  }
  return url.toString();
}

function respondWithError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  console.error('Unexpected error in POST /api/session', error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}
