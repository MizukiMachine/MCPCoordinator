import { simpleHandoffScenario } from './simpleHandoff';
import { customerServiceRetailScenario, customerServiceRetailCompanyName } from './customerServiceRetail';
import { chatSupervisorScenario, chatSupervisorCompanyName } from './chatSupervisor';
import { basicAssistantScenario, basicAssistantCompanyName } from './basicAssistant';
import { kateScenario, kateCompanyName } from './kate';
import { graffityScenario, graffityCompanyName } from './graffity';
import type { RealtimeAgent } from '@openai/agents/realtime';

// Map of scenario key -> array of RealtimeAgent objects
export const allAgentSets: Record<string, RealtimeAgent[]> = {
  graffity: graffityScenario,
  basicAssistant: basicAssistantScenario,
  simpleHandoff: simpleHandoffScenario,
  customerServiceRetail: customerServiceRetailScenario,
  chatSupervisor: chatSupervisorScenario,
  kate: kateScenario,
};

export type ScenarioMcpBinding = {
  requiredMcpServers: string[];
};

// 各シナリオが要求するMCPサーバーのキー（config.jsonの id と一致させる）
export const scenarioMcpBindings: Record<string, ScenarioMcpBinding> = {
  basicAssistant: { requiredMcpServers: [] },
  simpleHandoff: { requiredMcpServers: [] },
  customerServiceRetail: { requiredMcpServers: [] },
  chatSupervisor: { requiredMcpServers: [] },
  graffity: { requiredMcpServers: [] },
  kate: { requiredMcpServers: ['google-calendar'] },
};

export const defaultAgentSetKey = 'graffity';

export const agentSetMetadata: Record<string, { label: string; companyName: string }> = {
  graffity: {
    label: 'Graffity (Default)',
    companyName: graffityCompanyName,
  },
  basicAssistant: {
    label: 'Basic Assistant (JP, Vision)',
    companyName: basicAssistantCompanyName,
  },
  simpleHandoff: {
    label: 'Simple Handoff Demo',
    companyName: 'OpenAI Studio',
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
