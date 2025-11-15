import type { ExpertContestRequest, ExpertContestResponse } from '@/app/agentConfigs/types';

export type BreadcrumbFn = (title: string, data?: any) => void;
export type LogFn = (
  eventObj: Record<string, any>,
  eventNameSuffix?: string,
  metadata?: { requestId?: string; sessionId?: string | null },
) => void;

const safeJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export interface ScoreSnapshot {
  expertId: string;
  totalScore?: number;
  confidence?: number;
  latencyMs?: number;
}

export interface ContestSummary {
  type: 'expertContestResult';
  contestId: string;
  scenario: string;
  totalLatencyMs: number;
  tieBreaker?: string;
  judgeSummary: string;
  winner?: ScoreSnapshot;
  runnerUp?: ScoreSnapshot;
  topScores: ScoreSnapshot[];
  preset?: string;
  baselineAnswer?: string;
}

export async function callExpertContestApi(
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

const buildScoreSnapshot = (
  contest: ExpertContestResponse,
  expertId: string | undefined,
  latencyMap: Map<string, number>,
): ScoreSnapshot | undefined => {
  if (!expertId) return undefined;
  const score = contest.scores.find((s) => s.expertId === expertId);
  if (!score) return undefined;
  return {
    expertId,
    totalScore: score.totalScore,
    confidence: score.confidence,
    latencyMs: latencyMap.get(expertId),
  };
};

export const buildContestSummary = (
  contest: ExpertContestResponse,
): ContestSummary => {
  const latencyMap = new Map<string, number>();
  contest.submissions.forEach((submission) => {
    latencyMap.set(submission.expertId, submission.latencyMs);
  });

  const sortedScores = [...contest.scores].sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    return b.confidence - a.confidence;
  });

  return {
    type: 'expertContestResult',
    contestId: contest.contestId,
    scenario: contest.scenario,
    totalLatencyMs: contest.totalLatencyMs,
    tieBreaker: contest.metadata?.tieBreaker,
    judgeSummary: contest.judgeSummary,
    winner: buildScoreSnapshot(contest, contest.winnerId, latencyMap),
    runnerUp: buildScoreSnapshot(contest, contest.runnerUpId, latencyMap),
    topScores: sortedScores.map((score) => ({
      expertId: score.expertId,
      totalScore: score.totalScore,
      confidence: score.confidence,
      latencyMs: latencyMap.get(score.expertId),
    })),
  };
};

export const recordContestBreadcrumb = (
  summary: ContestSummary,
  addBreadcrumb?: BreadcrumbFn,
) => {
  if (!addBreadcrumb) return;
  addBreadcrumb('[expertContest] 勝者選定', summary);
};

export const logContestEvent = (
  summary: ContestSummary,
  logClientEvent?: LogFn,
) => {
  if (!logClientEvent) return;
  logClientEvent(
    {
      type: 'expert.contest.result',
      ...summary,
    },
    'expertContest',
  );
};

export const ensureContestId = (contestId?: string) => {
  if (contestId && contestId.trim().length > 0) {
    return contestId.trim();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `contest-${Date.now()}`;
};

export const findSubmissionText = (
  contest: ExpertContestResponse,
  expertId: string,
): string | undefined =>
  contest.submissions.find((submission) => submission.expertId === expertId)?.outputText;
