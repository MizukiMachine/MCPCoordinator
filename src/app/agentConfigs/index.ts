import { simpleHandoffScenario } from './simpleHandoff';
import { customerServiceRetailScenario, customerServiceRetailCompanyName } from './customerServiceRetail';
import { chatSupervisorScenario, chatSupervisorCompanyName } from './chatSupervisor';
import { techExpertContestScenario, techExpertContestCompanyName } from './techExpertContest';
import { medExpertContestScenario, medExpertContestCompanyName } from './medExpertContest';

import type { RealtimeAgent } from '@openai/agents/realtime';

// Map of scenario key -> array of RealtimeAgent objects
export const allAgentSets: Record<string, RealtimeAgent[]> = {
  simpleHandoff: simpleHandoffScenario,
  customerServiceRetail: customerServiceRetailScenario,
  chatSupervisor: chatSupervisorScenario,
  techParallelContest: techExpertContestScenario,
  medParallelContest: medExpertContestScenario,
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
  techParallelContest: {
    label: 'Tech 並列エキスパート',
    companyName: techExpertContestCompanyName,
  },
  medParallelContest: {
    label: 'Med 並列エキスパート',
    companyName: medExpertContestCompanyName,
  },
};
