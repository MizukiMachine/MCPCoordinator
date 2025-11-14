/// <reference types="vitest" />
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { RealtimeAgent } from '@openai/agents/realtime';
import { createOpenAISessionManager } from '../createOpenAISessionManager';

const sessionManagerCtor = vi.fn();
const transportCtor = vi.fn();
const resolverCtor = vi.fn();

const sessionManagerInstance = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  getStatus: vi.fn(() => 'DISCONNECTED'),
  updateHooks: vi.fn(),
  sendUserText: vi.fn(),
  sendEvent: vi.fn(),
  interrupt: vi.fn(),
  mute: vi.fn(),
  pushToTalkStart: vi.fn(),
  pushToTalkStop: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('../../SessionManager', () => {
  class MockSessionManager {
    constructor(options: any) {
      sessionManagerCtor(options);
      return sessionManagerInstance;
    }
  }

  return {
    SessionManager: MockSessionManager,
  };
});

vi.mock('../openAIAgentSetResolver', () => {
  class MockResolver {
    constructor(map: Record<string, RealtimeAgent[]>) {
      resolverCtor(map);
    }

    resolve = vi.fn();
  }

  return { OpenAIAgentSetResolver: MockResolver };
});

vi.mock('../openAIRealtimeTransport', () => {
  class MockTransport {
    constructor(options: any) {
      transportCtor(options);
    }

    createSession = vi.fn();
    dispose = vi.fn();
  }

  return {
    OpenAIRealtimeTransport: MockTransport,
  };
});

describe('createOpenAISessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionManagerCtor.mockClear();
  });

  it('builds a SessionManager wired with resolver, transport, and hooks', () => {
    const hooks = {
      logger: { info: vi.fn() },
    };

    const scenarioMap: Record<string, RealtimeAgent[]> = {
      demo: [
        {
          name: 'demo',
          instructions: 'hi',
        } as RealtimeAgent,
      ],
    };

    const manager = createOpenAISessionManager({
      scenarioMap,
      transport: { model: 'gpt-realtime-preview', defaultOutputModalities: ['audio'] },
      hooks,
    });

    expect(manager).toBe(sessionManagerInstance);
    expect(resolverCtor).toHaveBeenCalledWith(scenarioMap);
    expect(sessionManagerCtor).toHaveBeenCalledTimes(1);

    const firstCall = sessionManagerCtor.mock.calls[0]![0];
    expect(firstCall.hooks).toBe(hooks);

    const transport = firstCall.transportFactory();
    expect(transport).toBeInstanceOf(Object);
    expect(transportCtor).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-realtime-preview' }),
    );
  });
});
