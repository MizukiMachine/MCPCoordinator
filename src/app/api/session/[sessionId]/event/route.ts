import { NextResponse } from 'next/server';

import { sessionHost, type SessionCommand } from '../../../../../../services/api/bff/sessionHost';
import { sessionCommandSchema } from '../../validators';
import { handleRouteError, requireBffSecret } from '../../utils';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, context: RouteParams) {
  try {
    requireBffSecret(request);
    const json = await request.json();
    const payload = sessionCommandSchema.parse(json) as SessionCommand;
    const { sessionId } = await context.params;
    const status = await sessionHost.handleCommand(sessionId, payload);
    return NextResponse.json({ accepted: true, sessionStatus: status });
  } catch (error) {
    return handleRouteError(error);
  }
}
