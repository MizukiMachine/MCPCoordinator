import type { RealtimeAgent } from '@openai/agents/realtime';

import { simpleHandoffScenario } from './simpleHandoff';
import {
  customerServiceRetailScenario,
  customerServiceRetailCompanyName,
} from './customerServiceRetail';
import {
  chatSupervisorScenario,
  chatSupervisorCompanyName,
} from './chatSupervisor';
import {
  jgrantsSubsidyScenario,
  jgrantsSubsidyCompanyName,
  jgrantsSubsidyScenarioKey,
} from './jgrantsSubsidy';

const baseAgentSets: Record<string, RealtimeAgent[]> = {
  simpleHandoff: simpleHandoffScenario,
  customerServiceRetail: customerServiceRetailScenario,
  chatSupervisor: chatSupervisorScenario,
};

if (jgrantsSubsidyScenario.length > 0) {
  baseAgentSets[jgrantsSubsidyScenarioKey] = jgrantsSubsidyScenario;
}

export const allAgentSets = baseAgentSets;

export const agentCompanyNames: Record<string, string> = {
  simpleHandoff: 'Realtime Demo',
  customerServiceRetail: customerServiceRetailCompanyName,
  chatSupervisor: chatSupervisorCompanyName,
};

if (jgrantsSubsidyScenario.length > 0) {
  agentCompanyNames[jgrantsSubsidyScenarioKey] = jgrantsSubsidyCompanyName;
}

export const defaultAgentSetKey = 'chatSupervisor';
