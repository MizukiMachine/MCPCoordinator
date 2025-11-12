import OpenAI from 'openai';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';

import { getCreativeRoleProfile, type CreativeRoleProfile } from '@/app/creativeSandbox/roles';
import { getCreativeJudgeProfiles, type CreativeJudgeProfile } from '@/app/creativeSandbox/judges';
import type {
  CandidateAverageScore,
  CreativeParallelResult,
  CreativePromptPayload,
  CreativeRunner,
  CreativeSingleResult,
  JudgeResult,
  ParallelCandidate,
} from '@/app/creativeSandbox/types';
import {
  CREATIVE_MODEL,
  CREATIVE_PARALLEL_COUNT,
  MERGE_SCORE_GAP_THRESHOLD,
  MERGE_RUNNER_MIN_SCORE,
  buildJudgePrompt,
  buildCreativeUserPrompt,
  createShuffledIndices,
  evaluateMergeDecision,
  buildMergePrompt,
  extractResponseText,
  mapTokenUsage,
} from '@/app/lib/creativeSandboxUtils';
import { aggregateJudgeScores } from '@/app/lib/creativeAggregation';

const JudgeScoreSchema = z.object({
  candidateId: z.string().min(1),
  score: z.number().min(0).max(10),
  rationale: z.string().min(1),
});

const JudgePanelSchema = z.object({
  judgeId: z.string().min(1),
  notes: z.string().min(1),
  candidateScores: z.array(JudgeScoreSchema).min(2),
});

function createCandidateId(index: number) {
  return `candidate_${index + 1}`;
}

const MIN_SUCCEEDED_JUDGES = 2;

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

    const shuffledIndices = createShuffledIndices(candidates.length);
    const judgeProfiles = getCreativeJudgeProfiles();

    const judgeSettled = await Promise.allSettled(
      judgeProfiles.map((judge) =>
        runJudgeEvaluation(openai, judge, profile, payload, candidates, shuffledIndices),
      ),
    );

    const judgeResults: JudgeResult[] = judgeSettled
      .filter((result): result is PromiseFulfilledResult<JudgeResult> => result.status === 'fulfilled')
      .map((result) => result.value);

    if (judgeResults.length < MIN_SUCCEEDED_JUDGES) {
      throw new Error('Failed to obtain enough judge evaluations');
    }

    const aggregation = aggregateJudgeScores(candidates, judgeResults);
    const winnerCandidate = candidates.find((candidate) => candidate.candidateId === aggregation.winnerId);
    const runnerCandidate = aggregation.runnerUpId
      ? candidates.find((candidate) => candidate.candidateId === aggregation.runnerUpId)
      : undefined;

    const totalLatencyMs = Date.now() - contestStart;
    const judgeSummary = buildJudgeSummary(aggregation.averages, aggregation.winnerId, aggregation.runnerUpId);
    const winnerText = winnerCandidate?.text ?? '';
    const runnerText = runnerCandidate?.text;

    const mergeDecision = evaluateMergeDecision(
      aggregation.averages,
      aggregation.winnerId,
      aggregation.runnerUpId,
      aggregation.scoreGap,
      {
        gapThreshold: MERGE_SCORE_GAP_THRESHOLD,
        minRunnerScore: MERGE_RUNNER_MIN_SCORE,
      },
    );

    let finalText = winnerText;
    let mergeApplied = false;
    let mergeReason = mergeDecision.reason;
    let mergeTokenUsage;

    if (mergeDecision.shouldMerge && winnerCandidate && runnerCandidate && runnerText) {
      const mergeResponse = await openai.responses.create({
        model: CREATIVE_MODEL,
        input: [
          { role: 'system', content: profile.instructions },
          { role: 'user', content: buildMergePrompt(profile, payload, winnerText, runnerText) },
        ],
      });
      finalText = extractResponseText(mergeResponse);
      mergeTokenUsage = mapTokenUsage((mergeResponse as any).usage);
      mergeApplied = true;
    }

    return {
      role: payload.role,
      prompt: payload.userPrompt,
      candidates,
      mergedAnswer: {
        text: finalText,
        latencyMs: totalLatencyMs,
        model: CREATIVE_MODEL,
        tokenUsage: mergeTokenUsage,
        sourceCandidateId: aggregation.winnerId,
        runnerUpCandidateId: aggregation.runnerUpId,
        mergeApplied,
        mergeReason,
        rawWinnerText: winnerText,
        rawRunnerUpText: runnerText,
      },
      evaluation: {
        winnerId: aggregation.winnerId,
        runnerUpId: aggregation.runnerUpId,
        judgeSummary,
        decisionReason: aggregation.decisionReason,
        totalLatencyMs,
        rubric: profile.evaluationRubric,
        averages: aggregation.averages,
        judges: judgeResults,
        mergeApplied,
        mergeReason,
      },
    } satisfies CreativeParallelResult;
  };

  return {
    runSingle,
    runParallel,
  } satisfies CreativeRunner;
}

async function runJudgeEvaluation(
  openai: OpenAI,
  judge: CreativeJudgeProfile,
  roleProfile: CreativeRoleProfile,
  payload: CreativePromptPayload,
  candidates: ParallelCandidate[],
  shuffledIndices: number[],
): Promise<JudgeResult> {
  const response = await openai.responses.parse({
    model: CREATIVE_MODEL,
    input: [
      {
        role: 'system',
        content: `あなたは ${judge.label} です。評価観点: ${judge.focus}。JSONのみで回答してください。`,
      },
      {
        role: 'user',
        content: buildJudgePrompt(judge, roleProfile, payload, candidates, shuffledIndices),
      },
    ],
    text: {
      format: zodTextFormat(JudgePanelSchema, `${judge.id}_scorecard`),
    },
  });

  const parsed = JudgePanelSchema.parse((response as any).output_parsed);
  return {
    judgeId: judge.id,
    focus: judge.focus,
    notes: parsed.notes,
    candidateScores: parsed.candidateScores,
  } satisfies JudgeResult;
}

function buildJudgeSummary(
  averages: CandidateAverageScore[],
  winnerId: string,
  runnerUpId?: string,
) {
  const winnerScore = averages.find((item) => item.candidateId === winnerId);
  const runnerScore = runnerUpId
    ? averages.find((item) => item.candidateId === runnerUpId)
    : undefined;

  if (!winnerScore) {
    return '勝者スコア情報が不足しています。';
  }

  if (!runnerScore) {
    return `勝者 ${winnerId} 平均${winnerScore.average.toFixed(2)}点 / Runner-up なし`;
  }

  return `勝者 ${winnerId} 平均${winnerScore.average.toFixed(2)}点 / Runner ${runnerUpId} 平均${runnerScore.average.toFixed(2)}点`;
}
