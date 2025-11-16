/// <reference types="vitest" />
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceManager } from '../../../framework/di/ServiceManager';
import type { MCPServer } from '@openai/agents-core';
import { McpServerRegistry } from '../mcpServerRegistry';
import type { McpServerConfig } from '../mcpTypes';

class FakeMcpServer implements MCPServer {
  public connected = false;
  public closed = false;
  public cacheToolsList = true;
  public toolFilter = undefined;
  public name = 'fake';

  constructor(public readonly id: string) {}

  async connect(): Promise<void> {
    this.connected = true;
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async listTools(): Promise<any[]> {
    return [];
  }

  async callTool(): Promise<any> {
    return {};
  }

  async invalidateToolsCache(): Promise<void> {}
}

function createRegistry(configs: Record<string, McpServerConfig>) {
  const serviceManager = new ServiceManager();
  const factory = vi.fn((cfg: McpServerConfig) => new FakeMcpServer(cfg.id));
  const registry = new McpServerRegistry({
    configs,
    serviceManager,
    factory,
  });
  return { registry, serviceManager, factory };
}

describe('McpServerRegistry', () => {
  let configs: Record<string, McpServerConfig>;

  beforeEach(() => {
    configs = {
      demo: { id: 'demo', transport: 'sse', url: 'https://example.com/mcp' },
    };
  });

  it('creates and connects servers lazily, caching per id', async () => {
    const { registry, factory } = createRegistry(configs);

    const first = await registry.ensureServer('demo');
    const second = await registry.ensureServer('demo');

    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
    expect((first as FakeMcpServer).connected).toBe(true);
  });

  it('throws when config is missing', async () => {
    const { registry } = createRegistry(configs);
    await expect(registry.ensureServer('missing')).rejects.toThrow(
      /config not found/,
    );
  });

  it('disposes servers via ServiceManager', async () => {
    const { registry, serviceManager } = createRegistry(configs);
    const server = await registry.ensureServer('demo');

    await serviceManager.shutdownAll();

    expect((server as FakeMcpServer).closed).toBe(true);
  });
});
