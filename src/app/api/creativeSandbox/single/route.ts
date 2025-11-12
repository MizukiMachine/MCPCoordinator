import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';

import { createCreativeSandboxRunner } from '@/app/lib/creativeSandboxRunner';
import type { CreativePromptPayload } from '@/app/creativeSandbox/types';
import { logCreativeSandboxEvent } from '@/app/lib/creativeSandboxLogger';

const payloadSchema = z.object({
  role: z.enum(['filmCritic', 'literaryCritic', 'copywriter']),
  userPrompt: z.string().min(1, 'userPrompt is required'),
  contextHint: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 });
  }

  const payloadJson = await req.json();
  const parsed = payloadSchema.safeParse(payloadJson);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const payload = parsed.data as CreativePromptPayload;
  const openai = new OpenAI({ apiKey });
  const runner = createCreativeSandboxRunner(openai);

  try {
    const result = await runner.runSingle(payload);
    await logCreativeSandboxEvent({ kind: 'single', payload, response: result });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[creativeSandbox.single] failed', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await logCreativeSandboxEvent({ kind: 'single', payload, error: message });
    return NextResponse.json({ error: 'Failed to run single creative response' }, { status: 500 });
  }
}
