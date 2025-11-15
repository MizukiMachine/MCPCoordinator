"use client";

import React, {
  createContext,
  useContext,
  useState,
  FC,
  PropsWithChildren,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { LoggedEvent } from "@/app/types";
import { createConsoleMetricEmitter } from "../../../framework/metrics/metricEmitter";

const CLIENT_LOG_ENDPOINT = process.env.NEXT_PUBLIC_CLIENT_LOG_ENDPOINT ?? "/api/client-logs";
const MIRROR_LOGS_TO_SERVER =
  (process.env.NEXT_PUBLIC_CLIENT_LOG_MIRROR ?? "true").toLowerCase() !== "false";

const DEFAULT_EVENT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_SWEEP_MS = 10 * 1000;

function parseDuration(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const EVENT_LOG_TTL_MS = parseDuration(
  process.env.NEXT_PUBLIC_CLIENT_LOG_TTL_MS,
  DEFAULT_EVENT_TTL_MS,
);
export const EVENT_LOG_SWEEP_INTERVAL_MS = parseDuration(
  process.env.NEXT_PUBLIC_CLIENT_LOG_SWEEP_MS,
  DEFAULT_SWEEP_MS,
);

function mirrorLogToServer(payload: LoggedEvent) {
  if (!MIRROR_LOGS_TO_SERVER) return;
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const success = navigator.sendBeacon(CLIENT_LOG_ENDPOINT, blob);
      if (success) return;
    }
    fetch(CLIENT_LOG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch((err) => {
      console.warn("Failed to mirror client log via fetch", err);
    });
  } catch (error) {
    console.warn("Failed to mirror client log", error);
  }
}

export type SessionMetadata = {
  sessionId: string | null;
};

type LogMetadata = {
  requestId?: string;
  sessionId?: string | null;
};

type EventContextValue = {
  loggedEvents: LoggedEvent[];
  logClientEvent: (
    eventObj: Record<string, any>,
    eventNameSuffix?: string,
    metadata?: LogMetadata,
  ) => void;
  logServerEvent: (
    eventObj: Record<string, any>,
    eventNameSuffix?: string,
    metadata?: LogMetadata,
  ) => void;
  logHistoryItem: (item: any) => void;
  toggleExpand: (id: string) => void;
  setSessionMetadata: (metadata: SessionMetadata | null) => void;
  sessionMetadata: SessionMetadata;
  generateRequestId: () => string;
};

const EventContext = createContext<EventContextValue | undefined>(undefined);

const metricEmitter = createConsoleMetricEmitter("client.event_log");

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return uuidv4();
}

export const EventProvider: FC<PropsWithChildren> = ({ children }) => {
  const [loggedEvents, setLoggedEvents] = useState<LoggedEvent[]>([]);
  const [sessionMetadata, setSessionMetadataState] = useState<SessionMetadata>({
    sessionId: null,
  });
  const sessionMetadataRef = useRef<SessionMetadata>(sessionMetadata);

  const updateSessionMetadata = useCallback((metadata: SessionMetadata | null) => {
    const next = metadata ?? { sessionId: null };
    sessionMetadataRef.current = next;
    setSessionMetadataState(next);
  }, []);

  const buildLoggedEvent = useCallback(
    (
      direction: 'client' | 'server',
      eventName: string,
      eventData: Record<string, any>,
      metadata: LogMetadata = {},
    ): LoggedEvent => {
      const requestId = metadata.requestId ?? createRequestId();
      const sessionId = metadata.sessionId ?? sessionMetadataRef.current.sessionId ?? null;
      const createdAtMs = Date.now();
      const idSource = eventData.event_id ?? requestId;
      return {
        id: String(idSource),
        direction,
        eventName,
        eventData: {
          ...eventData,
          sessionId,
          requestId,
        },
        timestamp: new Date(createdAtMs).toLocaleTimeString(),
        expanded: false,
        sessionId,
        requestId,
        createdAtMs,
      };
    },
    [],
  );

  const addLoggedEvent = useCallback(
    (
      direction: "client" | "server",
      eventName: string,
      eventData: Record<string, any>,
      metadata: LogMetadata = {},
    ) => {
      const nextEvent = buildLoggedEvent(direction, eventName, eventData, metadata);
      setLoggedEvents((prev) => [...prev, nextEvent]);
      mirrorLogToServer(nextEvent);
    },
    [buildLoggedEvent],
  );

  const logClientEvent: EventContextValue["logClientEvent"] = useCallback(
    (eventObj, eventNameSuffix = "", metadata) => {
      const name = `${eventObj.type || ""} ${eventNameSuffix || ""}`.trim() || "client.event";
      addLoggedEvent("client", name, eventObj, metadata);
    },
    [addLoggedEvent],
  );

  const logServerEvent: EventContextValue["logServerEvent"] = useCallback(
    (eventObj, eventNameSuffix = "", metadata) => {
      const name = `${eventObj.type || ""} ${eventNameSuffix || ""}`.trim() || "server.event";
      addLoggedEvent("server", name, eventObj, metadata);
    },
    [addLoggedEvent],
  );

  const logHistoryItem: EventContextValue["logHistoryItem"] = useCallback(
    (item) => {
      let eventName = item.type;
      if (item.type === "message") {
        eventName = `${item.role}.${item.status}`;
      }
      if (item.type === "function_call") {
        eventName = `function.${item.name}.${item.status}`;
      }
      addLoggedEvent("server", eventName, item);
    },
    [addLoggedEvent],
  );

  const toggleExpand: EventContextValue["toggleExpand"] = useCallback((id) => {
    setLoggedEvents((prev) =>
      prev.map((log) => {
        if (log.id === id) {
          return { ...log, expanded: !log.expanded };
        }
        return log;
      }),
    );
  }, []);

  useEffect(() => {
    if (EVENT_LOG_TTL_MS <= 0 || typeof window === "undefined") {
      return;
    }
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - EVENT_LOG_TTL_MS;
      let removed: LoggedEvent[] = [];
      let cleanupEvent: LoggedEvent | null = null;
      setLoggedEvents((prev) => {
        if (prev.length === 0) return prev;
        const next: LoggedEvent[] = [];
        const expired: LoggedEvent[] = [];
        for (const entry of prev) {
          if (entry.createdAtMs < cutoff) {
            expired.push(entry);
          } else {
            next.push(entry);
          }
        }
        removed = expired;
        if (expired.length === 0) {
          return next;
        }

        cleanupEvent = buildLoggedEvent(
          'client',
          'event_log.ttl_cleanup',
          {
            type: 'event_log.ttl_cleanup',
            removedCount: expired.length,
            removedEventIds: expired.map((event) => event.id),
            cutoffTimestampMs: cutoff,
          },
          { sessionId: sessionMetadataRef.current.sessionId },
        );

        return [...next, cleanupEvent];
      });

      if (removed.length > 0 && cleanupEvent) {
        metricEmitter.increment("client_event_log_ttl_cleanup_total", removed.length, {
          component: "event_context",
        });
        mirrorLogToServer(cleanupEvent);
      }
    }, EVENT_LOG_SWEEP_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [buildLoggedEvent]);

  return (
    <EventContext.Provider
      value={{
        loggedEvents,
        logClientEvent,
        logServerEvent,
        logHistoryItem,
        toggleExpand,
        setSessionMetadata: updateSessionMetadata,
        sessionMetadata,
        generateRequestId: createRequestId,
      }}
    >
      {children}
    </EventContext.Provider>
  );
};

export function useEvent() {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error("useEvent must be used within an EventProvider");
  }
  return context;
}
