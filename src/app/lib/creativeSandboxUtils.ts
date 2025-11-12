import type {
  CandidateAverageScore,
  CreativePromptPayload,
  ParallelCandidate,
} from '@/app/creativeSandbox/types';
import type { CreativeRoleProfile } from '@/app/creativeSandbox/roles';
import type { CreativeJudgeProfile } from '@/app/creativeSandbox/judges';

export const CREATIVE_MODEL = 'gpt-5-mini';
export const CREATIVE_PARALLEL_COUNT = 4;
export const MERGE_SCORE_GAP_THRESHOLD = 0.5;
export const MERGE_RUNNER_MIN_SCORE = 8;

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

export function createShuffledIndices(count: number): number[] {
  const indices = Array.from({ length: count }, (_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

export function buildJudgePrompt(
  judge: CreativeJudgeProfile,
  profile: CreativeRoleProfile,
  payload: CreativePromptPayload,
  candidates: ParallelCandidate[],
  shuffledIndices: number[],
): string {
  const candidateBlocks = shuffledIndices
    .map((index, order) => {
      const candidate = candidates[index];
      return `提示${order + 1} (ID: ${candidate.candidateId}, latency=${candidate.latencyMs}ms):\n${candidate.text}`;
    })
    .join('\n\n');

  return `あなたは ${judge.label} です。フォーカス: ${judge.focus}。${judge.instructions}\n\n` +
    `質問: ${payload.userPrompt}\nロール: ${profile.label}\n共有ルーブリック: ${profile.evaluationRubric}\n\n候補一覧 (順番は毎回ランダムです):\n${candidateBlocks}\n\n` +
    'タスク:\n' +
    '- 各候補に0-10点でスコアを付け、短い理由を示す。\n' +
    '- JSONのみで出力し、candidateScores配列に {candidateId, score, rationale} を列挙する。\n' +
    '- judgeId には自分のIDを入れる。notes には一言コメントを書く。\n' +
    '- runner-up を決めたり回答を生成したりはしない。採点のみ。';
}

export interface MergeDecision {
  shouldMerge: boolean;
  reason: string;
}

export function evaluateMergeDecision(
  averages: CandidateAverageScore[],
  winnerId: string,
  runnerUpId: string | undefined,
  scoreGap: number | undefined,
  options?: { gapThreshold?: number; minRunnerScore?: number },
): MergeDecision {
  if (!runnerUpId) {
    return { shouldMerge: false, reason: 'Runner-up が存在しないためマージ不可。' };
  }

  const gapThreshold = options?.gapThreshold ?? MERGE_SCORE_GAP_THRESHOLD;
  const minRunnerScore = options?.minRunnerScore ?? MERGE_RUNNER_MIN_SCORE;
  const winnerScore = averages.find((item) => item.candidateId === winnerId);
  const runnerScore = averages.find((item) => item.candidateId === runnerUpId);

  if (!winnerScore || !runnerScore) {
    return { shouldMerge: false, reason: 'スコア情報が不足しているためマージ不可。' };
  }

  if (scoreGap === undefined || scoreGap >= gapThreshold) {
    return {
      shouldMerge: false,
      reason: `平均差 ${scoreGap ?? 'N/A'} がしきい値 ${gapThreshold} 以上のため勝者のみ採用。`,
    };
  }

  if (runnerScore.average < minRunnerScore) {
    return {
      shouldMerge: false,
      reason: `Runner-up 平均 ${runnerScore.average.toFixed(2)} が基準 ${minRunnerScore} を下回るため勝者のみ採用。`,
    };
  }

  return {
    shouldMerge: true,
    reason: `平均差 ${scoreGap.toFixed(2)} < ${gapThreshold} 且つ Runner-up 平均 ${runnerScore.average.toFixed(2)} ≥ ${minRunnerScore} のためマージ実施。`,
  };
}

export function buildMergePrompt(
  profile: CreativeRoleProfile,
  payload: CreativePromptPayload,
  winnerText: string,
  runnerText: string,
): string {
  return `ロール: ${profile.label}\n質問: ${payload.userPrompt}\n` +
    '目的: 勝者回答の骨格を維持しつつ、Runner-up が提供したユニークな洞察を1行だけ追加して品質を底上げする。\n' +
    'ルール: できるだけ短く答える/長文にしない。勝者文のトーンを維持し、Runner-up の要素は重複を避ける。\n' +
    '出力は最大2段落or4行まで。JSONにせず生テキストで返す。\n\n' +
    `勝者テキスト:\n${winnerText}\n\nRunner-up テキスト:\n${runnerText}\n\n` +
    '統合方針:\n- 勝者の骨格は残す\n- Runner-up の唯一の強みを1行で吸収\n- 余分な前置きは禁止';
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
