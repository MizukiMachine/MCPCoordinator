import type { RealtimeAgent } from '@openai/agents/realtime';

import type { HotwordDictionary } from '../../framework/voice_gateway/HotwordListener';
import { scenarioAliasMap } from '../../src/shared/scenarioAliases';

export interface ScenarioRegistryOptions {
  scenarioMap: Record<string, RealtimeAgent[]>;
  aliasOverrides?: Record<string, string[]>;
}

export class ScenarioRegistry {
  private readonly scenarioMap: Record<string, RealtimeAgent[]>;
  private readonly aliasMap: Record<string, string[]>;

  constructor(options: ScenarioRegistryOptions) {
    this.scenarioMap = options.scenarioMap;
    this.aliasMap = this.buildAliasMap(options.aliasOverrides ?? {});
  }

  getHotwordDictionary(): HotwordDictionary {
    return {
      entries: Object.keys(this.scenarioMap).map((scenarioKey) => ({
        scenarioKey,
        aliases: this.aliasMap[scenarioKey] ?? [scenarioKey],
      })),
    };
  }

  private buildAliasMap(overrides: Record<string, string[]>): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const key of Object.keys(this.scenarioMap)) {
      const base = scenarioAliasMap[key] ?? [key];
      const extra = overrides[key] ?? [];
      const values = new Set<string>();
      [...base, ...extra, key].forEach((alias) => {
        const trimmed = alias?.trim();
        if (trimmed) {
          values.add(trimmed);
        }
      });
      map[key] = Array.from(values);
    }
    return map;
  }
}
