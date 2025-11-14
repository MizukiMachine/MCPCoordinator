/// <reference types="vitest" />
import { EventEmitter } from 'events';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { SessionManager } from '../SessionManager';
import type {
  IAgentSetResolver,
  ISessionHandle,
  ISessionTransport,
  ResolvedAgentSet,
  SessionConnectOptions,
  SessionLifecycleStatus,
  SessionManagerHooks,
  SessionTransportRequest,
} from '../types';

class FakeHandle extends EventEmitter implements ISessionHandle {
  disconnect = vi.fn();
  interrupt = vi.fn();
  sendUserText = vi.fn();
  sendEvent = vi.fn();
  mute = vi.fn();
  pushToTalkStart = vi.fn();
  pushToTalkStop = vi.fn();

  override on(event: string, handler: (...args: any[]) => void): this {
    return super.on(event, handler);
  }

  override off(event: string, handler: (...args: any[]) => void): this {
    return super.off(event, handler);
  }
}

class FakeTransport<TAgentHandle = unknown>
  implements ISessionTransport<TAgentHandle>
{
  constructor(private readonly handle: FakeHandle) {}

  createSession = vi.fn(
    async (
      request: SessionTransportRequest<TAgentHandle>,
    ): Promise<ISessionHandle> => {
      (this.handle as any).request = request;
      return this.handle;
    },
  );
}

class FakeResolver<TAgentHandle = unknown>
  implements IAgentSetResolver<TAgentHandle>
{
  constructor(private readonly resolved: ResolvedAgentSet<TAgentHandle>) {}

  resolve = vi.fn(async () => this.resolved);
}

describe('SessionManager', () => {
  let handle: FakeHandle;
  let transport: FakeTransport<any>;
  let resolver: FakeResolver<any>;
  let hooks: SessionManagerHooks;
  const agentSet: ResolvedAgentSet<any> = {
    primaryAgent: { name: 'root', handle: { kind: 'root' } },
    agents: [
      { name: 'root', handle: { kind: 'root' } },
      { name: 'secondary', handle: { kind: 'secondary' } },
    ],
  };
  const connectOptions: SessionConnectOptions = {
    agentSetKey: 'demo',
    getEphemeralKey: async () => 'test-ek',
  };

  beforeEach(() => {
    handle = new FakeHandle();
    transport = new FakeTransport(handle);
    resolver = new FakeResolver(agentSet);
    hooks = {
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
      metrics: {
        increment: vi.fn(),
      },
      onStatusChange: vi.fn(),
      onServerEvent: vi.fn(),
      guardrail: {
        onGuardrailTripped: vi.fn(),
      },
    };
  });

  const createManager = () =>
    new SessionManager({
      agentResolver: resolver,
      transportFactory: () => transport,
      hooks,
    });

  it('connects via resolver and transport then updates hooks', async () => {
    const manager = createManager();
    await manager.connect(connectOptions);

    expect(resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'demo' }),
    );
    expect(transport.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ agentSet }),
    );
    expect(manager.getStatus()).toBe('CONNECTED');
    expect(hooks.onStatusChange).toHaveBeenCalledWith('CONNECTING');
    expect(hooks.onStatusChange).toHaveBeenCalledWith('CONNECTED');
  });

  it('forwards guardrail events to hooks and listeners', async () => {
    const manager = createManager();
    const guardrailListener = vi.fn();
    manager.on('guardrail_tripped', guardrailListener);

    await manager.connect(connectOptions);

    const payload = { reason: 'moderation' };
    handle.emit('guardrail_tripped', payload);

    expect(hooks.guardrail?.onGuardrailTripped).toHaveBeenCalledWith(payload);
    expect(guardrailListener).toHaveBeenCalledWith(payload);
  });

  it('logs connection failures and returns manager to disconnected state', async () => {
    transport.createSession.mockRejectedValueOnce(new Error('boom'));
    const manager = createManager();

    await expect(manager.connect(connectOptions)).rejects.toThrow('boom');
    expect(manager.getStatus()).toBe('DISCONNECTED');
    expect(hooks.logger?.error).toHaveBeenCalled();
  });

  it('disconnects and unsubscribes from handle events', async () => {
    const manager = createManager();
    await manager.connect(connectOptions);

    manager.disconnect();

    expect(handle.disconnect).toHaveBeenCalled();
    expect(manager.getStatus()).toBe('DISCONNECTED');

    const guardrailListener = vi.fn();
    manager.on('guardrail_tripped', guardrailListener);
    handle.emit('guardrail_tripped', { test: true });
    expect(guardrailListener).not.toHaveBeenCalled();
  });
});
