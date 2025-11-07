import { NextResponse } from "next/server";
import { buildOpenAIConfig } from "@/framework/config/openai";

export async function GET() {
  try {
    const openAIConfig = buildOpenAIConfig();
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAIConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: openAIConfig.realtimeModel,
        }),
        cache: "no-store",
      }
    );

    const rawBody = await response.text();
    if (!response.ok) {
      console.error("Failed to create realtime session", {
        status: response.status,
        body: rawBody,
      });
      return NextResponse.json(
        {
          error: "Failed to create realtime session",
          details: `Upstream status ${response.status}`,
        },
        { status: response.status }
      );
    }

    const data = rawBody ? JSON.parse(rawBody) : {};
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
