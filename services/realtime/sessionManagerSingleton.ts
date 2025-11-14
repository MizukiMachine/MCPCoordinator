import { FfmpegWebmOpusTranscoder } from './audio/FfmpegWebmOpusTranscoder';
import { SessionManager } from './SessionManager';
import { HttpError } from '../../framework/errors/HttpError';

const GLOBAL_KEY = Symbol.for('mcpc.sessionManager');

type GlobalWithSessionManager = typeof globalThis & {
  [GLOBAL_KEY]?: SessionManager;
};

export function getSessionManager(): SessionManager {
  const globalRef = globalThis as GlobalWithSessionManager;
  if (globalRef[GLOBAL_KEY]) {
    return globalRef[GLOBAL_KEY] as SessionManager;
  }

  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw new HttpError(500, 'OPENAI_API_KEY is not configured');
  }

  const manager = new SessionManager({
    audioTranscoder: new FfmpegWebmOpusTranscoder(),
    openAiApiKey,
    realtimeModel: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-preview',
    transcriptionModel:
      process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL ?? 'gpt-4o-transcribe',
    voice: process.env.OPENAI_REALTIME_VOICE ?? 'verse',
  });

  globalRef[GLOBAL_KEY] = manager;
  return manager;
}
