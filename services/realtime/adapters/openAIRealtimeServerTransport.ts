import { RealtimeSession, type RealtimeAgent } from '@openai/agents/realtime';

import type {
  ISessionHandle,
  ISessionTransport,
  SessionTransportRequest,
} from '../types';

export interface OpenAIRealtimeServerTransportOptions {
  model?: string;
  defaultOutputModalities?: Array<'audio' | 'text'>;
  baseUrl?: string;
}

const DEFAULT_REALTIME_MODEL = 'gpt-realtime';

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError');
  }
  const error = new Error('Aborted');
  (error as any).name = 'AbortError';
  return error;
}

class OpenAIRealtimeServerSessionHandle implements ISessionHandle {
  constructor(private readonly session: RealtimeSession) {}

  disconnect(): void {
    this.session.close();
  }

  interrupt(): void {
    this.session.interrupt();
  }

  sendUserText(text: string): void {
    this.session.sendMessage(text);
  }

  sendEvent(event: Record<string, any>): void {
    (this.session as any).transport?.sendEvent?.(event);
  }

  mute(_muted: boolean): void {
    // WebSocketトランスポートはmute操作不要。クライアント側で扱う。
  }

  pushToTalkStart(): void {
    this.sendEvent({ type: 'input_audio_buffer.clear' });
  }

  pushToTalkStop(): void {
    this.sendEvent({ type: 'input_audio_buffer.commit' });
    this.sendEvent({ type: 'response.create' });
  }

  on(event: string, handler: (...args: any[]) => void): void {
    this.session.on(event as any, handler);
  }

  off(event: string, handler: (...args: any[]) => void): void {
    this.session.off(event as any, handler);
  }
}

export class OpenAIRealtimeServerTransport
  implements ISessionTransport<RealtimeAgent>
{
  private readonly model: string;
  private readonly defaultOutputModalities: Array<'audio' | 'text'>;
  private readonly baseUrl?: string;

  constructor(options: OpenAIRealtimeServerTransportOptions = {}) {
    this.model =
      options.model ?? process.env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL;
    this.defaultOutputModalities = options.defaultOutputModalities ?? ['audio'];
    this.baseUrl = options.baseUrl;
  }

  async createSession(
    request: SessionTransportRequest<RealtimeAgent>,
  ): Promise<ISessionHandle> {
    const { agentSet, extraContext, outputModalities, signal } = request;
    const rootAgent = agentSet.primaryAgent.handle;

    const session = new RealtimeSession(rootAgent, {
      transport: 'websocket',
      model: this.model,
      context: extraContext ?? {},
      outputGuardrails: request.outputGuardrails ?? [],
      historyStoreAudio: true,
      config: {
        outputModalities: outputModalities ?? this.defaultOutputModalities,
      },
    });

    if (signal?.aborted) {
      session.close();
      throw createAbortError();
    }

    const abortListener = () => {
      session.close();
    };
    signal?.addEventListener('abort', abortListener, { once: true });

    const apiKey = await request.getEphemeralKey();
    try {
      await session.connect({ apiKey, url: this.baseUrl });
      return new OpenAIRealtimeServerSessionHandle(session);
    } catch (error) {
      session.close();
      throw error;
    } finally {
      signal?.removeEventListener('abort', abortListener);
    }
  }

  dispose(): void {
    // WebSocket接続はSessionHandle側で閉じるため、ここでは何もしない
  }
}
