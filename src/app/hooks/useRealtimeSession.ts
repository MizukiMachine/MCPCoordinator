import { useCallback, useEffect, useRef, useState } from 'react';
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

const OUTPUT_MODALITIES: Array<'text' | 'audio'> = ['audio'];
const TRANSCRIPTION_COMPLETED_EVENTS = new Set([
  'conversation.item.input_audio_transcription.completed',
  'input_audio_transcription.completed',
  'response.audio_transcript.done',
  'audio_transcript.done',
  'response.output_audio_transcript.done',
  'output_audio_transcript.done',
  'response.output_text.done',
  'output_text.done',
]);
const TRANSCRIPTION_DELTA_EVENTS = new Set([
  'response.audio_transcript.delta',
  'transcript_delta',
  'audio_transcript_delta',
  'response.output_audio_transcript.delta',
  'output_audio_transcript.delta',
  'response.output_text.delta',
  'output_text.delta',
]);

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
  const [status, setStatus] = useState<SessionStatus>('DISCONNECTED');
  const { logClientEvent, logServerEvent } = useEvent();
  const historyHandlers = useHandleSessionHistory().current;

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
      if (TRANSCRIPTION_COMPLETED_EVENTS.has(eventType)) {
        const normalized = addFallbackItemId({
          ...event,
          transcript: transcriptTextFromEvent(event, 'transcript'),
        });
        historyHandlers.handleTranscriptionCompleted(normalized);
        return;
      }
      if (TRANSCRIPTION_DELTA_EVENTS.has(eventType)) {
        const normalized = addFallbackItemId({
          ...event,
          delta: transcriptTextFromEvent(event, 'delta'),
        });
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
    manager.updateHooks({
      onStatusChange: updateStatus,
      logger: {
        info: (message, context) => logClientEvent(context ?? {}, message),
        error: (message, context) =>
          logClientEvent({ ...(context ?? {}), level: 'error' }, message),
        debug: (message, context) =>
          logClientEvent({ ...(context ?? {}), level: 'debug' }, message),
      },
      metrics: {
        increment: (name, value, tags) =>
          logClientEvent({ metric: name, value, tags }, 'metric'),
      },
      onServerEvent: (_event, payload) => logServerEvent(payload),
      guardrail: {
        onGuardrailTripped: historyHandlers.handleGuardrailTripped,
      },
    });
  }, [historyHandlers, logClientEvent, logServerEvent, updateStatus]);

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
        throw error;
      }
    },
    [applyCodec, detachSessionListeners, registerSessionListeners],
  );

  const disconnect = useCallback(() => {
    sessionManagerRef.current?.disconnect();
    detachSessionListeners();
  }, [detachSessionListeners]);

  /**
   * Throws when the underlying SessionManager is not connected.
   * Consumers should wrap calls in try/catch if they want to handle this state.
   */
  const assertConnected = () => {
    const manager = sessionManagerRef.current;
    if (!manager || manager.getStatus() === 'DISCONNECTED') {
      throw new Error('RealtimeSession not connected');
    }
  };

  const sendUserText = useCallback(
    (text: string) => {
      assertConnected();
      sessionManagerRef.current!.sendUserText(text);
    },
    [],
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
