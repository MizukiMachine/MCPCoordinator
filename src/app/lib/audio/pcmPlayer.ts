const DEFAULT_SAMPLE_RATE = 24000;

export class PcmAudioPlayer {
  private readonly audioContext: AudioContext;
  private readonly gainNode: GainNode;
  private scheduledTime = 0;
  private readonly activeSources = new Set<AudioBufferSourceNode>();

  constructor(options: { sampleRate?: number } = {}) {
    const context = new AudioContext({ sampleRate: options.sampleRate ?? DEFAULT_SAMPLE_RATE });
    this.audioContext = context;
    this.gainNode = context.createGain();
    this.gainNode.connect(context.destination);
  }

  setMuted(muted: boolean) {
    this.gainNode.gain.value = muted ? 0 : 1;
  }

  async enqueue(base64: string) {
    if (!base64) return;
    const audioBuffer = this.decodePcmChunk(base64);
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode);
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
    };
    const startTime = Math.max(this.audioContext.currentTime, this.scheduledTime);
    source.start(startTime);
    this.scheduledTime = startTime + audioBuffer.duration;
  }

  stop() {
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch (error) {
        console.warn('Failed to stop audio source', error);
      }
    });
    this.activeSources.clear();
    this.scheduledTime = this.audioContext.currentTime;
  }

  close() {
    try {
      this.stop();
      this.audioContext.close();
    } catch (error) {
      console.warn('Failed to close AudioContext', error);
    }
  }

  private decodePcmChunk(base64: string): AudioBuffer {
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i += 1) {
      view[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(buffer);
    const floatData = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) {
      floatData[i] = int16[i] / 32768;
    }
    const audioBuffer = this.audioContext.createBuffer(1, floatData.length, this.audioContext.sampleRate);
    audioBuffer.copyToChannel(floatData, 0);
    return audioBuffer;
  }
}
