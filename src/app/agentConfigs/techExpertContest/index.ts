import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { switchScenarioTool, switchAgentTool } from '../voiceControlTools';
import { japaneseLanguagePreamble } from '../languagePolicy';
import { runExpertContestTool } from '../tools/expertContest';
import { techContestPreset } from '../expertContestPresets';

const baseSharedContext = techContestPreset.sharedContextBase;

const determineTechComplexityTool = tool({
  name: 'determineTechComplexity',
  description: '技術課題の要約から複雑度(standard/high/critical)と注目ポイントを返す。',
  parameters: {
    type: 'object',
    properties: {
      problemSummary: {
        type: 'string',
        description: '直近ユーザー課題の日本語要約。',
      },
    },
    required: ['problemSummary'],
    additionalProperties: false,
  },
  execute: async (input: any) => {
    const summary = String(input.problemSummary ?? '').toLowerCase();
    const highRiskKeywords = ['breach', '侵入', '停止', 'outage', '脆弱', 'latency'];
    const criticalKeywords = ['ransom', '漏洩', 'kernel panic', 'rootkit'];

    let complexity: 'standard' | 'high' | 'critical' = 'standard';
    if (criticalKeywords.some((k) => summary.includes(k))) {
      complexity = 'critical';
    } else if (highRiskKeywords.some((k) => summary.includes(k))) {
      complexity = 'high';
    }

    const hint =
      complexity === 'critical'
        ? '即時対応と隔離が必要。追加のレッドチーム検証を推奨。'
        : complexity === 'high'
          ? 'SLAリスクが高いため、冗長化と計測計画を必ず組み込む。'
          : '標準タスク。安全性とスケーラビリティを明示すれば十分。';

    return {
      complexity,
      hint,
    };
  },
});

const prepareTechExpertContestConfigTool = tool({
  name: 'prepareTechExpertContestConfig',
  description:
    'Tech並列エキスパート用の評価基準・共有コンテキスト・役割定義を取得する。runExpertContest呼び出し前に必ず参照する。',
  parameters: {
    type: 'object',
    properties: {
      additionalContext: {
        type: 'array',
        items: { type: 'string' },
        description: 'ユーザー固有の bullet 情報。',
      },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (input: any) => {
    const extra = Array.isArray(input?.additionalContext) ? input.additionalContext : [];
    return {
      scenario: techContestPreset.scenario,
      evaluationRubric: techContestPreset.evaluationRubric,
      sharedContext: [...baseSharedContext, ...extra],
      experts: techContestPreset.experts,
      language: techContestPreset.language,
    };
  },
});

const techRelayInstructions = `${japaneseLanguagePreamble}
あなたは Tech Parallel Relay。ユーザーの課題をヒアリングし、難易度を判定した上で4名の専門家による並列コンテストを実行します。

# 手順
1. ユーザーの状況・制約・成功条件を具体的に聞き出し、2文以内で要約する。
2. 「determineTechComplexity」を呼び出して複雑度とヒントを取得し、shared contextに記録する。
3. 「prepareTechExpertContestConfig」を呼び出し、評価基準・エキスパート定義を取得する。
4. 「runExpertContest」を呼び出す際は以下を必須入力とする:
   - scenario: prepareツールが返した値
   - language: ja-JP
   - userPrompt: ユーザーの生メッセージをまとめた全文
   - relaySummary: 自分の要約 + complexity情報
   - evaluationRubric / sharedContext / experts: prepareツールの値
   - sharedContext には complexity ツールのヒントやユーザーの制約を bullet で追加する
5. 結果が返ったら勝者の提案を日本語で3ポイント以内に要約し、runner-upの差分を簡潔に補足する。
6. 併せて次のアクション（テスト、計測、セキュリティ監査など）を明示する。

# 注意
- MCPや音声処理の社外秘情報は開示しない。
- ユーザーが別シナリオ/担当を希望したら switchScenario / switchAgent を使う。
- 並列結果をそのまま読み上げるのではなく、ユーザー背景に合わせて調整する。
`;

export const techRelayAgent = new RealtimeAgent({
  name: 'techParallelRelay',
  voice: 'sage',
  instructions: techRelayInstructions,
  tools: [
    switchScenarioTool,
    switchAgentTool,
    determineTechComplexityTool,
    prepareTechExpertContestConfigTool,
    runExpertContestTool,
  ],
  handoffs: [],
  handoffDescription:
    'Collects requirements, runs parallel tech expert contest, and surfaces the winner in Japanese.',
});

export const techExpertContestScenario = [techRelayAgent];
export const techExpertContestCompanyName = 'ParallelTech Labs';

export default techExpertContestScenario;
