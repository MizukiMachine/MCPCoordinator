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
import { allAgentSets, scenarioMcpBindings } from '@/app/agentConfigs';
import { createOpenAISessionManager } from '../../../../services/realtime/adapters/createOpenAISessionManager';
import { McpServerRegistry } from '../../../../services/mcp/mcpServerRegistry';
import { loadMcpServersFromEnv } from '../../../../services/mcp/config';
import { McpEnabledAgentSetResolver } from '../../../../services/realtime/adapters/mcpEnabledAgentSetResolver';
import { OpenAIAgentSetResolver } from '../../../../services/realtime/adapters/openAIAgentSetResolver';
import type { IAgentSetResolver } from '../../../../services/realtime/types';
import type { McpServerConfig } from '../../../../services/mcp/mcpTypes';
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
  scenarioMcpBindings?: Record<string, string[]>;
  serviceManager: ServiceManager;
  logger: ServiceManagerLogger;
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
  scenarioMcpBindings?: Record<string, string[]>;
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

const MCP_REGISTRY_TOKEN = createServiceToken<McpServerRegistry>(
  'realtime.mcp.registry',
);

function ensureMcpRegistry(
  serviceManager: ServiceManager,
  configs: Record<string, McpServerConfig>,
  logger: ServiceManagerLogger,
): McpServerRegistry {
  if (!serviceManager.has(MCP_REGISTRY_TOKEN)) {
    const registry = new McpServerRegistry({
      configs,
      serviceManager,
      logger,
    });
    serviceManager.register(MCP_REGISTRY_TOKEN, () => registry);
  }
  return serviceManager.get(MCP_REGISTRY_TOKEN);
}

function buildAgentResolver(
  ctx: SessionManagerProviderContext,
  logger: ServiceManagerLogger,
): IAgentSetResolver<RealtimeAgent> {
  const bindings = ctx.scenarioMcpBindings ?? scenarioMcpBindings;
  const hasBinding = Object.values(bindings).some((list) => list.length > 0);
  if (!hasBinding) {
    return new OpenAIAgentSetResolver(ctx.scenarioMap);
  }

  const configs = loadMcpServersFromEnv();
  if (Object.keys(configs).length === 0) {
    logger.warn?.('MCP bindings exist but MCP_SERVERS is empty; skipping MCP wiring', {
      environment: ctx.environment,
    });
    return new OpenAIAgentSetResolver(ctx.scenarioMap);
  }

  const registry = ensureMcpRegistry(ctx.serviceManager, configs, logger);
  return new McpEnabledAgentSetResolver({
    scenarios: ctx.scenarioMap,
    bindings,
    registry,
    logger,
  });
}

const defaultProviders: ProviderMap = {
  web: (ctx) =>
    createOpenAISessionManager({
      agentResolver: buildAgentResolver(ctx, ctx.logger),
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

const REGISTRY_KEY = Symbol.for('mcpc.realtime.defaultServiceManagerRegistry');

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

type ServiceManagerRegistry = Map<string, ServiceManager>;

function getServiceManagerRegistry(): ServiceManagerRegistry {
  const globalScope = globalThis as Record<symbol | string, unknown>;
  const existing = globalScope[REGISTRY_KEY] as ServiceManagerRegistry | undefined;
  if (existing) {
    return existing;
  }

  const registry: ServiceManagerRegistry = new Map();
  globalScope[REGISTRY_KEY] = registry;
  return registry;
}

async function teardownServiceManagerRegistry(): Promise<void> {
  const registry = getServiceManagerRegistry();
  const managers = Array.from(registry.values());
  await Promise.all(
    managers.map((manager) =>
      manager.shutdownAll().catch((error) => {
        defaultLogger.warn?.('Failed to shutdown default ServiceManager', { error });
      }),
    ),
  );
  registry.clear();
}

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
  await teardownServiceManagerRegistry();

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
    options.serviceManager ?? getDefaultServiceManager(environment, logger);
  const token = sessionTokens[environment];

  if (!serviceManager.has(token)) {
    const provider = resolveProvider(environment, options.providers);
    if (!provider) {
      const message = `No SessionManager provider configured for environment "${environment}"`;
      logger.error?.(message, { environment });
      throw new ServiceConfigurationError(message);
    }

    const scenarioMap = options.scenarioMap ?? allAgentSets;
    const scenarioMcp = options.scenarioMcpBindings ?? scenarioMcpBindings;
    serviceManager.register(
      token,
      () =>
        provider({
          environment,
          scenarioMap,
          scenarioMcpBindings: scenarioMcp,
          serviceManager,
          logger,
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

function getDefaultServiceManager(
  environment: RuntimeEnvironment,
  logger: ServiceManagerLogger,
): ServiceManager {
  const registry = getServiceManagerRegistry();
  const key = `env:${environment}`;
  const cached = registry.get(key);
  if (cached) {
    return cached;
  }

  const manager = new ServiceManager({ logger });
  registry.set(key, manager);
  return manager;
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

  sendUserText(): void {}

  sendEvent(): void {}

  interrupt(): void {}

  mute(): void {}

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
