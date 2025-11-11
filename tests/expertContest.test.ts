import { describe, it, expect } from 'vitest';
import { decideExpertContestOutcome } from '@/app/lib/expertContest';
import type {
  ExpertContestSubmission,
  ExpertPanelScore,
} from '@/app/agentConfigs/types';

const buildSubmission = (expertId: string, latencyMs: number): ExpertContestSubmission => ({
  expertId,
  outputText: `${expertId}-output`,
  latencyMs,
});

const buildScore = (
  expertId: string,
  totalScore: number,
  confidence: number,
  rationale: string,
): ExpertPanelScore => ({
  expertId,
  totalScore,
  confidence,
  rationale,
});

describe('decideExpertContestOutcome', () => {
  it('picks highest score as winner and next best as runner-up', () => {
    const submissions: ExpertContestSubmission[] = [
      buildSubmission('expA', 1200),
      buildSubmission('expB', 900),
      buildSubmission('expC', 1500),
      buildSubmission('expD', 1100),
    ];
    const scores: ExpertPanelScore[] = [
      buildScore('expA', 7.1, 0.82, 'solid hardware reasoning'),
      buildScore('expB', 8.2, 0.77, 'best networking guidance'),
      buildScore('expC', 6.9, 0.8, 'okay workflow advice'),
      buildScore('expD', 7.9, 0.81, 'good automation plan'),
    ];

    const result = decideExpertContestOutcome(submissions, scores);

    expect(result).toEqual({
      winnerId: 'expB',
      runnerUpId: 'expD',
    });
  });

  it('uses confidence to break score ties', () => {
    const submissions: ExpertContestSubmission[] = [
      buildSubmission('expA', 1200),
      buildSubmission('expB', 900),
    ];
    const scores: ExpertPanelScore[] = [
      buildScore('expA', 8.5, 0.72, 'confident but slower'),
      buildScore('expB', 8.5, 0.88, 'faster and confident'),
    ];

    const result = decideExpertContestOutcome(submissions, scores);

    expect(result).toEqual({
      winnerId: 'expB',
      runnerUpId: 'expA',
      tieBreaker: 'confidence',
    });
  });

  it('falls back to latency when score and confidence tie', () => {
    const submissions: ExpertContestSubmission[] = [
      buildSubmission('expA', 1200),
      buildSubmission('expB', 900),
    ];
    const scores: ExpertPanelScore[] = [
      buildScore('expA', 8.5, 0.9, 'slow but steady'),
      buildScore('expB', 8.5, 0.9, 'equal confidence, quicker'),
    ];

    const result = decideExpertContestOutcome(submissions, scores);

    expect(result).toEqual({
      winnerId: 'expB',
      runnerUpId: 'expA',
      tieBreaker: 'latency',
    });
  });

  it('throws a helpful error when fewer than two valid submissions exist', () => {
    const submissions: ExpertContestSubmission[] = [buildSubmission('expA', 1200)];
    const scores: ExpertPanelScore[] = [buildScore('expA', 9.1, 0.9, 'great detail')];

    expect(() => decideExpertContestOutcome(submissions, scores)).toThrow(
      /at least two expert submissions/i,
    );
  });
});
