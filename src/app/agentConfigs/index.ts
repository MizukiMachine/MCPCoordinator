import { bashoScenario, bashoCompanyName } from './basho';
import { customerServiceRetailScenario, customerServiceRetailCompanyName } from './customerServiceRetail';
import { chatSupervisorScenario, chatSupervisorCompanyName } from './chatSupervisor';
import { kateScenario, kateCompanyName } from './kate';
import { graffityScenario, graffityCompanyName } from './graffity';
import { takubokuScenario, takubokuCompanyName } from './takuboku';
import type { RealtimeAgent } from '@openai/agents/realtime';

// Map of scenario key -> array of RealtimeAgent objects
export const allAgentSets: Record<string, RealtimeAgent[]> = {
  graffity: graffityScenario,
  basho: bashoScenario,
  customerServiceRetail: customerServiceRetailScenario,
  chatSupervisor: chatSupervisorScenario,
  kate: kateScenario,
  takuboku: takubokuScenario,
};

export type ScenarioMcpBinding = {
  requiredMcpServers: string[];
};

// 各シナリオが要求するMCPサーバーのキー（config.jsonの id と一致させる）
export const scenarioMcpBindings: Record<string, ScenarioMcpBinding> = {
  basho: { requiredMcpServers: [] },
  customerServiceRetail: { requiredMcpServers: [] },
  chatSupervisor: { requiredMcpServers: [] },
  graffity: { requiredMcpServers: [] },
  kate: { requiredMcpServers: ['google-calendar'] },
  takuboku: { requiredMcpServers: [] },
};

export const defaultAgentSetKey = 'graffity';

export const agentSetMetadata: Record<string, { label: string; companyName: string }> = {
  graffity: {
    label: 'Graffity (Default)',
    companyName: graffityCompanyName,
  },
  basho: {
    label: 'バショウ (Haiku)',
    companyName: bashoCompanyName,
  },
  takuboku: {
    label: 'タクボク (Tanka)',
    companyName: takubokuCompanyName,
  },
  customerServiceRetail: {
    label: 'Retail Support (Snowy Peak)',
    companyName: customerServiceRetailCompanyName,
  },
  chatSupervisor: {
    label: 'Chat Supervisor (NewTelco)',
    companyName: chatSupervisorCompanyName,
  },
  kate: {
    label: 'ケイト (Google Calendar MCP)',
    companyName: kateCompanyName,
  },
};
