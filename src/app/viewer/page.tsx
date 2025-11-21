"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

import { useSessionSpectator } from "../hooks/useSessionSpectator";
import type { SessionStatus, SpectatorDirective, SpectatorEventLog, SpectatorTranscript } from "../types";

const statusStyle: Record<SessionStatus, string> = {
  DISCONNECTED: "bg-rose-500/15 text-rose-100 border border-rose-400/30",
  CONNECTING: "bg-amber-500/15 text-amber-100 border border-amber-400/30",
  CONNECTED: "bg-emerald-500/15 text-emerald-100 border border-emerald-400/30",
};

function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-semibold tracking-wide ${statusStyle[status]}`}>
      {status}
    </span>
  );
}

function TranscriptList({ transcripts }: { transcripts: SpectatorTranscript[] }) {
  if (transcripts.length === 0) {
    return <p className="text-sm text-slate-300/80">まだ文字起こしが届いていません。</p>;
  }
  const sorted = [...transcripts].sort((a, b) => a.updatedAt - b.updatedAt);
  return (
    <div className="space-y-3">
      {sorted.map((item) => (
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
      ))}
    </div>
  );
}

function DirectiveList({ directives }: { directives: SpectatorDirective[] }) {
  if (directives.length === 0) {
    return <p className="text-sm text-slate-300/80">シナリオ配信イベントはまだありません。</p>;
  }
  return (
    <ul className="space-y-2">
      {directives.map((directive) => (
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
  );
}

function EventLog({ events }: { events: SpectatorEventLog[] }) {
  if (events.length === 0) {
    return null;
  }
  return (
    <div className="rounded-lg bg-slate-900/30 border border-slate-700/40 p-3 space-y-2 max-h-64 overflow-y-auto">
      {events.slice(0, 10).map((ev) => (
        <div key={ev.id} className="text-[11px] leading-relaxed text-slate-200/80">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100">{ev.type}</span>
            <span className="text-slate-400">{new Date(ev.timestamp).toLocaleTimeString()}</span>
          </div>
          <pre className="overflow-x-auto">{JSON.stringify(ev.data ?? {}, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}

interface PanelProps {
  title: string;
  placeholder: string;
  onConnect: () => void;
  onDisconnect: () => void;
  sessionValue: string;
  onSessionChange: (value: string) => void;
  clientTagValue: string;
  onClientTagChange: (value: string) => void;
  state: ReturnType<typeof useSessionSpectator>;
}

function SessionPanel({
  title,
  placeholder,
  onConnect,
  onDisconnect,
  sessionValue,
  onSessionChange,
  clientTagValue,
  onClientTagChange,
  state,
}: PanelProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur shadow-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-200/70">{title}</p>
          <p className="text-lg font-semibold text-white mt-1">Realtime モニター</p>
        </div>
        <StatusBadge status={state.status} />
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-sm text-slate-200/80">
          クライアントタグ（推奨）
          <input
            value={clientTagValue}
            onChange={(e) => onClientTagChange(e.target.value)}
            placeholder="glasses01"
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <span className="text-xs text-slate-400">タグが一致する最新セッションに自動追従します</span>
        </label>
        <label className="text-sm text-slate-200/80">
          セッションID（手入力する場合のみ）
          <input
            value={sessionValue}
            onChange={(e) => onSessionChange(e.target.value)}
            placeholder={placeholder}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </label>
        <div className="flex gap-2">
          <button
          onClick={onConnect}
          className="flex-1 rounded-lg bg-gradient-to-r from-sky-500 to-cyan-400 text-slate-900 font-semibold py-2 shadow-lg shadow-sky-500/20 transition hover:brightness-95 disabled:opacity-50"
          disabled={!clientTagValue.trim() && !sessionValue.trim()}
        >
          接続
        </button>
          <button
            onClick={onDisconnect}
            className="rounded-lg px-4 py-2 border border-white/20 text-slate-100 hover:bg-white/10 transition"
          >
            切断
          </button>
        </div>
      </div>

      {state.lastError && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-900/30 text-rose-50 px-3 py-2 text-sm">
          {state.lastError}
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-100">文字起こし</p>
        <TranscriptList transcripts={state.transcripts} />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-100">シナリオ配信 / 音声制御</p>
        <DirectiveList directives={state.directives} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-200/80">受信イベント (最新10件)</p>
        <EventLog events={state.events} />
      </div>
    </div>
  );
}

export default function ViewerPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [bffKey, setBffKey] = useState<string>("");
  const [clientTagA, setClientTagA] = useState<string>("glasses01");
  const [clientTagB, setClientTagB] = useState<string>("glasses02");
  const [sessionA, setSessionA] = useState<string>("");
  const [sessionB, setSessionB] = useState<string>("");

  const spectatorA = useSessionSpectator();
  const spectatorB = useSessionSpectator();

  useEffect(() => {
    if (!searchParams) return;
    const initialA = searchParams.get("sessionA");
    const initialB = searchParams.get("sessionB");
    const tagA = searchParams.get("tagA");
    const tagB = searchParams.get("tagB");
    const initialKey = searchParams.get("bffKey");
    const initialBase = searchParams.get("baseUrl");
    if (initialA) setSessionA(initialA);
    if (initialB) setSessionB(initialB);
    if (tagA) setClientTagA(tagA);
    if (tagB) setClientTagB(tagB);
    if (initialKey) setBffKey(initialKey);
    if (initialBase) setBaseUrl(initialBase);
  }, [searchParams]);

  const shareLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    const params = url.searchParams;
    params.set("sessionA", sessionA);
    params.set("sessionB", sessionB);
    params.set("tagA", clientTagA);
    params.set("tagB", clientTagB);
    if (bffKey) params.set("bffKey", bffKey);
    if (baseUrl) params.set("baseUrl", baseUrl);
    url.search = params.toString();
    return url.toString();
  }, [sessionA, sessionB, clientTagA, clientTagB, bffKey, baseUrl]);

  const connectA = () =>
    spectatorA.connect({
      sessionId: sessionA.trim() || undefined,
      clientTag: clientTagA.trim() || undefined,
      bffKey,
      baseUrl,
      label: "A",
    });
  const connectB = () =>
    spectatorB.connect({
      sessionId: sessionB.trim() || undefined,
      clientTag: clientTagB.trim() || undefined,
      bffKey,
      baseUrl,
      label: "B",
    });

  const copyShareLink = async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
  };

  const clearQueries = () => {
    const basePath = window.location.pathname;
    router.replace(basePath);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
        <header className="space-y-3">
          <p className="uppercase text-[11px] tracking-[0.35em] text-sky-200/70">Spectator</p>
          <h1 className="text-3xl font-semibold">観覧専用ダッシュボード</h1>
          <p className="text-slate-200/80 leading-relaxed">
            2つのクライアント端末のセッションSSEを並列購読し、リアルタイム文字起こしとシナリオ配信イベントをモニタリングします。
            BFFキーを1回入力するだけで、複数デバイスの進捗を読み取り専用で追跡できます。
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-200/80">
            <span className="px-2 py-1 rounded-full bg-slate-800/60 border border-slate-600/60">想定タグ: develop / glasses01 / glasses02</span>
            <span className="px-2 py-1 rounded-full bg-slate-800/60 border border-slate-600/60">下のプリセットリンクで即接続</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/viewer/develop"
              className="text-xs px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition"
            >
              develop 用ビュー
            </Link>
            <Link
              href="/viewer/glasses01"
              className="text-xs px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition"
            >
              glasses01 用ビュー
            </Link>
            <Link
              href="/viewer/glasses02"
              className="text-xs px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition"
            >
              glasses02 用ビュー
            </Link>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <label className="text-sm text-slate-200/80">
              BFF Key
              <input
                value={bffKey}
                onChange={(e) => setBffKey(e.target.value)}
                placeholder="NEXT_PUBLIC_BFF_KEY"
                className="mt-1 w-64 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </label>
            <label className="text-sm text-slate-200/80">
              BFF Base URL (任意)
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="空なら同一オリジンを利用"
                className="mt-1 w-72 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </label>
            <button
              onClick={copyShareLink}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10 transition"
            >
              設定リンクをコピー
            </button>
            <button
              onClick={clearQueries}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-100 hover:bg-white/10 transition"
            >
              クエリをクリア
            </button>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <SessionPanel
            title="端末A (glasses01デフォルト)"
            placeholder="sess_xxxxx"
            onConnect={connectA}
            onDisconnect={spectatorA.disconnect}
            sessionValue={sessionA}
            onSessionChange={setSessionA}
            clientTagValue={clientTagA}
            onClientTagChange={setClientTagA}
            state={spectatorA}
          />
          <SessionPanel
            title="端末B (glasses02デフォルト)"
            placeholder="sess_yyyyy"
            onConnect={connectB}
            onDisconnect={spectatorB.disconnect}
            sessionValue={sessionB}
            onSessionChange={setSessionB}
            clientTagValue={clientTagB}
            onClientTagChange={setClientTagB}
            state={spectatorB}
          />
        </section>
      </div>
    </main>
  );
}
