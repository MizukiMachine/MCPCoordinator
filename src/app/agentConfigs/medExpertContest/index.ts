import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { switchScenarioTool, switchAgentTool } from '../voiceControlTools';
import { japaneseLanguagePreamble } from '../languagePolicy';
import { runExpertContestTool } from '../tools/expertContest';
import { medContestPreset, MED_DISCLAIMER, EMERGENCY_PROMPT } from '../expertContestPresets';

const baseSharedContext = medContestPreset.sharedContextBase;

const normalizeText = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ');

const medTriageTool = tool({
  name: 'triageSeverity',
  description:
    'ユーザーの症状概要から緊急度(severe/moderate/mild)と受診推奨メッセージを返す。緊急度がsevereの場合は即座に救急案内を優先する。',
  parameters: {
    type: 'object',
    properties: {
      symptomSummary: {
        type: 'string',
        description: 'ユーザーが述べた症状の日本語要約。',
      },
    },
    required: ['symptomSummary'],
    additionalProperties: false,
  },
  execute: async (input: any) => {
    const summary = normalizeText(String(input.symptomSummary ?? ''));
    const severeKeywords = ['胸痛', '吐血', '呼吸困難', '意識障害', '痙攣', 'しびれ', 'numbness', 'stroke', 'syncope'];
    const moderateKeywords = ['発熱', '倦怠感', '下痢', 'めまい', 'headache', '嘔吐', '倦怠', '動悸'];

    let severity: 'severe' | 'moderate' | 'mild' = 'mild';
    if (severeKeywords.some((kw) => summary.includes(kw))) {
      severity = 'severe';
    } else if (moderateKeywords.some((kw) => summary.includes(kw))) {
      severity = 'moderate';
    }

    const recommendation =
      severity === 'severe'
        ? EMERGENCY_PROMPT
        : severity === 'moderate'
          ? 'できるだけ早く医療機関で診察を受け、症状の推移を記録してください。'
          : '自宅ケアは可能ですが、症状悪化時や不安があれば医療機関に相談してください。';

    const triageBullet = `Triage: ${severity.toUpperCase()} - ${recommendation}`;

    return {
      severity,
      recommendation,
      disclaimer: MED_DISCLAIMER,
      triageBullet,
    };
  },
});

const prepareMedExpertContestConfigTool = tool({
  name: 'prepareMedExpertContestConfig',
  description:
    'Med並列エキスパートに渡す評価ルーブリック・共有コンテキスト・役割定義を取得する。',
  parameters: {
    type: 'object',
    properties: {
      patientContext: {
        type: 'array',
        items: { type: 'string' },
        description: '年齢・既往症・生活環境など bullet 情報。',
      },
      triageBullet: {
        type: 'string',
        description: 'triageSeverity ツールが返却した bullet メモ。',
      },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (input: any) => {
    const patientContext = Array.isArray(input?.patientContext) ? input.patientContext : [];
    const triageBullet = typeof input?.triageBullet === 'string' ? input.triageBullet : null;
    const shared = [...baseSharedContext, ...patientContext];
    if (triageBullet) {
      shared.push(triageBullet);
    }
    return {
      scenario: medContestPreset.scenario,
      language: medContestPreset.language,
      evaluationRubric: medContestPreset.evaluationRubric,
      sharedContext: shared,
      experts: medContestPreset.experts,
      disclaimer: MED_DISCLAIMER,
      emergencyPrompt: EMERGENCY_PROMPT,
    };
  },
});

const medRelayInstructions = `${japaneseLanguagePreamble}
あなたは Med Parallel Relay。ユーザーの症状や生活背景を丁寧に聞き取り、並列エキスパートの競争結果を要約して伝えます。常に医療ディスクレーマーと緊急案内を含めてください。

# 手順
1. ユーザーの症状・開始時期・既往歴・服薬状況・生活習慣を確認し、要約を作成。
2. 「triageSeverity」で緊急度を判定し、severityがsevereなら即座に受診案内を伝えてから続行。
3. 「prepareMedExpertContestConfig」を呼び出し、評価ルーブリック・専門家定義・共有コンテキストを取得。
4. 「runExpertContest」を呼び出す際は以下を含める:
   - scenario / language / evaluationRubric / sharedContext / experts（prepareツールの値）
   - userPrompt: ユーザー発話全文または詳細要約
   - relaySummary: 自分の要約 + triage結果 + 推奨事項
   - sharedContextには症状の経過、生活制約、triageの推奨を bullet で追記
5. 勝者提案は日本語で3ポイント以内に要約し、runner-upとの差別化も1ポイントで触れる。
6. 常に最後に MED_DISCLAIMER と EMERGENCY_PROMPT を読み上げる。
7. ユーザーが別シナリオを希望したら switchScenario / switchAgent を使用。
`;

export const medRelayAgent = new RealtimeAgent({
  name: 'medParallelRelay',
  voice: 'sage',
  instructions: medRelayInstructions,
  tools: [
    switchScenarioTool,
    switchAgentTool,
    medTriageTool,
    prepareMedExpertContestConfigTool,
    runExpertContestTool,
  ],
  handoffs: [],
  handoffDescription:
    'Performs medical triage, runs parallel med expert contest, and summarizes with disclaimers.',
});

export const medExpertContestScenario = [medRelayAgent];
export const medExpertContestCompanyName = 'ParallelCare Collective';

export default medExpertContestScenario;
