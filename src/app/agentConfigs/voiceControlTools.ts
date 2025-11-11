import { tool } from '@openai/agents/realtime';

type ScenarioChangeHandler = (scenarioKey: string) => Promise<{ success: boolean; message?: string }>;
type AgentChangeHandler = (agentName: string) => Promise<{ success: boolean; message?: string }>;

export const switchScenarioTool = tool({
  name: 'switchScenario',
  description:
    'Switches the entire conversation to a different scenario (e.g., chatSupervisor, simpleHandoff, customerServiceRetail). Use when the user explicitly requests a different experience.',
  parameters: {
    type: 'object',
    properties: {
      scenarioKey: {
        type: 'string',
        description: 'The scenario identifier to switch to (chatSupervisor, simpleHandoff, customerServiceRetail, etc.).',
      },
    },
    required: ['scenarioKey'],
    additionalProperties: false,
  },
  execute: async (input, details) => {
    const handler: ScenarioChangeHandler | undefined = (details?.context as any)?.requestScenarioChange;
    if (!handler) {
      return { success: false, message: 'Scenario switching is unavailable right now.' };
    }
    try {
      return await handler((input as { scenarioKey: string }).scenarioKey);
    } catch (error: any) {
      return { success: false, message: error?.message ?? 'Failed to switch scenario.' };
    }
  },
});

export const switchAgentTool = tool({
  name: 'switchAgent',
  description:
    'Switches to another agent within the current scenario (for example, jump directly to the sales or returns specialist). Use only after confirming the user wants a specific agent.',
  parameters: {
    type: 'object',
    properties: {
      agentName: {
        type: 'string',
        description: 'Exact name of the agent to activate (must exist in the current scenario).',
      },
    },
    required: ['agentName'],
    additionalProperties: false,
  },
  execute: async (input, details) => {
    const handler: AgentChangeHandler | undefined = (details?.context as any)?.requestAgentChange;
    if (!handler) {
      return { success: false, message: 'Agent switching is unavailable right now.' };
    }
    try {
      return await handler((input as { agentName: string }).agentName);
    } catch (error: any) {
      return { success: false, message: error?.message ?? 'Failed to switch agent.' };
    }
  },
});
