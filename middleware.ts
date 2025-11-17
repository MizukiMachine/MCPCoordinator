import { NextRequest, NextResponse } from 'next/server';

const allowedOrigin =
  process.env.CORS_ALLOW_ORIGIN?.trim() || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-bff-key',
};

export function middleware(request: NextRequest) {
  // Preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  // Other requests: pass through with CORS headers
  const response = NextResponse.next();
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

// Limit to API routes soページ配信に不要なヘッダを付けない
export const config = {
  matcher: ['/api/:path*'],
};
