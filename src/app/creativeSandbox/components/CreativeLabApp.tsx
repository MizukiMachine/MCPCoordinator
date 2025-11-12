"use client";

import React, { useMemo, useState } from 'react';

import {
  type CandidateAverageScore,
  creativeRoleOptions,
  getCreativeRoleProfile,
  type CreativeRoleKey,
} from '@/app/creativeSandbox/roles';
import type {
  JudgeResult,
  CreativeParallelResult,
  CreativePromptPayload,
  CreativeSingleResult,
} from '@/app/creativeSandbox/types';

type RunStatus = 'idle' | 'running' | 'error' | 'success';

async function postJson<T>(url: string, payload: CreativePromptPayload): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = 'Unknown error';
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function formatLatency(latencyMs?: number) {
  if (!latencyMs && latencyMs !== 0) return 'n/a';
  return `${latencyMs.toLocaleString()} ms`;
}

function formatTokens(tokens?: { totalTokens?: number }) {
  if (!tokens?.totalTokens) return 'n/a';
  return `${tokens.totalTokens} tok`;
}

export default function CreativeLabApp() {
  const [role, setRole] = useState<CreativeRoleKey>('filmCritic');
  const [userPrompt, setUserPrompt] = useState('');
  const [contextHint, setContextHint] = useState('');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [singleResult, setSingleResult] = useState<CreativeSingleResult | null>(null);
  const [parallelResult, setParallelResult] = useState<CreativeParallelResult | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  const roleProfile = useMemo(() => getCreativeRoleProfile(role), [role]);

  const isRunDisabled = status === 'running' || userPrompt.trim().length === 0;

  const runExperiment = async () => {
    if (isRunDisabled) return;
    setStatus('running');
    setError(null);

    const payload: CreativePromptPayload = {
      role,
      userPrompt: userPrompt.trim(),
      contextHint: contextHint.trim() || undefined,
    };

    try {
      const [single, parallel] = await Promise.all([
        postJson<CreativeSingleResult>('/api/creativeSandbox/single', payload),
        postJson<CreativeParallelResult>('/api/creativeSandbox/parallel', payload),
      ]);

      setSingleResult(single);
      setParallelResult(parallel);
      setStatus('success');
      setLastRunAt(new Date());
    } catch (err: any) {
      console.error('creative sandbox run failed', err);
      setError(err?.message ?? 'Failed to run experiment');
      setStatus('error');
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runExperiment();
  };

  const handleReset = () => {
    setSingleResult(null);
    setParallelResult(null);
    setError(null);
    setLastRunAt(null);
    setStatus('idle');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-12 space-y-10">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-emerald-300">Developer Sandbox</p>
          <h1 className="text-3xl font-semibold">Creative Parallel Lab</h1>
          <p className="text-slate-300 text-base">
            テキスト入力で映画/文学/コピーの各ロールを検証し、単独回答と4並列+評価エージェントの差分を比較します。
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col text-sm font-medium gap-1">
              <span>ロール選択</span>
              <select
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-base"
                value={role}
                onChange={(event) => setRole(event.target.value as CreativeRoleKey)}
              >
                {creativeRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-400">{roleProfile.description}</span>
            </label>

            <label className="flex flex-col text-sm font-medium gap-1">
              <span>コンテキスト（任意）</span>
              <input
                value={contextHint}
                onChange={(event) => setContextHint(event.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-base"
                placeholder="例: Z世代向け、ネタバレ禁止など"
              />
            </label>
          </div>

          <label className="flex flex-col text-sm font-medium gap-2">
            <span>ユーザー質問</span>
            <textarea
              value={userPrompt}
              onChange={(event) => setUserPrompt(event.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 min-h-[140px] text-base"
              placeholder="例: 80年代SF映画リメイクの独自視点を3行で提案して"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="bg-emerald-400/80 hover:bg-emerald-400 text-slate-900 font-semibold px-5 py-2 rounded-xl disabled:opacity-40"
              disabled={isRunDisabled}
            >
              {status === 'running' ? '実行中…' : '並列比較を実行'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="border border-slate-600 hover:border-slate-400 text-slate-200 px-4 py-2 rounded-xl"
            >
              リセット
            </button>
            {lastRunAt && (
              <span className="text-sm text-slate-400 self-center">
                最終実行: {lastRunAt.toLocaleTimeString()}
              </span>
            )}
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </form>

        <section className="grid gap-6 md:grid-cols-2">
          <ResultCard
            title="単独 gpt-5-mini"
            subtitle="同一システムプロンプトで単独推論"
            status={status}
            result={singleResult}
          />
          <ParallelResultCard status={status} result={parallelResult} />
        </section>
      </div>
    </div>
  );
}

interface ResultCardProps {
  title: string;
  subtitle: string;
  status: RunStatus;
  result: CreativeSingleResult | null;
}

function ResultCard({ title, subtitle, status, result }: ResultCardProps) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
      <header>
        <p className="text-xs uppercase tracking-widest text-slate-400">{subtitle}</p>
        <h2 className="text-xl font-semibold">{title}</h2>
      </header>
      {status === 'running' && <p className="text-sm text-slate-400">生成中…</p>}
      {result ? (
        <div className="space-y-3">
          <p className="text-base whitespace-pre-wrap leading-relaxed">{result.answer.text}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm text-slate-400">
            <div>
              <dt className="text-xs uppercase tracking-wide">Latency</dt>
              <dd>{formatLatency(result.answer.latencyMs)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide">Tokens</dt>
              <dd>{formatTokens(result.answer.tokenUsage)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="text-sm text-slate-500">未実行です。</p>
      )}
    </article>
  );
}

interface ParallelCardProps {
  status: RunStatus;
  result: CreativeParallelResult | null;
}

function ParallelResultCard({ status, result }: ParallelCardProps) {
  const winnerId = result?.evaluation.winnerId;
  const runnerUpId = result?.evaluation.runnerUpId;

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-widest text-slate-400">4並列 + 評価AI</p>
        <h2 className="text-xl font-semibold">Parallel Merge</h2>
      </header>
      {status === 'running' && <p className="text-sm text-slate-400">評価エージェントが集計中…</p>}
      {result ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-emerald-300 font-medium">最終回答</p>
            <p className="mt-1 text-base whitespace-pre-wrap leading-relaxed">{result.mergedAnswer.text}</p>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm text-slate-400">
            <div>
              <dt className="text-xs uppercase tracking-wide">総Latency</dt>
              <dd>{formatLatency(result.evaluation.totalLatencyMs)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide">Tokens (judge)</dt>
              <dd>{formatTokens(result.mergedAnswer.tokenUsage)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide">Winner</dt>
              <dd>{winnerId ?? 'n/a'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide">Runner Up</dt>
              <dd>{runnerUpId ?? 'n/a'}</dd>
            </div>
          </dl>

          <div className="text-sm text-slate-300">
            <p className="font-medium">審査サマリ</p>
            <p className="mt-1 whitespace-pre-wrap">{result.evaluation.judgeSummary}</p>
          </div>

          <div className="text-sm text-slate-300">
            <p className="font-medium">決定理由</p>
            <p className="mt-1 whitespace-pre-wrap">{result.evaluation.decisionReason}</p>
          </div>

          <ScoreTable
            averages={result.evaluation.averages}
            winnerId={winnerId ?? ''}
            runnerUpId={runnerUpId}
          />

          <JudgePanelList judges={result.evaluation.judges} />

          <div className="space-y-3">
            <p className="text-sm text-slate-400">候補回答</p>
            <div className="space-y-3">
              {result.candidates.map((candidate) => {
                const isWinner = candidate.candidateId === winnerId;
                const isRunnerUp = candidate.candidateId === runnerUpId;
                return (
                  <div
                    key={candidate.candidateId}
                    className={`rounded-xl border p-3 text-sm whitespace-pre-wrap leading-relaxed ${
                      isWinner
                        ? 'border-emerald-400/60 bg-emerald-400/5'
                        : isRunnerUp
                          ? 'border-sky-400/40 bg-sky-400/5'
                          : 'border-slate-700 bg-slate-950'
                    }`}
                  >
                    <div className="flex justify-between text-xs font-semibold uppercase tracking-wide mb-2">
                      <span>
                        {candidate.candidateId}
                        {isWinner && ' · WINNER'}
                        {isRunnerUp && !isWinner && ' · RUNNER-UP'}
                      </span>
                      <span>{formatLatency(candidate.latencyMs)}</span>
                    </div>
                    {candidate.text}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">未実行です。</p>
      )}
    </article>
  );
}

function ScoreTable({
  averages,
  winnerId,
  runnerUpId,
}: {
  averages: CandidateAverageScore[];
  winnerId: string;
  runnerUpId?: string;
}) {
  if (!averages.length) return null;
  return (
    <div className="text-sm text-slate-300">
      <p className="font-medium mb-2">平均スコア (0-10)</p>
      <div className="space-y-2">
        {averages.map((item) => {
          const isWinner = item.candidateId === winnerId;
          const isRunner = item.candidateId === runnerUpId;
          return (
            <div
              key={item.candidateId}
              className={`flex justify-between rounded-lg border px-3 py-2 ${
                isWinner
                  ? 'border-emerald-400/60 bg-emerald-400/5'
                  : isRunner
                    ? 'border-sky-400/40 bg-sky-400/5'
                    : 'border-slate-700'
              }`}
            >
              <span>
                {item.candidateId}
                {isWinner && ' · WINNER'}
                {isRunner && !isWinner && ' · RUNNER-UP'}
              </span>
              <span>
                {item.average.toFixed(2)}点 / {item.votes}票
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JudgePanelList({ judges }: { judges: JudgeResult[] }) {
  if (!judges.length) return null;
  return (
    <div className="space-y-3 text-sm text-slate-300">
      <p className="font-medium">審判スコア詳細</p>
      {judges.map((judge) => (
        <div key={judge.judgeId} className="rounded-xl border border-slate-700 px-3 py-3">
          <div className="flex justify-between text-xs uppercase tracking-wide text-slate-400 mb-1">
            <span>{judge.judgeId}</span>
            <span>{judge.focus}</span>
          </div>
          <p className="text-slate-200 text-xs mb-2">{judge.notes}</p>
          <div className="space-y-1">
            {judge.candidateScores.map((score) => (
              <div key={`${judge.judgeId}-${score.candidateId}`} className="flex justify-between">
                <span>{score.candidateId}</span>
                <span>{score.score.toFixed(2)}点 · {score.rationale}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
