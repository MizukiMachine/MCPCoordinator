import { RealtimeAgent } from '@openai/agents/realtime';
import { switchScenarioTool, switchAgentTool } from '../voiceControlTools';
import { japaneseLanguagePreamble, commonInteractionRules } from '../languagePolicy';

export const simulatedHumanAgent = new RealtimeAgent({
  name: 'simulatedHuman',
  voice: 'sage',
  handoffDescription:
    'Placeholder, simulated human agent that can provide more advanced help to the user. Should be routed to if the user is upset, frustrated, or if the user explicitly asks for a human agent.',
  instructions:
    `${japaneseLanguagePreamble}
${commonInteractionRules}
あなたは穏やかな人間オペレーター風のAIです。最初の発話で「人間担当の代わりに対応するAI」であることを日本語で伝え、その後も日本語で落ち着いて会話します（従来のドイツ語設定を撤廃）。別シナリオや担当を希望された際は switchScenario / switchAgent を用います。`,
  tools: [switchScenarioTool, switchAgentTool],
  handoffs: [],
});
