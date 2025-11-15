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
import { SessionHost, SessionHostError } from '../sessionHost';

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

  async connect(): Promise<void> {
    this.status = 'CONNECTED';
    this.hooks.onStatusChange?.('CONNECTED');
    this.connectMock();
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

  beforeEach(() => {
    managers = [];
    host = new SessionHost({
      scenarioMap,
      sessionManagerFactory: (hooks) => {
        const mgr = new FakeSessionManager(hooks);
        managers.push(mgr);
        return mgr;
      },
      now: () => Date.now(),
    });
  });

  it('creates sessions and forwards commands', async () => {
    const result = await host.createSession({ agentSetKey: 'demo' });
    expect(result.sessionId).toMatch(/^sess_/);
    expect(result.streamUrl).toContain(result.sessionId);

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
});
