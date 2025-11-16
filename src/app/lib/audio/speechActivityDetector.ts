export interface SpeechActivityDetectorTuning {
  startThreshold?: number;
  stopThreshold?: number;
  minSpeechDurationMs?: number;
  minSilenceDurationMs?: number;
}

const DEFAULT_START_THRESHOLD = 0.02;
const DEFAULT_STOP_THRESHOLD = 0.01;
const DEFAULT_MIN_SPEECH_MS = 120;
const DEFAULT_MIN_SILENCE_MS = 300;

export interface SpeechActivityDetectorOptions extends SpeechActivityDetectorTuning {
  sampleRate: number;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

type SpeechState = 'silence' | 'speech';

export class SpeechActivityDetector {
  private readonly sampleRate: number;
  private readonly startThreshold: number;
  private readonly stopThreshold: number;
  private readonly minSpeechDurationMs: number;
  private readonly minSilenceDurationMs: number;
  private readonly onSpeechStart?: () => void;
  private readonly onSpeechEnd?: () => void;

  private state: SpeechState = 'silence';
  private speechAccumulatedMs = 0;
  private silenceAccumulatedMs = 0;

  constructor(options: SpeechActivityDetectorOptions) {
    this.sampleRate = options.sampleRate;
    this.startThreshold = options.startThreshold ?? DEFAULT_START_THRESHOLD;
    const derivedStop = this.startThreshold * 0.5;
    this.stopThreshold =
      options.stopThreshold ?? (derivedStop < DEFAULT_STOP_THRESHOLD ? derivedStop : DEFAULT_STOP_THRESHOLD);
    this.minSpeechDurationMs = options.minSpeechDurationMs ?? DEFAULT_MIN_SPEECH_MS;
    this.minSilenceDurationMs = options.minSilenceDurationMs ?? DEFAULT_MIN_SILENCE_MS;
    this.onSpeechStart = options.onSpeechStart;
    this.onSpeechEnd = options.onSpeechEnd;
  }

  process(frame: Float32Array) {
    if (frame.length === 0) {
      return;
    }
    const frameDurationMs = (frame.length / this.sampleRate) * 1000;
    const rms = this.computeRms(frame);

    if (this.state === 'silence') {
      if (rms >= this.startThreshold) {
        this.speechAccumulatedMs += frameDurationMs;
      } else {
        this.speechAccumulatedMs = Math.max(0, this.speechAccumulatedMs - frameDurationMs);
      }

      if (this.speechAccumulatedMs >= this.minSpeechDurationMs) {
        this.state = 'speech';
        this.silenceAccumulatedMs = 0;
        this.onSpeechStart?.();
      }
      return;
    }

    if (rms < this.stopThreshold) {
      this.silenceAccumulatedMs += frameDurationMs;
      if (this.silenceAccumulatedMs >= this.minSilenceDurationMs) {
        this.state = 'silence';
        this.speechAccumulatedMs = 0;
        this.silenceAccumulatedMs = 0;
        this.onSpeechEnd?.();
      }
      return;
    }

    this.silenceAccumulatedMs = Math.max(0, this.silenceAccumulatedMs - frameDurationMs);
  }

  reset() {
    this.state = 'silence';
    this.speechAccumulatedMs = 0;
    this.silenceAccumulatedMs = 0;
  }

  private computeRms(frame: Float32Array) {
    let sumSquares = 0;
    for (let i = 0; i < frame.length; i += 1) {
      const value = frame[i];
      sumSquares += value * value;
    }
    return Math.sqrt(sumSquares / frame.length);
  }
}
