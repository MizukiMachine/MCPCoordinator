import { NextResponse } from "next/server";
import { buildOpenAIConfig } from "@/framework/config/openai";

const redactSecretTokens = (value: string): string =>
  value.replace(/sk-[a-zA-Z0-9_-]+/g, "sk-****");

const sanitizeForLog = (value: unknown): unknown => {
  if (typeof value === "string") {
    return redactSecretTokens(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForLog);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, sanitizeForLog(val)])
    );
  }
  return value;
};

export async function GET() {
  try {
    const openAIConfig = buildOpenAIConfig();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${openAIConfig.apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "realtime=v1",
    };
    if (openAIConfig.projectId) {
      headers["OpenAI-Project"] = openAIConfig.projectId;
    }

    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: openAIConfig.realtimeModel,
        }),
        cache: "no-store",
      }
    );

    const rawBody = await response.text();
    const parseBody = (): Record<string, unknown> => {
      if (!rawBody) return {};
      try {
        return JSON.parse(rawBody);
      } catch {
        return { raw: rawBody };
      }
    };

    if (!response.ok) {
      const sanitized = sanitizeForLog(parseBody());
      console.error("Failed to create realtime session", {
        status: response.status,
        body: sanitized,
      });
      return NextResponse.json(
        {
          error: "Failed to create realtime session",
          details: `Upstream status ${response.status}`,
          upstream: sanitized,
        },
        { status: response.status }
      );
    }

    const data = parseBody();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in /session:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal Server Error", details: message },
      { status: 500 }
    );
  }
}
