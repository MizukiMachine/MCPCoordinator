/// <reference types="vitest" />
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import type { RealtimeAgent } from '@openai/agents/realtime';
import type { ISessionManager } from '../../../../services/realtime/types';
import { ServiceManager } from '../../../../../framework/di/ServiceManager';
import {
  ServiceConfigurationError,
  getSessionManager,
  setSessionManagerProvider,
} from '../sessionManagerLocator';

function createStubManager(): ISessionManager<RealtimeAgent> {
  return {
    getStatus: () => 'DISCONNECTED',
    updateHooks: () => {},
    connect: async () => {},
    disconnect: () => {},
    sendUserText: () => {},
    sendEvent: () => {},
    interrupt: () => {},
    mute: () => {},
    pushToTalkStart: () => {},
    pushToTalkStop: () => {},
    on: () => {},
    off: () => {},
  };
}

describe('getSessionManager', () => {
  let serviceManager: ServiceManager;

  beforeEach(() => {
    serviceManager = new ServiceManager();
  });

  afterEach(() => {
    setSessionManagerProvider('api', null);
    setSessionManagerProvider('web', null);
    setSessionManagerProvider('test', null);
  });

  it('uses the provided provider map and caches the instance per environment', () => {
    const stub = createStubManager();
    const provider = vi.fn(() => stub);
    const scenarioMap: Record<string, RealtimeAgent[]> = {
      demo: [
        {
          name: 'demo',
          instructions: 'hi',
        } as RealtimeAgent,
      ],
    };

    const first = getSessionManager({
      environment: 'web',
      providers: { web: provider },
      serviceManager,
      scenarioMap,
    });

    const second = getSessionManager({
      environment: 'web',
      providers: { web: provider },
      serviceManager,
      scenarioMap,
    });

    expect(first).toBe(stub);
    expect(second).toBe(first);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('throws a ServiceConfigurationError when no provider is configured', () => {
    const logger = {
      error: vi.fn(),
    };

    expect(() =>
      getSessionManager({
        environment: 'api',
        serviceManager,
        providers: {},
        logger,
      }),
    ).toThrow(ServiceConfigurationError);

    expect(logger.error).toHaveBeenCalled();
  });

  it('allows registering a provider globally', () => {
    const stub = createStubManager();
    const provider = vi.fn(() => stub);
    setSessionManagerProvider('api', provider);

    const resolved = getSessionManager({
      environment: 'api',
      serviceManager,
    });

    expect(resolved).toBe(stub);
    expect(provider).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'api' }),
    );
  });
});
