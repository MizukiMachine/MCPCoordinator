"use client";

import React, { useEffect, useMemo } from "react";
import { notFound } from "next/navigation";

import { useSessionSpectator } from "@/app/hooks/useSessionSpectator";

const VALID_TAGS = new Set(["develop", "glasses01", "glasses02"]);

export default function SingleViewer({ params }: { params: { clientTag: string } }) {
  const tag = params.clientTag;
  const isValid = VALID_TAGS.has(tag);
  const spectator = useSessionSpectator();

  useEffect(() => {
    if (!isValid) return;
    void spectator.connect({ clientTag: tag });
  }, [isValid, spectator, tag]);

  const badge = useMemo(
    () => ({
      develop: "開発ブラウザ",
      glasses01: "ARグラス #1",
      glasses02: "ARグラス #2",
    }[tag as keyof typeof VALID_TAGS] ?? tag),
    [tag],
  );

  if (!isValid) {
    return notFound();
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-200/70">Spectator</p>
            <h1 className="text-2xl font-semibold mt-1">{badge} をモニター</h1>
            <p className="text-slate-200/80 text-sm mt-2">
              クライアントタグ「{tag}」に紐づく最新セッションを自動追従します。セッションが切り替わっても再解決して購読し直します。
            </p>
          </div>
          <div className="text-xs px-3 py-1 rounded-full bg-slate-800/60 border border-white/10">
            {spectator.status}
          </div>
        </div>

        {spectator.lastError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-900/30 text-rose-50 px-3 py-2 text-sm">
            {spectator.lastError}
          </div>
        )}

        <section className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur shadow-2xl p-5 space-y-3">
            <div className="text-xs text-slate-300/80">
              現在の sessionId: {spectator.sessionId ?? "解決中…"}
            </div>
            <div className="space-y-2">
              {spectator.transcripts.length === 0 ? (
                <p className="text-sm text-slate-300/80">まだ文字起こしが届いていません。</p>
              ) : (
                spectator.transcripts
                  .slice()
                  .sort((a, b) => a.updatedAt - b.updatedAt)
                  .map((item) => (
                    <div
                      key={item.itemId}
                      className="rounded-lg bg-slate-900/40 border border-slate-700/40 p-3 shadow-md"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-300/70 mb-2">
                        <span className="uppercase tracking-wide">
                          {item.status === "STREAMING" ? "Streaming" : "Completed"}
                        </span>
                        <span>{new Date(item.updatedAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed text-slate-50">{item.text || "…"}</p>
                      {item.lastEventType && (
                        <p className="text-[11px] text-sky-200/70 mt-2">event: {item.lastEventType}</p>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur shadow-2xl p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-100">シナリオ配信 / 音声制御</p>
            {spectator.directives.length === 0 ? (
              <p className="text-sm text-slate-300/80">まだイベントはありません。</p>
            ) : (
              <ul className="space-y-2">
                {spectator.directives.map((directive) => (
                  <li
                    key={directive.id}
                    className="rounded-md bg-gradient-to-r from-indigo-900/40 to-sky-900/40 border border-indigo-700/30 px-3 py-2"
                  >
                    <div className="flex items-center justify-between text-xs text-indigo-100/80 mb-1">
                      <span className="font-semibold">{directive.action}</span>
                      <span>{new Date(directive.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <pre className="text-[11px] text-indigo-100/90 overflow-x-auto">
                      {JSON.stringify(directive.payload ?? {}, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
