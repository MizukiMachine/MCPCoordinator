import { describe, expect, it } from 'vitest';

import { getCreativeRoleProfile } from '@/app/creativeSandbox/roles';
import type { ParallelCandidate } from '@/app/creativeSandbox/types';
import {
  buildCreativeUserPrompt,
  buildCreativeEvaluationPrompt,
} from '@/app/lib/creativeSandboxUtils';

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

  it('buildCreativeEvaluationPrompt enumerates candidates and rubric', () => {
    const profile = getCreativeRoleProfile('literaryCritic');
    const prompt = {
      role: 'literaryCritic' as const,
      userPrompt: '近未来小説のテーマ分析',
    };
    const candidates: ParallelCandidate[] = [
      {
        candidateId: 'c1',
        text: '候補1',
        latencyMs: 100,
        model: 'gpt-5-mini',
      },
      {
        candidateId: 'c2',
        text: '候補2',
        latencyMs: 120,
        model: 'gpt-5-mini',
      },
    ];

    const evalPrompt = buildCreativeEvaluationPrompt(profile, prompt, candidates);

    expect(evalPrompt).toContain(profile.evaluationRubric);
    expect(evalPrompt).toContain('c1');
    expect(evalPrompt).toContain('候補2');
  });
});
