import type { TransportEvent } from '@openai/agents/realtime';
import type { AuthContext } from '../../framework/auth/JwtVerifier';

export type SessionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';

export type ClientEvent =
  | { type: 'audio_chunk'; mimeType: string; data: string }
  | { type: 'audio_commit' }
  | { type: 'text_message'; text: string }
  | { type: 'interrupt' }
  | { type: 'mute'; value: boolean };

export type ServerEvent =
  | { type: 'status'; status: SessionStatus }
  | { type: 'transport'; payload: TransportEvent }
  | { type: 'history_added'; item: unknown }
  | { type: 'history_updated'; items: unknown[] }
  | { type: 'error'; message: string };

export interface CreateSessionOptions {
  agentKey: string;
  auth: AuthContext;
  locale?: string;
  deviceInfo?: Record<string, unknown>;
}

export interface SessionHandle {
  sessionId: string;
  expiresAt: Date;
}
