"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useState } from "react";

import { uiText } from "@/app/i18n";

type Props = {
  disabled?: boolean;
  maxSizeBytes?: number;
  onSend: (file: File, caption?: string) => Promise<void>;
};

type UploadState = "idle" | "uploading" | "done" | "error";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

const takeFirstFile = (list: FileList | File[] | null | undefined) => {
  if (!list) return null;
  const byItem = typeof (list as FileList).item === "function" ? (list as FileList).item(0) : null;
  return byItem ?? (list as File[])[0] ?? null;
};

export function ImageUploadPanel({ disabled = false, maxSizeBytes, onSend }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const maxBytes = maxSizeBytes ?? DEFAULT_MAX_BYTES;
  const maxMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFiles = useCallback(
    (next: File | null) => {
      if (!next) return;
      if (next.size > maxBytes) {
        setError(
          uiText.upload.errorPrefix.replace("{{reason}}", `ファイルサイズが ${maxMb}MB を超えています`)
        );
        setFile(null);
        setPreviewUrl(null);
        return;
      }
      setError(null);
      setFile(next);
      const nextUrl = URL.createObjectURL(next);
      setPreviewUrl(nextUrl);
      setStatus("idle");
    },
    [maxBytes, maxMb],
  );

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    handleFiles(takeFirstFile(event.dataTransfer?.files ?? null));
  };

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    handleFiles(takeFirstFile(event.target.files));
  };

  const handleSend = async () => {
    if (!file || disabled) return;
    try {
      setStatus("uploading");
      setError(null);
      await onSend(file, caption || undefined);
      setStatus("done");
      setCaption("");
      setFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    } catch (err: any) {
      const reason = err?.message ?? "unknown";
      setError(uiText.upload.errorPrefix.replace("{{reason}}", reason));
      setStatus("error");
    }
  };

  return (
    <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)] text-[var(--foreground)] shadow-md shadow-black/30">
      <div className="flex justify-between items-center">
        <span className="font-semibold text-sm text-[var(--foreground)]">{uiText.upload.title}</span>
        <span className="text-xs text-[var(--muted)]">
          {uiText.upload.sizeNote.replace("{{maxSizeMb}}", String(maxMb))}
        </span>
      </div>

      <div
        className="mt-2 border-2 border-dashed border-[var(--border)] rounded-md p-3 text-sm text-[var(--foreground)] bg-[var(--surface-muted)] hover:bg-[var(--surface)] transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        data-testid="drop-area"
      >
        <p className="mb-2">{uiText.upload.dropHint}</p>
        <div className="flex items-center gap-2">
          <label className="px-3 py-1 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white text-sm cursor-pointer transition-colors">
            {uiText.upload.selectLabel}
            <input
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={handleInputChange}
              data-testid="file-input"
            />
          </label>
          {file && <span className="text-xs text-[var(--foreground)]">{file.name}</span>}
          {!file && <span className="text-xs text-[var(--muted)]">{uiText.upload.statusReady}</span>}
        </div>
        {previewUrl && file?.type !== "application/pdf" && (
          <div className="mt-2">
            <Image
              src={previewUrl}
              alt={file?.name ?? "preview"}
              width={160}
              height={160}
              className="max-h-40 rounded border border-[var(--border)] object-contain"
              unoptimized
            />
          </div>
        )}
        {file?.type === "application/pdf" && (
          <div className="mt-2 text-xs text-[var(--foreground)]">PDF: {file.name}</div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <input
          type="text"
          placeholder={uiText.upload.captionPlaceholder}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="border border-[var(--border)] rounded px-2 py-1 text-sm bg-[var(--surface)] text-[var(--foreground)] placeholder:text-[var(--muted)]"
          data-testid="caption-input"
        />
        <div className="flex items-center justify-between">
          <button
            onClick={handleSend}
            disabled={!file || disabled || status === "uploading"}
            className="px-3 py-1 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white text-sm disabled:opacity-50 transition-colors"
            data-testid="send-image-button"
          >
            {status === "uploading" ? uiText.upload.statusUploading : uiText.upload.sendLabel}
          </button>
          <div className="text-xs text-[var(--muted)]">
            {status === "done"
              ? uiText.upload.statusDone
              : status === "error"
                ? error
                : status === "uploading"
                  ? uiText.upload.statusUploading
                  : uiText.upload.statusReady}
          </div>
        </div>
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>
    </div>
  );
}
