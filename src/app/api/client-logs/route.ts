import { NextResponse } from "next/server";
import { logStructured } from "../../../../framework/logging/structuredLogger";

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
    const severity = String(
      body?.eventData?.severity ?? body?.eventData?.level ?? "INFO",
    ).toUpperCase();

    logStructured({
      message: `CLIENT LOG [${direction}] ${eventName}`,
      severity: severity as any,
      component: "client_log",
      request,
      data: {
        requestId: body?.requestId,
        sessionId: body?.sessionId,
        eventId: body?.id,
        eventData: body?.eventData ?? body,
        createdAtMs: body?.createdAtMs,
      },
      labels: {
        direction,
        eventName,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logStructured({
      message: "Failed to mirror client log",
      severity: "ERROR",
      component: "client_log",
      request,
      data: { error: String(error) },
    });
    return NextResponse.json({ error: "invalid_log_payload" }, { status: 400 });
  }
}
