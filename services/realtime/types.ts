export type SessionLifecycleStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED';

export type SessionEventHandler = (payload: any) => void;

export interface SessionLogger {
  debug?: (message: string, context?: Record<string, any>) => void;
  info?: (message: string, context?: Record<string, any>) => void;
  warn?: (message: string, context?: Record<string, any>) => void;
  error?: (message: string, context?: Record<string, any>) => void;
}

export interface SessionMetricRecorder {
  increment?: (
    name: string,
    value?: number,
    tags?: Record<string, string>,
  ) => void;
  observe?: (
    name: string,
    value: number,
    tags?: Record<string, string>,
  ) => void;
}

export interface GuardrailHooks {
  onGuardrailTripped?: (payload: any) => void | Promise<void>;
}

export type SessionEventName =
  | 'error'
  | 'agent_handoff'
  | 'agent_tool_start'
  | 'agent_tool_end'
  | 'history_updated'
  | 'history_added'
  | 'guardrail_tripped'
  | 'transport_event';

export interface SessionManagerHooks {
  logger?: SessionLogger;
  metrics?: SessionMetricRecorder;
  onStatusChange?: (status: SessionLifecycleStatus) => void;
  onServerEvent?: (eventName: string, payload: any) => void;
  guardrail?: GuardrailHooks;
}

export interface ISessionManager<TAgentHandle = unknown> {
  getStatus(): SessionLifecycleStatus;
  updateHooks(next: SessionManagerHooks): void;
  connect(options: SessionConnectOptions<TAgentHandle>): Promise<void>;
  disconnect(): void;
  sendUserText(text: string): void;
  sendEvent(event: Record<string, any>): void;
  interrupt(): void;
  mute(muted: boolean): void;
  pushToTalkStart(): void;
  pushToTalkStop(): void;
  on(event: string, handler: SessionEventHandler): void;
  off(event: string, handler: SessionEventHandler): void;
}

export interface SessionManagerOptions<TAgentHandle = unknown> {
  agentResolver: IAgentSetResolver<TAgentHandle>;
  transportFactory: () => ISessionTransport<TAgentHandle>;
  hooks?: SessionManagerHooks;
}

export interface SessionConnectOptions<TAgentHandle = unknown> {
  getEphemeralKey: () => Promise<string>;
  agentSetKey?: string;
  preferredAgentName?: string | null;
  agentSetOverride?: ResolvedAgentSet<TAgentHandle>;
  audioElement?: HTMLAudioElement | null;
  extraContext?: Record<string, any>;
  outputGuardrails?: any[];
  outputModalities?: Array<'text' | 'audio'>;
  transportOverrides?: TransportOverrides;
}

export interface TransportOverrides {
  changePeerConnection?: (
    pc: RTCPeerConnection,
  ) => Promise<RTCPeerConnection> | RTCPeerConnection | void;
}

export interface SessionTransportRequest<TAgentHandle = unknown> {
  agentSet: ResolvedAgentSet<TAgentHandle>;
  getEphemeralKey: () => Promise<string>;
  audioElement?: HTMLAudioElement | null;
  extraContext?: Record<string, any>;
  outputGuardrails?: any[];
  outputModalities?: Array<'text' | 'audio'>;
  transportOverrides?: TransportOverrides;
  signal?: AbortSignal;
}

export interface ISessionTransport<TAgentHandle = unknown> {
  createSession(
    request: SessionTransportRequest<TAgentHandle>,
  ): Promise<ISessionHandle>;
  dispose?(): void;
}

export interface ISessionHandle {
  disconnect(): void;
  interrupt(): void;
  sendUserText(text: string): void;
  sendEvent(event: Record<string, any>): void;
  mute(muted: boolean): void;
  pushToTalkStart(): void;
  pushToTalkStop(): void;
  on(event: string, handler: SessionEventHandler): void;
  off(event: string, handler: SessionEventHandler): void;
}

export interface ResolvedAgent<TAgentHandle = unknown> {
  name: string;
  handle: TAgentHandle;
  metadata?: Record<string, any>;
}

export interface ResolvedAgentSet<TAgentHandle = unknown> {
  primaryAgent: ResolvedAgent<TAgentHandle>;
  agents: ResolvedAgent<TAgentHandle>[];
}

export interface AgentSetResolveParams {
  key?: string;
  preferredAgentName?: string | null;
  context?: Record<string, any>;
}

export interface IAgentSetResolver<TAgentHandle = unknown> {
  resolve(
    params: AgentSetResolveParams,
  ): Promise<ResolvedAgentSet<TAgentHandle>>;
}
