import { z } from 'zod';

import type { ClientEvent } from './types';

const audioChunkSchema = z.object({
  type: z.literal('audio_chunk'),
  mimeType: z.string().min(1),
  data: z.string().min(1),
});

const audioCommitSchema = z.object({
  type: z.literal('audio_commit'),
});

const textMessageSchema = z.object({
  type: z.literal('text_message'),
  text: z.string().min(1),
});

const interruptSchema = z.object({
  type: z.literal('interrupt'),
});

const muteSchema = z.object({
  type: z.literal('mute'),
  value: z.boolean(),
});

export const clientEventSchema: z.ZodType<ClientEvent> = z.discriminatedUnion('type', [
  audioChunkSchema,
  audioCommitSchema,
  textMessageSchema,
  interruptSchema,
  muteSchema,
]) as z.ZodType<ClientEvent>;
