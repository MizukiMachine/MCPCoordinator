import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RealtimeAgent,
  RealtimeOutputGuardrail,
} from '@openai/agents/realtime';

import { applyCodecPreferences } from '../lib/codecUtils';
import { useEvent } from '../contexts/EventContext';
import { useHandleSessionHistory } from './useHandleSessionHistory';
import { SessionStatus } from '../types';
import type { ISessionManager, SessionManagerHooks } from '../../../services/realtime/types';
import { getSessionManager } from '@/app/lib/realtime/sessionManagerLocator';
import { createConsoleMetricEmitter } from '../../../framework/metrics/metricEmitter';
import { createStructuredLogger } from '../../../framework/logging/structuredLogger';

const OUTPUT_MODALITIES: Array<'text' | 'audio'> = ['audio'];
type TranscriptEventStage = 'completed' | 'delta';
const TRANSCRIPTION_EVENT_KIND: Record<string, TranscriptEventStage> = {
  'conversation.item.input_audio_transcription.completed': 'completed',
  'input_audio_transcription.completed': 'completed',
  'response.audio_transcript.done': 'completed',
  'audio_transcript.done': 'completed',
  'response.output_audio_transcript.done': 'completed',
  'output_audio_transcript.done': 'completed',
  'response.output_text.done': 'completed',
  'output_text.done': 'completed',
  'response.audio_transcript.delta': 'delta',
  transcript_delta: 'delta',
  audio_transcript_delta: 'delta',
  'response.output_audio_transcript.delta': 'delta',
  'output_audio_transcript.delta': 'delta',
  'response.output_text.delta': 'delta',
  'output_text.delta': 'delta',
} as const;

function addFallbackItemId(event: any) {
  if (!event || typeof event !== 'object') return event;
  const fallbackId =
    event.item_id ??
    event.itemId ??
    event.item?.id ??
    event.response_id ??
    event.responseId ??
    event.id ??
    null;
  return fallbackId && event.item_id !== fallbackId
    ? {
        ...event,
        item_id: fallbackId,
      }
    : event;
}

function transcriptTextFromEvent(event: any, field: 'transcript' | 'delta') {
  const value = event?.[field] ?? event?.text ?? event?.delta ?? '';
  return typeof value === 'string' ? value : '';
}

export interface RealtimeSessionCallbacks {
  onConnectionChange?: (status: SessionStatus) => void;
  onAgentHandoff?: (agentName: string) => void;
}

export interface ConnectOptions {
  getEphemeralKey: () => Promise<string>;
  agentSetKey: string;
  preferredAgentName?: string;
  audioElement?: HTMLAudioElement | null;
  extraContext?: Record<string, any>;
  outputGuardrails?: RealtimeOutputGuardrail[];
}

export interface RealtimeSessionHookOverrides {
  createSessionManager?: () => ISessionManager<RealtimeAgent>;
  initialSessionHooks?: SessionManagerHooks;
}

export function useRealtimeSession(
  callbacks: RealtimeSessionCallbacks = {},
  overrides: RealtimeSessionHookOverrides = {},
) {
  const sessionManagerRef = useRef<ISessionManager<RealtimeAgent> | null>(null);
  const listenerCleanupRef = useRef<(() => void) | null>(null);
  const sessionMetadataRef = useRef<{ sessionId: string | null }>({ sessionId: null });
  const metricEmitterRef = useRef(createConsoleMetricEmitter('client.session_manager'));
  const [status, setStatus] = useState<SessionStatus>('DISCONNECTED');
  const { logClientEvent, logServerEvent, setSessionMetadata, generateRequestId } = useEvent();
  const historyHandlers = useHandleSessionHistory().current;

  const assignSessionId = useCallback(() => {
    const nextSessionId = generateRequestId();
    sessionMetadataRef.current.sessionId = nextSessionId;
    setSessionMetadata({ sessionId: nextSessionId });
    return nextSessionId;
  }, [generateRequestId, setSessionMetadata]);

  const clearSessionId = useCallback(() => {
    sessionMetadataRef.current.sessionId = null;
    setSessionMetadata({ sessionId: null });
  }, [setSessionMetadata]);

  const structuredLogger = useMemo(
    () =>
      createStructuredLogger({
        component: 'session_manager',
        sink: (level, message, context) => {
          const sessionId = sessionMetadataRef.current.sessionId;
          logClientEvent(
            {
              type: 'session.log',
              level,
              message,
              context,
            },
            `session.${level}`,
            { sessionId },
          );
        },
      }),
    [logClientEvent],
  );

  const updateStatus = useCallback(
    (s: SessionStatus) => {
      setStatus(s);
      callbacks.onConnectionChange?.(s);
      logClientEvent({ type: 'session_status', status: s }, 'session_status');
    },
    [callbacks, logClientEvent],
  );

  if (!sessionManagerRef.current) {
    const createManager =
      overrides.createSessionManager ??
      (() =>
        getSessionManager({
          hooks: overrides.initialSessionHooks,
          transport: {
            defaultOutputModalities: OUTPUT_MODALITIES,
          },
        }));
    sessionManagerRef.current = createManager();
  }

  const handleTransportEvent = useCallback(
    (event: any) => {
      const eventType = event?.type;
      const stage = eventType ? TRANSCRIPTION_EVENT_KIND[eventType] : undefined;
      if (!stage) {
        return;
      }

      const payloadKey = stage === 'completed' ? 'transcript' : 'delta';
      const normalized = addFallbackItemId({
        ...event,
        [payloadKey]: transcriptTextFromEvent(event, payloadKey),
      });

      if (stage === 'completed') {
        historyHandlers.handleTranscriptionCompleted(normalized);
      } else {
        historyHandlers.handleTranscriptionDelta(normalized);
      }
    },
    [historyHandlers],
  );

  const codecParamRef = useRef<string>(
    (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('codec') ?? 'opus')
      : 'opus'
    ).toLowerCase(),
  );

  const applyCodec = useCallback(
    (pc: RTCPeerConnection) => applyCodecPreferences(pc, codecParamRef.current),
    [],
  );

  const handleAgentHandoff = useCallback(
    (item: any) => {
      const history = Array.isArray(item?.context?.history)
        ? item.context.history
        : [];
      const lastMessage = history[history.length - 1];
      const handoffName =
        typeof lastMessage?.name === 'string'
          ? lastMessage.name.split('transfer_to_')[1] ?? lastMessage.name
          : null;

      if (handoffName) {
        callbacks.onAgentHandoff?.(handoffName);
      } else {
        logServerEvent({
          type: 'agent_handoff_warning',
          message: 'Received agent_handoff event without a parsable target',
          payload: item,
        });
      }
    },
    [callbacks, logServerEvent],
  );

  const detachSessionListeners = useCallback(() => {
    listenerCleanupRef.current?.();
    listenerCleanupRef.current = null;
  }, []);

  const registerSessionListeners = useCallback(() => {
    const manager = sessionManagerRef.current;
    if (!manager) return;
    detachSessionListeners();
    const disposers: Array<() => void> = [];

    const addListener = (event: string, handler: (...args: any[]) => void) => {
      manager.on(event, handler);
      disposers.push(() => manager.off(event, handler));
    };

    addListener('error', (message: unknown) => {
      logServerEvent({
        type: 'error',
        message,
      });
    });
    addListener('agent_handoff', handleAgentHandoff);
    addListener('agent_tool_start', historyHandlers.handleAgentToolStart);
    addListener('agent_tool_end', historyHandlers.handleAgentToolEnd);
    addListener('history_updated', historyHandlers.handleHistoryUpdated);
    addListener('history_added', historyHandlers.handleHistoryAdded);
    addListener('transport_event', handleTransportEvent);

    listenerCleanupRef.current = () => {
      disposers.forEach((dispose) => dispose());
    };
  }, [
    detachSessionListeners,
    handleAgentHandoff,
    handleTransportEvent,
    historyHandlers.handleAgentToolEnd,
    historyHandlers.handleAgentToolStart,
    historyHandlers.handleHistoryAdded,
    historyHandlers.handleHistoryUpdated,
    logServerEvent,
  ]);

  useEffect(() => {
    const manager = sessionManagerRef.current;
    if (!manager) return;
    const metricRecorder = {
      increment: (name: string, value?: number, tags?: Record<string, string>) => {
        const sessionId = sessionMetadataRef.current.sessionId;
        metricEmitterRef.current.increment(name, value ?? 1, {
          ...(tags ?? {}),
          sessionId: sessionId ?? 'unassigned',
        });
        logClientEvent(
          {
            type: 'metric.increment',
            metric: name,
            value: value ?? 1,
            tags: {
              ...(tags ?? {}),
              sessionId,
            },
          },
          'metric.increment',
          { sessionId },
        );
      },
      observe: (name: string, value: number, tags?: Record<string, string>) => {
        const sessionId = sessionMetadataRef.current.sessionId;
        metricEmitterRef.current.observe(name, value, {
          ...(tags ?? {}),
          sessionId: sessionId ?? 'unassigned',
        });
        logClientEvent(
          {
            type: 'metric.observe',
            metric: name,
            value,
            tags: {
              ...(tags ?? {}),
              sessionId,
            },
          },
          'metric.observe',
          { sessionId },
        );
      },
    };

    manager.updateHooks({
      onStatusChange: updateStatus,
      logger: structuredLogger,
      metrics: metricRecorder,
      onServerEvent: (_event, payload) => logServerEvent(payload),
      guardrail: {
        onGuardrailTripped: historyHandlers.handleGuardrailTripped,
      },
    });
  }, [historyHandlers, logClientEvent, logServerEvent, structuredLogger, updateStatus]);

  const connect = useCallback(
    async ({
      getEphemeralKey,
      agentSetKey,
      preferredAgentName,
      audioElement,
      extraContext,
      outputGuardrails,
    }: ConnectOptions) => {
      const manager = sessionManagerRef.current;
      if (!manager) {
        throw new Error('SessionManager is not initialized');
      }

      assignSessionId();
      try {
        await manager.connect({
          getEphemeralKey,
          agentSetKey,
          preferredAgentName,
          audioElement,
          extraContext,
          outputGuardrails,
          outputModalities: OUTPUT_MODALITIES,
          transportOverrides: {
            changePeerConnection: applyCodec,
          },
        });
        registerSessionListeners();
      } catch (error) {
        detachSessionListeners();
        clearSessionId();
        throw error;
      }
    },
    [applyCodec, assignSessionId, clearSessionId, detachSessionListeners, registerSessionListeners],
  );

  const disconnect = useCallback(() => {
    sessionManagerRef.current?.disconnect();
    detachSessionListeners();
    clearSessionId();
  }, [clearSessionId, detachSessionListeners]);

  const sendUserText = useCallback(
    (text: string) => {
      const manager = sessionManagerRef.current;
      if (!manager || manager.getStatus() === 'DISCONNECTED') {
        logClientEvent(
          {
            type: 'session_warning',
            message: 'sendUserText ignored because realtime session is disconnected',
          },
          'session_warning',
        );
        return;
      }

      manager.sendUserText(text);
    },
    [logClientEvent],
  );

  const sendEvent = useCallback(
    (ev: any) => {
      sessionManagerRef.current?.sendEvent(ev);
    },
    [],
  );

  const mute = useCallback(
    (m: boolean) => {
      sessionManagerRef.current?.mute(m);
    },
    [],
  );

  const interrupt = useCallback(() => {
    sessionManagerRef.current?.interrupt();
  }, []);

  const pushToTalkStart = useCallback(() => {
    sessionManagerRef.current?.pushToTalkStart();
  }, []);

  const pushToTalkStop = useCallback(() => {
    sessionManagerRef.current?.pushToTalkStop();
  }, []);

  return {
    status,
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    mute,
    pushToTalkStart,
    pushToTalkStop,
    interrupt,
  } as const;
}
