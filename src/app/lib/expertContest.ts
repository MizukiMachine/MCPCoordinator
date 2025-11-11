import type {
  ExpertContestDecision,
  ExpertContestSubmission,
  ExpertPanelScore,
} from '@/app/agentConfigs/types';

interface RankedExpert extends ExpertPanelScore {
  latencyMs: number;
}

const MIN_EXPERTS = 2;

export function decideExpertContestOutcome(
  submissions: ExpertContestSubmission[],
  scores: ExpertPanelScore[],
): ExpertContestDecision {
  const latencyByExpert = new Map<string, number>();
  submissions.forEach((submission) => {
    latencyByExpert.set(submission.expertId, submission.latencyMs);
  });

  const comparableExperts: RankedExpert[] = scores
    .filter((score) => latencyByExpert.has(score.expertId))
    .map((score) => ({
      ...score,
      latencyMs: latencyByExpert.get(score.expertId)!,
    }));

  if (comparableExperts.length < MIN_EXPERTS) {
    throw new Error('Expert contest requires at least two expert submissions');
  }

  comparableExperts.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return a.latencyMs - b.latencyMs;
  });

  const [winner, runnerUp] = comparableExperts;

  if (!runnerUp) {
    throw new Error('Expert contest requires at least two expert submissions');
  }

  let tieBreaker: ExpertContestDecision['tieBreaker'];
  if (winner.totalScore === runnerUp.totalScore) {
    tieBreaker = winner.confidence === runnerUp.confidence ? 'latency' : 'confidence';
  }

  return tieBreaker
    ? { winnerId: winner.expertId, runnerUpId: runnerUp.expertId, tieBreaker }
    : { winnerId: winner.expertId, runnerUpId: runnerUp.expertId };
}
