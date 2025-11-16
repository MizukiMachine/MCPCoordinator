import type { RealtimeAgent } from '@openai/agents/realtime';
import type { ServiceManagerLogger } from '../../../framework/di/ServiceManager';
import { McpServerRegistry } from '../../mcp/mcpServerRegistry';
import type { ResolvedAgentSet, AgentSetResolveParams, IAgentSetResolver } from '../types';
import { buildResolvedAgentSetFromAgents } from './openAIAgentSetResolver';

function reorderAgentsByPreference(
  agents: RealtimeAgent[],
  preferredAgentName?: string | null,
): RealtimeAgent[] {
  if (!preferredAgentName) return agents;
  const cloned = [...agents];
  const idx = cloned.findIndex((agent) => agent.name === preferredAgentName);
  if (idx > 0) {
    const [match] = cloned.splice(idx, 1);
    cloned.unshift(match);
  }
  return cloned;
}

export interface McpAwareScenarioBindings {
  requiredMcpServers?: string[];
}

export interface McpEnabledAgentSetResolverOptions {
  scenarios: Record<string, RealtimeAgent[]>;
  bindings?: Record<string, McpAwareScenarioBindings>;
  registry: McpServerRegistry;
  logger?: ServiceManagerLogger;
}

export class McpEnabledAgentSetResolver
  implements IAgentSetResolver<RealtimeAgent>
{
  private readonly scenarios: Record<string, RealtimeAgent[]>;
  private readonly bindings: Record<string, McpAwareScenarioBindings>;
  private readonly registry: McpServerRegistry;
  private readonly logger?: ServiceManagerLogger;

  constructor(options: McpEnabledAgentSetResolverOptions) {
    this.scenarios = options.scenarios;
    this.bindings = options.bindings ?? {};
    this.registry = options.registry;
    this.logger = options.logger;
  }

  async resolve(
    params: AgentSetResolveParams,
  ): Promise<ResolvedAgentSet<RealtimeAgent>> {
    const { key, preferredAgentName } = params;
    if (!key) {
      throw new Error('agentSetKey is required');
    }

    const agents = this.scenarios[key];
    if (!Array.isArray(agents) || agents.length === 0) {
      throw new Error(`No agents registered for scenario "${key}"`);
    }

    const reordered = reorderAgentsByPreference(agents, preferredAgentName);
    const required = this.bindings[key]?.requiredMcpServers ?? [];

    if (required.length > 0) {
      this.logger?.debug?.('Connecting MCP servers for scenario', { key, required });
      const servers = await this.registry.ensureServers(required);
      reordered.forEach((agent) => {
        (agent as any).mcpServers = servers;
      });
    }

    return buildResolvedAgentSetFromAgents(reordered);
  }
}
