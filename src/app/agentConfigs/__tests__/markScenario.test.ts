import { describe, it, expect } from 'vitest';

import { allAgentSets, agentSetMetadata, scenarioMcpBindings } from '../index';
import { normalizeScenarioKey } from '@/shared/scenarioAliases';

describe('mark scenario', () => {
  it('registers the scenario with a single agent named Mark and the required instructions', () => {
    const scenario = allAgentSets.mark;

    expect(scenario).toBeDefined();
    expect(scenario).toHaveLength(1);
    expect(scenario?.[0]?.name).toBe('Mark');
    expect(scenario?.[0]?.voice).toBeDefined();
    expect(scenario?.[0]?.instructions).toContain('想定カロリー');
    expect(scenario?.[0]?.instructions).toContain('今日の最適ランチは');
    expect(scenario?.[0]?.instructions).toContain('もっと詳しく聞きますか？');
  });

  it('exposes metadata, does not require MCP servers, and normalizes aliases', () => {
    expect(agentSetMetadata.mark?.label).toContain('マーク');
    expect(scenarioMcpBindings.mark?.requiredMcpServers).toEqual([]);
    expect(normalizeScenarioKey('マーク')).toBe('mark');
    expect(normalizeScenarioKey('mark')).toBe('mark');
  });
});
