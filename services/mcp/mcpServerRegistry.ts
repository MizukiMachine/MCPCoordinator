import {
  MCPServer,
  MCPServerSSE,
  MCPServerStdio,
  MCPServerStreamableHttp,
} from '@openai/agents-core';

import {
  ServiceManager,
  ServiceManagerLogger,
  ServiceToken,
  createServiceToken,
} from '../../framework/di/ServiceManager';
import type { McpServerConfig, McpServerFactory, McpRegistryLogger } from './mcpTypes';

export interface McpServerRegistryOptions {
  configs: Record<string, McpServerConfig>;
  serviceManager?: ServiceManager;
  logger?: McpRegistryLogger;
  factory?: McpServerFactory;
}

export class McpServerRegistry {
  private readonly serviceManager: ServiceManager;
  private readonly logger?: McpRegistryLogger;
  private readonly factory: McpServerFactory;
  private readonly tokens = new Map<string, ServiceToken<MCPServer>>();
  private readonly configs: Record<string, McpServerConfig>;
  private readonly connectionPromises = new Map<string, Promise<void>>();

  constructor(options: McpServerRegistryOptions) {
    this.configs = options.configs;
    this.serviceManager = options.serviceManager ?? new ServiceManager({ logger: options.logger });
    this.logger = options.logger;
    this.factory = options.factory ?? defaultFactory;
  }

  async ensureServers(ids: string[]): Promise<MCPServer[]> {
    return Promise.all(ids.map((id) => this.ensureServer(id)));
  }

  async ensureServer(id: string): Promise<MCPServer> {
    const token = this.getOrCreateToken(id);

    if (!this.serviceManager.has(token)) {
      const config = this.configs[id];
      if (!config) {
        throw new Error(`MCP server config not found for id "${id}"`);
      }
      this.serviceManager.register(
        token,
        () => this.factory(config),
        {
          dispose: async (server) => {
            await server.close();
          },
        },
      );
    }

    const server = this.serviceManager.get(token);
    await this.connectIfNeeded(id, server);
    return server;
  }

  private getOrCreateToken(id: string): ServiceToken<MCPServer> {
    const existing = this.tokens.get(id);
    if (existing) return existing;
    const token = createServiceToken<MCPServer>(`mcp.server.${id}`);
    this.tokens.set(id, token);
    return token;
  }

  private async connectIfNeeded(id: string, server: MCPServer): Promise<void> {
    const pending = this.connectionPromises.get(id);
    if (pending) {
      await pending;
      return;
    }

    const connectPromise = server.connect().catch((error) => {
      this.logger?.error?.('Failed to connect MCP server', { id, error });
      throw error;
    });
    this.connectionPromises.set(id, connectPromise);
    try {
      await connectPromise;
      this.logger?.info?.('MCP server connected', { id });
    } finally {
      this.connectionPromises.delete(id);
    }
  }
}

function defaultFactory(config: McpServerConfig): MCPServer {
  switch (config.transport) {
    case 'sse':
      if (!config.url) {
        throw new Error(`MCP server "${config.id}" requires url for SSE transport`);
      }
      return new MCPServerSSE({
        url: config.url,
        name: config.name ?? config.id,
        cacheToolsList: config.cacheToolsList ?? true,
        requestInit: config.headers ? { headers: config.headers } : undefined,
        timeout: config.timeoutMs,
      });
    case 'streamable_http':
      if (!config.url) {
        throw new Error(`MCP server "${config.id}" requires url for streamable_http transport`);
      }
      return new MCPServerStreamableHttp({
        url: config.url,
        name: config.name ?? config.id,
        cacheToolsList: config.cacheToolsList ?? true,
        requestInit: config.headers ? { headers: config.headers } : undefined,
        timeout: config.timeoutMs,
      });
    case 'stdio':
      if (!config.command) {
        throw new Error(`MCP server "${config.id}" requires command for stdio transport`);
      }
      return new MCPServerStdio({
        command: config.command,
        args: config.args ?? [],
        cacheToolsList: config.cacheToolsList ?? true,
        name: config.name ?? config.id,
        timeout: config.timeoutMs,
      } as any);
    default:
      throw new Error(`Unsupported MCP transport: ${config.transport}`);
  }
}
