import { kateScenario, kateCompanyName } from './kate';
import { graffityScenario, graffityCompanyName } from './graffity';
import { bashoScenario, bashoCompanyName } from './basho';
import { takubokuScenario, takubokuCompanyName } from './takuboku';
import type { RealtimeAgent } from '@openai/agents/realtime';

// Map of scenario key -> array of RealtimeAgent objects
export const allAgentSets: Record<string, RealtimeAgent[]> = {
  graffity: graffityScenario,
  kate: kateScenario,
  basho: bashoScenario,
  takuboku: takubokuScenario,
};

export type ScenarioMcpBinding = {
  requiredMcpServers: string[];
};

// 各シナリオが要求するMCPサーバーのキー（config.jsonの id と一致させる）
export const scenarioMcpBindings: Record<string, ScenarioMcpBinding> = {
  graffity: { requiredMcpServers: [] },
  kate: { requiredMcpServers: ['google-calendar'] },
  basho: { requiredMcpServers: [] },
  takuboku: { requiredMcpServers: [] },
};

export const defaultAgentSetKey = 'graffity';

export const agentSetMetadata: Record<string, { label: string; companyName: string }> = {
  graffity: {
    label: 'Graffity (Default)',
    companyName: graffityCompanyName,
  },
  kate: {
    label: 'ケイト (Google Calendar MCP)',
    companyName: kateCompanyName,
  },
  basho: {
    label: 'バショウ (Haiku)',
    companyName: bashoCompanyName,
  },
  takuboku: {
    label: 'タクボク (Tanka)',
    companyName: takubokuCompanyName,
  },
};
