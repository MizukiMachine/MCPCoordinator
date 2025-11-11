// Central re-exports so agent files don’t need to reach deep into the SDK path
export { tool } from '@openai/agents/realtime';
export type { RealtimeAgent, FunctionTool } from '@openai/agents/realtime';

// ---------------------------------------------------------------------------
// Parallel expert contest shared contracts (Step2)
// ---------------------------------------------------------------------------

export interface ExpertContestRoleDefinition {
  id: string;
  title: string;
  instructions: string;
  focus: string;
  // Optional guardrail keywords or disclaimers each expert must include.
  complianceNotes?: string[];
}

export interface ExpertContestRequest {
  contestId: string;
  scenario: string;
  language: string;
  userPrompt: string;
  relaySummary?: string;
  sharedContext?: string[];
  evaluationRubric: string;
  experts: ExpertContestRoleDefinition[];
  metadata?: Record<string, any>;
}

export interface ExpertContestSubmission {
  expertId: string;
  outputText: string;
  latencyMs: number;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface ExpertPanelScore {
  expertId: string;
  totalScore: number;
  confidence: number;
  rationale: string;
  categoryBreakdown?: Record<string, number>;
}

export interface ExpertContestResponse {
  contestId: string;
  scenario: string;
  winnerId: string;
  runnerUpId: string;
  judgeSummary: string;
  totalLatencyMs: number;
  submissions: ExpertContestSubmission[];
  scores: ExpertPanelScore[];
  metadata?: Record<string, any>;
}

export interface ExpertContestDecision {
  winnerId: string;
  runnerUpId: string;
  tieBreaker?: 'score' | 'confidence' | 'latency';
}
