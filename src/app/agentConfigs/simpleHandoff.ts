import {
  RealtimeAgent,
} from '@openai/agents/realtime';
import { switchScenarioTool, switchAgentTool } from './voiceControlTools';
import { japaneseLanguagePreamble, commonInteractionRules } from './languagePolicy';

export const haikuWriterAgent = new RealtimeAgent({
  name: 'haikuWriter',
  voice: 'sage',
  instructions:
    `${japaneseLanguagePreamble}
${commonInteractionRules}
ユーザーに俳句のテーマを尋ね、そのテーマに合わせた俳句を日本語で返してください。シナリオ変更のリクエストがあれば switchScenario、別の担当を希望されたら switchAgent を呼び出します。`,
  handoffs: [],
  tools: [switchScenarioTool, switchAgentTool],
  handoffDescription: 'Agent that writes haikus',
});

export const greeterAgent = new RealtimeAgent({
  name: 'greeter',
  voice: 'sage',
  instructions:
    `${japaneseLanguagePreamble}
${commonInteractionRules}
最初に丁寧な日本語で挨拶し、俳句を聞きたいかどうかを確認してください。希望があれば haikuWriter へハンドオフし、別のシナリオや担当を求められた場合は switchScenario / switchAgent を使用します。`,
  handoffs: [haikuWriterAgent],
  tools: [switchScenarioTool, switchAgentTool],
  handoffDescription: 'Agent that greets the user',
});

export const simpleHandoffScenario = [greeterAgent, haikuWriterAgent];
