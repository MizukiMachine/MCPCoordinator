import { simpleHandoffScenario } from './simpleHandoff';
import { customerServiceRetailScenario, customerServiceRetailCompanyName } from './customerServiceRetail';
import { chatSupervisorScenario, chatSupervisorCompanyName } from './chatSupervisor';
import { basicAssistantScenario, basicAssistantCompanyName } from './basicAssistant';
import type { RealtimeAgent } from '@openai/agents/realtime';

// Map of scenario key -> array of RealtimeAgent objects
export const allAgentSets: Record<string, RealtimeAgent[]> = {
  basicAssistant: basicAssistantScenario,
  simpleHandoff: simpleHandoffScenario,
  customerServiceRetail: customerServiceRetailScenario,
  chatSupervisor: chatSupervisorScenario,
};

// 各シナリオが要求するMCPサーバーのキー（config.jsonの id と一致させる）
export const scenarioMcpBindings: Record<string, string[]> = {
  basicAssistant: [],
  simpleHandoff: [],
  customerServiceRetail: [],
  chatSupervisor: [],
};

export const defaultAgentSetKey = 'basicAssistant';

export const agentSetMetadata: Record<string, { label: string; companyName: string }> = {
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
};
