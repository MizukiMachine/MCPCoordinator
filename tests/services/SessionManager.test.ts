import { EventEmitter } from 'node:events';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { AudioTranscoder } from '../../services/realtime/audio/AudioTranscoder';
import { SessionManager, type SessionManagerOptions } from '../../services/realtime/SessionManager';
import type { AuthContext } from '../../framework/auth/JwtVerifier';

vi.mock('@/app/agentConfigs', () => ({
  allAgentSets: {
    mock: [
      {
        name: 'mock-agent',
        instructions: 'be helpful',
      },
    ],
  },
  defaultAgentSetKey: 'mock',
}));

class FakeSession extends EventEmitter {
  transport = { sendEvent: vi.fn() };
  sendMessage = vi.fn();
  interrupt = vi.fn();
  mute = vi.fn();
  close = vi.fn();
}

describe('SessionManager', () => {
  const auth: AuthContext = { userId: 'user-1', scopes: [] };
  const transcoder: AudioTranscoder = {
    transcodeWebmOpusToLinear16: vi.fn(async (buffer: Buffer) => buffer),
  };
  let sessionFactory: ReturnType<typeof vi.fn>;
  const managers: SessionManager[] = [];

  const createManager = (overrides: Partial<SessionManagerOptions> = {}) => {
    const manager = new SessionManager({
      audioTranscoder: transcoder,
      openAiApiKey: 'test-key',
      realtimeModel: 'gpt-realtime',
      transcriptionModel: 'gpt-4o-transcribe',
      voice: 'verse',
      sessionFactory,
      ...overrides,
    });
    managers.push(manager);
    return manager;
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    (transcoder.transcodeWebmOpusToLinear16 as any).mockClear?.();
    sessionFactory = vi.fn(async () => new FakeSession());
  });

  afterEach(() => {
    managers.splice(0).forEach((manager) => manager.shutdown());
    vi.useRealTimers();
  });

  it('creates a session and returns handle', async () => {
    const manager = createManager();

    const handle = await manager.createSession({ agentKey: 'mock', auth });

    expect(handle.sessionId).toBeDefined();
    expect(handle.expiresAt).toBeInstanceOf(Date);
    expect(sessionFactory).toHaveBeenCalledTimes(1);
  });

  it('sends transcoded audio to transport when receiving audio_chunk', async () => {
    const manager = createManager();

    const handle = await manager.createSession({ agentKey: 'mock', auth });
    const record = sessionFactory.mock.results[0].value as Promise<FakeSession>;
    const fakeSession = await record;

    await manager.handleClientEvent(handle.sessionId, auth, {
      type: 'audio_chunk',
      mimeType: 'audio/webm;codecs=opus',
      data: Buffer.from('stub').toString('base64'),
    });

    expect(transcoder.transcodeWebmOpusToLinear16).toHaveBeenCalledTimes(1);
    expect(fakeSession.transport.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'input_audio_buffer.append' }),
    );
  });

  it('throws when user tries to access alien session', async () => {
    const manager = createManager();

    const handle = await manager.createSession({ agentKey: 'mock', auth });

    await expect(
      manager.handleClientEvent(handle.sessionId, { userId: 'other', scopes: [] }, { type: 'interrupt' }),
    ).rejects.toThrowError(/Forbidden/);
  });

  it('cleans up expired sessions via the background loop', async () => {
    vi.useFakeTimers();
    const manager = createManager({ sessionTtlMs: 1_000, cleanupIntervalMs: 200 });

    const handle = await manager.createSession({ agentKey: 'mock', auth });

    vi.advanceTimersByTime(1_200);

    await expect(manager.handleClientEvent(handle.sessionId, auth, { type: 'interrupt' })).rejects.toThrow(
      /not found/i,
    );

    const fakeSession = (await sessionFactory.mock.results[0].value) as FakeSession;
    expect(fakeSession.close).toHaveBeenCalledTimes(1);
  });

  it('wraps session factory failures with HttpError 502', async () => {
    const failure = new Error('boom');
    sessionFactory.mockRejectedValueOnce(failure);
    const manager = createManager();

    await expect(manager.createSession({ agentKey: 'mock', auth })).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('Failed to initialize realtime session'),
    });
  });
});
