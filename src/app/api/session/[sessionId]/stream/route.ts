import { randomUUID } from 'node:crypto';

import { sessionHost, type SessionStreamMessage } from '../../../../../../services/api/bff/sessionHost';
import { handleRouteError, requireBffSecret } from '../../utils';

interface RouteParams {
  params: {
    sessionId: string;
  };
}

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: RouteParams) {
  try {
    requireBffSecret(request);
    const encoder = new TextEncoder();
    let cleanup: (() => void) | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const subscriber = {
          id: randomUUID(),
          send: (message: SessionStreamMessage) => {
            controller.enqueue(encoder.encode(formatSse(message)));
          },
        };
        cleanup = sessionHost.subscribe(params.sessionId, subscriber);
        controller.enqueue(
          encoder.encode(
            formatSse({
              event: 'ready',
              data: { sessionId: params.sessionId },
              timestamp: new Date().toISOString(),
            }),
          ),
        );
      },
      cancel() {
        cleanup?.();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function formatSse(message: SessionStreamMessage): string {
  const data =
    typeof message.data === 'string'
      ? message.data
      : JSON.stringify(message.data ?? {});
  return `event: ${message.event}\nid: ${message.timestamp}\ndata: ${data}\n\n`;
}
