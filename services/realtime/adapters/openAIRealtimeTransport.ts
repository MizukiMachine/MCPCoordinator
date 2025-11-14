import {
  RealtimeSession,
  OpenAIRealtimeWebRTC,
  type RealtimeAgent,
} from '@openai/agents/realtime';

import type {
  ISessionHandle,
  ISessionTransport,
  SessionTransportRequest,
} from '../types';

export interface OpenAIRealtimeTransportOptions {
  model?: string;
  transcriptionModel?: string;
  defaultOutputModalities?: Array<'audio' | 'text'>;
}

type EventfulRealtimeSession = RealtimeSession & {
  on?: (event: string, handler: (...args: any[]) => void) => void;
  off?: (event: string, handler: (...args: any[]) => void) => void;
  addListener?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

const DEFAULT_REALTIME_MODEL = 'gpt-realtime';
const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';
const EVENT_CLEAR_BUFFER = { type: 'input_audio_buffer.clear' } as const;
const EVENT_COMMIT_BUFFER = { type: 'input_audio_buffer.commit' } as const;
const EVENT_CREATE_RESPONSE = { type: 'response.create' } as const;

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError');
  }
  const error = new Error('Aborted');
  (error as any).name = 'AbortError';
  return error;
}

function attachRealtimeListener(
  session: EventfulRealtimeSession,
  event: string,
  handler: (...args: any[]) => void,
) {
  if (typeof session.on === 'function') {
    session.on(event, handler);
    return;
  }
  session.addListener?.(event, handler);
}

function detachRealtimeListener(
  session: EventfulRealtimeSession,
  event: string,
  handler: (...args: any[]) => void,
) {
  if (typeof session.off === 'function') {
    session.off(event, handler);
    return;
  }
  session.removeListener?.(event, handler);
}

class OpenAIRealtimeSessionHandle implements ISessionHandle {
  constructor(private readonly session: EventfulRealtimeSession) {}

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
    this.session.transport.sendEvent(event);
  }

  mute(muted: boolean): void {
    this.session.mute(muted);
  }

  pushToTalkStart(): void {
    this.session.transport.sendEvent(EVENT_CLEAR_BUFFER as any);
  }

  pushToTalkStop(): void {
    this.session.transport.sendEvent(EVENT_COMMIT_BUFFER as any);
    this.session.transport.sendEvent(EVENT_CREATE_RESPONSE as any);
  }

  on(event: string, handler: (...args: any[]) => void): void {
    attachRealtimeListener(this.session, event, handler);
  }

  off(event: string, handler: (...args: any[]) => void): void {
    detachRealtimeListener(this.session, event, handler);
  }
}

export class OpenAIRealtimeTransport
  implements ISessionTransport<RealtimeAgent>
{
  private readonly model: string;
  private readonly transcriptionModel: string;
  private readonly defaultOutputModalities: Array<'audio' | 'text'>;

  constructor(options: OpenAIRealtimeTransportOptions = {}) {
    this.model =
      options.model ?? process.env.NEXT_PUBLIC_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL;
    this.transcriptionModel =
      options.transcriptionModel ??
      process.env.NEXT_PUBLIC_REALTIME_TRANSCRIPTION_MODEL ??
      DEFAULT_TRANSCRIPTION_MODEL;
    this.defaultOutputModalities = options.defaultOutputModalities ?? ['audio'];
  }

  async createSession(
    request: SessionTransportRequest<RealtimeAgent>,
  ): Promise<ISessionHandle> {
    const { agentSet, extraContext, outputModalities, transportOverrides } = request;
    const rootAgent = agentSet.primaryAgent.handle;
    const session = new RealtimeSession(rootAgent, {
      transport: new OpenAIRealtimeWebRTC({
        audioElement: request.audioElement ?? undefined,
        changePeerConnection: async (pc: RTCPeerConnection) => {
          if (!transportOverrides?.changePeerConnection) {
            return pc;
          }
          const result = await Promise.resolve(transportOverrides.changePeerConnection(pc));
          return result ?? pc;
        },
      }),
      model: this.model,
      config: {
        outputModalities: outputModalities ?? this.defaultOutputModalities,
        audio: {
          input: {
            transcription: {
              model: this.transcriptionModel,
            },
          },
          ...(rootAgent.voice ? { output: { voice: rootAgent.voice } } : {}),
        },
      },
      outputGuardrails: request.outputGuardrails ?? [],
      automaticallyTriggerResponseForMcpToolCalls: true,
      context: extraContext ?? {},
    });

    if (request.signal?.aborted) {
      session.close();
      throw createAbortError();
    }

    const abortListener = () => {
      session.close();
    };
    request.signal?.addEventListener('abort', abortListener, { once: true });

    const apiKey = await request.getEphemeralKey();
    try {
      await session.connect({ apiKey });
      if (request.signal?.aborted) {
        session.close();
        throw createAbortError();
      }
      return new OpenAIRealtimeSessionHandle(session as EventfulRealtimeSession);
    } catch (error) {
      session.close();
      throw error;
    } finally {
      request.signal?.removeEventListener('abort', abortListener);
    }
  }

  dispose(): void {
    // No long-lived transport resources to dispose for the WebRTC implementation.
  }
}
