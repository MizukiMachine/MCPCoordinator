/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';

import { scenarioMcpBindings } from '../index';

describe('scenarioMcpBindings', () => {
  it('enables google-calendar only for Schedule Coordinator', () => {
    const enabled = Object.entries(scenarioMcpBindings)
      .filter(([, binding]) => (binding.requiredMcpServers ?? []).length > 0)
      .map(([key]) => key);

    expect(enabled).toEqual(['scheduleCoordinator']);
    expect(scenarioMcpBindings.scheduleCoordinator.requiredMcpServers).toEqual([
      'google-calendar',
    ]);
  });
});
