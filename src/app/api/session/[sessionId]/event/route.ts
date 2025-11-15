import { NextResponse } from 'next/server';

import { sessionHost, type SessionCommand } from '../../../../../../services/api/bff/sessionHost';
import { sessionCommandSchema } from '../../validators';
import { handleRouteError, requireBffSecret } from '../../utils';

interface RouteParams {
  params: {
    sessionId: string;
  };
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    requireBffSecret(request);
    const json = await request.json();
    const payload = sessionCommandSchema.parse(json) as SessionCommand;
    const status = await sessionHost.handleCommand(params.sessionId, payload);
    return NextResponse.json({ accepted: true, sessionStatus: status });
  } catch (error) {
    return handleRouteError(error);
  }
}
