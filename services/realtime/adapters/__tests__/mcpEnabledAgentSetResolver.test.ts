/// <reference types="vitest" />
import { describe, it, expect, vi } from 'vitest';

import { RealtimeAgent } from '@openai/agents/realtime';
import type { McpServerRegistry } from '../../../mcp/mcpServerRegistry';
import { McpEnabledAgentSetResolver } from '../mcpEnabledAgentSetResolver';

function createAgent(name: string) {
  return new RealtimeAgent({
    name,
    instructions: 'demo',
  });
}

describe('McpEnabledAgentSetResolver', () => {
  it('attaches MCP servers when required', async () => {
    const registry: Pick<McpServerRegistry, 'ensureServers'> = {
      ensureServers: vi.fn(async () => [{ name: 's' }] as any),
    };

    const resolver = new McpEnabledAgentSetResolver({
      scenarios: {
        demo: [createAgent('primary')],
      },
      bindings: {
        demo: { requiredMcpServers: ['s1'] },
      },
      registry: registry as McpServerRegistry,
    });

    const resolved = await resolver.resolve({ key: 'demo' });
    const agent = resolved.primaryAgent.handle as any;

    expect(registry.ensureServers).toHaveBeenCalledWith(['s1']);
    expect(agent.mcpServers).toBeDefined();
  });

  it('reorders agents when preferredAgentName is provided', async () => {
    const registry: Pick<McpServerRegistry, 'ensureServers'> = {
      ensureServers: vi.fn(async () => []),
    };

    const resolver = new McpEnabledAgentSetResolver({
      scenarios: {
        demo: [createAgent('first'), createAgent('second')],
      },
      bindings: {},
      registry: registry as McpServerRegistry,
    });

    const result = await resolver.resolve({
      key: 'demo',
      preferredAgentName: 'second',
    });

    expect(result.primaryAgent.handle.name).toBe('second');
  });
});
