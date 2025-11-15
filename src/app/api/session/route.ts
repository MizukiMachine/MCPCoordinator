import { NextResponse } from 'next/server';

import { sessionHost } from '../../../../services/api/bff/sessionHost';
import { createSessionSchema } from './validators';
import { handleRouteError, requireBffSecret } from './utils';

export async function POST(request: Request) {
  try {
    requireBffSecret(request);
    const json = await request.json();
    const payload = createSessionSchema.parse(json);
    const result = await sessionHost.createSession(payload);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
