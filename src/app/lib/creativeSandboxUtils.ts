import type { CreativePromptPayload, ParallelCandidate } from '@/app/creativeSandbox/types';
import type { CreativeRoleProfile } from '@/app/creativeSandbox/roles';

export const CREATIVE_MODEL = 'gpt-5-mini';
export const CREATIVE_PARALLEL_COUNT = 4;

export function buildCreativeUserPrompt(payload: CreativePromptPayload): string {
  const { userPrompt, contextHint } = payload;
  const trimmedPrompt = userPrompt.trim();
  const contextText = contextHint?.trim().length ? contextHint.trim() : 'なし';

  return [
    `ロール: ${payload.role}`,
    `ユーザー質問: ${trimmedPrompt}`,
    `補足情報: ${contextText}`,
    '回答は最大4行で表現し、必要なら箇条書きを使う。',
  ].join('\n');
}

export function buildCreativeEvaluationPrompt(
  profile: CreativeRoleProfile,
  payload: CreativePromptPayload,
  candidates: ParallelCandidate[],
): string {
  const candidateBlocks = candidates
    .map(
      (candidate, index) =>
        `候補${index + 1} (ID: ${candidate.candidateId}, latency=${candidate.latencyMs}ms):\n${candidate.text}`,
    )
    .join('\n\n');

  return `ロール: ${profile.label}\n質問: ${payload.userPrompt}\nルーブリック: ${profile.evaluationRubric}\n\n候補一覧:\n${candidateBlocks}\n\n指示:\n- ルーブリックに沿って候補を比較し、winnerId と runnerUpId を選ぶ。\n- 最優秀案を参考に、必要なら複数候補の良さを統合した mergedAnswer を1〜3行で作成する。\n- mergedAnswer も ${profile.label} としての口調を守る。\n- JSONのみで出力する。`;
}

export function extractResponseText(response: any): string {
  if (Array.isArray(response?.output_text) && response.output_text.length > 0) {
    return response.output_text.join('\n').trim();
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

export function mapTokenUsage(usage: any | undefined) {
  if (!usage) return undefined;
  return {
    promptTokens: usage.input_tokens ?? usage.prompt_tokens,
    completionTokens: usage.output_tokens ?? usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}
