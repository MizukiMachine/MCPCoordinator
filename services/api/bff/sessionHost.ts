import { randomUUID } from 'node:crypto';
import EventEmitter from 'node:events';

import type { RealtimeAgent } from '@openai/agents/realtime';

import { createStructuredLogger } from '../../../framework/logging/structuredLogger';
import { createConsoleMetricEmitter } from '../../../framework/metrics/metricEmitter';
import type { MetricEmitter } from '../../../framework/metrics/metricEmitter';
import type { StructuredLogger } from '../../../framework/logging/structuredLogger';
import { createModerationGuardrail } from '../../../src/app/agentConfigs/guardrails';
import { agentSetMetadata, allAgentSets } from '../../../src/app/agentConfigs';
import { isRealtimeTranscriptionEventPayload } from '../../../src/shared/realtimeTranscriptionEvents';
import type { VoiceControlDirective, VoiceControlHandlers } from '../../../src/shared/voiceControl';
import type {
  ISessionManager,
  SessionEventName,
  SessionManagerHooks,
  SessionLifecycleStatus,
} from '../../realtime/types';
import { createOpenAIServerSessionManager } from '../../realtime/adapters/createOpenAIServerSessionManager';

const SESSION_TTL_MS = 10 * 60 * 1000;
const SESSION_MAX_LIFETIME_MS = 30 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const STREAM_IDLE_CLEANUP_MS = 60_000;
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_EVENTS = 10;

export type SessionCommand =
  | {
      kind: 'input_text';
      text: string;
      triggerResponse?: boolean;
      metadata?: Record<string, any>;
    }
  | {
      kind: 'input_audio';
      audio: string;
      commit?: boolean;
      response?: boolean;
    }
  | {
      kind: 'input_image';
      data: string;
      mimeType: string;
      encoding?: 'base64';
      text?: string;
      triggerResponse?: boolean;
    }
  | {
      kind: 'event';
      event: Record<string, any>;
    }
  | {
      kind: 'control';
      action: 'interrupt' | 'mute' | 'push_to_talk_start' | 'push_to_talk_stop';
      value?: boolean;
    };

export interface CreateSessionOptions {
  agentSetKey: string;
  preferredAgentName?: string;
  sessionLabel?: string;
  clientCapabilities?: {
    audio?: boolean;
    images?: boolean;
    outputText?: boolean;
  };
  metadata?: Record<string, any>;
}

export interface CreateSessionResult {
  sessionId: string;
  streamUrl: string;
  expiresAt: string;
  heartbeatIntervalMs: number;
  allowedModalities: Array<'text' | 'audio'>;
  textOutputEnabled: boolean;
  agentSet: {
    key: string;
    primary: string;
  };
  capabilityWarnings: string[];
}

export interface SessionStreamMessage {
  event: string;
  data: Record<string, any> | string | null;
  timestamp: string;
}

export interface RealtimeEnvironmentSnapshot {
  warnings: string[];
  audio: {
    enabled: boolean;
    reason?: string;
  };
}

interface SessionErrorSummary {
  code?: string;
  message?: string;
  type?: string;
  status?: number;
  retryable?: boolean;
  eventId?: string;
}

export class SessionHostError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = 'SessionHostError';
    this.code = code;
    this.status = status;
  }
}

interface SessionSubscriber {
  id: string;
  send: (message: SessionStreamMessage) => void;
}

interface SessionRateLimiter {
  hits: number[];
}

interface SessionContext {
  id: string;
  createdAt: number;
  expiresAt: number;
  maxLifetimeAt: number;
  status: SessionLifecycleStatus;
  connectedAt?: number;
  agentSetKey: string;
  preferredAgentName?: string;
  manager: ISessionManager<RealtimeAgent>;
  subscribers: Map<string, SessionSubscriber>;
  emitter: EventEmitter;
  destroy: (options?: DestroySessionOptions) => Promise<void>;
  heartbeatTimer?: ReturnType<typeof setInterval>;
  streamIdleTimer?: ReturnType<typeof setTimeout>;
  rateLimiter: SessionRateLimiter;
  lastCommandAt: number;
  allowedModalities: Array<'text' | 'audio'>;
  textOutputEnabled: boolean;
}

interface DestroySessionOptions {
  reason?: string;
  initiatedBy?: 'client' | 'server' | 'system';
}

interface SessionHostDeps {
  logger?: StructuredLogger;
  metrics?: MetricEmitter;
  now?: () => number;
  sessionManagerFactory?: (hooks: SessionManagerHooks) => ISessionManager<RealtimeAgent>;
  scenarioMap?: Record<string, RealtimeAgent[]>;
  envInspector?: () => RealtimeEnvironmentSnapshot;
}

export class SessionHost {
  private readonly sessions = new Map<string, SessionContext>();
  private readonly logger: StructuredLogger;
  private readonly metrics: MetricEmitter;
  private readonly now: () => number;
  private readonly sessionManagerFactory: (hooks: SessionManagerHooks) => ISessionManager<RealtimeAgent>;
  private readonly scenarioMap: Record<string, RealtimeAgent[]>;
  private readonly inspectEnvironment: () => RealtimeEnvironmentSnapshot;

  constructor(deps: SessionHostDeps = {}) {
    this.logger = deps.logger ?? createStructuredLogger({ component: 'bff.session' });
    this.metrics = deps.metrics ?? createConsoleMetricEmitter('bff.session');
    this.now = deps.now ?? (() => Date.now());
    this.scenarioMap = deps.scenarioMap ?? allAgentSets;
    this.inspectEnvironment = deps.envInspector ?? (() => inspectRealtimeEnvironment());
    this.sessionManagerFactory =
      deps.sessionManagerFactory ??
      ((hooks) =>
        createOpenAIServerSessionManager({
          scenarioMap: this.scenarioMap,
          hooks,
        }));
  }

  async createSession(options: CreateSessionOptions): Promise<CreateSessionResult> {
    const agentSet = this.scenarioMap[options.agentSetKey];
    if (!agentSet) {
      throw new SessionHostError('Unknown agentSetKey', 'invalid_agent_set', 400);
    }

    const sessionId = this.generateSessionId();
    const sessionLogger = createStructuredLogger({
      component: 'bff.session',
      defaultContext: { sessionId },
    });

    const sessionMetrics = createConsoleMetricEmitter(`bff.session.${sessionId}`);
    let contextRef: SessionContext | null = null;

    const hooks: SessionManagerHooks = {
      logger: sessionLogger,
      metrics: sessionMetrics,
      onStatusChange: (status) => {
        if (contextRef) {
          contextRef.status = status;
          if (status === 'CONNECTED') {
            contextRef.connectedAt = this.now();
          }
        }
        this.broadcast(sessionId, 'status', { status });
      },
      // transport_event は onServerEvent 経由でのみ forward し、EventEmitter 側とは二重登録しない
      // （音声チャンクが二重再生されるのを防ぐため）。
      onServerEvent: (event, payload) => this.broadcast(sessionId, event, payload),
      guardrail: {
        onGuardrailTripped: (payload) =>
          this.broadcast(sessionId, 'guardrail_tripped', payload ?? {}),
      },
    };

    const companyName = agentSetMetadata[options.agentSetKey]?.companyName ?? 'DefaultCo';
    const guardrail = createModerationGuardrail(companyName);
    const envSnapshot = this.inspectEnvironment();
    const textOutputEnabled = options.clientCapabilities?.outputText !== false;
    const resolvedModalities = this.resolveRuntimeModalities(options, envSnapshot, textOutputEnabled);
    const reportedModalities = this.buildReportedModalities(options, envSnapshot, textOutputEnabled);

    const manager = this.sessionManagerFactory(hooks);
    const now = this.now();
    const context: SessionContext = {
      id: sessionId,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      maxLifetimeAt: now + SESSION_MAX_LIFETIME_MS,
      status: 'DISCONNECTED',
      agentSetKey: options.agentSetKey,
      preferredAgentName: options.preferredAgentName,
      manager,
      subscribers: new Map(),
      emitter: new EventEmitter(),
      destroy: async (destroyOptions: DestroySessionOptions = {}) => {
        this.clearTimers(context);
        this.sessions.delete(sessionId);
        try {
          manager.disconnect();
        } catch (error) {
          this.logger.warn('Failed to disconnect session cleanly', { sessionId, error });
        }
        const reason = destroyOptions.reason ?? 'unspecified';
        const initiatedBy = destroyOptions.initiatedBy ?? 'system';
        this.logger.info('Session destroyed', { sessionId, reason, initiatedBy });
        this.metrics.increment('bff.session.closed_total', 1, {
          initiatedBy,
          reason,
        });
      },
      rateLimiter: { hits: [] },
      lastCommandAt: now,
      allowedModalities: reportedModalities,
      textOutputEnabled,
    };
    contextRef = context;

    this.sessions.set(sessionId, context);
    const voiceControlHandlers = this.createVoiceControlHandlers(sessionId);

    if (options.clientCapabilities?.audio !== false && !envSnapshot.audio.enabled) {
      this.logger.warn('Audio requested but disabled. Falling back to text-only session.', {
        sessionId,
        reason: envSnapshot.audio.reason,
      });
    }

    if (envSnapshot.warnings.length > 0) {
      this.logger.warn('Realtime environment warnings detected', {
        sessionId,
        warnings: envSnapshot.warnings,
      });
    }

    await manager.connect({
      agentSetKey: options.agentSetKey,
      preferredAgentName: options.preferredAgentName,
      getEphemeralKey: async () => this.getRealtimeApiKey(),
      extraContext: {
        sessionLabel: options.sessionLabel,
        metadata: options.metadata ?? {},
        clientCapabilities: options.clientCapabilities ?? {},
        requestScenarioChange: voiceControlHandlers.requestScenarioChange,
        requestAgentChange: voiceControlHandlers.requestAgentChange,
      },
      outputGuardrails: [guardrail],
      outputModalities: resolvedModalities,
    });

    this.attachManagerListeners(context);
    this.startHeartbeat(context);
    this.broadcast(sessionId, 'status', { status: 'CONNECTED' });
    this.metrics.increment('bff.session.created_total');

    return {
      sessionId,
      streamUrl: `/api/session/${sessionId}/stream`,
      expiresAt: new Date(context.expiresAt).toISOString(),
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      allowedModalities: reportedModalities,
      textOutputEnabled,
      capabilityWarnings: envSnapshot.warnings,
      agentSet: {
        key: options.agentSetKey,
        primary: agentSet[0]?.name ?? 'agent',
      },
    };
  }

  async destroySession(sessionId: string, options: DestroySessionOptions = {}): Promise<boolean> {
    const context = this.sessions.get(sessionId);
    if (!context) {
      return false;
    }
    await context.destroy(options);
    return true;
  }

  ensureSession(sessionId: string): SessionContext {
    const context = this.sessions.get(sessionId);
    if (!context) {
      throw new SessionHostError('Session not found', 'session_not_found', 404);
    }

    const now = this.now();
    if (now > context.maxLifetimeAt) {
      void context.destroy({ reason: 'max_lifetime_exceeded', initiatedBy: 'system' });
      throw new SessionHostError('Session lifetime exceeded', 'session_expired', 410);
    }

    if (now > context.expiresAt) {
      void context.destroy({ reason: 'session_ttl_expired', initiatedBy: 'system' });
      throw new SessionHostError('Session expired', 'session_expired', 410);
    }

    return context;
  }

  async handleCommand(sessionId: string, command: SessionCommand): Promise<SessionLifecycleStatus> {
    const context = this.ensureSession(sessionId);
    this.enforceRateLimit(context);
    context.expiresAt = this.now() + SESSION_TTL_MS;
    context.lastCommandAt = this.now();

    switch (command.kind) {
      case 'input_text':
        context.manager.sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: command.text,
              },
            ],
          },
        });
        if (command.triggerResponse !== false) {
          context.manager.sendEvent({
            type: 'response.create',
            response: { metadata: command.metadata ?? {} },
          });
        }
        this.metrics.increment('bff.session.event_forwarded_total', 1, { kind: 'input_text' });
        break;
      case 'input_audio':
        context.manager.sendEvent({
          type: 'input_audio_buffer.append',
          audio: command.audio,
        });
        if (command.commit !== false) {
          context.manager.sendEvent({ type: 'input_audio_buffer.commit' });
        }
        if (command.response !== false) {
          context.manager.sendEvent({ type: 'response.create' });
        }
        this.metrics.increment('bff.session.event_forwarded_total', 1, { kind: 'input_audio' });
        break;
      case 'input_image':
        context.manager.sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: command.text ?? '[Image uploaded]',
              },
              {
                type: 'input_image',
                mime_type: command.mimeType,
                image: command.data,
              },
            ],
          },
        });
        if (command.triggerResponse !== false) {
          context.manager.sendEvent({ type: 'response.create' });
        }
        this.metrics.increment('bff.session.event_forwarded_total', 1, { kind: 'input_image' });
        break;
      case 'event':
        context.manager.sendEvent(command.event);
        this.metrics.increment('bff.session.event_forwarded_total', 1, { kind: 'raw_event' });
        break;
      case 'control':
        this.handleControlCommand(context, command);
        break;
      default:
        throw new SessionHostError('Unsupported command', 'invalid_event_payload', 400);
    }

    return context.manager.getStatus();
  }

  subscribe(sessionId: string, subscriber: SessionSubscriber): () => void {
    const context = this.ensureSession(sessionId);
    context.subscribers.set(subscriber.id, subscriber);
    context.emitter.on('message', subscriber.send);

    if (context.streamIdleTimer) {
      clearTimeout(context.streamIdleTimer);
      context.streamIdleTimer = undefined;
    }

    // 直近の状態を即時送信
    subscriber.send({
      event: 'status',
      data: { status: context.manager.getStatus() },
      timestamp: new Date(this.now()).toISOString(),
    });

    return () => {
      context.subscribers.delete(subscriber.id);
      context.emitter.off('message', subscriber.send);
      if (context.subscribers.size === 0) {
        context.streamIdleTimer = setTimeout(() => {
          this.destroySession(sessionId, {
            reason: 'sse_idle_timeout',
            initiatedBy: 'system',
          }).catch((error) =>
            this.logger.error('Failed to cleanup idle session', { sessionId, error }),
          );
        }, STREAM_IDLE_CLEANUP_MS);
      }
    };
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  private handleControlCommand(context: SessionContext, command: Extract<SessionCommand, { kind: 'control' }>) {
    switch (command.action) {
      case 'interrupt':
        context.manager.interrupt();
        break;
      case 'mute':
        context.manager.mute(Boolean(command.value));
        break;
      case 'push_to_talk_start':
        context.manager.pushToTalkStart();
        break;
      case 'push_to_talk_stop':
        context.manager.pushToTalkStop();
        break;
      default:
        throw new SessionHostError('Unknown control action', 'invalid_event_payload', 400);
    }
  }

  private resolveRuntimeModalities(
    options: CreateSessionOptions,
    snapshot: RealtimeEnvironmentSnapshot,
    textOutputEnabled: boolean,
  ): Array<'text' | 'audio'> {
    const audioRequested = options.clientCapabilities?.audio !== false;
    const audioAvailable = audioRequested && snapshot.audio.enabled;

    if (!audioRequested && !textOutputEnabled) {
      throw new SessionHostError(
        'Client must enable audio or text output when creating a session',
        'invalid_client_capabilities',
        400,
      );
    }

    if (audioAvailable) {
      return ['audio'];
    }

    if (textOutputEnabled) {
      return ['text'];
    }

    throw new SessionHostError(
      'Audio output unavailable in current environment and text output disabled by client',
      'invalid_client_capabilities',
      400,
    );
  }

  private buildReportedModalities(
    options: CreateSessionOptions,
    snapshot: RealtimeEnvironmentSnapshot,
    textOutputEnabled: boolean,
  ): Array<'text' | 'audio'> {
    const modalities: Array<'text' | 'audio'> = [];
    const audioRequested = options.clientCapabilities?.audio !== false;
    if (audioRequested && snapshot.audio.enabled) {
      modalities.push('audio');
    }
    if (textOutputEnabled) {
      modalities.push('text');
    }
    if (modalities.length === 0) {
      // fallback for text-only environments
      modalities.push('text');
    }
    return modalities;
  }

  private normalizeRealtimeError(payload: any): SessionErrorSummary {
    const pickString = (value: unknown) =>
      typeof value === 'string' && value.length > 0 ? value : undefined;

    if (!payload || typeof payload !== 'object') {
      return {
        message: pickString(payload as string) ?? 'Unknown Realtime error',
      };
    }

    const source = typeof payload.error === 'object' && payload.error ? payload.error : payload;
    const nestedErrorCandidate = Array.isArray((source as any).errors)
      ? (source as any).errors[0]
      : undefined;
    const leaf =
      typeof (source as any).error === 'object' && (source as any).error
        ? (source as any).error
        : nestedErrorCandidate ?? source;

    const summary: SessionErrorSummary = {
      code: pickString((leaf as any).code) ?? pickString((source as any).code),
      message:
        pickString((leaf as any).message) ??
        pickString((source as any).message) ??
        pickString((payload as any).message),
      type: pickString((leaf as any).type) ?? pickString((source as any).type),
      eventId: pickString((source as any).event_id ?? (source as any).eventId),
    };

    if (typeof (leaf as any).status === 'number') {
      summary.status = (leaf as any).status;
    } else if (typeof (source as any).status === 'number') {
      summary.status = (source as any).status;
    }

    if (typeof (leaf as any).retryable === 'boolean') {
      summary.retryable = (leaf as any).retryable;
    } else if (typeof (source as any).retryable === 'boolean') {
      summary.retryable = (source as any).retryable;
    }

    if (!summary.message && typeof payload === 'string') {
      summary.message = payload;
    }

    if (!summary.message) {
      summary.message = 'Unknown Realtime error';
    }

    return summary;
  }

  private sanitizeErrorPayload(payload: any) {
    try {
      return JSON.parse(JSON.stringify(payload));
    } catch {
      return undefined;
    }
  }

  private enforceRateLimit(context: SessionContext) {
    const now = this.now();
    context.rateLimiter.hits = context.rateLimiter.hits.filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
    );
    if (context.rateLimiter.hits.length >= RATE_LIMIT_MAX_EVENTS) {
      throw new SessionHostError('Too many events', 'rate_limit_exceeded', 429);
    }
    context.rateLimiter.hits.push(now);
  }

  private attachManagerListeners(context: SessionContext) {
    const forwardableEvents: SessionEventName[] = [
      'agent_handoff',
      'agent_tool_start',
      'agent_tool_end',
      'history_updated',
      'history_added',
      'guardrail_tripped',
      'error',
    ];

    forwardableEvents.forEach((event) => {
      const handler = (...args: any[]) => {
        const payload = args.length > 1 ? args : args[0];
        this.broadcast(context.id, event, payload);
        if (event === 'error') {
          const summary = this.normalizeRealtimeError(payload);
          const rawPayload = this.sanitizeErrorPayload(payload);
          this.logger.error('Realtime session error', {
            sessionId: context.id,
            ...summary,
            raw: rawPayload,
          });
          this.metrics.increment('bff.session.realtime_errors_total', 1, {
            code: summary.code ?? 'unknown',
          });
          this.broadcast(context.id, 'session_error', summary);
        }
      };
      context.manager.on(event, handler as any);
      context.emitter.once('cleanup', () => context.manager.off(event, handler as any));
    });
  }

  private startHeartbeat(context: SessionContext) {
    context.heartbeatTimer = setInterval(() => {
      this.broadcast(context.id, 'heartbeat', { ts: Date.now() });
      const now = this.now();
      if (now - context.lastCommandAt > SESSION_TTL_MS) {
        this.destroySession(context.id, {
          reason: 'heartbeat_timeout',
          initiatedBy: 'system',
        }).catch((error) =>
          this.logger.error('Failed to cleanup inactive session', { sessionId: context.id, error }),
        );
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private broadcast(sessionId: string, event: string, data: Record<string, any> | string | null) {
    const context = this.sessions.get(sessionId);
    if (!context) return;
    if (event === 'transport_event' && !context.textOutputEnabled && isRealtimeTranscriptionEventPayload(data)) {
      return;
    }
    const message: SessionStreamMessage = {
      event,
      data,
      timestamp: new Date(this.now()).toISOString(),
    };
    context.emitter.emit('message', message);
  }

  private clearTimers(context: SessionContext) {
    if (context.heartbeatTimer) {
      clearInterval(context.heartbeatTimer);
      context.heartbeatTimer = undefined;
    }
    if (context.streamIdleTimer) {
      clearTimeout(context.streamIdleTimer);
      context.streamIdleTimer = undefined;
    }
    context.emitter.emit('cleanup');
    context.emitter.removeAllListeners();
  }

  private generateSessionId(): string {
    return `sess_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  private createVoiceControlHandlers(sessionId: string): VoiceControlHandlers {
    const emitDirective = (directive: VoiceControlDirective) => {
      this.broadcast(sessionId, 'voice_control', directive);
    };

    return {
      requestScenarioChange: async (scenarioKey: string) => {
        if (!scenarioKey) {
          return { success: false, message: '有効なシナリオキーを指定してください。' };
        }
        emitDirective({ action: 'switchScenario', scenarioKey });
        return { success: true, message: `シナリオ「${scenarioKey}」へ切り替えます。` };
      },
      requestAgentChange: async (agentName: string) => {
        if (!agentName) {
          return { success: false, message: '有効なエージェント名を指定してください。' };
        }
        emitDirective({ action: 'switchAgent', agentName });
        return { success: true, message: `エージェント「${agentName}」に切り替えます。` };
      },
    };
  }

  private getRealtimeApiKey(): string {
    const apiKey =
      process.env.OPENAI_API_KEY ?? process.env.OPENAI_REALTIME_API_KEY ?? process.env.OPENAI_API_KEY_VOICE;
    if (!apiKey) {
      throw new SessionHostError('Realtime API key is not configured', 'missing_api_key', 500);
    }
    return apiKey;
  }
}

const SESSION_HOST_SYMBOL = Symbol.for('mcpc.sessionHost.singleton');

export function getSessionHost(): SessionHost {
  const globalScope = globalThis as typeof globalThis & {
    [SESSION_HOST_SYMBOL]?: SessionHost;
  };

  if (!globalScope[SESSION_HOST_SYMBOL]) {
    globalScope[SESSION_HOST_SYMBOL] = new SessionHost();
  }

  return globalScope[SESSION_HOST_SYMBOL]!;
}

export const sessionHost = getSessionHost();

const AUDIO_REQUIREMENT_KEYS = [
  'OPENAI_REALTIME_MODEL',
  'OPENAI_REALTIME_TRANSCRIPTION_MODEL',
  'OPENAI_REALTIME_VOICE',
] as const;

const PLACEHOLDER_KEY_PATTERN = /^sk[-_]?your/i;

export function inspectRealtimeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): RealtimeEnvironmentSnapshot {
  const warnings: string[] = [];

  const apiKey =
    env.OPENAI_API_KEY ?? env.OPENAI_REALTIME_API_KEY ?? env.OPENAI_API_KEY_VOICE ?? '';
  if (!apiKey) {
    warnings.push('Realtime API key is not configured (OPENAI_API_KEY / OPENAI_REALTIME_API_KEY).');
  } else if (PLACEHOLDER_KEY_PATTERN.test(apiKey)) {
    warnings.push('Realtime API key is using a placeholder value.');
  }

  const audioExplicitlyDisabled =
    (env.OPENAI_REALTIME_AUDIO_DISABLED ?? '').toLowerCase() === 'true';
  const missingAudioKeys = AUDIO_REQUIREMENT_KEYS.filter((key) => !env[key]);
  let audioEnabled = !audioExplicitlyDisabled && missingAudioKeys.length === 0;
  let audioReason: string | undefined;

  if (audioExplicitlyDisabled) {
    audioReason = 'Audio capability explicitly disabled via OPENAI_REALTIME_AUDIO_DISABLED.';
  } else if (missingAudioKeys.length > 0) {
    audioReason = `Audio output disabled: missing ${missingAudioKeys.join(', ')}`;
  }

  if (audioReason) {
    warnings.push(audioReason);
  }

  return {
    warnings,
    audio: {
      enabled: audioEnabled,
      reason: audioReason,
    },
  };
}
