import type {
  CandidateAverageScore,
  JudgeResult,
  ParallelCandidate,
} from '@/app/creativeSandbox/types';

interface AggregationConfig {
  earlyWinMargin?: number;
}

interface AggregateScore {
  candidate: ParallelCandidate;
  scores: number[];
  average: number;
  votes: number;
}

interface AggregationOutcome {
  winnerId: string;
  runnerUpId?: string;
  decisionReason: string;
  averages: CandidateAverageScore[];
  winnerAverage: number;
  runnerUpAverage?: number;
  scoreGap?: number;
}

const DEFAULT_MARGIN = 1.0;

export function aggregateJudgeScores(
  candidates: ParallelCandidate[],
  judgeResults: JudgeResult[],
  config: AggregationConfig = {},
): AggregationOutcome {
  const earlyWinMargin = config.earlyWinMargin ?? DEFAULT_MARGIN;
  const aggregateMap = new Map<string, AggregateScore>();

  candidates.forEach((candidate) => {
    aggregateMap.set(candidate.candidateId, {
      candidate,
      scores: [],
      average: 0,
      votes: 0,
    });
  });

  judgeResults.forEach((judge) => {
    judge.candidateScores.forEach((score) => {
      const record = aggregateMap.get(score.candidateId);
      if (!record) return;
      record.scores.push(score.score);
    });
  });

  const aggregates: AggregateScore[] = [];
  aggregateMap.forEach((record) => {
    if (record.scores.length === 0) return;
    const total = record.scores.reduce((sum, value) => sum + value, 0);
    record.votes = record.scores.length;
    record.average = total / record.scores.length;
    aggregates.push(record);
  });

  if (aggregates.length < 2) {
    throw new Error('At least two candidates need valid judge scores');
  }

  aggregates.sort((a, b) => b.average - a.average);
  let winner = aggregates[0];
  let runnerUp = aggregates[1];

  const averages: CandidateAverageScore[] = aggregates.map((aggregate) => ({
    candidateId: aggregate.candidate.candidateId,
    average: Number(aggregate.average.toFixed(3)),
    votes: aggregate.votes,
  }));

  const diff = runnerUp ? winner.average - runnerUp.average : undefined;
  let decisionReason = '';

  if (!runnerUp) {
    decisionReason = 'Runner-up 不在: スコア付き候補が1件のみ。';
  } else if (diff !== undefined && diff >= earlyWinMargin) {
    decisionReason = `平均差 ${diff.toFixed(2)} >= しきい値 ${earlyWinMargin.toFixed(2)} のため早期決定。`;
  } else {
    const tieDecision = breakTie(winner, runnerUp);
    winner = tieDecision.winner;
    runnerUp = tieDecision.runnerUp;
    decisionReason = tieDecision.reason;
  }

  return {
    winnerId: winner.candidate.candidateId,
    runnerUpId: runnerUp?.candidate.candidateId,
    decisionReason,
    averages,
    winnerAverage: Number(winner.average.toFixed(3)),
    runnerUpAverage: runnerUp ? Number(runnerUp.average.toFixed(3)) : undefined,
    scoreGap: diff !== undefined ? Number(diff.toFixed(3)) : undefined,
  } satisfies AggregationOutcome;
}

function breakTie(winner: AggregateScore, runnerUp: AggregateScore) {
  const winnerLength = winner.candidate.text.length;
  const runnerLength = runnerUp.candidate.text.length;

  if (winnerLength !== runnerLength) {
    if (winnerLength > runnerLength) {
      return {
        winner: runnerUp,
        runnerUp: winner,
        reason: '平均差が小さいため、より短い回答を優先。',
      };
    }
    return {
      winner,
      runnerUp,
      reason: '平均差が小さいため、より短い回答を優先。',
    };
  }

  if (winner.candidate.latencyMs !== runnerUp.candidate.latencyMs) {
    if (winner.candidate.latencyMs > runnerUp.candidate.latencyMs) {
      return {
        winner: runnerUp,
        runnerUp: winner,
        reason: '回答時間が速い方を優先。',
      };
    }
    return {
      winner,
      runnerUp,
      reason: '回答時間が速い方を優先。',
    };
  }

  return {
    winner,
    runnerUp,
    reason: '差が極小のため生成順で決定。',
  };
}
