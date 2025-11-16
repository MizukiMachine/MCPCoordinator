import { simpleHandoffScenario } from './simpleHandoff';
import { customerServiceRetailScenario, customerServiceRetailCompanyName } from './customerServiceRetail';
import { chatSupervisorScenario, chatSupervisorCompanyName } from './chatSupervisor';
import type { RealtimeAgent } from '@openai/agents/realtime';

// Map of scenario key -> array of RealtimeAgent objects
export const allAgentSets: Record<string, RealtimeAgent[]> = {
  simpleHandoff: simpleHandoffScenario,
  customerServiceRetail: customerServiceRetailScenario,
  chatSupervisor: chatSupervisorScenario,
};

export const defaultAgentSetKey = 'chatSupervisor';

export const agentSetMetadata: Record<string, { label: string; companyName: string }> = {
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
