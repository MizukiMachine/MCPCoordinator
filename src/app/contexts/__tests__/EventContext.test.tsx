import React from 'react';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PropsWithChildren, FC } from 'react';

import {
  EventProvider,
  useEvent,
  EVENT_LOG_TTL_MS,
  EVENT_LOG_SWEEP_INTERVAL_MS,
} from '../EventContext';

function createWrapper(): FC<PropsWithChildren> {
  return function Wrapper({ children }) {
    return <EventProvider>{children}</EventProvider>;
  };
}

const ORIGINAL_MIRROR_SETTING = process.env.NEXT_PUBLIC_CLIENT_LOG_MIRROR;

describe('EventContext observability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.NEXT_PUBLIC_CLIENT_LOG_MIRROR = 'false';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_CLIENT_LOG_MIRROR = ORIGINAL_MIRROR_SETTING;
    vi.useRealTimers();
  });

  it('attaches sessionId and requestId metadata to logged client events', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useEvent(), { wrapper });

    act(() => {
      result.current.setSessionMetadata({ sessionId: 'session-test' });
      result.current.logClientEvent(
        { type: 'demo_event', payload: { ok: true } },
        'demo_event',
        { requestId: 'request-demo' },
      );
    });

    expect(result.current.loggedEvents).toHaveLength(1);
    const [log] = result.current.loggedEvents;
    expect(log.sessionId).toBe('session-test');
    expect(log.requestId).toBe('request-demo');
  });

  it('cleans up expired events based on TTL and records a cleanup log entry', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useEvent(), { wrapper });

    act(() => {
      result.current.setSessionMetadata({ sessionId: 'session-ttl' });
      result.current.logClientEvent({ type: 'event.old' }, 'event.old');
    });

    expect(result.current.loggedEvents).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(EVENT_LOG_TTL_MS + EVENT_LOG_SWEEP_INTERVAL_MS + 50);
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loggedEvents).toHaveLength(1);
    const cleanupLog = result.current.loggedEvents[0];
    expect(cleanupLog.eventName).toBe('event_log.ttl_cleanup');
    expect(cleanupLog.eventData.removedCount).toBe(1);
    expect(cleanupLog.sessionId).toBe('session-ttl');
    expect(cleanupLog.requestId).toBeDefined();
  });
});
