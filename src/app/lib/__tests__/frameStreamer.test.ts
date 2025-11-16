import { File } from "undici";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FrameStreamer } from "../frameStreamer";

describe("FrameStreamer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends first frame immediately with triggerResponse true by default, then false", async () => {
    const capture = vi.fn().mockResolvedValue(new Blob(["data"]));
    const sendImage = vi.fn().mockResolvedValue(undefined);
    const streamer = new FrameStreamer({ fps: 2 }, { captureFrame: capture, sendImage });

    await streamer.start();
    expect(sendImage).toHaveBeenCalledTimes(1);
    expect(sendImage).toHaveBeenLastCalledWith(expect.any(File), { triggerResponse: true });

    vi.advanceTimersByTime(600); // about one frame at 2fps (500ms)
    await Promise.resolve();

    expect(sendImage).toHaveBeenCalledTimes(2);
    expect(sendImage).toHaveBeenLastCalledWith(expect.any(File), { triggerResponse: false });
  });

  it("forces response on next frame when requestNextResponse is used", async () => {
    const capture = vi.fn().mockResolvedValue(new Blob(["data"]));
    const sendImage = vi.fn().mockResolvedValue(undefined);
    const streamer = new FrameStreamer({ fps: 1, initialRespond: false }, { captureFrame: capture, sendImage });

    await streamer.start();
    expect(sendImage).toHaveBeenLastCalledWith(expect.any(File), { triggerResponse: false });

    streamer.requestNextResponse();
    vi.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(sendImage).toHaveBeenCalledTimes(2);
    expect(sendImage).toHaveBeenLastCalledWith(expect.any(File), { triggerResponse: true });
  });

  it("drops frames while a send is in flight", async () => {
    const capture = vi.fn().mockResolvedValue(new Blob(["data"]));
    let resolveSend: (() => void) | null = null;
    const sendPromise = new Promise<void>((r) => {
      resolveSend = r;
    });
    const sendImage = vi.fn().mockReturnValue(sendPromise);
    const streamer = new FrameStreamer({ fps: 5 }, { captureFrame: capture, sendImage });

    await streamer.start();
    vi.advanceTimersByTime(500); // several ticks may occur but should be dropped
    await Promise.resolve();
    expect(sendImage).toHaveBeenCalledTimes(1);

    resolveSend?.();
    await sendPromise;
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    expect(sendImage).toHaveBeenCalledTimes(2);
  });
});
