import {
  ISessionHandle,
  SessionConnectOptions,
  SessionLifecycleStatus,
  SessionManagerHooks,
  SessionManagerOptions,
  SessionEventHandler,
  ResolvedAgentSet,
  SessionTransportRequest,
  SessionEventName,
  ISessionTransport,
  ISessionManager,
} from './types';

const FORWARDED_EVENTS: SessionEventName[] = [
  'error',
  'agent_handoff',
  'agent_tool_start',
  'agent_tool_end',
  'history_updated',
  'history_added',
  'guardrail_tripped',
  'transport_event',
];

export class SessionManager<TAgentHandle = unknown>
  implements ISessionManager<TAgentHandle>
{
  private status: SessionLifecycleStatus = 'DISCONNECTED';
  private handle: ISessionHandle | null = null;
  private hooks: SessionManagerHooks;
  private listeners = new Map<SessionEventName, Set<SessionEventHandler>>();
  private boundHandlers = new Map<SessionEventName, SessionEventHandler>();
  private pendingHandlePromise: Promise<ISessionHandle> | null = null;
  private cancelRequested = false;
  private pendingConnectAbort: AbortController | null = null;
  private activeTransport: ISessionTransport<TAgentHandle> | null = null;

  constructor(
    private readonly options: SessionManagerOptions<TAgentHandle>,
  ) {
    this.hooks = options.hooks ?? {};
  }

  private static mergeLogger(
    current?: SessionManagerHooks['logger'],
    next?: SessionManagerHooks['logger'],
  ): SessionManagerHooks['logger'] {
    return {
      debug: next?.debug ?? current?.debug ?? (() => {}),
      info: next?.info ?? current?.info ?? (() => {}),
      warn: next?.warn ?? current?.warn ?? (() => {}),
      error: next?.error ?? current?.error ?? (() => {}),
    };
  }

  private static mergeMetrics(
    current?: SessionManagerHooks['metrics'],
    next?: SessionManagerHooks['metrics'],
  ): SessionManagerHooks['metrics'] {
    if (!current && !next) return undefined;
    return {
      increment: next?.increment ?? current?.increment ?? (() => {}),
      observe: next?.observe ?? current?.observe ?? (() => {}),
    };
  }

  getStatus(): SessionLifecycleStatus {
    return this.status;
  }

  updateHooks(next: SessionManagerHooks) {
    this.hooks = {
      ...this.hooks,
      ...next,
      logger: SessionManager.mergeLogger(this.hooks.logger, next.logger),
      metrics: SessionManager.mergeMetrics(this.hooks.metrics, next.metrics),
      guardrail: {
        ...(this.hooks.guardrail ?? {}),
        ...(next.guardrail ?? {}),
      },
    };
  }

  async connect(options: SessionConnectOptions<TAgentHandle>): Promise<void> {
    if (this.status === 'CONNECTED') {
      const message = 'connect() called while already connected';
      this.hooks.logger?.warn?.(message);
      this.hooks.metrics?.increment?.('session_connect_conflict_total', 1, {
        status: this.status,
      });
      throw new Error(message);
    }

    if (this.pendingHandlePromise) {
      await this.abortPendingConnect('connect_reentry');
    }

    this.cancelRequested = false;
    this.setStatus('CONNECTING');
    this.pendingConnectAbort = this.createAbortController();

    let agentSet: ResolvedAgentSet<TAgentHandle>;
    try {
      agentSet = await this.resolveAgentSet(options);
    } catch (error) {
      this.setStatus('DISCONNECTED');
      this.hooks.logger?.error?.('Failed to resolve agent set', {
        error,
        agentSetKey: options.agentSetKey,
      });
      this.hooks.metrics?.increment?.('session_agentset_resolution_errors_total', 1);
      throw error;
    }

    const transportRequest: SessionTransportRequest<TAgentHandle> = {
      agentSet,
      getEphemeralKey: options.getEphemeralKey,
      audioElement: options.audioElement ?? null,
      extraContext: options.extraContext ?? {},
      outputGuardrails: options.outputGuardrails ?? [],
      outputModalities: options.outputModalities,
      transportOverrides: options.transportOverrides,
    };

    const transport = this.options.transportFactory();
    this.activeTransport = transport;
    const handlePromise = transport.createSession({
      ...transportRequest,
      signal: this.pendingConnectAbort?.signal,
    });
    this.pendingHandlePromise = handlePromise;

    try {
      const handle = await handlePromise;
      this.pendingHandlePromise = null;

      if (this.cancelRequested) {
        this.hooks.logger?.info?.(
          'Session connect aborted before completion. Closing handle.',
        );
        this.hooks.metrics?.increment?.('session_connect_aborted_total', 1);
        this.cancelRequested = false;
        try {
          handle.disconnect();
        } finally {
          this.setStatus('DISCONNECTED');
        }
        return;
      }

      this.attachHandle(handle);
      this.hooks.logger?.info?.('Session connected', {
        agentSetKey: options.agentSetKey,
        preferredAgent: options.preferredAgentName,
      });
      this.hooks.metrics?.increment?.('session_connect_success_total', 1);
      this.setStatus('CONNECTED');
    } catch (error) {
      this.pendingHandlePromise = null;
      this.cancelRequested = false;
      this.teardownHandle();
      this.handle = null;
      this.setStatus('DISCONNECTED');
      this.hooks.logger?.error?.('Session connect failed', {
        error,
        agentSetKey: options.agentSetKey,
      });
      this.hooks.metrics?.increment?.('session_connect_failure_total', 1);
      throw error;
    } finally {
      this.pendingConnectAbort = null;
      this.activeTransport?.dispose?.();
      this.activeTransport = null;
    }
  }

  disconnect() {
    const hadHandle = Boolean(this.handle);
    const isPendingConnect = !this.handle && this.status === 'CONNECTING';

    if (!hadHandle && !isPendingConnect && this.status === 'DISCONNECTED') {
      return;
    }

    if (isPendingConnect) {
      this.requestPendingConnectAbort('disconnect');
      this.hooks.logger?.info?.('Disconnect requested while connecting.');
    }

    if (hadHandle) {
      const activeHandle = this.handle;
      activeHandle?.disconnect();
      this.teardownHandle(activeHandle);
      this.handle = null;
      this.cancelRequested = false;
    }

    this.setStatus('DISCONNECTED');
    this.hooks.logger?.info?.('Session disconnected');
    this.hooks.metrics?.increment?.('session_disconnect_total', 1, {
      stage: hadHandle ? 'connected' : 'connecting',
    });
  }

  sendUserText(text: string) {
    if (!this.handle) throw new Error('Session not connected');
    this.handle.sendUserText(text);
  }

  sendEvent(event: Record<string, any>) {
    if (!this.handle) throw new Error('Session not connected');
    this.handle.sendEvent(event);
  }

  interrupt() {
    this.handle?.interrupt();
  }

  mute(muted: boolean) {
    this.handle?.mute(muted);
  }

  pushToTalkStart() {
    this.handle?.pushToTalkStart();
  }

  pushToTalkStop() {
    this.handle?.pushToTalkStop();
  }

  on(event: SessionEventName, handler: SessionEventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: SessionEventName, handler: SessionEventHandler) {
    this.listeners.get(event)?.delete(handler);
  }

  private async resolveAgentSet(
    options: SessionConnectOptions<TAgentHandle>,
  ): Promise<ResolvedAgentSet<TAgentHandle>> {
    if (options.agentSetOverride) {
      return options.agentSetOverride;
    }

    if (!options.agentSetKey) {
      throw new Error('agentSetKey must be provided when no override is supplied');
    }

    return this.options.agentResolver.resolve({
      key: options.agentSetKey,
      preferredAgentName: options.preferredAgentName,
      context: options.extraContext,
    });
  }

  private emit(event: SessionEventName, payload: any) {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        this.hooks.logger?.error?.('Session listener threw error', {
          event,
          error,
        });
      }
    });
  }

  private setStatus(next: SessionLifecycleStatus) {
    if (this.status === next) return;
    this.status = next;
    this.hooks.onStatusChange?.(next);
  }

  private bindHandle(handle: ISessionHandle) {
    FORWARDED_EVENTS.forEach((event) => {
      const listener = (payload: any) => {
        if (event === 'guardrail_tripped') {
          this.hooks.guardrail?.onGuardrailTripped?.(payload);
        }
        if (event === 'error') {
          this.handleRealtimeError(handle, payload);
        }
        this.emit(event, payload);
        if (event === 'transport_event') {
          this.hooks.onServerEvent?.(event, payload);
        } else if (event === 'error') {
          this.hooks.logger?.error?.('Realtime session error', { payload });
        }
        this.hooks.metrics?.increment?.('session_events_total', 1, {
          event,
        });
      };
      this.boundHandlers.set(event, listener);
      handle.on(event, listener);
    });
  }

  private teardownHandle(handle: ISessionHandle | null = this.handle) {
    if (!handle) return;
    this.boundHandlers.forEach((handler, event) => {
      handle.off(event, handler);
    });
    this.boundHandlers.clear();
  }

  private extractErrorDetails(payload: any): { code?: string; message?: string } {
    const candidates = [
      payload,
      (payload as any)?.error,
      (payload as any)?.error?.error,
      Array.isArray((payload as any)?.error?.errors)
        ? (payload as any).error.errors[0]
        : undefined,
    ].filter(Boolean);

    let code: string | undefined;
    let message: string | undefined;

    for (const candidate of candidates) {
      if (!code && typeof (candidate as any)?.code === 'string') {
        code = (candidate as any).code;
      }
      if (!message && typeof (candidate as any)?.message === 'string') {
        message = (candidate as any).message;
      }
      if (code && message) break;
    }

    return { code, message };
  }

  private handleRealtimeError(handle: ISessionHandle, payload: any) {
    const { code, message } = this.extractErrorDetails(payload);
    const isShortAudioError =
      code === 'invalid_value' &&
      typeof message === 'string' &&
      message.includes('Audio content of') &&
      message.includes('shorter than');

    if (isShortAudioError) {
      // Realtime sometimes rejects a commit/turn-detection pass when the audio buffer
      // is shorter than the requested slice. Clear the buffer to keep the session alive.
      try {
        handle.sendEvent({ type: 'input_audio_buffer.clear' });
        this.hooks.logger?.warn?.('Recovered from short-audio invalid_value by clearing buffer', {
          message,
          code,
        });
      } catch (error) {
        this.hooks.logger?.error?.('Failed to clear audio buffer after invalid_value', {
          error,
          code,
          message,
        });
      }
    }
  }

  private requestPendingConnectAbort(reason: string) {
    this.cancelRequested = true;
    if (!this.pendingHandlePromise) return;
    if (this.pendingConnectAbort && !this.pendingConnectAbort.signal.aborted) {
      this.pendingConnectAbort.abort();
    }
    this.hooks.logger?.info?.('Cancelling pending connection', { reason });
  }

  private async abortPendingConnect(reason: string) {
    if (!this.pendingHandlePromise) return;
    this.requestPendingConnectAbort(reason);
    try {
      await this.pendingHandlePromise;
    } catch (error) {
      this.hooks.logger?.debug?.('Pending connection rejected', {
        error,
        reason,
      });
    } finally {
      this.pendingHandlePromise = null;
    }
    this.pendingConnectAbort = null;
    this.setStatus('DISCONNECTED');
  }

  private attachHandle(handle: ISessionHandle) {
    this.teardownHandle(this.handle);
    this.handle = handle;
    this.bindHandle(handle);
  }

  private createAbortController(): AbortController | null {
    if (typeof AbortController === 'undefined') {
      return null;
    }
    return new AbortController();
  }
}
