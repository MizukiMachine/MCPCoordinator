import { describe, it, expect } from 'vitest';

import { allAgentSets, agentSetMetadata, scenarioMcpBindings } from '../index';
import { normalizeScenarioKey } from '@/shared/scenarioAliases';

describe('patricia scenario', () => {
  it('registers the scenario with a single agent named Patricia', () => {
    const scenario = allAgentSets.patricia;

    expect(scenario).toBeDefined();
    expect(scenario).toHaveLength(1);
    expect(scenario?.[0]?.name).toBe('Patricia');
    expect(scenario?.[0]?.voice).toBeDefined();
    expect(scenario?.[0]?.instructions).toContain('想定カロリー');
    expect(scenario?.[0]?.instructions).toContain('もっと詳しく聞きますか？');
  });

  it('exposes metadata, does not require MCP servers, and normalizes aliases', () => {
    expect(agentSetMetadata.patricia?.label).toContain('パトリシア');
    expect(scenarioMcpBindings.patricia?.requiredMcpServers).toEqual([]);
    expect(normalizeScenarioKey('パトリシア')).toBe('patricia');
    expect(normalizeScenarioKey('patricia')).toBe('patricia');
  });
});
