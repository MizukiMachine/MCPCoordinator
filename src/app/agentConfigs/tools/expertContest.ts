import { tool } from '@openai/agents/realtime';
import type {
  ExpertContestRequest,
  ExpertContestResponse,
} from '@/app/agentConfigs/types';

interface RunExpertContestInput
  extends Omit<ExpertContestRequest, 'contestId'> {
  contestId?: string;
}

interface ExpertContestToolSuccess {
  success: true;
  contestId: string;
  scenario: string;
  winnerId: string;
  runnerUpId: string;
  judgeSummary: string;
  totalLatencyMs: number;
  tieBreaker?: string;
  winnerAnswer?: string;
  runnerUpAnswer?: string;
  scores: ExpertContestResponse['scores'];
  submissions: ExpertContestResponse['submissions'];
  metadata?: ExpertContestResponse['metadata'];
}

interface ExpertContestToolError {
  success: false;
  message: string;
}

type ExpertContestToolResult = ExpertContestToolSuccess | ExpertContestToolError;

type BreadcrumbFn = (title: string, data?: any) => void;

const ensureContestId = (contestId?: string) => {
  if (contestId && contestId.trim().length > 0) {
    return contestId.trim();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `contest-${Date.now()}`;
};

const safeJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const findSubmissionText = (
  contest: ExpertContestResponse,
  expertId: string,
): string | undefined =>
  contest.submissions.find((submission) => submission.expertId === expertId)?.outputText;

const recordBreadcrumbs = (
  contest: ExpertContestResponse,
  addBreadcrumb?: BreadcrumbFn,
) => {
  if (!addBreadcrumb) return;
  addBreadcrumb('[expertContest] 勝者選定', {
    contestId: contest.contestId,
    scenario: contest.scenario,
    winnerId: contest.winnerId,
    runnerUpId: contest.runnerUpId,
    totalLatencyMs: contest.totalLatencyMs,
    tieBreaker: contest.metadata?.tieBreaker,
  });
};

async function callExpertContestApi(
  body: ExpertContestRequest,
): Promise<ExpertContestResponse> {
  const response = await fetch('/api/expertContest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await safeJson(response);
    const message =
      (errorBody as any)?.error ?? `Failed to run expert contest (status ${response.status})`;
    throw new Error(message);
  }

  return (await response.json()) as ExpertContestResponse;
}

export const runExpertContestTool = tool({
  name: 'runExpertContest',
  description:
    '指定した複数エキスパートを並列実行し、/api/expertContest で勝者と評価サマリを取得する。Tech/Med並列シナリオ専用。',
  parameters: {
    type: 'object',
    properties: {
      contestId: {
        type: 'string',
        description: '任意。指定しない場合は自動生成されるコンテストID。',
      },
      scenario: {
        type: 'string',
        description: '実行するシナリオの識別子（例: techParallelContest, medParallelContest）。',
      },
      language: {
        type: 'string',
        description: 'エキスパート回答と評価を生成する言語（例: ja-JP）。',
      },
      userPrompt: {
        type: 'string',
        description: '元々のユーザーリクエスト全文。',
      },
      relaySummary: {
        type: 'string',
        description: 'Relayエージェントが整理した要約や補足。',
      },
      evaluationRubric: {
        type: 'string',
        description: '評価ボードに渡す採点基準。',
      },
      sharedContext: {
        type: 'array',
        items: { type: 'string' },
        description: '全エキスパートで共有すべき bullet 情報の配列。',
      },
      experts: {
        type: 'array',
        description: '並列実行する各エキスパートの定義。',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            instructions: { type: 'string' },
            focus: { type: 'string' },
            complianceNotes: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['id', 'title', 'instructions', 'focus'],
          additionalProperties: false,
        },
      },
      metadata: {
        type: 'object',
        description: 'API層へそのまま渡す追加メタデータ。',
        additionalProperties: true,
      },
    },
    required: ['scenario', 'language', 'userPrompt', 'evaluationRubric', 'experts'],
    additionalProperties: false,
  },
  execute: async (input, details): Promise<ExpertContestToolResult> => {
    const {
      contestId,
      scenario,
      language,
      userPrompt,
      relaySummary,
      evaluationRubric,
      sharedContext,
      experts,
      metadata,
    } = input as RunExpertContestInput;

    const body: ExpertContestRequest = {
      contestId: ensureContestId(contestId),
      scenario,
      language,
      userPrompt,
      relaySummary,
      sharedContext: Array.isArray(sharedContext) ? sharedContext : undefined,
      evaluationRubric,
      experts: experts as ExpertContestRequest['experts'],
      metadata,
    };

    const addBreadcrumb = (details?.context as any)?.addTranscriptBreadcrumb as
      | BreadcrumbFn
      | undefined;

    try {
      const contest = await callExpertContestApi(body);
      recordBreadcrumbs(contest, addBreadcrumb);
      return {
        success: true,
        contestId: contest.contestId,
        scenario: contest.scenario,
        winnerId: contest.winnerId,
        runnerUpId: contest.runnerUpId,
        judgeSummary: contest.judgeSummary,
        totalLatencyMs: contest.totalLatencyMs,
        tieBreaker: contest.metadata?.tieBreaker,
        winnerAnswer: findSubmissionText(contest, contest.winnerId),
        runnerUpAnswer: findSubmissionText(contest, contest.runnerUpId),
        scores: contest.scores,
        submissions: contest.submissions,
        metadata: contest.metadata,
      } satisfies ExpertContestToolSuccess;
    } catch (error: any) {
      console.error('[runExpertContestTool] failed', error);
      if (addBreadcrumb) {
        addBreadcrumb('[expertContest] エラー', {
          contestId: body.contestId,
          message: error?.message ?? 'unknown_error',
        });
      }
      return {
        success: false,
        message: error?.message ?? 'Failed to execute expert contest',
      } satisfies ExpertContestToolError;
    }
  },
});
