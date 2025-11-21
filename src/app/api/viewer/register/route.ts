import { NextResponse } from 'next/server';
import { z } from 'zod';

import { sessionHost } from '../../../../../services/api/bff/sessionHost';
import { handleRouteError, requireBffSecret } from '../../session/utils';

const payloadSchema = z.object({
  clientTag: z.string().min(1),
  sessionId: z.string().min(1),
  scenarioKey: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    requireBffSecret(request);
    const json = await request.json().catch(() => ({}));
    const payload = payloadSchema.parse(json);
    const result = sessionHost.registerViewerSession(
      payload.clientTag,
      payload.sessionId,
      payload.scenarioKey,
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const runtime = 'nodejs';
