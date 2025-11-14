import { Buffer } from 'node:buffer';

import { NextRequest, NextResponse } from 'next/server';

import { getJwtVerifier } from '../../../../../../framework/auth';
import { HttpError } from '../../../../../../framework/errors/HttpError';
import { requireBearerToken } from '../../../../../../framework/http/headers';
import { clientEventSchema } from '../../../../../../services/realtime/clientEventSchema';
import { getSessionManager } from '../../../../../../services/realtime/sessionManagerSingleton';

export const runtime = 'nodejs';

type RouteContext = {
  params: { id: string };
};

export async function GET(request: NextRequest, context: RouteContext) {
  if (request.headers.get('upgrade') !== 'websocket') {
    return NextResponse.json({ error: 'Expected WebSocket upgrade' }, { status: 400 });
  }

  const pair = createWebSocketPair();
  const [client, server] = pair;
  server.accept();

  try {
    const token = extractToken(request);
    const auth = await getJwtVerifier().verify(token);
    const manager = getSessionManager();

    const unsubscribe = manager.subscribe(context.params.id, auth, (event) => {
      try {
        server.send(JSON.stringify(event));
      } catch (error) {
        console.warn('Failed to push event to client', error);
      }
    });

    server.addEventListener('message', async (msg) => {
      try {
        const raw =
          typeof msg.data === 'string'
            ? msg.data
            : Buffer.from(msg.data as ArrayBuffer).toString('utf8');
        const parsed = clientEventSchema.parse(JSON.parse(raw));
        await manager.handleClientEvent(context.params.id, auth, parsed);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        server.send(JSON.stringify({ type: 'error', message }));
      }
    });

    server.addEventListener('close', () => {
      unsubscribe();
    });

    return new NextResponse(null, { status: 101, webSocket: client });
  } catch (error) {
    server.close(1011, error instanceof Error ? error.message : 'Internal error');
    return respondWithError(error);
  }
}

function createWebSocketPair(): [WebSocket, WebSocket] {
  const WebSocketPairCtor = (globalThis as any).WebSocketPair;
  if (!WebSocketPairCtor) {
    throw new HttpError(500, 'WebSocketPair is not supported in this runtime');
  }
  const pair = new WebSocketPairCtor();
  return [pair[0], pair[1]];
}

function extractToken(request: NextRequest): string {
  const headerToken = request.headers.get('authorization');
  if (headerToken) {
    return requireBearerToken(headerToken);
  }
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  if (!queryToken) {
    throw new HttpError(401, 'Missing Authorization (header or token query param)');
  }
  return queryToken;
}

function respondWithError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  console.error('Unexpected error in GET /api/session/[id]/stream', error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}
