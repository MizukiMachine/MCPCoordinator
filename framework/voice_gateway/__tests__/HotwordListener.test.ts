import { describe, it, expect, beforeEach } from 'vitest';

import {
  HotwordListener,
  type HotwordDictionary,
  type HotwordMatch,
} from '../HotwordListener';

const baseDictionary: HotwordDictionary = {
  entries: [
    { scenarioKey: 'graffity', aliases: ['graffity', 'グラフィティ'] },
    { scenarioKey: 'kate', aliases: ['kate', 'ケイト'] },
  ],
};

describe('HotwordListener', () => {
  let matches: HotwordMatch[];
  let invalidItemIds: string[];
  let timeoutTriggered: boolean;
  let now: number;

  beforeEach(() => {
    matches = [];
    invalidItemIds = [];
    timeoutTriggered = false;
    now = 0;
  });

  const buildListener = (override: Partial<ConstructorParameters<typeof HotwordListener>[0]> = {}) =>
    new HotwordListener({
      dictionary: baseDictionary,
      reminderTimeoutMs: 5000,
      clock: () => now,
      onMatch: (match) => matches.push(match),
      onInvalidTranscript: (payload) => invalidItemIds.push(payload.itemId),
      onTimeout: () => {
        timeoutTriggered = true;
      },
      ...override,
    });

  const completedEvent = (itemId: string, transcript: string) => ({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: itemId,
    transcript,
  });

  it('detects a hotword and extracts the scenario key and command text', () => {
    const listener = buildListener();
    listener.handleTranscriptionEvent(completedEvent('msg_1', 'Hey Graffity, play my playlist'));

    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual(
      expect.objectContaining({
        scenarioKey: 'graffity',
        commandText: 'play my playlist',
        itemId: 'msg_1',
      }),
    );
    expect(invalidItemIds).toHaveLength(0);
  });

  it('normalizes aliases including Japanese characters', () => {
    const listener = buildListener();
    listener.handleTranscriptionEvent(completedEvent('msg_2', 'Hey ケイト 今日の予定を教えて'));

    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual(
      expect.objectContaining({
        scenarioKey: 'kate',
        commandText: '今日の予定を教えて',
        itemId: 'msg_2',
      }),
    );
  });

  it('marks transcripts without hotwords as invalid and triggers timeout only once', () => {
    const listener = buildListener();

    listener.handleTranscriptionEvent(completedEvent('msg_3', 'Can you help me?'));
    expect(matches).toHaveLength(0);
    expect(invalidItemIds).toEqual(['msg_3']);
    expect(timeoutTriggered).toBe(false);

    now += 6000;
    listener.handleTranscriptionEvent(completedEvent('msg_4', 'Still no hotword here'));
    expect(timeoutTriggered).toBe(true);

    now += 6000;
    listener.handleTranscriptionEvent(completedEvent('msg_5', 'Another attempt without prefix'));
    expect(timeoutTriggered).toBe(true);
    expect(invalidItemIds).toEqual(['msg_3', 'msg_4', 'msg_5']);
  });

  it('resets timeout window after a successful hotword match', () => {
    const listener = buildListener();

    listener.handleTranscriptionEvent(completedEvent('msg_6', 'No wake phrase'));
    now += 6000;
    listener.handleTranscriptionEvent(completedEvent('msg_7', 'Hey Graffity, open calendar'));
    expect(timeoutTriggered).toBe(false);
    expect(matches).toHaveLength(1);

    now += 6000;
    listener.handleTranscriptionEvent(completedEvent('msg_8', 'Missing prefix again'));
    expect(timeoutTriggered).toBe(false);
  });

  it('ignores non-transcription transport events', () => {
    const listener = buildListener();

    listener.handleTranscriptionEvent({
      type: 'response.output_audio.delta',
      delta: 'PCM',
    } as any);

    expect(matches).toHaveLength(0);
    expect(invalidItemIds).toHaveLength(0);
  });
});
