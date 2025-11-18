import { describe, it, expect } from 'vitest';

import {
  allAgentSets,
  agentSetMetadata,
  scenarioMcpBindings,
} from '../index';

describe('takuboku scenario', () => {
  it('registers the scenario with a single agent named タクボク', () => {
    const scenario = allAgentSets.takuboku;

    expect(scenario).toBeDefined();
    expect(scenario).toHaveLength(1);
    expect(scenario?.[0]?.name).toBe('タクボク');
  });

  it('exposes metadata and does not require MCP servers', () => {
    expect(agentSetMetadata.takuboku?.label).toContain('タクボク');
    expect(scenarioMcpBindings.takuboku?.requiredMcpServers).toEqual([]);
  });
});
