import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getTranscriptionEventStage } from '@/shared/realtimeTranscriptionEvents';
import type { SessionStatus, SpectatorDirective, SpectatorEventLog, SpectatorTranscript } from '../types';

type TranscriptStage = 'completed' | 'delta';

interface ConnectParams {
  sessionId?: string;
  clientTag?: string;
  bffKey?: string;
  baseUrl?: string;
  label?: string;
}

interface NormalizedTranscriptEvent {
  itemId: string;
  text: string;
  stage: TranscriptStage;
  raw: any;
}

function buildUrl(params: ConnectParams): string {
  if (!params.sessionId) {
    throw new Error('sessionId is required to build stream URL');
  }
  const origin =
    params.baseUrl?.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  const url = new URL(`/api/session/${params.sessionId}/stream`, normalizedOrigin);
  if (params.bffKey) {
    url.searchParams.set('bffKey', params.bffKey);
  }
  // cache buster to avoid EventSource reuse in some browsers
  url.searchParams.set('_', Date.now().toString());
  return url.toString();
}

function safeJsonParse<T = any>(input: string): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return input as unknown as T;
  }
}

function fallbackItemId(event: any): string | null {
  if (!event || typeof event !== 'object') return null;
  return (
    event.item_id ??
    event.itemId ??
    event.item?.id ??
    event.response_id ??
    event.responseId ??
    event.id ??
    null
  );
}

function transcriptTextFromEvent(event: any, field: 'transcript' | 'delta'): string {
  const value = event?.[field] ?? event?.text ?? event?.delta ?? '';
  return typeof value === 'string' ? value : '';
}

export function normalizeTranscriptEvent(event: any): NormalizedTranscriptEvent | null {
  const stage = getTranscriptionEventStage(event);
  if (!stage) return null;
  const itemId = fallbackItemId(event);
  if (!itemId) return null;

  const text =
    stage === 'completed'
      ? transcriptTextFromEvent(event, 'transcript') || transcriptTextFromEvent(event, 'delta')
      : transcriptTextFromEvent(event, 'delta');

  return {
    itemId,
    text,
    stage,
    raw: event,
  };
}

export function upsertTranscriptItems(
  prev: SpectatorTranscript[],
  payload: NormalizedTranscriptEvent,
): SpectatorTranscript[] {
  const now = Date.now();
  const next = prev.map((item) => {
    if (item.itemId !== payload.itemId) return item;
    const mergedText =
      payload.stage === 'completed'
        ? payload.text || item.text
        : `${item.text}${payload.text}`;
    return {
      ...item,
      text: mergedText,
      status: payload.stage === 'completed' ? 'COMPLETED' : 'STREAMING',
      updatedAt: now,
      lastEventType: payload.raw?.type ?? item.lastEventType,
    };
  });

  const exists = next.some((item) => item.itemId === payload.itemId);
  if (!exists) {
    next.push({
      itemId: payload.itemId,
      text: payload.text,
      status: payload.stage === 'completed' ? 'COMPLETED' : 'STREAMING',
      updatedAt: now,
      lastEventType: payload.raw?.type,
    });
  }

  return next.slice(-50);
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}`;
}

export interface SessionSpectatorState {
  status: SessionStatus;
  transcripts: SpectatorTranscript[];
  directives: SpectatorDirective[];
  events: SpectatorEventLog[];
  lastError: string | null;
  sessionId: string | null;
  activeClientTag: string | null;
  connect: (params: ConnectParams) => Promise<void>;
  disconnect: () => void;
}

export function useSessionSpectator(): SessionSpectatorState {
  const [status, setStatus] = useState<SessionStatus>('DISCONNECTED');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeClientTag, setActiveClientTag] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<SpectatorTranscript[]>([]);
  const [directives, setDirectives] = useState<SpectatorDirective[]>([]);
  const [events, setEvents] = useState<SpectatorEventLog[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const lastConnectParamsRef = useRef<ConnectParams | null>(null);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setStatus('DISCONNECTED');
    setActiveClientTag(null);
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  const resolveSessionIdByTag = useCallback(
    async (params: ConnectParams): Promise<ConnectParams> => {
      const origin =
        params.baseUrl?.trim() ||
        (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
      const url = new URL('/api/session/resolve', normalizedOrigin);
      url.searchParams.set('clientTag', params.clientTag ?? '');
      const headers: Record<string, string> = {};
      if (params.bffKey) {
        headers['x-bff-key'] = params.bffKey;
      }
      const response = await fetch(url.toString(), { headers });
      if (response.status === 404) {
        throw new Error('resolve_not_found');
      }
      if (response.status === 401) {
        throw new Error('resolve_unauthorized');
      }
      if (!response.ok) {
        throw new Error(`resolve_failed_${response.status}`);
      }
      const payload = await response.json();
      return {
        ...params,
        sessionId: payload.sessionId,
      };
    },
    [],
  );

  const handleSseEvent = useCallback((eventName: string, data: any) => {
    setEvents((prev) => [
      {
        id: generateId('ev'),
        type: eventName,
        timestamp: Date.now(),
        data,
      },
      ...prev,
    ].slice(0, 60));

    if (eventName === 'status' && typeof data?.status === 'string') {
      const normalized = data.status.toUpperCase() as SessionStatus;
      setStatus(normalized);
      return;
    }

    if (eventName === 'transport_event') {
      const normalized = normalizeTranscriptEvent(data);
      if (normalized) {
        setTranscripts((prev) => upsertTranscriptItems(prev, normalized));
      }
      return;
    }

    if (eventName === 'voice_control') {
      setDirectives((prev) => [
        {
          id: generateId('vc'),
          action: data?.action ?? 'unknown',
          payload: data,
          timestamp: Date.now(),
        },
        ...prev,
      ].slice(0, 30));
      return;
    }

    if (eventName === 'session_error') {
      const message = data?.message ?? 'セッションエラーが発生しました';
      setLastError(message);
      setStatus('DISCONNECTED');
    }
  }, []);

  const connect = useCallback(
    async (params: ConnectParams) => {
      if (!params.sessionId && !params.clientTag) {
        setLastError('clientTag か sessionId を入力してください');
        return;
      }

      let resolvedParams = params;
      if (!params.sessionId && params.clientTag) {
        try {
          resolvedParams = await resolveSessionIdByTag(params);
        } catch (error: any) {
          const message = String(error?.message ?? '');
          if (message === 'resolve_not_found') {
            setLastError('まだ該当タグのセッションがありません。再試行します…');
            setTimeout(() => {
              void connect(params);
            }, 1000);
            return;
          }
          if (message === 'resolve_unauthorized') {
            setLastError('BFF Key がありません（?bffKey= を付けるか NEXT_PUBLIC_BFF_KEY を設定してください）。');
            return;
          }
          setLastError('クライアントタグでセッションを解決できませんでした');
          return;
        }
      }

      disconnect();
      lastConnectParamsRef.current = params;
      setSessionId(resolvedParams.sessionId ?? null);
      setActiveClientTag(params.clientTag ?? null);
      setStatus('CONNECTING');
      setTranscripts([]);
      setDirectives([]);
      setEvents([]);
      setLastError(null);

      const streamUrl = buildUrl(resolvedParams as Required<ConnectParams>);
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      const knownEvents = ['status', 'transport_event', 'voice_control', 'session_error', 'heartbeat', 'ready'];
      knownEvents.forEach((eventName) => {
        es.addEventListener(eventName, (event: MessageEvent<string>) => {
          const parsed = safeJsonParse(event.data);
          handleSseEvent(eventName, parsed);
        });
      });

      es.onopen = () => setStatus('CONNECTED');
      es.onerror = async () => {
        setLastError('SSE接続でエラーが発生しました');
        disconnect();
        if (params.clientTag) {
          const retryParams = lastConnectParamsRef.current ?? params;
          setTimeout(() => {
            void connect(retryParams);
          }, 1200);
        }
      };
    },
    [disconnect, handleSseEvent, resolveSessionIdByTag],
  );

  return useMemo(
    () => ({
      status,
      sessionId,
      activeClientTag,
      transcripts,
      directives,
      events,
      lastError,
      connect,
      disconnect,
    }),
    [status, sessionId, activeClientTag, transcripts, directives, events, lastError, connect, disconnect],
  );
}
