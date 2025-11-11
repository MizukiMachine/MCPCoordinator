import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';

import { decideExpertContestOutcome } from '@/app/lib/expertContest';
import type {
  ExpertContestRequest,
  ExpertContestResponse,
  ExpertContestRoleDefinition,
  ExpertContestSubmission,
} from '@/app/agentConfigs/types';

const JudgePanelSchema = z.object({
  judgeSummary: z.string(),
  scores: z
    .array(
      z.object({
        expertId: z.string(),
        totalScore: z.number(),
        confidence: z.number(),
        rationale: z.string(),
        categoryBreakdown: z.record(z.number()).optional(),
      }),
    )
    .min(2),
});

type JudgeOutput = z.infer<typeof JudgePanelSchema>;

const MIN_EXPERTS = 2;

export async function POST(req: NextRequest) {
  const payload = (await req.json()) as ExpertContestRequest | undefined;

  const validationError = validatePayload(payload);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey });
  const contestStart = Date.now();

  try {
    const submissions = await Promise.all(
      payload!.experts.map((expert) => runExpertSubmission(openai, payload!, expert)),
    );

    const judgeOutput = await runJudgePanel(openai, payload!, submissions);
    const filteredScores = judgeOutput.scores.filter((score) =>
      submissions.some((submission) => submission.expertId === score.expertId),
    );

    if (filteredScores.length < MIN_EXPERTS) {
      throw new Error('Judge response did not contain enough valid scores');
    }

    const decision = decideExpertContestOutcome(submissions, filteredScores);

    const body: ExpertContestResponse = {
      contestId: payload!.contestId,
      scenario: payload!.scenario,
      winnerId: decision.winnerId,
      runnerUpId: decision.runnerUpId,
      judgeSummary: judgeOutput.judgeSummary,
      totalLatencyMs: Date.now() - contestStart,
      submissions,
      scores: filteredScores,
      metadata: {
        tieBreaker: decision.tieBreaker,
        evaluationRubric: payload!.evaluationRubric,
        sharedContextCount: payload!.sharedContext?.length ?? 0,
        relaySummaryIncluded: Boolean(payload!.relaySummary),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error('[expertContest] Failed to run contest', error);
    return NextResponse.json({ error: 'Failed to run expert contest' }, { status: 500 });
  }
}

function validatePayload(payload: ExpertContestRequest | undefined) {
  if (!payload) return 'Missing request body';

  const requiredStrings: Array<keyof ExpertContestRequest> = [
    'contestId',
    'scenario',
    'language',
    'userPrompt',
    'evaluationRubric',
  ];

  for (const key of requiredStrings) {
    if (!payload[key] || typeof payload[key] !== 'string') {
      return `Missing or invalid field: ${key}`;
    }
  }

  if (!Array.isArray(payload.experts) || payload.experts.length < MIN_EXPERTS) {
    return 'At least two experts are required';
  }

  return null;
}

async function runExpertSubmission(
  openai: OpenAI,
  payload: ExpertContestRequest,
  expert: ExpertContestRoleDefinition,
): Promise<ExpertContestSubmission> {
  const startedAt = Date.now();

  const response = await openai.responses.create({
    model: 'gpt-5-mini',
    input: [
      {
        role: 'system',
        content: buildExpertSystemPrompt(payload, expert),
      },
      {
        role: 'user',
        content: buildExpertUserPrompt(payload, expert),
      },
    ],
  });

  const latencyMs = Date.now() - startedAt;
  const outputText = extractOutputText(response);

  return {
    expertId: expert.id,
    outputText,
    latencyMs,
    tokenUsage: mapTokenUsage((response as any).usage),
  };
}

async function runJudgePanel(
  openai: OpenAI,
  payload: ExpertContestRequest,
  submissions: ExpertContestSubmission[],
): Promise<JudgeOutput> {
  const response = await openai.responses.parse({
    model: 'gpt-5-mini',
    input: [
      {
        role: 'system',
        content:
          'You are the chair of an expert review board. Score each expert on relevance, depth, safety, and overall execution. Output JSON only.',
      },
      {
        role: 'user',
        content: buildJudgePrompt(payload, submissions),
      },
    ],
    text: {
      format: zodTextFormat(JudgePanelSchema, 'expert_panel_output'),
    },
  });

  const parsed = JudgePanelSchema.parse((response as any).output_parsed);
  return parsed;
}

function buildExpertSystemPrompt(
  payload: ExpertContestRequest,
  expert: ExpertContestRoleDefinition,
) {
  const compliance = expert.complianceNotes?.length
    ? `\n# Compliance\n${expert.complianceNotes.map((note) => `- ${note}`).join('\n')}`
    : '';

  return `You are "${expert.title}" for the ${payload.scenario} contest. Focus area: ${expert.focus}.\n${expert.instructions}\nRespond in ${payload.language} with concise, actionable guidance.${compliance}`;
}

function buildExpertUserPrompt(
  payload: ExpertContestRequest,
  expert: ExpertContestRoleDefinition,
) {
  const sharedContext = payload.sharedContext?.length
    ? payload.sharedContext.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : 'なし';

  const relayBlock = payload.relaySummary ? payload.relaySummary : 'なし';

  return `User request: ${payload.userPrompt}\n\nRelay summary: ${relayBlock}\n\nShared context:\n${sharedContext}\n\nEvaluation rubric: ${payload.evaluationRubric}\n\nDeliverable: Provide the best possible answer from the perspective of ${expert.title}. Emphasize unique expertise in ${expert.focus} and avoid referencing other experts.`;
}

function buildJudgePrompt(
  payload: ExpertContestRequest,
  submissions: ExpertContestSubmission[],
) {
  const sharedContext = payload.sharedContext?.length
    ? payload.sharedContext.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : 'なし';

  const submissionBlocks = submissions
    .map(
      (submission, index) =>
        `Expert ${index + 1}: ${submission.expertId}\nLatency: ${submission.latencyMs}ms\nAnswer:\n${submission.outputText}`,
    )
    .join('\n\n');

  return `Scenario: ${payload.scenario}\nLanguage expectation: ${payload.language}\nUser prompt: ${payload.userPrompt}\nRelay summary: ${payload.relaySummary ?? 'なし'}\nShared context:\n${sharedContext}\nEvaluation rubric: ${payload.evaluationRubric}\n\nSubmissions:\n${submissionBlocks}\n\nInstructions:\n- Score every expert on a 0-10 scale for totalScore.\n- confidence is a 0-1 float describing certainty.\n- Provide a short rationale referencing their unique insight or risks.\n- categoryBreakdown should include the keys relevance, depth, safety (0-10 each).\n- Also give a judgeSummary that compares the top entries.`;
}

function extractOutputText(response: any) {
  if (Array.isArray(response?.output_text) && response.output_text.length > 0) {
    return response.output_text.join('\n');
  }

  const output = response?.output ?? [];
  const combined = output
    .flatMap((item: any) => {
      if (item.type !== 'message') return [];
      const content = item.content ?? [];
      return content
        .filter((c: any) => c.type === 'output_text')
        .map((c: any) => c.text ?? '');
    })
    .join('\n')
    .trim();

  return combined;
}

function mapTokenUsage(usage: any | undefined) {
  if (!usage) return undefined;
  return {
    promptTokens: usage.input_tokens ?? usage.prompt_tokens,
    completionTokens: usage.output_tokens ?? usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}
