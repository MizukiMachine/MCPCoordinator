"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { uiText } from "@/app/i18n";
import { FrameStreamer } from "@/app/lib/frameStreamer";

type Props = {
  disabled?: boolean;
  maxSizeBytes?: number;
  onSend: (file: File, options?: { triggerResponse?: boolean }) => Promise<void>;
};

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

type StreamState = "idle" | "camera_ready" | "streaming" | "error";

type ResolutionPreset = "640x360" | "1280x720" | "1920x1080";

export function CameraCapturePanel({ disabled = false, maxSizeBytes, onSend }: Props) {
  const [status, setStatus] = useState<StreamState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(1);
  const [resolution, setResolution] = useState<ResolutionPreset>("640x360");
  const [quality, setQuality] = useState(0.6);
  const [respondEveryFrame, setRespondEveryFrame] = useState(false);
  const [pendingResponseOnce, setPendingResponseOnce] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameStreamerRef = useRef<FrameStreamer | null>(null);

  const maxBytes = maxSizeBytes ?? DEFAULT_MAX_BYTES;
  const maxMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;

  const [resWidth, resHeight] = useMemo(() => {
    const [w, h] = resolution.split("x").map((v) => Number(v));
    return [w || 640, h || 360];
  }, [resolution]);

  const startCamera = useCallback(async () => {
    if (disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: resWidth,
          height: resHeight,
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      streamRef.current = stream;
      setStatus("camera_ready");
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "permission denied");
      setStatus("error");
    }
  }, [disabled, resHeight, resWidth]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus("idle");
  }, []);

  const captureFrame = useCallback(async (): Promise<Blob> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) {
      throw new Error(uiText.camera.errorNoStream);
    }
    canvas.width = resWidth;
    canvas.height = resHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error(uiText.camera.errorNoStream);
    }
    ctx.drawImage(video, 0, 0, resWidth, resHeight);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (!b) reject(new Error("toBlob failed"));
          else resolve(b);
        },
        "image/jpeg",
        quality,
      );
    });

    if (blob.size > maxBytes) {
      throw new Error(uiText.camera.errorMaxSize.replace("{{maxSizeMb}}", String(maxMb)));
    }

    return blob;
  }, [maxBytes, maxMb, quality, resHeight, resWidth]);

  const buildFrameStreamer = useCallback(() => {
    frameStreamerRef.current = new FrameStreamer(
      {
        fps: Math.max(0.5, Math.min(5, fps)),
        respondEveryFrame,
        initialRespond: true,
      },
      {
        captureFrame,
        sendImage: onSend,
      },
    );
  }, [captureFrame, fps, onSend, respondEveryFrame]);

  const stopStreaming = useCallback(() => {
    frameStreamerRef.current?.stop();
    setStatus((prev) => (prev === "streaming" ? "camera_ready" : prev));
  }, []);

  useEffect(() => {
    return () => {
      stopStreaming();
      stopCamera();
    };
  }, [stopCamera, stopStreaming]);

  const startStreaming = useCallback(async () => {
    if (!streamRef.current) {
      setError(uiText.camera.permissionHint);
      setStatus("error");
      return;
    }
    if (!frameStreamerRef.current) {
      buildFrameStreamer();
    } else {
      frameStreamerRef.current.updateConfig({ fps: Math.max(0.5, Math.min(5, fps)), respondEveryFrame });
    }
    try {
      await frameStreamerRef.current!.start();
      setStatus("streaming");
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "unknown error");
      setStatus("error");
    }
  }, [buildFrameStreamer, fps, respondEveryFrame]);

  const handleCaptureOnce = useCallback(async () => {
    try {
      const blob = await captureFrame();
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      await onSend(file, { triggerResponse: true });
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "capture failed");
      setStatus("error");
    }
  }, [captureFrame, onSend]);

  const handleRespondNext = useCallback(() => {
    setPendingResponseOnce(true);
    if (frameStreamerRef.current) {
      frameStreamerRef.current.requestNextResponse();
    }
  }, []);

  useEffect(() => {
    if (!pendingResponseOnce) return;
    const timeout = setTimeout(() => setPendingResponseOnce(false), 2000);
    return () => clearTimeout(timeout);
  }, [pendingResponseOnce]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case "streaming":
        return uiText.camera.statusStreaming;
      case "camera_ready":
        return uiText.camera.statusReady;
      case "error":
        return uiText.camera.statusError.replace("{{reason}}", error ?? "-");
      default:
        return uiText.camera.statusReady;
    }
  }, [error, status]);

  return (
    <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)] text-[var(--foreground)] shadow-md shadow-black/30">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{uiText.camera.title}</span>
        <span className="text-xs text-gray-500">{statusLabel}</span>
      </div>

      <div className="mt-2 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3">
        <div className="flex flex-col gap-2">
          <video
            ref={videoRef}
            className="w-full h-40 bg-black rounded-md object-contain"
            muted
            autoPlay
            playsInline
          />
          <canvas ref={canvasRef} className="hidden" />
          <button
            className="px-3 py-1 rounded-md text-sm text-white bg-[var(--accent)] hover:bg-[var(--accent-strong)] disabled:opacity-50 transition-colors"
            onClick={startCamera}
            disabled={disabled || status === "camera_ready" || status === "streaming"}
          >
            {uiText.camera.startCamera}
          </button>
          <button
            className="px-3 py-1 rounded-md text-sm text-white bg-red-600 hover:bg-red-700 border border-red-700 disabled:opacity-50 transition-colors"
            onClick={stopCamera}
            disabled={status === "idle"}
          >
            {uiText.camera.stopCamera}
          </button>
          <p className="text-xs text-gray-500">{uiText.camera.permissionHint}</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">{uiText.camera.fpsLabel}</span>
              <input
                type="number"
                min={0.5}
                max={5}
                step={0.5}
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] rounded px-2 py-1 placeholder:text-[var(--muted)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">{uiText.camera.resolutionLabel}</span>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as ResolutionPreset)}
                className="border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] rounded px-2 py-1 placeholder:text-[var(--muted)]"
              >
                <option value="640x360">640x360</option>
                <option value="1280x720">1280x720</option>
                <option value="1920x1080">1920x1080</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-xs text-gray-600">{uiText.camera.qualityLabel} ({quality.toFixed(1)})</span>
              <input
                type="range"
                min={0.3}
                max={0.9}
                step={0.1}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={respondEveryFrame}
                onChange={(e) => setRespondEveryFrame(e.target.checked)}
              />
              <span>{uiText.camera.respondEveryFrame}</span>
            </label>
            <button
              className="px-2 py-1 text-xs rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
              onClick={handleRespondNext}
              disabled={pendingResponseOnce || status !== "streaming"}
            >
              {uiText.camera.respondNextFrame}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white text-sm disabled:opacity-50 transition-colors"
              onClick={handleCaptureOnce}
              disabled={disabled || status === "idle"}
            >
              {uiText.camera.captureOnce}
            </button>
            {status === "streaming" ? (
              <button
                className="px-3 py-1 rounded-md bg-red-600 text-white text-sm"
                onClick={stopStreaming}
              >
                {uiText.camera.stopStreaming}
              </button>
            ) : (
              <button
                className="px-3 py-1 rounded-md bg-blue-600 text-white text-sm disabled:opacity-50"
                onClick={startStreaming}
                disabled={disabled || status === "idle"}
              >
                {uiText.camera.startStreaming}
              </button>
            )}
          </div>

          {error && <div className="text-xs text-red-600">{error}</div>}
          <div className="text-xs text-gray-500">
            {`最大 ${maxMb}MB / JPEG`} {status === "streaming" && "｜低fps連投中"}
            {respondEveryFrame ? "｜毎フレーム応答" : "｜応答は初回のみ"}
          </div>
        </div>
      </div>
    </div>
  );
}
