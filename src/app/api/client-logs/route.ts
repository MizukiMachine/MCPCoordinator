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
