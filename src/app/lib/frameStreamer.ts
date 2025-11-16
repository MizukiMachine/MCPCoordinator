export interface FrameStreamerConfig {
  fps: number; // frames per second (can be fractional, e.g., 1 = 1fps)
  respondEveryFrame?: boolean;
  initialRespond?: boolean;
}

export interface FrameStreamerDeps {
  captureFrame: () => Promise<Blob>; // returns an image blob to send
  sendImage: (file: File, options?: { triggerResponse?: boolean }) => Promise<void>;
  buildFileName?: () => string;
}

/**
 * FrameStreamer schedules captures at the configured fps and forwards them via sendImage.
 * - First frame is sent immediately on start().
 * - initialRespond (default true) controls whether the first frame triggers LLM response.
 * - respondEveryFrame sends triggerResponse=true on every frame when enabled.
 * - requestNextResponse() flags the next outgoing frame to trigger a response once.
 */
export class FrameStreamer {
  private readonly captureFrame: FrameStreamerDeps['captureFrame'];
  private readonly sendImage: FrameStreamerDeps['sendImage'];
  private readonly buildFileName: () => string;
  private config: FrameStreamerConfig;
  private timerId: NodeJS.Timeout | null = null;
  private running = false;
  private respondNext = false;
  private sending = false;

  constructor(config: FrameStreamerConfig, deps: FrameStreamerDeps) {
    this.config = config;
    this.captureFrame = deps.captureFrame;
    this.sendImage = deps.sendImage;
    this.buildFileName = deps.buildFileName ?? (() => `frame-${Date.now()}.jpg`);
  }

  public isRunning() {
    return this.running;
  }

  public updateConfig(next: Partial<FrameStreamerConfig>) {
    this.config = { ...this.config, ...next };
    if (this.running) {
      this.restart();
    }
  }

  public requestNextResponse() {
    this.respondNext = true;
  }

  public async start() {
    if (this.running) return;
    this.running = true;
    await this.sendFrame(true);
    this.scheduleNext();
  }

  public stop() {
    this.running = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private restart() {
    this.stop();
    void this.start();
  }

  private scheduleNext() {
    if (!this.running) return;
    const intervalMs = this.config.fps > 0 ? 1000 / this.config.fps : 2000;
    this.timerId = setTimeout(() => {
      void this.sendFrame(false).finally(() => this.scheduleNext());
    }, intervalMs);
  }

  private async sendFrame(isInitial: boolean) {
    if (this.sending) {
      // drop frame if previous send is still in flight
      return;
    }

    this.sending = true;
    try {
      const blob = await this.captureFrame();
      const file = new File([blob], this.buildFileName(), { type: 'image/jpeg' });
      const shouldRespond = this.computeTriggerResponse(isInitial);
      await this.sendImage(file, shouldRespond ? { triggerResponse: true } : { triggerResponse: false });
    } finally {
      this.sending = false;
    }
  }

  private computeTriggerResponse(isInitial: boolean): boolean {
    const { respondEveryFrame = false, initialRespond = true } = this.config;
    if (respondEveryFrame) return true;
    if (this.respondNext) {
      this.respondNext = false;
      return true;
    }
    if (isInitial) return initialRespond;
    return false;
  }
}
