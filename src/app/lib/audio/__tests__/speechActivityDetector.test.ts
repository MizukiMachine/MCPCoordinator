import { describe, expect, it, vi } from 'vitest';

import { SpeechActivityDetector } from '../speechActivityDetector';

function createFrame(length: number, value: number) {
  const frame = new Float32Array(length);
  frame.fill(value);
  return frame;
}

describe('SpeechActivityDetector', () => {
  it('fires onSpeechStart only after sustained energy above threshold', () => {
    const onSpeechStart = vi.fn();
    const detector = new SpeechActivityDetector({
      sampleRate: 24000,
      minSpeechDurationMs: 150,
      startThreshold: 0.02,
      onSpeechStart,
    });

    detector.process(createFrame(4096, 0.001));
    detector.process(createFrame(4096, 0.015));
    expect(onSpeechStart).not.toHaveBeenCalled();

    detector.process(createFrame(4096, 0.05));
    expect(onSpeechStart).toHaveBeenCalledTimes(1);

    detector.process(createFrame(4096, 0.08));
    expect(onSpeechStart).toHaveBeenCalledTimes(1);
  });

  it('resets to silence after quiet frames so speech can be detected again', () => {
    const onSpeechStart = vi.fn();
    const detector = new SpeechActivityDetector({
      sampleRate: 24000,
      minSpeechDurationMs: 100,
      minSilenceDurationMs: 200,
      startThreshold: 0.03,
      stopThreshold: 0.01,
      onSpeechStart,
    });

    detector.process(createFrame(4096, 0.04));
    detector.process(createFrame(4096, 0.04));
    expect(onSpeechStart).toHaveBeenCalledTimes(1);

    detector.process(createFrame(4096, 0.0));
    detector.process(createFrame(4096, 0.0));
    detector.process(createFrame(4096, 0.0));

    detector.process(createFrame(4096, 0.05));
    detector.process(createFrame(4096, 0.05));
    expect(onSpeechStart).toHaveBeenCalledTimes(2);
  });
});
