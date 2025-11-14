/// <reference types="vitest" />
import { renderHook, act } from '@testing-library/react';
import { EventEmitter } from 'events';

const noop = () => {};

let useRealtimeSession: typeof import('../useRealtimeSession').useRealtimeSession;

class FakeSessionManager extends EventEmitter {
  public failFirstConnect = false;
  public connectSpy = vi.fn();
  public disconnectSpy = vi.fn();
  public status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' = 'DISCONNECTED';
  public hooks: any = {};

  updateHooks(nextHooks: any) {
    this.hooks = nextHooks;
  }

  getStatus() {
    return this.status;
  }

  async connect(request: any) {
    this.connectSpy(request);
    this.status = 'CONNECTING';
    this.hooks.onStatusChange?.('CONNECTING');
    if (this.failFirstConnect) {
      this.failFirstConnect = false;
      this.status = 'DISCONNECTED';
      this.hooks.onStatusChange?.('DISCONNECTED');
      throw new Error('network down');
    }
    this.status = 'CONNECTED';
    this.hooks.onStatusChange?.('CONNECTED');
  }

  disconnect() {
    this.disconnectSpy();
    this.status = 'DISCONNECTED';
    this.hooks.onStatusChange?.('DISCONNECTED');
  }

  sendUserText = vi.fn();
  sendEvent = vi.fn();
  interrupt = vi.fn();
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

beforeAll(async () => {
  vi.doMock('@/app/contexts/EventContext', () => {
    return {
      useEvent: () => ({
        logClientEvent: noop,
        logServerEvent: noop,
      }),
    };
  });

  vi.doMock('@/app/hooks/useHandleSessionHistory', () => {
    return {
      useHandleSessionHistory: () => ({
        current: {
          handleTranscriptionCompleted: noop,
          handleTranscriptionDelta: noop,
          handleAgentToolStart: noop,
          handleAgentToolEnd: noop,
          handleHistoryUpdated: noop,
          handleHistoryAdded: noop,
          handleGuardrailTripped: noop,
        },
      }),
    };
  });

  ({ useRealtimeSession } = await import('../useRealtimeSession'));
});

describe('useRealtimeSession', () => {
  const baseConnectOptions = {
    getEphemeralKey: async () => 'fake-ek',
    agentSetKey: 'chatSupervisor',
    preferredAgentName: 'rootAgent',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recovers gracefully after connection failures and allows retry', async () => {
    const fakeManager = new FakeSessionManager();
    fakeManager.failFirstConnect = true;
    const onConnectionChange = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeSession({ onConnectionChange }, { createSessionManager: () => fakeManager }),
    );

    await expect(
      act(async () => {
        await result.current.connect(baseConnectOptions as any);
      }),
    ).rejects.toThrow('network down');

    expect(onConnectionChange).toHaveBeenCalledWith('CONNECTING');
    expect(result.current.status).toBe('DISCONNECTED');

    await act(async () => {
      result.current.disconnect();
    });

    await act(async () => {
      await result.current.connect(baseConnectOptions as any);
    });

    expect(fakeManager.connectSpy).toHaveBeenCalledTimes(2);
  });

  // Session teardown validations now live in SessionManager tests.
});
