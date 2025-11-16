import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { createTransportEventHandler, useRealtimeSession } from '../useRealtimeSession';

const logClientEvent = vi.fn();
const logServerEvent = vi.fn();
const setSessionMetadata = vi.fn();
const generateRequestId = vi.fn(() => 'req-test');

vi.mock('../../contexts/EventContext', () => ({
  useEvent: () => ({
    logClientEvent,
    logServerEvent,
    setSessionMetadata,
    generateRequestId,
  }),
}));

const historyHandlerSpies = {
  handleAgentToolStart: vi.fn(),
  handleAgentToolEnd: vi.fn(),
  handleHistoryUpdated: vi.fn(),
  handleHistoryAdded: vi.fn(),
  handleTranscriptionDelta: vi.fn(),
  handleTranscriptionCompleted: vi.fn(),
  handleGuardrailTripped: vi.fn(),
};

vi.mock('../useHandleSessionHistory', () => ({
  useHandleSessionHistory: () => ({ current: historyHandlerSpies }),
}));

const audioPlayerMock = vi.hoisted(() => ({
  enqueue: vi.fn(),
  close: vi.fn(),
  setMuted: vi.fn(),
  stop: vi.fn(),
}));
const pcmPlayerCtor = vi.hoisted(() =>
  vi.fn(function MockedPcmAudioPlayer() {
    return audioPlayerMock;
  }),
);

vi.mock('@/app/lib/audio/pcmPlayer', () => ({
  PcmAudioPlayer: pcmPlayerCtor,
}));

describe('useRealtimeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(historyHandlerSpies).forEach((spy) => spy.mockReset());
    audioPlayerMock.enqueue.mockReset();
    audioPlayerMock.close.mockReset();
    audioPlayerMock.setMuted.mockReset();
    audioPlayerMock.stop.mockReset();
    pcmPlayerCtor.mockClear();
  });

  it('forwards the outputText capability to the session API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createMockResponse({
        sessionId: 'sess_1',
        streamUrl: '/api/session/sess_1/stream',
        allowedModalities: ['audio'],
        capabilityWarnings: [],
      }),
    );
    const stubEventSource = createStubEventSource();

    const { result } = renderHook(() =>
      useRealtimeSession(
        {},
        {
          fetchImpl,
          createEventSource: () => stubEventSource,
        },
      ),
    );

    await act(async () => {
      await result.current.connect({
        agentSetKey: 'demo',
        clientCapabilities: { outputText: false },
      });
    });

    const requestInit = fetchImpl.mock.calls[0]?.[1];
    const body = JSON.parse((requestInit!.body ?? '{}') as string);
    expect(body.clientCapabilities).toEqual({ audio: true, outputText: false });
  });

  it('exposes sendAudioChunk that suppresses commit/response by default', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({
          sessionId: 'sess_pcm',
          streamUrl: '/api/session/sess_pcm/stream',
          allowedModalities: ['audio'],
          capabilityWarnings: [],
        }),
      )
      .mockResolvedValue(createMockResponse({ accepted: true }));
    const stubEventSource = createStubEventSource();
    const { result } = renderHook(() =>
      useRealtimeSession(
        {},
        {
          fetchImpl,
          createEventSource: () => stubEventSource,
        },
      ),
    );

    await act(async () => {
      await result.current.connect({ agentSetKey: 'demo' });
    });

    await act(async () => {
      await result.current.sendAudioChunk('BASE64_CHUNK');
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [, eventArgs] = fetchImpl.mock.calls;
    expect(eventArgs?.[0]).toBe('/api/session/sess_pcm/event');
    const body = JSON.parse((eventArgs?.[1]?.body ?? '{}') as string);
    expect(body).toEqual({
      kind: 'input_audio',
      audio: 'BASE64_CHUNK',
      commit: false,
      response: false,
    });
  });

  it('allows overriding commit/response flags when sending audio chunks', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({
          sessionId: 'sess_pcm2',
          streamUrl: '/api/session/sess_pcm2/stream',
          allowedModalities: ['audio'],
          capabilityWarnings: [],
        }),
      )
      .mockResolvedValue(createMockResponse({ accepted: true }));
    const stubEventSource = createStubEventSource();
    const { result } = renderHook(() =>
      useRealtimeSession(
        {},
        {
          fetchImpl,
          createEventSource: () => stubEventSource,
        },
      ),
    );

    await act(async () => {
      await result.current.connect({ agentSetKey: 'demo' });
    });

    await act(async () => {
      await result.current.sendAudioChunk('FINAL_CHUNK', { commit: true, response: true });
    });

    const [, eventArgs] = fetchImpl.mock.calls;
    const body = JSON.parse((eventArgs?.[1]?.body ?? '{}') as string);
    expect(body.commit).toBe(true);
    expect(body.response).toBe(true);
  });

  it('stops local playback when interrupt is triggered', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse({
          sessionId: 'sess_interrupt',
          streamUrl: '/api/session/sess_interrupt/stream',
          allowedModalities: ['audio'],
          capabilityWarnings: [],
        }),
      )
      .mockResolvedValue(createMockResponse({ accepted: true }));
    const stubEventSource = createStubEventSource();
    const { result } = renderHook(() =>
      useRealtimeSession(
        {},
        {
          fetchImpl,
          createEventSource: () => stubEventSource,
        },
      ),
    );

    await act(async () => {
      await result.current.connect({ agentSetKey: 'demo' });
    });

    const transportListener = stubEventSource.addEventListener.mock.calls.find(
      ([eventName]) => eventName === 'transport_event',
    )?.[1];

    if (transportListener) {
      await act(async () => {
        transportListener({
          data: JSON.stringify({ type: 'response.output_audio.delta', delta: 'PCM' }),
        } as MessageEvent<string>);
      });
    }

    await act(async () => {
      result.current.interrupt();
      await Promise.resolve();
    });

    expect(audioPlayerMock.stop).toHaveBeenCalled();
    const [, eventArgs] = fetchImpl.mock.calls;
    expect(eventArgs?.[0]).toBe('/api/session/sess_interrupt/event');
    const body = JSON.parse((eventArgs?.[1]?.body ?? '{}') as string);
    expect(body).toEqual({ kind: 'control', action: 'interrupt' });
  });

  it('propagates voice_control events to the provided callback', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        createMockResponse({
          sessionId: 'sess_voice',
          streamUrl: '/api/session/sess_voice/stream',
          allowedModalities: ['audio'],
          capabilityWarnings: [],
        }),
      );
    const stubEventSource = createStubEventSource();
    const voiceCallback = vi.fn();

    const { result } = renderHook(() =>
      useRealtimeSession(
        {
          onVoiceControlDirective: voiceCallback,
        },
        {
          fetchImpl,
          createEventSource: () => stubEventSource,
        },
      ),
    );

    await act(async () => {
      await result.current.connect({ agentSetKey: 'demo' });
    });

    const listener = stubEventSource.addEventListener.mock.calls.find(
      ([eventName]) => eventName === 'voice_control',
    )?.[1];
    expect(listener).toBeInstanceOf(Function);

    await act(async () => {
      listener?.({
        data: JSON.stringify({ action: 'switchScenario', scenarioKey: 'simpleHandoff' }),
      } as MessageEvent<string>);
    });

    expect(voiceCallback).toHaveBeenCalledWith({
      action: 'switchScenario',
      scenarioKey: 'simpleHandoff',
    });
  });
});

describe('createTransportEventHandler', () => {
  it('routes audio deltas to the PCM player when unmuted', () => {
    const enqueue = vi.fn();
    const handler = createTransportEventHandler({
      ensureAudioPlayer: () => ({ enqueue } as any),
      historyHandlers: {
        handleTranscriptionCompleted: vi.fn(),
        handleTranscriptionDelta: vi.fn(),
      },
      audioMutedRef: { current: false },
      textOutputEnabledRef: { current: true },
    });

    handler({ type: 'response.output_audio.delta', delta: 'pcm-chunk' });
    expect(enqueue).toHaveBeenCalledWith('pcm-chunk');
  });

  it('skips transcription handlers when text output is disabled', () => {
    const historyHandlers = {
      handleTranscriptionCompleted: vi.fn(),
      handleTranscriptionDelta: vi.fn(),
    };
    const handler = createTransportEventHandler({
      ensureAudioPlayer: () => ({ enqueue: vi.fn() } as any),
      historyHandlers,
      audioMutedRef: { current: false },
      textOutputEnabledRef: { current: false },
    });

    handler({ type: 'response.output_text.delta', delta: 'partial text' });
    handler({
      type: 'response.output_text.done',
      transcript: 'final text',
    });

    expect(historyHandlers.handleTranscriptionDelta).not.toHaveBeenCalled();
    expect(historyHandlers.handleTranscriptionCompleted).not.toHaveBeenCalled();
  });

  it('invokes transcription handlers when text output is enabled', () => {
    const historyHandlers = {
      handleTranscriptionCompleted: vi.fn(),
      handleTranscriptionDelta: vi.fn(),
    };
    const handler = createTransportEventHandler({
      ensureAudioPlayer: () => ({ enqueue: vi.fn() } as any),
      historyHandlers,
      audioMutedRef: { current: true },
      textOutputEnabledRef: { current: true },
    });

    handler({ type: 'response.output_text.delta', delta: 'partial text' });
    handler({
      type: 'response.output_text.done',
      transcript: 'final text',
      item_id: 'item-42',
    });

    expect(historyHandlers.handleTranscriptionDelta).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 'partial text' }),
    );
    expect(historyHandlers.handleTranscriptionCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: 'final text', item_id: 'item-42' }),
    );
  });
});

function createMockResponse(body: any, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function createStubEventSource(): EventSource {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  } as unknown as EventSource;
}
