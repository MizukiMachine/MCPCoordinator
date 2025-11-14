import type { RealtimeAgent } from '@openai/agents/realtime';

import type {
  AgentSetResolveParams,
  IAgentSetResolver,
  ResolvedAgent,
  ResolvedAgentSet,
} from '../types';

function toResolvedAgent(agent: RealtimeAgent): ResolvedAgent<RealtimeAgent> {
  return {
    name: agent.name ?? 'agent',
    handle: agent,
    metadata: {
      voice: (agent as any).voice,
    },
  };
}

export function buildResolvedAgentSetFromAgents(
  agents: RealtimeAgent[],
): ResolvedAgentSet<RealtimeAgent> {
  if (!agents.length) {
    throw new Error('Agent set must include at least one agent');
  }

  const resolved = agents.map(toResolvedAgent);
  return {
    primaryAgent: resolved[0],
    agents: resolved,
  };
}

export class OpenAIAgentSetResolver
  implements IAgentSetResolver<RealtimeAgent>
{
  constructor(
    private readonly scenarioMap: Record<string, RealtimeAgent[]>,
  ) {}

  async resolve(
    params: AgentSetResolveParams,
  ): Promise<ResolvedAgentSet<RealtimeAgent>> {
    const { key, preferredAgentName } = params;
    if (!key) {
      throw new Error('agentSetKey is required');
    }

    const agents = this.scenarioMap[key];
    if (!Array.isArray(agents) || agents.length === 0) {
      throw new Error(`No agents registered for scenario "${key}"`);
    }

    const cloned = [...agents];
    if (preferredAgentName) {
      const idx = cloned.findIndex((agent) => agent.name === preferredAgentName);
      if (idx > 0) {
        const [match] = cloned.splice(idx, 1);
        cloned.unshift(match);
      }
    }

    return buildResolvedAgentSetFromAgents(cloned);
  }
}
