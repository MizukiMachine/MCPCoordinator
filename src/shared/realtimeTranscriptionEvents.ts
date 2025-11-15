export type RealtimeTranscriptionEventStage = 'completed' | 'delta';

export const TRANSCRIPTION_EVENT_STAGE_MAP = {
  'conversation.item.input_audio_transcription.completed': 'completed',
  'input_audio_transcription.completed': 'completed',
  'response.audio_transcript.done': 'completed',
  'audio_transcript.done': 'completed',
  'response.output_audio_transcript.done': 'completed',
  'output_audio_transcript.done': 'completed',
  'response.output_text.done': 'completed',
  'output_text.done': 'completed',
  'response.audio_transcript.delta': 'delta',
  transcript_delta: 'delta',
  audio_transcript_delta: 'delta',
  'response.output_audio_transcript.delta': 'delta',
  'output_audio_transcript.delta': 'delta',
  'response.output_text.delta': 'delta',
  'output_text.delta': 'delta',
} as const satisfies Record<string, RealtimeTranscriptionEventStage>;

export type RealtimeTranscriptionEventType = keyof typeof TRANSCRIPTION_EVENT_STAGE_MAP;

export function getTranscriptionEventStageFromType(
  eventType?: string | null,
): RealtimeTranscriptionEventStage | undefined {
  if (!eventType) return undefined;
  return TRANSCRIPTION_EVENT_STAGE_MAP[eventType as RealtimeTranscriptionEventType];
}

export function getTranscriptionEventStage(event: unknown): RealtimeTranscriptionEventStage | undefined {
  if (!event || typeof event !== 'object') {
    return undefined;
  }
  const type = (event as { type?: string }).type;
  return getTranscriptionEventStageFromType(type);
}

export function isRealtimeTranscriptionEventPayload(payload: unknown): boolean {
  if (Array.isArray(payload)) {
    return payload.some((entry) => isRealtimeTranscriptionEventPayload(entry));
  }
  return Boolean(getTranscriptionEventStage(payload));
}
