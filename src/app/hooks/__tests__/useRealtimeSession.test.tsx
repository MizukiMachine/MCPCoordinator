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

const audioPlayerMock = {
  enqueue: vi.fn(),
  close: vi.fn(),
  setMuted: vi.fn(),
};

vi.mock('@/app/lib/audio/pcmPlayer', () => ({
  PcmAudioPlayer: vi.fn(() => audioPlayerMock),
}));

describe('useRealtimeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(historyHandlerSpies).forEach((spy) => spy.mockReset());
    audioPlayerMock.enqueue.mockReset();
    audioPlayerMock.close.mockReset();
    audioPlayerMock.setMuted.mockReset();
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
