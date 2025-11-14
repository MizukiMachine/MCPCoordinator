import {
  ISessionHandle,
  SessionConnectOptions,
  SessionLifecycleStatus,
  SessionManagerHooks,
  SessionManagerOptions,
  SessionEventHandler,
  ResolvedAgentSet,
  SessionTransportRequest,
} from './types';

const FORWARDED_EVENTS = [
  'error',
  'agent_handoff',
  'agent_tool_start',
  'agent_tool_end',
  'history_updated',
  'history_added',
  'guardrail_tripped',
  'transport_event',
] as const;

export class SessionManager<TAgentHandle = unknown> {
  private status: SessionLifecycleStatus = 'DISCONNECTED';
  private handle: ISessionHandle | null = null;
  private hooks: SessionManagerHooks;
  private listeners = new Map<string, Set<SessionEventHandler>>();
  private boundHandlers = new Map<string, SessionEventHandler>();

  constructor(
    private readonly options: SessionManagerOptions<TAgentHandle>,
  ) {
    this.hooks = options.hooks ?? {};
  }

  getStatus(): SessionLifecycleStatus {
    return this.status;
  }

  updateHooks(next: SessionManagerHooks) {
    this.hooks = {
      ...this.hooks,
      ...next,
      logger: {
        ...(this.hooks.logger ?? {}),
        ...(next.logger ?? {}),
      },
      metrics: {
        ...(this.hooks.metrics ?? {}),
        ...(next.metrics ?? {}),
      },
      guardrail: {
        ...(this.hooks.guardrail ?? {}),
        ...(next.guardrail ?? {}),
      },
    };
  }

  async connect(options: SessionConnectOptions<TAgentHandle>): Promise<void> {
    if (this.status === 'CONNECTING' || this.handle) {
      this.hooks.logger?.debug?.('connect() skipped because session is active', {
        status: this.status,
      });
      return;
    }

    this.setStatus('CONNECTING');

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

    try {
      const transport = this.options.transportFactory();
      const handle = await transport.createSession(transportRequest);
      this.attachHandle(handle);
      this.hooks.logger?.info?.('Session connected', {
        agentSetKey: options.agentSetKey,
        preferredAgent: options.preferredAgentName,
      });
      this.hooks.metrics?.increment?.('session_connect_success_total', 1);
      this.setStatus('CONNECTED');
    } catch (error) {
      this.teardownHandle();
      this.handle = null;
      this.setStatus('DISCONNECTED');
      this.hooks.logger?.error?.('Session connect failed', {
        error,
        agentSetKey: options.agentSetKey,
      });
      this.hooks.metrics?.increment?.('session_connect_failure_total', 1);
      throw error;
    }
  }

  disconnect() {
    if (!this.handle) return;
    this.handle.disconnect();
    this.teardownHandle();
    this.handle = null;
    this.setStatus('DISCONNECTED');
    this.hooks.logger?.info?.('Session disconnected');
    this.hooks.metrics?.increment?.('session_disconnect_total', 1);
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

  on(event: string, handler: SessionEventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: SessionEventHandler) {
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

  private emit(event: string, payload: any) {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }

  private setStatus(next: SessionLifecycleStatus) {
    if (this.status === next) return;
    this.status = next;
    this.hooks.onStatusChange?.(next);
  }

  private bindHandle(handle: ISessionHandle) {
    this.teardownHandle();
    FORWARDED_EVENTS.forEach((event) => {
      const listener = (payload: any) => {
        if (event === 'guardrail_tripped') {
          this.hooks.guardrail?.onGuardrailTripped?.(payload);
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

  private teardownHandle() {
    if (!this.handle) return;
    this.boundHandlers.forEach((handler, event) => {
      this.handle!.off(event, handler);
    });
    this.boundHandlers.clear();
  }

  private attachHandle(handle: ISessionHandle) {
    this.handle = handle;
    this.bindHandle(handle);
  }
}
