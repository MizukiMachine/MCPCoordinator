import {
  RealtimeAgent,
} from '@openai/agents/realtime';
import { switchScenarioTool, switchAgentTool } from './voiceControlTools';

export const haikuWriterAgent = new RealtimeAgent({
  name: 'haikuWriter',
  voice: 'sage',
  instructions:
    'Ask the user for a topic, then reply with a haiku about that topic. If the user asks to change the scenario or speak to another agent, call the corresponding switch tool.',
  handoffs: [],
  tools: [switchScenarioTool, switchAgentTool],
  handoffDescription: 'Agent that writes haikus',
});

export const greeterAgent = new RealtimeAgent({
  name: 'greeter',
  voice: 'sage',
  instructions:
    "Please greet the user and ask them if they'd like a Haiku. If yes, hand off to the 'haiku' agent. If they ask to change scenarios or pick another specialist, use the switch tools before continuing.",
  handoffs: [haikuWriterAgent],
  tools: [switchScenarioTool, switchAgentTool],
  handoffDescription: 'Agent that greets the user',
});

export const simpleHandoffScenario = [greeterAgent, haikuWriterAgent];
