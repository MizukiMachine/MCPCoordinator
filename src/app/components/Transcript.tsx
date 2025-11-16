"use-client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { TranscriptItem } from "@/app/types";
import Image from "next/image";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { DownloadIcon, ClipboardCopyIcon } from "@radix-ui/react-icons";
import { GuardrailChip } from "./GuardrailChip";
import { formatUiText, uiText } from "../i18n";

interface ScoreSnapshot {
  expertId: string;
  totalScore?: number;
  confidence?: number;
  latencyMs?: number;
}

interface ExpertContestBreadcrumbData {
  type: "expertContestResult";
  contestId: string;
  scenario: string;
  totalLatencyMs: number;
  tieBreaker?: string;
  judgeSummary: string;
  winner?: ScoreSnapshot;
  runnerUp?: ScoreSnapshot;
  topScores?: ScoreSnapshot[];
  baselineAnswer?: string;
  preset?: string;
}

const formatScore = (value?: number) =>
  typeof value === "number" ? value.toFixed(1) : "—";
const formatConfidence = (value?: number) =>
  typeof value === "number" ? value.toFixed(2) : "—";
const formatLatency = (value?: number) =>
  typeof value === "number" ? `${value} ms` : "—";

const ExpertContestSummaryCard = ({ data }: { data: ExpertContestBreadcrumbData }) => {
  const contestText = uiText.transcript.expertContest;
  const topScores = Array.isArray(data.topScores) ? data.topScores.slice(0, 4) : [];

  return (
    <div className="mt-2 w-full rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-gray-900">
      <div className="font-semibold text-indigo-900 mb-1">{contestText.title}</div>
      {data.preset && (
        <div className="text-xs text-gray-600 mb-1">Preset: {data.preset}</div>
      )}
      <div className="flex flex-col gap-1 text-xs">
        <div>
          <span className="font-semibold">{contestText.winnerLabel}: </span>
          <span>{data.winner?.expertId ?? "—"}</span>
          <span className="ml-2 text-gray-600">
            {formatScore(data.winner?.totalScore)} / {formatConfidence(data.winner?.confidence)} /{" "}
            {formatLatency(data.winner?.latencyMs)}
          </span>
        </div>
        <div>
          <span className="font-semibold">{contestText.runnerUpLabel}: </span>
          <span>{data.runnerUp?.expertId ?? "—"}</span>
          <span className="ml-2 text-gray-600">
            {formatScore(data.runnerUp?.totalScore)} / {formatConfidence(data.runnerUp?.confidence)} /{" "}
            {formatLatency(data.runnerUp?.latencyMs)}
          </span>
        </div>
        <div>
          <span className="font-semibold">{contestText.totalLatencyLabel}: </span>
          <span>{formatLatency(data.totalLatencyMs)}</span>
        </div>
        {data.tieBreaker && (
          <div>
            <span className="font-semibold">{contestText.tieBreakerLabel}: </span>
            <span>{data.tieBreaker}</span>
          </div>
        )}
        <div className="mt-1">
          <span className="font-semibold">{contestText.judgeSummaryLabel}: </span>
          <span>{data.judgeSummary || "—"}</span>
        </div>
        {data.baselineAnswer && (
          <div className="mt-1">
            <span className="font-semibold">{contestText.baselineLabel}: </span>
            <span className="whitespace-pre-wrap">{data.baselineAnswer}</span>
          </div>
        )}
      </div>
      {topScores.length > 0 && (
        <div className="mt-3">
          <div className="font-semibold text-xs text-indigo-900">{contestText.scoreboardLabel}</div>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full text-xs font-mono text-gray-800">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-3">{contestText.expertHeading}</th>
                  <th className="py-1 pr-3">{contestText.scoreHeading}</th>
                  <th className="py-1 pr-3">{contestText.confidenceHeading}</th>
                  <th className="py-1">{contestText.latencyHeading}</th>
                </tr>
              </thead>
              <tbody>
                {topScores.map((score) => (
                  <tr key={`${data.contestId}-${score.expertId}`} className="border-t border-indigo-100">
                    <td className="py-1 pr-3">{score.expertId}</td>
                    <td className="py-1 pr-3">{formatScore(score.totalScore)}</td>
                    <td className="py-1 pr-3">{formatConfidence(score.confidence)}</td>
                    <td className="py-1">{formatLatency(score.latencyMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

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
    <div className="flex flex-col flex-1 bg-white min-h-0 rounded-xl">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-6 py-3 sticky top-0 z-10 text-base border-b bg-white rounded-t-xl">
          <span className="font-semibold">{uiText.transcript.title}</span>
          <div className="flex gap-x-2">
            <button
              onClick={handleCopyTranscript}
              className="w-24 text-sm px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center gap-x-1"
            >
              <ClipboardCopyIcon />
              {justCopied
                ? uiText.transcript.copiedLabel
                : uiText.transcript.copyLabel}
            </button>
            <button
              onClick={downloadRecording}
              className="w-40 text-sm px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center gap-x-1"
            >
              <DownloadIcon />
              <span>{uiText.transcript.downloadAudioLabel}</span>
            </button>
          </div>
        </div>

        {/* Transcript Content */}
        <div
          ref={transcriptRef}
          className="overflow-auto p-4 flex flex-col gap-y-4 h-full"
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
                isUser ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-black"
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
                          isUser ? "text-gray-400" : "text-gray-500"
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
                            className="border border-gray-200 rounded-md p-1 bg-white shadow-sm"
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
                      <div className="bg-gray-200 px-3 py-2 rounded-b-xl">
                        <GuardrailChip guardrailResult={guardrailResult} />
                      </div>
                    )}
                  </div>
                </div>
              );
            } else if (type === "BREADCRUMB") {
              const isExpertContest =
                data && (data as ExpertContestBreadcrumbData).type === "expertContestResult";
              const expertContestData = isExpertContest
                ? (data as ExpertContestBreadcrumbData)
                : undefined;
              return (
                <div
                  key={itemId}
                  className="flex flex-col justify-start items-start text-gray-500 text-sm"
                >
                  <span className="text-xs font-mono">{timestamp}</span>
                  <div
                    className={`whitespace-pre-wrap flex items-center font-mono text-sm text-gray-800 ${
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
                  {expertContestData && <ExpertContestSummaryCard data={expertContestData} />}
                  {expanded && data && (
                    <div className="text-gray-800 text-left">
                      <pre className="border-l-2 ml-1 border-gray-200 whitespace-pre-wrap break-words font-mono text-xs mb-2 mt-2 pl-2">
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
                  className="flex justify-center text-gray-500 text-sm italic font-mono"
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

      <div className="p-4 flex items-center gap-x-2 flex-shrink-0 border-t border-gray-200">
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
          className="flex-1 px-4 py-2 focus:outline-none"
          placeholder={uiText.transcript.placeholder}
        />
        <button
          onClick={onSendMessage}
          disabled={!canSend || !userText.trim()}
          className="bg-gray-900 text-white rounded-full px-2 py-2 disabled:opacity-50"
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
