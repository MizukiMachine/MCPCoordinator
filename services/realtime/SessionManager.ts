import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';

import type { RealtimeAgent } from '@openai/agents/realtime';
import {
  OpenAIRealtimeWebSocket,
  RealtimeSession,
  type RealtimeSession as RealtimeSessionType,
} from '@openai/agents/realtime';

import { HttpError } from '../../framework/errors/HttpError';
import type { AuthContext } from '../../framework/auth/JwtVerifier';
import { allAgentSets, defaultAgentSetKey } from '@/app/agentConfigs';
import type { AudioTranscoder } from './audio';
import { SessionEventBus } from './events/SessionEventBus';
import type { ClientEvent, CreateSessionOptions, ServerEvent, SessionHandle } from './types';

type SessionRecord = {
  id: string;
  auth: AuthContext;
  agentKey: string;
  createdAt: number;
  expiresAt: number;
  session: RealtimeSessionType;
  bus: SessionEventBus;
  disposer: () => void;
};

type SessionFactoryInput = {
  agent: RealtimeAgent;
  openAiApiKey: string;
  realtimeModel: string;
  transcriptionModel: string;
  voice: string;
  context: Record<string, unknown>;
};

type SessionFactory = (input: SessionFactoryInput) => Promise<RealtimeSessionType>;

const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface SessionManagerOptions {
  audioTranscoder: AudioTranscoder;
  openAiApiKey: string;
  realtimeModel: string;
  transcriptionModel: string;
  voice: string;
  sessionTtlMs?: number;
  sessionFactory?: SessionFactory;
}

export class SessionManager {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly audioTranscoder: AudioTranscoder;
  private readonly openAiApiKey: string;
  private readonly realtimeModel: string;
  private readonly transcriptionModel: string;
  private readonly voice: string;
  private readonly sessionTtlMs: number;
  private readonly sessionFactory: SessionFactory;

  constructor(options: SessionManagerOptions) {
    this.audioTranscoder = options.audioTranscoder;
    this.openAiApiKey = options.openAiApiKey;
    this.realtimeModel = options.realtimeModel;
    this.transcriptionModel = options.transcriptionModel;
    this.voice = options.voice;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.sessionFactory = options.sessionFactory ?? defaultSessionFactory;
  }

  async createSession(options: CreateSessionOptions): Promise<SessionHandle> {
    const { agentKey = defaultAgentSetKey } = options;
    const agentSet = allAgentSets[agentKey] ?? allAgentSets[defaultAgentSetKey];
    if (!agentSet || agentSet.length === 0) {
      throw new HttpError(400, `Unknown agent key: ${agentKey}`);
    }

    const rootAgent = agentSet[0];
    const sessionId = randomUUID();
    const now = Date.now();

    const session = await this.sessionFactory({
      agent: rootAgent,
      openAiApiKey: this.openAiApiKey,
      realtimeModel: this.realtimeModel,
      transcriptionModel: this.transcriptionModel,
      voice: this.voice,
      context: {
        userId: options.auth.userId,
        deviceId: options.auth.deviceId,
        scopes: options.auth.scopes,
        locale: options.locale ?? options.auth.locale,
        deviceInfo: options.deviceInfo,
      },
    });

    const bus = new SessionEventBus();
    const disposer = this.registerSessionListeners(sessionId, session, bus);

    const record: SessionRecord = {
      id: sessionId,
      auth: options.auth,
      agentKey,
      createdAt: now,
      expiresAt: now + this.sessionTtlMs,
      session,
      bus,
      disposer,
    };

    this.sessions.set(sessionId, record);

    bus.publish({ type: 'status', status: 'CONNECTED' });

    return {
      sessionId,
      expiresAt: new Date(record.expiresAt),
    };
  }

  subscribe(sessionId: string, auth: AuthContext, handler: (event: ServerEvent) => void): () => void {
    const record = this.assertSessionOwnership(sessionId, auth);
    return record.bus.subscribe(handler);
  }

  async handleClientEvent(sessionId: string, auth: AuthContext, event: ClientEvent): Promise<void> {
    const record = this.assertSessionOwnership(sessionId, auth);

    switch (event.type) {
      case 'audio_chunk':
        await this.handleAudioChunk(record, event);
        break;
      case 'audio_commit':
        record.session.transport.sendEvent({ type: 'input_audio_buffer.commit' } as any);
        record.session.transport.sendEvent({ type: 'response.create' } as any);
        break;
      case 'text_message':
        record.session.sendMessage(event.text);
        break;
      case 'interrupt':
        record.session.interrupt();
        break;
      case 'mute':
        record.session.mute(event.value);
        break;
      default:
        throw new HttpError(400, `Unsupported client event: ${(event as ClientEvent).type}`);
    }
  }

  async closeSession(sessionId: string, auth: AuthContext): Promise<void> {
    const record = this.assertSessionOwnership(sessionId, auth);
    this.teardownSession(record);
  }

  private assertSessionOwnership(sessionId: string, auth: AuthContext): SessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new HttpError(404, `Session ${sessionId} not found`);
    }
    if (record.auth.userId !== auth.userId) {
      throw new HttpError(403, 'Forbidden: session does not belong to caller');
    }
    return record;
  }

  private async handleAudioChunk(record: SessionRecord, event: Extract<ClientEvent, { type: 'audio_chunk' }>) {
    if (!event.mimeType.startsWith('audio/webm')) {
      throw new HttpError(415, `Unsupported audio mime type: ${event.mimeType}`);
    }
    const binary = Buffer.from(event.data, 'base64');
    const pcm = await this.audioTranscoder.transcodeWebmOpusToLinear16(binary);
    record.session.transport.sendEvent({
      type: 'input_audio_buffer.append',
      audio: pcm.toString('base64'),
      mime_type: 'audio/pcm',
    } as any);
  }

  private registerSessionListeners(sessionId: string, session: RealtimeSessionType, bus: SessionEventBus) {
    const transportListener = (payload: unknown) => {
      bus.publish({ type: 'transport', payload } as ServerEvent);
    };
    const historyAdded = (item: unknown) => bus.publish({ type: 'history_added', item });
    const historyUpdated = (items: unknown[]) => bus.publish({ type: 'history_updated', items });
    const errorListener = (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown session error';
      bus.publish({ type: 'error', message });
    };

    session.on('transport_event', transportListener as any);
    session.on('history_added', historyAdded as any);
    session.on('history_updated', historyUpdated as any);
    session.on('error', errorListener as any);

    return () => {
      session.off('transport_event', transportListener as any);
      session.off('history_added', historyAdded as any);
      session.off('history_updated', historyUpdated as any);
      session.off('error', errorListener as any);
      session.close();
      this.sessions.delete(sessionId);
      bus.publish({ type: 'status', status: 'DISCONNECTED' });
    };
  }

  private teardownSession(record: SessionRecord) {
    record.disposer();
  }
}

const defaultSessionFactory: SessionFactory = async ({
  agent,
  openAiApiKey,
  realtimeModel,
  transcriptionModel,
  voice,
  context,
}) => {
  const session = new RealtimeSession(agent, {
    transport: new OpenAIRealtimeWebSocket({
      url: process.env.OPENAI_REALTIME_WS_URL,
      useInsecureApiKey: true,
    }),
    model: realtimeModel,
    config: {
      outputModalities: ['audio', 'text'],
      audio: {
        input: {
          transcription: {
            model: transcriptionModel,
          },
        },
        output: {
          voice,
        },
      },
    },
    context,
    automaticallyTriggerResponseForMcpToolCalls: true,
  });

  await session.connect({ apiKey: openAiApiKey });
  return session;
};
