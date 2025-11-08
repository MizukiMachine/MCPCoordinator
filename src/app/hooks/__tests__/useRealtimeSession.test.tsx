/// <reference types="vitest" />
import { renderHook, act } from '@testing-library/react';
import { EventEmitter } from 'events';

const sessionStore: any[] = [];
const noop = () => {};

let useRealtimeSession: typeof import('../useRealtimeSession').useRealtimeSession;
let RealtimeSession: any;

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

  vi.doMock('@openai/agents/realtime', () => {
    class FakeSession extends EventEmitter {
      public transport = { sendEvent: noop };
      public initialAgent: any;
      public options: any;

      constructor(agent: any, options: any) {
        super();
        this.initialAgent = agent;
        this.options = options;
        sessionStore.push(this);
      }

      async connect() {
        /* no-op */
      }

      close() {
        this.removeAllListeners();
      }

      interrupt() {}
      sendMessage() {}
      mute() {}
    }

    class FakeTransport {
      public options: any;
      constructor(options: any) {
        this.options = options;
      }
    }

    return {
      RealtimeSession: FakeSession,
      OpenAIRealtimeWebRTC: FakeTransport,
    };
  });

  ({ useRealtimeSession } = await import('../useRealtimeSession'));
  ({ RealtimeSession } = await import('@openai/agents/realtime'));
});

describe('useRealtimeSession', () => {
  const baseConnectOptions = {
    getEphemeralKey: async () => 'fake-ek',
    initialAgents: [{ name: 'rootAgent' } as any],
  };

  beforeEach(() => {
    sessionStore.length = 0;
    vi.clearAllMocks();
  });

  it('recovers gracefully after connection failures and allows retry', async () => {
    const onConnectionChange = vi.fn();
    const { result } = renderHook(() => useRealtimeSession({ onConnectionChange }));

    const connectSpy = vi
      .spyOn(RealtimeSession.prototype, 'connect')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(undefined);

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

    expect(connectSpy).toHaveBeenCalledTimes(2);
    expect(sessionStore).toHaveLength(2);
  });

  it('cleans up sessions on disconnect so a fresh connection can be created', async () => {
    const { result } = renderHook(() => useRealtimeSession());

    const closeSpy = vi
      .spyOn(RealtimeSession.prototype, 'close')
      .mockImplementation(function close(this: any) {
        EventEmitter.prototype.removeAllListeners.call(this);
      });

    await act(async () => {
      await result.current.connect(baseConnectOptions as any);
    });

    expect(sessionStore).toHaveLength(1);

    await act(() => {
      result.current.disconnect();
    });

    expect(closeSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.connect(baseConnectOptions as any);
    });

    expect(sessionStore).toHaveLength(2);
  });
});
