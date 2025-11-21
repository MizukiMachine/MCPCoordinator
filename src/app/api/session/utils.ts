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

function asSessionHostError(error: unknown): SessionHostError | null {
  if (error instanceof SessionHostError) return error;

  if (error && typeof error === 'object') {
    const maybe = error as Record<string, any>;
    const hasStatus = typeof maybe.status === 'number';
    const hasCode = typeof maybe.code === 'string';
    const isNamedSessionError = maybe.name === 'SessionHostError';

    if (hasStatus && (hasCode || isNamedSessionError)) {
      const code = hasCode ? maybe.code : 'session_error';
      const message = typeof maybe.message === 'string' ? maybe.message : 'Session error';
      return new SessionHostError(message, code, maybe.status);
    }
  }

  return null;
}

export function handleRouteError(error: unknown) {
  const sessionError = asSessionHostError(error);
  if (sessionError) {
    return NextResponse.json(
      { error: sessionError.code, message: sessionError.message },
      { status: sessionError.status },
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
