import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ScenarioRouter } from '../ScenarioRouter';
import type { VoiceControlHandlers } from '../../../src/shared/voiceControl';
import type { HotwordMatch } from '../../../framework/voice_gateway/HotwordListener';

describe('ScenarioRouter', () => {
  const makeMatch = (overrides: Partial<HotwordMatch> = {}): HotwordMatch => ({
    scenarioKey: 'graffity',
    commandText: '注文状況を教えて',
    itemId: 'msg_a',
    transcript: 'Hey Graffity, 注文状況を教えて',
    ...overrides,
  });

  let voiceControl: VoiceControlHandlers;
  let forwarder: {
    replaceTranscriptWithText: ReturnType<typeof vi.fn>;
    interruptActiveResponse: ReturnType<typeof vi.fn>;
  };
  let router: ScenarioRouter;

  beforeEach(() => {
    voiceControl = {
      requestScenarioChange: vi.fn().mockResolvedValue({ success: true }),
      requestAgentChange: vi.fn().mockResolvedValue({ success: true }),
    } satisfies VoiceControlHandlers;

    forwarder = {
      replaceTranscriptWithText: vi.fn(),
      interruptActiveResponse: vi.fn(),
    };

    router = new ScenarioRouter({
      currentScenarioKey: 'graffity',
      voiceControl,
      forwarder,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });
  });

  it('forwards commands when the hotword matches the current scenario', async () => {
    await router.handleHotwordMatch(makeMatch());

    expect(forwarder.replaceTranscriptWithText).toHaveBeenCalledTimes(1);
    expect(forwarder.replaceTranscriptWithText).toHaveBeenCalledWith(makeMatch());
    expect(voiceControl.requestScenarioChange).not.toHaveBeenCalled();
  });

  it('requests a scenario change and cancels audio when a different hotword is detected', async () => {
    const match = makeMatch({
      scenarioKey: 'kate',
      commandText: '今日の予定を教えて',
    });

    await router.handleHotwordMatch(match);

    expect(forwarder.replaceTranscriptWithText).not.toHaveBeenCalled();
    expect(forwarder.interruptActiveResponse).toHaveBeenCalledTimes(1);
    expect(voiceControl.requestScenarioChange).toHaveBeenCalledWith('kate', {
      initialCommand: '今日の予定を教えて',
    });
  });

  it('drops empty commands even when the scenario matches', async () => {
    await router.handleHotwordMatch(makeMatch({ commandText: '' }));

    expect(forwarder.replaceTranscriptWithText).not.toHaveBeenCalled();
    expect(voiceControl.requestScenarioChange).not.toHaveBeenCalled();
  });
});
