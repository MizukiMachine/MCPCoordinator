"use client";

import React, { useRef, useEffect, useState } from "react";
import { useEvent } from "@/app/contexts/EventContext";
import { LoggedEvent } from "@/app/types";
import { uiText } from "../i18n";

export interface EventsProps {
  isExpanded: boolean;
}

function Events({ isExpanded }: EventsProps) {
  const [prevEventLogs, setPrevEventLogs] = useState<LoggedEvent[]>([]);
  const eventLogsContainerRef = useRef<HTMLDivElement | null>(null);

  const { loggedEvents, toggleExpand } = useEvent();

  const shortenId = (value?: string | null) => {
    if (!value) return null;
    return value.length > 10 ? `${value.slice(0, 10)}…` : value;
  };

  const getDirectionArrow = (direction: string) => {
    if (direction === "client") return { symbol: "▲", color: "#7f5af0" };
    if (direction === "server") return { symbol: "▼", color: "#2cb67d" };
    return { symbol: "•", color: "#555" };
  };

  useEffect(() => {
    const hasNewEvent = loggedEvents.length > prevEventLogs.length;

    if (isExpanded && hasNewEvent && eventLogsContainerRef.current) {
      eventLogsContainerRef.current.scrollTop =
        eventLogsContainerRef.current.scrollHeight;
    }

    setPrevEventLogs(loggedEvents);
  }, [loggedEvents, isExpanded]);

  return (
    <div
      className={
        (isExpanded ? "w-1/2 overflow-auto" : "w-0 overflow-hidden opacity-0") +
        " transition-all rounded-xl duration-200 ease-in-out flex-col bg-[var(--surface)] border border-[var(--border)] shadow-md shadow-black/30"
      }
      ref={eventLogsContainerRef}
    >
      {isExpanded && (
        <div>
          <div className="flex items-center justify-between px-6 py-3.5 sticky top-0 z-10 text-base border-b border-[var(--border)] bg-[var(--surface-muted)] rounded-t-xl">
            <span className="font-semibold text-[var(--foreground)]">{uiText.events.title}</span>
          </div>
          <div>
            {loggedEvents.map((log, idx) => {
              const arrowInfo = getDirectionArrow(log.direction);
              const isError =
                log.eventName.toLowerCase().includes("error") ||
                log.eventData?.response?.status_details?.error != null;
              return (
                <div
                  key={`${log.id}-${idx}`}
                  className="border-t border-[var(--border)] py-2 px-6 font-mono text-[var(--foreground)]"
                >
                  <div
                    onClick={() => toggleExpand(log.id)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center flex-1">
                      <span
                        style={{ color: arrowInfo.color }}
                        className="ml-1 mr-2"
                      >
                      {arrowInfo.symbol}
                      </span>
                      <span
                        className={
                          "flex-1 text-sm " +
                          (isError ? "text-red-400" : "text-[var(--foreground)]")
                        }
                      >
                        {log.eventName}
                      </span>
                    </div>
                    <div className="text-[var(--muted)] ml-1 text-xs whitespace-nowrap">
                      {log.timestamp}
                    </div>
                    {(log.sessionId || log.requestId) && (
                      <div className="ml-3 text-[10px] text-[var(--muted)] flex flex-col items-end">
                        {log.sessionId && (
                          <span>session:{shortenId(log.sessionId)}</span>
                        )}
                        {log.requestId && <span>req:{shortenId(log.requestId)}</span>}
                      </div>
                    )}
                  </div>

                  {log.expanded && log.eventData && (
                    <div className="text-[var(--foreground)] text-left">
                      <pre className="border-l-2 ml-1 border-[var(--border)] whitespace-pre-wrap break-words font-mono text-xs mb-2 mt-2 pl-2">
                        {JSON.stringify(log.eventData, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default Events;
