import { NextResponse } from 'next/server';

import { sessionHost } from '../../../../../services/api/bff/sessionHost';
import { handleRouteError, requireBffSecret } from '../utils';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function DELETE(request: Request, context: RouteParams) {
  try {
    requireBffSecret(request);
    const { sessionId } = await context.params;
    const url = new URL(request.url);
    const reason = url.searchParams.get('reason') ?? 'client_request';
    const deleted = await sessionHost.destroySession(sessionId, {
      reason,
      initiatedBy: 'client',
    });
    if (!deleted) {
      return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
