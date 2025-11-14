import { Buffer } from 'node:buffer';

import { NextRequest, NextResponse } from 'next/server';

import { getJwtVerifier } from '../../../../../../framework/auth';
import { HttpError } from '../../../../../../framework/errors/HttpError';
import { requireBearerToken } from '../../../../../../framework/http/headers';
import { clientEventSchema } from '../../../../../../services/realtime/clientEventSchema';
import { getSessionManager } from '../../../../../../services/realtime/sessionManagerSingleton';

export const runtime = 'nodejs';

type VerifiedAuthContext = Awaited<ReturnType<ReturnType<typeof getJwtVerifier>['verify']>>;

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

  let unsubscribe: (() => void) | null = null;
  let auth: VerifiedAuthContext | null = null;
  let manager: ReturnType<typeof getSessionManager> | null = null;
  let cleanedUp = false;

  try {
    const token = extractToken(request);
    auth = await getJwtVerifier().verify(token);
    manager = getSessionManager();

    unsubscribe = manager.subscribe(context.params.id, auth, (event) => {
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
        const message = formatClientErrorMessage(error);
        server.send(JSON.stringify({ type: 'error', message }));
        if (message === GENERIC_ERROR_MESSAGE) {
          console.error('Unhandled error in session stream message handler', error);
        }
      }
    });

    const runCleanup = () => {
      if (cleanedUp) {
        return;
      }
      void cleanupSession(manager, context.params.id, auth, unsubscribe, () => {
        cleanedUp = true;
        unsubscribe = null;
      });
    };

    server.addEventListener('close', runCleanup);
    server.addEventListener('error', runCleanup);
    if (request.signal.aborted) {
      runCleanup();
    } else {
      request.signal.addEventListener('abort', runCleanup, { once: true });
    }

    return new NextResponse(null, { status: 101, webSocket: client });
  } catch (error) {
    await cleanupSession(manager, context.params.id, auth, unsubscribe, () => {
      cleanedUp = true;
      unsubscribe = null;
    });
    server.close(1011, formatClientErrorMessage(error));
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
  const status = error instanceof HttpError ? error.statusCode : 500;
  if (!(error instanceof HttpError) || status >= 500) {
    console.error('Unexpected error in GET /api/session/[id]/stream', error);
  }
  return NextResponse.json({ error: formatPublicErrorMessage(error) }, { status });
}

async function cleanupSession(
  manager: ReturnType<typeof getSessionManager> | null,
  sessionId: string,
  auth: VerifiedAuthContext | null,
  unsubscribe: (() => void) | null,
  markCleaned: () => void,
) {
  if (unsubscribe) {
    unsubscribe();
  }
  markCleaned();
  if (!auth || !manager) return;
  try {
    await manager.closeSession(sessionId, auth);
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      return;
    }
    console.warn('Failed to close realtime session', error);
  }
}

const GENERIC_ERROR_MESSAGE = 'Internal Server Error';

function formatClientErrorMessage(error: unknown): string {
  if (error instanceof HttpError && error.statusCode < 500) {
    return error.message;
  }
  return GENERIC_ERROR_MESSAGE;
}

function formatPublicErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    return error.statusCode < 500 ? error.message : GENERIC_ERROR_MESSAGE;
  }
  return GENERIC_ERROR_MESSAGE;
}
