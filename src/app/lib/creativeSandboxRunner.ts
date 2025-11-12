import OpenAI from 'openai';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';

import { getCreativeRoleProfile } from '@/app/creativeSandbox/roles';
import type {
  CreativeParallelResult,
  CreativePromptPayload,
  CreativeRunner,
  CreativeSingleResult,
  ParallelCandidate,
} from '@/app/creativeSandbox/types';
import {
  CREATIVE_MODEL,
  CREATIVE_PARALLEL_COUNT,
  buildCreativeEvaluationPrompt,
  buildCreativeUserPrompt,
  extractResponseText,
  mapTokenUsage,
} from '@/app/lib/creativeSandboxUtils';

const CreativeJudgeSchema = z.object({
  winnerId: z.string().min(1),
  runnerUpId: z.string().nullable(),
  judgeSummary: z.string().min(1),
  mergedAnswer: z.string().min(1),
});

export type CreativeJudgeOutput = z.infer<typeof CreativeJudgeSchema>;

const evaluatorSystemPrompt = `あなたはクリエイティブ審査員です。候補の回答を比較し、
1. ルーブリックに基づく勝者(winnerId)と次点(runnerUpId)を選ぶ。runnerUpが不在なら runnerUpId は null を明示する。
2. 勝者を軸にしつつ、他候補の良さも統合した最終回答(mergedAnswer)を最大3行で作る。
3. 審査根拠をjudgeSummaryとして1-2文でまとめる。
出力は必ずJSONのみ。`;

function createCandidateId(index: number) {
  return `candidate_${index + 1}`;
}

export function createCreativeSandboxRunner(openai: OpenAI): CreativeRunner {
  const runSingle = async (payload: CreativePromptPayload): Promise<CreativeSingleResult> => {
    const profile = getCreativeRoleProfile(payload.role);
    const userPrompt = buildCreativeUserPrompt(payload);
    const startedAt = Date.now();
    const response = await openai.responses.create({
      model: CREATIVE_MODEL,
      input: [
        { role: 'system', content: profile.instructions },
        { role: 'user', content: userPrompt },
      ],
    });

    return {
      role: payload.role,
      prompt: payload.userPrompt,
      answer: {
        text: extractResponseText(response),
        latencyMs: Date.now() - startedAt,
        model: CREATIVE_MODEL,
        tokenUsage: mapTokenUsage((response as any).usage),
      },
    } satisfies CreativeSingleResult;
  };

  const runParallel = async (payload: CreativePromptPayload): Promise<CreativeParallelResult> => {
    const profile = getCreativeRoleProfile(payload.role);
    const userPrompt = buildCreativeUserPrompt(payload);
    const contestStart = Date.now();

    const candidates = await Promise.all(
      Array.from({ length: CREATIVE_PARALLEL_COUNT }).map(async (_, index) => {
        const candidateId = createCandidateId(index);
        const startedAt = Date.now();
        const response = await openai.responses.create({
          model: CREATIVE_MODEL,
          input: [
            { role: 'system', content: profile.instructions },
            { role: 'user', content: userPrompt },
          ],
        });

        return {
          candidateId,
          text: extractResponseText(response),
          latencyMs: Date.now() - startedAt,
          model: CREATIVE_MODEL,
          tokenUsage: mapTokenUsage((response as any).usage),
        } satisfies ParallelCandidate;
      }),
    );

    const judgeResponse = await openai.responses.parse({
      model: CREATIVE_MODEL,
      input: [
        { role: 'system', content: evaluatorSystemPrompt },
        {
          role: 'user',
          content: buildCreativeEvaluationPrompt(profile, payload, candidates),
        },
      ],
      text: {
        format: zodTextFormat(CreativeJudgeSchema, 'creative_judge_output'),
      },
    });

    const parsed = CreativeJudgeSchema.parse((judgeResponse as any).output_parsed);
    const totalLatencyMs = Date.now() - contestStart;
    const mergedAnswer = parsed.mergedAnswer.trim();

    return {
      role: payload.role,
      prompt: payload.userPrompt,
      candidates,
      mergedAnswer: {
        text: mergedAnswer,
        latencyMs: totalLatencyMs,
        model: CREATIVE_MODEL,
        tokenUsage: mapTokenUsage((judgeResponse as any).usage),
        sourceCandidateId: parsed.winnerId,
      },
      evaluation: {
        winnerId: parsed.winnerId,
        runnerUpId: parsed.runnerUpId ?? undefined,
        judgeSummary: parsed.judgeSummary,
        totalLatencyMs,
        rubric: profile.evaluationRubric,
      },
    } satisfies CreativeParallelResult;
  };

  return {
    runSingle,
    runParallel,
  } satisfies CreativeRunner;
}
