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

class OpenAIRealtimeSessionHandle implements ISessionHandle {
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
    this.session.transport.sendEvent(event);
  }

  mute(muted: boolean): void {
    this.session.mute(muted);
  }

  pushToTalkStart(): void {
    this.session.transport.sendEvent({ type: 'input_audio_buffer.clear' } as any);
  }

  pushToTalkStop(): void {
    this.session.transport.sendEvent({ type: 'input_audio_buffer.commit' } as any);
    this.session.transport.sendEvent({ type: 'response.create' } as any);
  }

  on(event: string, handler: (...args: any[]) => void): void {
    (this.session as any).on?.(event, handler);
  }

  off(event: string, handler: (...args: any[]) => void): void {
    if (typeof (this.session as any).off === 'function') {
      (this.session as any).off(event, handler);
      return;
    }
    (this.session as any).removeListener?.(event, handler);
  }
}

export class OpenAIRealtimeTransport
  implements ISessionTransport<RealtimeAgent>
{
  private readonly model: string;
  private readonly transcriptionModel: string;
  private readonly defaultOutputModalities: Array<'audio' | 'text'>;

  constructor(options: OpenAIRealtimeTransportOptions = {}) {
    this.model = options.model ?? process.env.NEXT_PUBLIC_REALTIME_MODEL ?? 'gpt-realtime';
    this.transcriptionModel =
      options.transcriptionModel ??
      process.env.NEXT_PUBLIC_REALTIME_TRANSCRIPTION_MODEL ??
      'gpt-4o-transcribe';
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
        changePeerConnection: transportOverrides?.changePeerConnection,
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

    const apiKey = await request.getEphemeralKey();
    await session.connect({ apiKey });
    return new OpenAIRealtimeSessionHandle(session);
  }
}
