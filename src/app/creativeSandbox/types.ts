import type { CreativeRoleKey } from './roles';

export interface CreativePromptPayload {
  role: CreativeRoleKey;
  userPrompt: string;
  contextHint?: string;
}

export interface CreativeModelResponse {
  text: string;
  latencyMs: number;
  model: string;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface ParallelCandidate extends CreativeModelResponse {
  candidateId: string;
  reasoning?: string;
}

export interface ParallelEvaluation {
  winnerId: string;
  runnerUpId?: string;
  judgeSummary: string;
  totalLatencyMs: number;
  rubric: string;
}

export interface CreativeSingleResult {
  role: CreativeRoleKey;
  prompt: string;
  answer: CreativeModelResponse;
}

export interface CreativeParallelResult {
  role: CreativeRoleKey;
  prompt: string;
  candidates: ParallelCandidate[];
  mergedAnswer: CreativeModelResponse & { sourceCandidateId?: string };
  evaluation: ParallelEvaluation;
}

export interface CreativeRunner {
  runSingle(payload: CreativePromptPayload): Promise<CreativeSingleResult>;
  runParallel(payload: CreativePromptPayload): Promise<CreativeParallelResult>;
}
