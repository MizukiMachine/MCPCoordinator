import { describe, expect, it } from 'vitest';

import { getCreativeRoleProfile } from '@/app/creativeSandbox/roles';
import { creativeJudgeProfiles } from '@/app/creativeSandbox/judges';
import type { JudgeResult, ParallelCandidate } from '@/app/creativeSandbox/types';
import {
  buildCreativeUserPrompt,
  buildJudgePrompt,
  createShuffledIndices,
} from '@/app/lib/creativeSandboxUtils';
import { aggregateJudgeScores } from '@/app/lib/creativeAggregation';

describe('creative sandbox helpers', () => {
  it('buildCreativeUserPrompt includes fallback context text', () => {
    const prompt = buildCreativeUserPrompt({
      role: 'filmCritic',
      userPrompt: 'このSF映画のテーマを整理して',
    });

    expect(prompt).toContain('このSF映画のテーマを整理して');
    expect(prompt).toContain('補足情報: なし');
  });

  it('buildCreativeUserPrompt appends context when provided', () => {
    const prompt = buildCreativeUserPrompt({
      role: 'copywriter',
      userPrompt: '新作エナジードリンクのキャッチコピー',
      contextHint: 'Z世代・夜勤ワーカー向け',
    });

    expect(prompt).toContain('新作エナジードリンクのキャッチコピー');
    expect(prompt).toContain('補足情報: Z世代・夜勤ワーカー向け');
  });

  it('buildJudgePrompt reflects shuffled order and rubric', () => {
    const profile = getCreativeRoleProfile('literaryCritic');
    const judge = creativeJudgeProfiles[0];
    const payload = {
      role: 'literaryCritic' as const,
      userPrompt: '近未来小説のテーマ分析',
    };
    const candidates: ParallelCandidate[] = [
      { candidateId: 'c1', text: '候補1', latencyMs: 100, model: 'gpt-5-mini' },
      { candidateId: 'c2', text: '候補2', latencyMs: 80, model: 'gpt-5-mini' },
    ];
    const prompt = buildJudgePrompt(judge, profile, payload, candidates, [1, 0]);

    expect(prompt).toContain('提示1 (ID: c2');
    expect(prompt).toContain(profile.evaluationRubric);
    expect(prompt).toContain(judge.focus);
  });

  it('createShuffledIndices produces unique order', () => {
    const order = createShuffledIndices(4);
    expect(order).toHaveLength(4);
    expect(new Set(order).size).toBe(4);
    order.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(4);
    });
  });

  it('aggregateJudgeScores applies tie-break rules', () => {
    const candidates: ParallelCandidate[] = [
      { candidateId: 'short', text: '短文', latencyMs: 150, model: 'gpt-5-mini' },
      { candidateId: 'long', text: 'やや長い回答です', latencyMs: 90, model: 'gpt-5-mini' },
      { candidateId: 'third', text: '三番目', latencyMs: 120, model: 'gpt-5-mini' },
    ];
    const judges: JudgeResult[] = [
      {
        judgeId: 'judgeA',
        focus: 'accuracy',
        notes: 'ok',
        candidateScores: [
          { candidateId: 'short', score: 8.5, rationale: '良い' },
          { candidateId: 'long', score: 8.4, rationale: '僅差' },
        ],
      },
      {
        judgeId: 'judgeB',
        focus: 'logic',
        notes: 'ok',
        candidateScores: [
          { candidateId: 'short', score: 7.9, rationale: '簡潔' },
          { candidateId: 'long', score: 7.95, rationale: '冗長' },
        ],
      },
      {
        judgeId: 'judgeC',
        focus: 'style',
        notes: 'ok',
        candidateScores: [
          { candidateId: 'third', score: 6, rationale: '普通' },
        ],
      },
    ];

    const outcome = aggregateJudgeScores(candidates, judges, { earlyWinMargin: 0.2 });

    expect(outcome.winnerId).toBe('short');
    expect(outcome.runnerUpId).toBe('long');
    expect(outcome.decisionReason).toContain('短い回答');
    expect(outcome.averages.length).toBeGreaterThanOrEqual(2);
  });
});
