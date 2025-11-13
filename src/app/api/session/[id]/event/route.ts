import { NextRequest, NextResponse } from 'next/server';

import { getJwtVerifier } from '../../../../../../framework/auth';
import { HttpError } from '../../../../../../framework/errors/HttpError';
import { requireBearerToken } from '../../../../../../framework/http/headers';
import { getSessionManager } from '../../../../../../services/realtime/sessionManagerSingleton';
import { clientEventSchema } from '../../../../../../services/realtime/clientEventSchema';

type RouteContext = {
  params: { id: string };
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const token = requireBearerToken(request.headers.get('authorization'));
    const auth = await getJwtVerifier().verify(token);
    const body = clientEventSchema.parse(await request.json());

    await getSessionManager().handleClientEvent(context.params.id, auth, body);

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    return respondWithError(error);
  }
}

function respondWithError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  console.error('Unexpected error in POST /api/session/[id]/event', error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}
