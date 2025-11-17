import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

import { SessionHostError } from '../../../../services/api/bff/sessionHost';
import { logStructured } from '../../../../framework/logging/structuredLogger';

export function requireBffSecret(request: Request): void {
  const expected = process.env.BFF_SERVICE_SHARED_SECRET;
  if (!expected) {
    return;
  }
  let provided = request.headers.get('x-bff-key') ?? '';
  if (!provided) {
    try {
      const url = new URL(request.url);
      provided = url.searchParams.get('bffKey') ?? '';
    } catch {
      provided = '';
    }
  }
  if (provided !== expected) {
    throw new SessionHostError('Unauthorized', 'unauthorized', 401);
  }
}

export function handleRouteError(error: unknown) {
  if (error instanceof SessionHostError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }

  if (isZodError(error)) {
    return NextResponse.json(
      {
        error: 'invalid_event_payload',
        issues: error.issues,
      },
      { status: 400 },
    );
  }

  logStructured({
    message: 'Unexpected BFF error',
    severity: 'ERROR',
    component: 'api.session',
    data: { error: String(error) },
  });
  return NextResponse.json(
    { error: 'internal_error', message: 'Internal Server Error' },
    { status: 500 },
  );
}

function isZodError(error: unknown): error is ZodError {
  return Boolean(error && typeof error === 'object' && 'issues' in (error as any));
}
