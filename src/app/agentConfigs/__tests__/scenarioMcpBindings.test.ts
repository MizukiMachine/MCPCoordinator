import { describe, it, expect } from 'vitest';

import { scenarioMcpBindings } from '../index';

describe('scenarioMcpBindings', () => {
  it('enables google-calendar only for Kate', () => {
    const enabled = Object.entries(scenarioMcpBindings)
      .filter(([, binding]) => (binding.requiredMcpServers ?? []).length > 0)
      .map(([key]) => key);

    expect(enabled).toEqual(['kate']);
    expect(scenarioMcpBindings.kate.requiredMcpServers).toEqual([
      'google-calendar',
    ]);
  });
});
