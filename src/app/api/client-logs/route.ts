import { NextResponse } from "next/server";

type ClientLogPayload = {
  id?: string;
  direction?: string;
  eventName?: string;
  eventData?: Record<string, any>;
  timestamp?: string;
  requestId?: string;
  sessionId?: string | null;
  createdAtMs?: number;
};

// NOTE: This endpoint only mirrors payloads to stdout for the prototype phase.
// 本番運用時は永続化や認証を追加すること。
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ClientLogPayload;
    const direction = body?.direction ?? "client";
    const eventName = body?.eventName ?? "client.log";
    console.log(`CLIENT LOG [${direction}] ${eventName}`, {
      requestId: body?.requestId,
      sessionId: body?.sessionId,
      eventData: body?.eventData ?? body,
      createdAtMs: body?.createdAtMs,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to mirror client log", error);
    return NextResponse.json({ error: "invalid_log_payload" }, { status: 400 });
  }
}
