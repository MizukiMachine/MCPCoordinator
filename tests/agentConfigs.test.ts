import { describe, expect, it } from 'vitest';

import {
  allAgentSets,
  agentSetMetadata,
  defaultAgentSetKey,
} from '@/app/agentConfigs';

const EXPECTED_SCENARIOS = ['basicAssistant', 'simpleHandoff', 'customerServiceRetail', 'chatSupervisor', 'kate'];

describe('agentConfigs', () => {
  it('公開シナリオをMed/Tech抜きの許可リストに限定する', () => {
    const keys = Object.keys(allAgentSets).sort();
    expect(keys).toEqual([...EXPECTED_SCENARIOS].sort());
  });

  it('メタデータのキーも許可シナリオと一致する', () => {
    const metaKeys = Object.keys(agentSetMetadata).sort();
    expect(metaKeys).toEqual([...EXPECTED_SCENARIOS].sort());
  });

  it('デフォルトシナリオが有効なキーに含まれている', () => {
    expect(EXPECTED_SCENARIOS).toContain(defaultAgentSetKey);
    expect(allAgentSets[defaultAgentSetKey]).toBeDefined();
  });
});
