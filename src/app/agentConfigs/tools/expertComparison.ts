import { tool } from '@openai/agents/realtime';
import {
  techContestPreset,
  medContestPreset,
  createContestRequestFromPreset,
} from '@/app/agentConfigs/expertContestPresets';
import type { ExpertContestRequest } from '@/app/agentConfigs/types';
import {
  callExpertContestApi,
  buildContestSummary,
  recordContestBreadcrumb,
  logContestEvent,
  ensureContestId,
  findSubmissionText,
  type BreadcrumbFn,
  type LogFn,
} from './expertContestClient';

interface ComparisonToolSuccess {
  success: true;
  preset: 'tech' | 'med';
  contest: ExpertContestRequest['scenario'];
  summary: ReturnType<typeof buildContestSummary> & { preset?: string; baselineAnswer?: string };
  winnerAnswer?: string;
  runnerUpAnswer?: string;
  baselineAnswer: string;
}

interface ComparisonToolError {
  success: false;
  message: string;
}

type ComparisonResult = ComparisonToolSuccess | ComparisonToolError;

interface ComparisonInput {
  userPrompt: string;
  relaySummary: string;
  baselineAnswer: string;
  sharedContextExtra?: string[];
  contestId?: string;
  metadata?: Record<string, any>;
}

const createComparisonTool = (
  presetName: 'tech' | 'med',
) => {
  const preset = presetName === 'tech' ? techContestPreset : medContestPreset;

  return tool({
    name: presetName === 'tech' ? 'compareWithTechExperts' : 'compareWithMedExperts',
    description:
      presetName === 'tech'
        ? '直近の質問内容をTech並列エキスパートに転送し、勝者と提案内容を取得する。'
        : '直近の症状や相談をMed並列エキスパートに転送し、安全性を重視した勝者回答を取得する。',
    parameters: {
      type: 'object',
      properties: {
        userPrompt: {
          type: 'string',
          description: 'ユーザーの元質問をそのまま渡す。',
        },
        relaySummary: {
          type: 'string',
          description: 'チャットスーパーバイザーが把握している文脈や追加説明。',
        },
        baselineAnswer: {
          type: 'string',
          description: 'チャットスーパーバイザーが自分で伝えた回答の要約または全文。',
        },
        sharedContextExtra: {
          type: 'array',
          items: { type: 'string' },
          description: '必要に応じて共有したい bullet 情報。',
        },
        metadata: {
          type: 'object',
          description: '比較用途で追跡したいメタデータ (例: sourceAgent)。',
          additionalProperties: true,
        },
      },
      required: ['userPrompt', 'relaySummary', 'baselineAnswer'],
      additionalProperties: false,
    },
    execute: async (input, details): Promise<ComparisonResult> => {
      const { userPrompt, relaySummary, sharedContextExtra, metadata, baselineAnswer } =
        input as ComparisonInput;
      const contestId = ensureContestId((input as ComparisonInput).contestId);

      const body: ExpertContestRequest = {
        ...createContestRequestFromPreset(preset, {
          contestId,
          userPrompt,
          relaySummary,
          sharedContextExtra,
          metadata: {
            source: 'comparison_tool',
            preset: presetName,
            ...(metadata ?? {}),
          },
        }),
        contestId,
      };

      const addBreadcrumb = (details?.context as any)?.addTranscriptBreadcrumb as
        | BreadcrumbFn
        | undefined;
      const logClientEvent = (details?.context as any)?.logClientEvent as LogFn | undefined;

      try {
        const contest = await callExpertContestApi(body);
        const summaryBase = buildContestSummary(contest);
        const summary = {
          ...summaryBase,
          preset: summaryBase.preset ?? preset.scenario,
          baselineAnswer,
        };
        recordContestBreadcrumb(summary, addBreadcrumb);
        logContestEvent(summary, logClientEvent);
        return {
          success: true,
          preset: presetName,
          contest: contest.scenario,
          summary,
          winnerAnswer: summary.winner?.expertId
            ? findSubmissionText(contest, summary.winner.expertId)
            : undefined,
          runnerUpAnswer: summary.runnerUp?.expertId
            ? findSubmissionText(contest, summary.runnerUp.expertId)
            : undefined,
          baselineAnswer,
        } satisfies ComparisonToolSuccess;
      } catch (error: any) {
        if (addBreadcrumb) {
          addBreadcrumb('[expertContest] エラー', {
            type: 'expertContestError',
            contestId,
            message: error?.message ?? 'unknown_error',
          });
        }
        if (logClientEvent) {
          logClientEvent(
            {
              type: 'expert.contest.error',
              contestId,
              message: error?.message ?? 'unknown_error',
            },
            'expertContest',
          );
        }
        return {
          success: false,
          message: error?.message ?? 'Failed to execute comparison',
        } satisfies ComparisonToolError;
      }
    },
  });
};

export const compareWithTechExpertsTool = createComparisonTool('tech');
export const compareWithMedExpertsTool = createComparisonTool('med');
