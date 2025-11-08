import { useCallback, useRef, useState } from 'react';
import {
  RealtimeSession,
  RealtimeAgent,
  OpenAIRealtimeWebRTC,
  RealtimeOutputGuardrail,
} from '@openai/agents/realtime';

import { applyCodecPreferences } from '../lib/codecUtils';
import { useEvent } from '../contexts/EventContext';
import { useHandleSessionHistory } from './useHandleSessionHistory';
import { SessionStatus } from '../types';

const DEFAULT_REALTIME_MODEL =
  process.env.NEXT_PUBLIC_REALTIME_MODEL ?? 'gpt-realtime';

const DEFAULT_TRANSCRIPTION_MODEL =
  process.env.NEXT_PUBLIC_REALTIME_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe';

const OUTPUT_MODALITIES: Array<'text' | 'audio'> = ['audio'];

export interface RealtimeSessionCallbacks {
  onConnectionChange?: (status: SessionStatus) => void;
  onAgentHandoff?: (agentName: string) => void;
}

export interface ConnectOptions {
  getEphemeralKey: () => Promise<string>;
  initialAgents: RealtimeAgent[];
  audioElement?: HTMLAudioElement;
  extraContext?: Record<string, any>;
  outputGuardrails?: RealtimeOutputGuardrail[];
}

export function useRealtimeSession(callbacks: RealtimeSessionCallbacks = {}) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>('DISCONNECTED');
  const { logClientEvent } = useEvent();
  const listenerCleanupRef = useRef<(() => void) | null>(null);

  const updateStatus = useCallback(
    (s: SessionStatus) => {
      setStatus(s);
      callbacks.onConnectionChange?.(s);
      logClientEvent({}, s);
    },
    [callbacks, logClientEvent],
  );

  const { logServerEvent } = useEvent();

  const historyHandlers = useHandleSessionHistory().current;

  const normalizeTranscriptEvent = (event: any) => {
    if (!event || typeof event !== 'object') return event;
    const fallbackId =
      event.item_id ??
      event.itemId ??
      event.item?.id ??
      event.response_id ??
      event.responseId ??
      event.id ??
      null;

    return {
      ...event,
      item_id: fallbackId,
    };
  };

  const handleTransportEvent = useCallback(
    (event: any) => {
      // Handle additional server events that aren't managed by the session
      const eventType = event?.type;
      switch (eventType) {
        case 'conversation.item.input_audio_transcription.completed':
        case 'input_audio_transcription.completed':
        case 'response.audio_transcript.done':
        case 'audio_transcript.done': {
          const normalized = normalizeTranscriptEvent({
            ...event,
            transcript: event?.transcript ?? event?.text ?? event?.delta ?? '',
          });
          historyHandlers.handleTranscriptionCompleted(normalized);
          break;
        }
        case 'response.audio_transcript.delta':
        case 'transcript_delta':
        case 'audio_transcript_delta': {
          const normalized = normalizeTranscriptEvent({
            ...event,
            delta: event?.delta ?? event?.text ?? event?.transcript ?? '',
          });
          historyHandlers.handleTranscriptionDelta(normalized);
          break;
        }
        default: {
          logServerEvent(event);
          break;
        }
      }
    },
    [historyHandlers, logServerEvent],
  );

  const codecParamRef = useRef<string>(
    (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('codec') ?? 'opus')
      : 'opus')
      .toLowerCase(),
  );

  // Wrapper to pass current codec param.
  // This lets you use the codec selector in the UI to force narrow-band (8 kHz) codecs to
  // simulate how the voice agent sounds over a PSTN/SIP phone call.
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

  const registerSessionListeners = useCallback(
    (session: RealtimeSession) => {
      detachSessionListeners();
      const disposers: Array<() => void> = [];

      const addListener = (event: string, handler: (...args: any[]) => void) => {
        (session as any).on(event, handler);
        disposers.push(() => {
          if (typeof (session as any).off === 'function') {
            (session as any).off(event, handler);
          } else if (typeof (session as any).removeListener === 'function') {
            (session as any).removeListener(event, handler);
          }
        });
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
      addListener('guardrail_tripped', historyHandlers.handleGuardrailTripped);
      addListener('transport_event', handleTransportEvent);

      listenerCleanupRef.current = () => {
        disposers.forEach((dispose) => dispose());
      };
    },
    [detachSessionListeners, handleAgentHandoff, handleTransportEvent, historyHandlers, logServerEvent],
  );

  const connect = useCallback(
    async ({
      getEphemeralKey,
      initialAgents,
      audioElement,
      extraContext,
      outputGuardrails,
    }: ConnectOptions) => {
      if (sessionRef.current) return; // already connected

      updateStatus('CONNECTING');

      try {
        const ek = await getEphemeralKey();
        const rootAgent = initialAgents[0];

        const session = new RealtimeSession(rootAgent, {
          transport: new OpenAIRealtimeWebRTC({
            audioElement,
            // Set preferred codec before offer creation
            changePeerConnection: async (pc: RTCPeerConnection) => {
              applyCodec(pc);
              return pc;
            },
          }),
          model: DEFAULT_REALTIME_MODEL,
          config: {
            outputModalities: OUTPUT_MODALITIES,
            audio: {
              input: {
                transcription: {
                  model: DEFAULT_TRANSCRIPTION_MODEL,
                },
              },
              ...(rootAgent.voice
                ? { output: { voice: rootAgent.voice } }
                : {}),
            },
          },
          outputGuardrails: outputGuardrails ?? [],
          automaticallyTriggerResponseForMcpToolCalls: true,
          context: extraContext ?? {},
        });

        sessionRef.current = session;
        registerSessionListeners(session);
        await session.connect({ apiKey: ek });
        updateStatus('CONNECTED');
      } catch (error) {
        detachSessionListeners();
        sessionRef.current?.close();
        sessionRef.current = null;
        updateStatus('DISCONNECTED');
        throw error;
      }
    },
    [detachSessionListeners, registerSessionListeners, updateStatus],
  );

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      detachSessionListeners();
      sessionRef.current.close();
      sessionRef.current = null;
    }
    updateStatus('DISCONNECTED');
  }, [detachSessionListeners, updateStatus]);

  const assertconnected = () => {
    if (!sessionRef.current) throw new Error('RealtimeSession not connected');
  };

  /* ----------------------- message helpers ------------------------- */

  const interrupt = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);
  
  const sendUserText = useCallback((text: string) => {
    assertconnected();
    sessionRef.current!.sendMessage(text);
  }, []);

  const sendEvent = useCallback((ev: any) => {
    sessionRef.current?.transport.sendEvent(ev);
  }, []);

  const mute = useCallback((m: boolean) => {
    sessionRef.current?.mute(m);
  }, []);

  const pushToTalkStart = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.clear' } as any);
  }, []);

  const pushToTalkStop = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.commit' } as any);
    sessionRef.current.transport.sendEvent({ type: 'response.create' } as any);
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
