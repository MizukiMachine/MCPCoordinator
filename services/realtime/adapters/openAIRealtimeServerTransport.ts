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
  transcriptionModel?: string;
  voice?: string;
}

const DEFAULT_REALTIME_MODEL = 'gpt-realtime';
const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';
const DEFAULT_VOICE = 'alloy';

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
  private readonly transcriptionModel: string | undefined;
  private readonly defaultVoice: string | undefined;

  constructor(options: OpenAIRealtimeServerTransportOptions = {}) {
    this.model =
      options.model ?? process.env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL;
    this.defaultOutputModalities = options.defaultOutputModalities ?? ['audio'];
    this.baseUrl = options.baseUrl;
    this.transcriptionModel =
      options.transcriptionModel ??
      process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL ??
      DEFAULT_TRANSCRIPTION_MODEL;
    this.defaultVoice = options.voice ?? process.env.OPENAI_REALTIME_VOICE ?? DEFAULT_VOICE;
  }

  async createSession(
    request: SessionTransportRequest<RealtimeAgent>,
  ): Promise<ISessionHandle> {
    const { agentSet, extraContext, outputModalities, signal } = request;
    const rootAgent = agentSet.primaryAgent.handle;

    const resolvedModalities = outputModalities ?? this.defaultOutputModalities;
    const wantsAudio = resolvedModalities.includes('audio');
    const resolvedVoice = rootAgent.voice ?? this.defaultVoice;

    const audioConfig = wantsAudio
      ? {
          input: this.transcriptionModel
            ? {
                transcription: {
                  model: this.transcriptionModel,
                },
              }
            : undefined,
          output: resolvedVoice
            ? {
                voice: resolvedVoice,
              }
            : undefined,
        }
      : undefined;

    const session = new RealtimeSession(rootAgent, {
      transport: 'websocket',
      model: this.model,
      context: extraContext ?? {},
      outputGuardrails: request.outputGuardrails ?? [],
      historyStoreAudio: wantsAudio,
      config: {
        outputModalities: resolvedModalities,
        ...(audioConfig ? { audio: audioConfig } : {}),
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
