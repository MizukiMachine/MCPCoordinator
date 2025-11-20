/// <reference types="vitest" />
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeAgent } from '@openai/agents/realtime';

import type { ISessionManager } from '../../../realtime/types';
import { ServerHotwordCueService, type HotwordCueRequest } from '../hotwordCueService';

const createStubManager = () => {
  const stub: Partial<ISessionManager<RealtimeAgent>> = {
    getStatus: vi.fn(() => 'CONNECTED'),
    updateHooks: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendUserText: vi.fn(),
    sendEvent: vi.fn(),
    interrupt: vi.fn(),
    mute: vi.fn(),
    pushToTalkStart: vi.fn(),
    pushToTalkStop: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  return stub as ISessionManager<RealtimeAgent>;
};

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  with: vi.fn(() => logger),
};

const metrics = {
  increment: vi.fn(),
  observe: vi.fn(),
};

describe('ServerHotwordCueService', () => {
  const audioPath = path.join(process.cwd(), 'public', 'audio', 'hotword-chime.wav');
  let manager: ISessionManager<RealtimeAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createStubManager();
  });

  const buildRequest = (overrides: Partial<HotwordCueRequest> = {}): HotwordCueRequest => ({
    sessionId: 'sess_test',
    scenarioKey: 'demo',
    transcript: 'Hey demo, 在庫を確認して',
    manager,
    ...overrides,
  });

  it('sends cancel and response events with metadata when the cue is available', async () => {
    const service = new ServerHotwordCueService({
      audioFilePath: audioPath,
      logger,
      metrics,
    });

    const result = await service.playCue(buildRequest());

    expect(result.status).toBe('streamed');
    expect(manager.sendEvent).toHaveBeenCalledWith({ type: 'response.cancel' });
    const responseCall = vi.mocked(manager.sendEvent).mock.calls.find(
      ([event]) => event?.type === 'response.create',
    );
    expect(responseCall?.[0]?.response?.metadata).toMatchObject({
      tags: ['hotword-chime'],
      scenarioKey: 'demo',
    });
    expect(metrics.increment).toHaveBeenCalledWith(
      'bff.session.hotword_cue_emitted_total',
      1,
      expect.objectContaining({ scenario: 'demo' }),
    );
  });

  it('returns a fallback status when the audio file is missing', async () => {
    const service = new ServerHotwordCueService({
      audioFilePath: path.join(process.cwd(), 'public', 'audio', 'missing.wav'),
      logger,
      metrics,
    });

    const result = await service.playCue(buildRequest());

    expect(result.status).toBe('fallback');
    expect(manager.sendEvent).not.toHaveBeenCalled();
    expect(metrics.increment).toHaveBeenCalledWith(
      'bff.session.hotword_cue_failed_total',
      1,
      expect.objectContaining({ scenario: 'demo' }),
    );
  });
});
