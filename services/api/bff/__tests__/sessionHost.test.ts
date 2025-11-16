/// <reference types="vitest" />
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

import type {
  ISessionManager,
  SessionEventName,
  SessionLifecycleStatus,
  SessionManagerHooks,
} from '../../../realtime/types';
import type { RealtimeAgent } from '@openai/agents/realtime';
import {
  SessionHost,
  SessionHostError,
  type RealtimeEnvironmentSnapshot,
  type SessionStreamMessage,
} from '../sessionHost';

type HookedManager = ISessionManager<RealtimeAgent> & {
  hooks: SessionManagerHooks;
  connectMock: ReturnType<typeof vi.fn>;
  sendEventMock: ReturnType<typeof vi.fn>;
};

class FakeSessionManager extends EventEmitter implements HookedManager {
  public hooks: SessionManagerHooks = {};
  public status: SessionLifecycleStatus = 'DISCONNECTED';
  public connectMock = vi.fn();
  public sendEventMock = vi.fn();

  constructor(private readonly hooksFactory: SessionManagerHooks) {
    super();
    this.updateHooks(hooksFactory);
  }

  getStatus(): SessionLifecycleStatus {
    return this.status;
  }

  updateHooks(next: SessionManagerHooks): void {
    this.hooks = next;
  }

  override emit(event: string | symbol, ...args: any[]): boolean {
    if (event === 'transport_event') {
      const payload = args.length > 1 ? args : args[0];
      this.hooks.onServerEvent?.('transport_event', payload);
    }
    return super.emit(event, ...args);
  }

  async connect(options?: any): Promise<void> {
    this.status = 'CONNECTED';
    this.hooks.onStatusChange?.('CONNECTED');
    this.connectMock(options);
  }

  disconnect(): void {
    this.status = 'DISCONNECTED';
    this.hooks.onStatusChange?.('DISCONNECTED');
  }

  sendUserText(): void {}

  sendEvent(payload: Record<string, any>): void {
    this.sendEventMock(payload);
    this.emit('transport_event', payload);
  }

  interrupt(): void {}
  mute(): void {}
  pushToTalkStart(): void {}
  pushToTalkStop(): void {}
}

describe('SessionHost', () => {
  const scenarioMap: Record<string, RealtimeAgent[]> = {
    demo: [
      {
        name: 'demo-agent',
        instructions: 'demo',
      } as RealtimeAgent,
    ],
  };

  let host: SessionHost;
  let managers: FakeSessionManager[];
  let envSnapshot: RealtimeEnvironmentSnapshot;

  beforeEach(() => {
    managers = [];
    envSnapshot = {
      warnings: [],
      audio: { enabled: true },
    };
    host = new SessionHost({
      scenarioMap,
      sessionManagerFactory: (hooks) => {
        const mgr = new FakeSessionManager(hooks);
        managers.push(mgr);
        return mgr;
      },
      now: () => Date.now(),
      envInspector: () => envSnapshot,
    });
  });

  it('creates sessions and forwards commands', async () => {
    const result = await host.createSession({ agentSetKey: 'demo' });
    expect(result.sessionId).toMatch(/^sess_/);
    expect(result.streamUrl).toContain(result.sessionId);
    expect(result.allowedModalities).toEqual(['audio', 'text']);
    expect(result.textOutputEnabled).toBe(true);
    expect(managers[0]!.connectMock).toHaveBeenCalledWith(
      expect.objectContaining({ outputModalities: ['audio', 'text'] }),
    );

    const manager = managers[0]!;
    const status = await host.handleCommand(result.sessionId, {
      kind: 'input_text',
      text: 'hello',
    });
    expect(status).toBe('CONNECTED');
    expect(manager.sendEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'conversation.item.create' }),
    );
  });

  it('allows disabling text output when requested by the client', async () => {
    const result = await host.createSession({
      agentSetKey: 'demo',
      clientCapabilities: { outputText: false },
    });

    expect(result.allowedModalities).toEqual(['audio']);
    expect(result.textOutputEnabled).toBe(false);
    expect(managers[0]!.connectMock).toHaveBeenCalledWith(
      expect.objectContaining({ outputModalities: ['audio'] }),
    );
  });

  it('enforces rate limiting', async () => {
    const { sessionId } = await host.createSession({ agentSetKey: 'demo' });
    await Promise.all(
      Array.from({ length: 10 }).map(() =>
        host.handleCommand(sessionId, { kind: 'event', event: { type: 'noop' } }),
      ),
    );

    await expect(
      host.handleCommand(sessionId, { kind: 'event', event: { type: 'overflow' } }),
    ).rejects.toThrow(SessionHostError);
  });

  it('broadcasts SSE messages to subscribers', async () => {
    const { sessionId } = await host.createSession({ agentSetKey: 'demo' });
    const messages: any[] = [];
    const unsubscribe = host.subscribe(sessionId, {
      id: 'sub',
      send: (msg) => messages.push(msg),
    });

    await host.handleCommand(sessionId, { kind: 'event', event: { type: 'pong' } });
    expect(messages.some((m) => m.event === 'status')).toBe(true);
    expect(messages.some((m) => m.event === 'transport_event')).toBe(true);
    unsubscribe();
  });

  it('forwards transport events exactly once', async () => {
    const { sessionId } = await host.createSession({ agentSetKey: 'demo' });
    const received: SessionStreamMessage[] = [];
    const unsubscribe = host.subscribe(sessionId, {
      id: 'listener',
      send: (msg) => received.push(msg),
    });

    const countTransportEvents = () =>
      received.filter((msg) => msg.event === 'transport_event').length;
    const initialCount = countTransportEvents();

    managers[0]!.hooks.onServerEvent?.('transport_event', {
      type: 'response.output_audio.delta',
      delta: 'PCM',
    });

    expect(countTransportEvents()).toBe(initialCount + 1);
    unsubscribe();
  });

  it('falls back to text-only output when audio capability is disabled', async () => {
    envSnapshot = {
      warnings: ['Audio disabled for test'],
      audio: {
        enabled: false,
        reason: 'Missing OPENAI_REALTIME_VOICE',
      },
    };

    host = new SessionHost({
      scenarioMap,
      sessionManagerFactory: (hooks) => {
        const mgr = new FakeSessionManager(hooks);
        managers.push(mgr);
        return mgr;
      },
      envInspector: () => envSnapshot,
    });

    const result = await host.createSession({
      agentSetKey: 'demo',
      clientCapabilities: { audio: true },
    });

    expect(result.allowedModalities).toEqual(['text']);
    expect(result.textOutputEnabled).toBe(true);
    expect(result.capabilityWarnings).toContain('Audio disabled for test');
    expect(managers[0]!.connectMock).toHaveBeenCalledWith(
      expect.objectContaining({ outputModalities: ['text'] }),
    );
  });

  it('rejects sessions when both audio and text outputs are disabled', async () => {
    await expect(
      host.createSession({
        agentSetKey: 'demo',
        clientCapabilities: { audio: false, outputText: false },
      }),
    ).rejects.toThrow(SessionHostError);
  });

  it('suppresses transcription transport events when text output is disabled', async () => {
    const { sessionId } = await host.createSession({
      agentSetKey: 'demo',
      clientCapabilities: { outputText: false },
    });
    const received: SessionStreamMessage[] = [];
    const unsubscribe = host.subscribe(sessionId, {
      id: 'listener',
      send: (msg) => received.push(msg),
    });

    const countTransportEvents = () =>
      received.filter((msg) => msg.event === 'transport_event').length;
    const initialCount = countTransportEvents();

    managers[0]!.emit('transport_event', {
      type: 'response.output_text.delta',
      delta: 'Hello from transcript',
    });

    expect(countTransportEvents()).toBe(initialCount);

    managers[0]!.emit('transport_event', {
      type: 'response.output_audio.delta',
      delta: 'PCM',
    });

    expect(countTransportEvents()).toBe(initialCount + 1);
    unsubscribe();
  });

  it('emits session_error events with sanitized payloads', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    host = new SessionHost({
      scenarioMap,
      sessionManagerFactory: (hooks) => {
        const mgr = new FakeSessionManager(hooks);
        managers.push(mgr);
        return mgr;
      },
      logger,
      envInspector: () => ({ warnings: [], audio: { enabled: true } }),
    });

    const { sessionId } = await host.createSession({ agentSetKey: 'demo' });
    const received: SessionStreamMessage[] = [];
    const unsubscribe = host.subscribe(sessionId, {
      id: 'listener',
      send: (msg) => received.push(msg),
    });

    managers[0]!.emit('error', {
      error: { code: 'access_denied', message: 'Audio output disabled', type: 'invalid_permission' },
    });

    const sessionError = received.find((msg) => msg.event === 'session_error');
    expect(sessionError?.data).toMatchObject({
      code: 'access_denied',
      message: 'Audio output disabled',
      type: 'invalid_permission',
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Realtime session error',
      expect.objectContaining({ sessionId, code: 'access_denied' }),
    );

    unsubscribe();
  });
});
