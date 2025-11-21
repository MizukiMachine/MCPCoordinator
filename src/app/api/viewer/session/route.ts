import { NextResponse } from 'next/server';

import { sessionHost } from '../../../../../services/api/bff/sessionHost';
import { handleRouteError, requireBffSecret } from '../../session/utils';

export async function GET(request: Request) {
  try {
    requireBffSecret(request);
    const url = new URL(request.url);
    const clientTag = url.searchParams.get('clientTag')?.trim();
    if (!clientTag) {
      return NextResponse.json({ error: 'client_tag_required' }, { status: 400 });
    }
    const result = sessionHost.resolveViewerSession(clientTag);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export const runtime = 'nodejs';
