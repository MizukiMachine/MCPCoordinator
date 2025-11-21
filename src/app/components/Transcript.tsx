"use-client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { TranscriptItem } from "@/app/types";
import Image from "next/image";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { DownloadIcon, ClipboardCopyIcon } from "@radix-ui/react-icons";
import { GuardrailChip } from "./GuardrailChip";
import { formatUiText, uiText } from "../i18n";

export interface TranscriptProps {
  userText: string;
  setUserText: (val: string) => void;
  onSendMessage: () => void;
  canSend: boolean;
  downloadRecording: () => void;
}

function Transcript({
  userText,
  setUserText,
  onSendMessage,
  canSend,
  downloadRecording,
}: TranscriptProps) {
  const { transcriptItems, toggleTranscriptItemExpand } = useTranscript();
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [prevLogs, setPrevLogs] = useState<TranscriptItem[]>([]);
  const [justCopied, setJustCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function scrollToBottom() {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }

  useEffect(() => {
    const hasNewMessage = transcriptItems.length > prevLogs.length;
    const hasUpdatedMessage = transcriptItems.some((newItem, index) => {
      const oldItem = prevLogs[index];
      return (
        oldItem &&
        (newItem.title !== oldItem.title || newItem.data !== oldItem.data)
      );
    });

    if (hasNewMessage || hasUpdatedMessage) {
      scrollToBottom();
    }

    setPrevLogs(transcriptItems);
  }, [transcriptItems]);

  // Autofocus on text box input on load
  useEffect(() => {
    if (canSend && inputRef.current) {
      inputRef.current.focus();
    }
  }, [canSend]);

  const handleCopyTranscript = async () => {
    if (!transcriptRef.current) return;
    try {
      await navigator.clipboard.writeText(transcriptRef.current.innerText);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy transcript:", error);
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-[var(--surface)] min-h-0 rounded-xl border border-[var(--border)] shadow-lg shadow-black/30">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-6 py-3 sticky top-0 z-10 text-base border-b border-[var(--border)] bg-[var(--surface-muted)] rounded-t-xl">
          <span className="font-semibold text-[var(--foreground)]">{uiText.transcript.title}</span>
          <div className="flex gap-x-2">
            <button
              onClick={handleCopyTranscript}
              className="w-24 text-sm px-3 py-1 rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-muted)] flex items-center justify-center gap-x-1 transition-colors"
            >
              <ClipboardCopyIcon />
              {justCopied
                ? uiText.transcript.copiedLabel
                : uiText.transcript.copyLabel}
            </button>
            <button
              onClick={downloadRecording}
              className="w-40 text-sm px-3 py-1 rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-muted)] flex itemscenter justify-center gap-x-1 transition-colors"
            >
              <DownloadIcon />
              <span>{uiText.transcript.downloadAudioLabel}</span>
            </button>
          </div>
        </div>

        {/* Transcript Content */}
        <div
          ref={transcriptRef}
          className="overflow-auto p-4 flex flex-col gap-y-4 h-full bg-[var(--surface)] text-[var(--foreground)]"
        >
          {[...transcriptItems]
            .sort((a, b) => a.createdAtMs - b.createdAtMs)
            .map((item) => {
              const {
                itemId,
                type,
                role,
                data,
                expanded,
                timestamp,
                title = "",
                isHidden,
                guardrailResult,
                attachments = [],
              } = item;

            if (isHidden) {
              return null;
            }

            if (type === "MESSAGE") {
              const isUser = role === "user";
              const containerClasses = `flex justify-end flex-col ${
                isUser ? "items-end" : "items-start"
              }`;
              const bubbleBase = `max-w-lg p-3 ${
                isUser
                  ? "bg-gradient-to-br from-slate-800 to-slate-900 text-slate-100"
                  : "bg-[var(--surface-muted)] text-[var(--foreground)]"
              }`;
              const isBracketedMessage =
                title.startsWith("[") && title.endsWith("]");
              const messageStyle = isBracketedMessage
                ? 'italic text-gray-400'
                : '';
              const displayTitle = isBracketedMessage
                ? title.slice(1, -1)
                : title;
              const attachmentsToShow = Array.isArray(attachments) ? attachments : [];

              return (
                <div key={itemId} className={containerClasses}>
                  <div className="max-w-lg">
                    <div
                      className={`${bubbleBase} rounded-t-xl ${
                        guardrailResult ? "" : "rounded-b-xl"
                      }`}
                    >
                      <div
                        className={`text-xs ${
                          isUser ? "text-slate-400" : "text-slate-400"
                        } font-mono`}
                      >
                        {timestamp}
                      </div>
                      <div className={`whitespace-pre-wrap ${messageStyle}`}>
                        <ReactMarkdown>{displayTitle}</ReactMarkdown>
                      </div>
                    </div>
                    {attachmentsToShow.length > 0 && (
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {attachmentsToShow.map((att, idx) => (
                          <div
                            key={`${itemId}-att-${idx}`}
                            className="border border-[var(--border)] rounded-md p-1 bg-[var(--surface)] shadow-sm"
                          >
                            {att.mimeType === "application/pdf" ? (
                              <div className="text-xs text-gray-700 px-2 py-4 min-w-24 text-center">
                                PDF
                              </div>
                            ) : (
                              <Image
                                src={att.url}
                                alt={att.name ?? `attachment-${idx + 1}`}
                                width={160}
                                height={160}
                                className="max-h-32 rounded object-contain"
                                unoptimized
                              />
                            )}
                            <div className="text-[10px] text-gray-500 mt-1 px-1">
                              {att.name ?? att.mimeType}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {guardrailResult && (
                      <div className="bg-[var(--surface-muted)]/80 px-3 py-2 rounded-b-xl border-t border-[var(--border)]">
                        <GuardrailChip guardrailResult={guardrailResult} />
                      </div>
                    )}
                  </div>
                </div>
              );
            } else if (type === "BREADCRUMB") {
              return (
                <div
                  key={itemId}
                  className="flex flex-col justify-start items-start text-[var(--muted)] text-sm"
                >
                  <span className="text-xs font-mono">{timestamp}</span>
                  <div
                    className={`whitespace-pre-wrap flex items-center font-mono text-sm text-[var(--foreground)] ${
                      data ? "cursor-pointer" : ""
                    }`}
                    onClick={() => data && toggleTranscriptItemExpand(itemId)}
                  >
                    {data && (
                      <span
                        className={`text-gray-400 mr-1 transform transition-transform duration-200 select-none font-mono ${
                          expanded ? "rotate-90" : "rotate-0"
                        }`}
                      >
                        ▶
                      </span>
                    )}
                    {title}
                  </div>
                  {expanded && data && (
                    <div className="text-[var(--foreground)] text-left">
                      <pre className="border-l-2 ml-1 border-[var(--border)] whitespace-pre-wrap break-words font-mono text-xs mb-2 mt-2 pl-2">
                        {JSON.stringify(data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            } else {
              // Fallback if type is neither MESSAGE nor BREADCRUMB
              return (
                <div
                  key={itemId}
                  className="flex justify-center text-[var(--muted)] text-sm italic font-mono"
                >
                  {formatUiText(uiText.transcript.unknownItemTypeTemplate, {
                    type,
                  })}{" "}
                  <span className="ml-2 text-xs">{timestamp}</span>
                </div>
              );
            }
          })}
        </div>
      </div>

      <div className="p-4 flex items-center gap-x-2 flex-shrink-0 border-t border-[var(--border)] bg-[var(--surface-muted)] rounded-b-xl">
        <input
          ref={inputRef}
          type="text"
          value={userText}
          onChange={(e) => setUserText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSend) {
              onSendMessage();
            }
          }}
          className="flex-1 px-4 py-2 focus:outline-none bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] rounded-lg placeholder:text-[var(--muted)]"
          placeholder={uiText.transcript.placeholder}
        />
        <button
          onClick={onSendMessage}
          disabled={!canSend || !userText.trim()}
          className="bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white rounded-full px-2 py-2 disabled:opacity-50 transition-colors shadow-md shadow-[var(--accent)]/30"
        >
          <Image
            src="arrow.svg"
            alt={uiText.transcript.sendIconAlt}
            width={24}
            height={24}
          />
        </button>
      </div>
    </div>
  );
}

export default Transcript;
