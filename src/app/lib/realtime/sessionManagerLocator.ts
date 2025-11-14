import type { RealtimeAgent } from '@openai/agents/realtime';

import {
  ServiceManager,
  ServiceManagerLogger,
  ServiceToken,
  createServiceToken,
} from '../../../../framework/di/ServiceManager';
import {
  detectRuntimeEnvironment,
  type RuntimeEnvironment,
} from '../../../../framework/di/runtimeEnvironment';
import { allAgentSets } from '@/app/agentConfigs';
import { createOpenAISessionManager } from '../../../../services/realtime/adapters/createOpenAISessionManager';
import type { OpenAIRealtimeTransportOptions } from '../../../../services/realtime/adapters/openAIRealtimeTransport';
import type {
  ISessionManager,
  SessionEventHandler,
  SessionLifecycleStatus,
  SessionManagerHooks,
} from '../../../../services/realtime/types';

type ProviderMap = Partial<Record<RuntimeEnvironment, SessionManagerProvider>>;

export interface SessionManagerProviderContext {
  environment: RuntimeEnvironment;
  scenarioMap: Record<string, RealtimeAgent[]>;
  hooks?: SessionManagerHooks;
  transport?: OpenAIRealtimeTransportOptions;
}

export type SessionManagerProvider = (
  context: SessionManagerProviderContext,
) => ISessionManager<RealtimeAgent>;

export interface GetSessionManagerOptions {
  environment?: RuntimeEnvironment;
  serviceManager?: ServiceManager;
  hooks?: SessionManagerHooks;
  scenarioMap?: Record<string, RealtimeAgent[]>;
  providers?: ProviderMap;
  transport?: OpenAIRealtimeTransportOptions;
  logger?: ServiceManagerLogger;
}

const DEFAULT_OUTPUT_MODALITIES: Array<'audio' | 'text'> = ['audio'];

const sessionTokens: Record<
  RuntimeEnvironment,
  ServiceToken<ISessionManager<RealtimeAgent>>
> = {
  web: createServiceToken<ISessionManager<RealtimeAgent>>(
    'realtime.sessionManager.web',
  ),
  api: createServiceToken<ISessionManager<RealtimeAgent>>(
    'realtime.sessionManager.api',
  ),
  test: createServiceToken<ISessionManager<RealtimeAgent>>(
    'realtime.sessionManager.test',
  ),
};

const providerOverrides: Partial<Record<RuntimeEnvironment, SessionManagerProvider>> =
  {};

const defaultProviders: ProviderMap = {
  web: (ctx) =>
    createOpenAISessionManager({
      scenarioMap: ctx.scenarioMap,
      hooks: ctx.hooks,
      transport: {
        ...ctx.transport,
        defaultOutputModalities:
          ctx.transport?.defaultOutputModalities ?? DEFAULT_OUTPUT_MODALITIES,
      },
    }),
  test: () => new NoopSessionManager(),
};

let defaultServiceManager: ServiceManager | null = null;

const defaultLogger: ServiceManagerLogger = {
  error: (message, context) => {
    if (typeof console !== 'undefined') {
      console.error(`[realtime-di] ${message}`, context);
    }
  },
  warn: (message, context) => {
    if (typeof console !== 'undefined') {
      console.warn(`[realtime-di] ${message}`, context);
    }
  },
};

export class ServiceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceConfigurationError';
  }
}

export function setSessionManagerProvider(
  environment: RuntimeEnvironment,
  provider: SessionManagerProvider | null,
): void {
  if (provider) {
    providerOverrides[environment] = provider;
  } else {
    delete providerOverrides[environment];
  }
}

export async function resetRealtimeServiceRegistry(): Promise<void> {
  if (defaultServiceManager) {
    await defaultServiceManager.shutdownAll().catch((error) => {
      defaultLogger.warn?.('Failed to shutdown default ServiceManager', { error });
    });
    defaultServiceManager = null;
  }

  Object.keys(providerOverrides).forEach((key) => {
    delete providerOverrides[key as RuntimeEnvironment];
  });
}

export function getSessionManager(
  options: GetSessionManagerOptions = {},
): ISessionManager<RealtimeAgent> {
  const logger = options.logger ?? defaultLogger;
  const environment = options.environment ?? detectRuntimeEnvironment();
  const serviceManager =
    options.serviceManager ?? getDefaultServiceManager(options.logger);
  const token = sessionTokens[environment];

  if (!serviceManager.has(token)) {
    const provider = resolveProvider(environment, options.providers);
    if (!provider) {
      const message = `No SessionManager provider configured for environment "${environment}"`;
      logger.error?.(message, { environment });
      throw new ServiceConfigurationError(message);
    }

    const scenarioMap = options.scenarioMap ?? allAgentSets;
    serviceManager.register(
      token,
      () =>
        provider({
          environment,
          scenarioMap,
          hooks: options.hooks,
          transport: options.transport,
        }),
      {
        dispose: (manager) => manager.disconnect(),
      },
    );
  }

  return serviceManager.get(token);
}

function resolveProvider(
  environment: RuntimeEnvironment,
  localOverrides?: ProviderMap,
): SessionManagerProvider | undefined {
  return (
    localOverrides?.[environment] ??
    providerOverrides[environment] ??
    defaultProviders[environment]
  );
}

function getDefaultServiceManager(logger?: ServiceManagerLogger): ServiceManager {
  if (!defaultServiceManager) {
    defaultServiceManager = new ServiceManager({ logger: logger ?? defaultLogger });
  }
  return defaultServiceManager;
}

class NoopSessionManager implements ISessionManager<RealtimeAgent> {
  private status: SessionLifecycleStatus = 'DISCONNECTED';
  private hooks: SessionManagerHooks = {};
  private listeners = new Map<string, Set<SessionEventHandler>>();

  getStatus(): SessionLifecycleStatus {
    return this.status;
  }

  updateHooks(next: SessionManagerHooks): void {
    this.hooks = {
      ...this.hooks,
      ...next,
    };
  }

  async connect(): Promise<void> {
    this.setStatus('CONNECTED');
  }

  disconnect(): void {
    this.setStatus('DISCONNECTED');
  }

  sendUserText(_text: string): void {}

  sendEvent(_event: Record<string, any>): void {}

  interrupt(): void {}

  mute(_muted: boolean): void {}

  pushToTalkStart(): void {}

  pushToTalkStop(): void {}

  on(event: string, handler: SessionEventHandler): void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler);
    this.listeners.set(event, set);
  }

  off(event: string, handler: SessionEventHandler): void {
    const set = this.listeners.get(event);
    set?.delete(handler);
    if (set && set.size === 0) {
      this.listeners.delete(event);
    }
  }

  private setStatus(next: SessionLifecycleStatus) {
    this.status = next;
    this.hooks.onStatusChange?.(next);
  }
}
