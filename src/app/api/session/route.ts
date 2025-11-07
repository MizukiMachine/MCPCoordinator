import { NextResponse } from "next/server";

const REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL ??
  process.env.NEXT_PUBLIC_REALTIME_MODEL ??
  "gpt-4.1-realtime-preview-2025-10-01";

const REALTIME_TRANSCRIPTION_MODEL =
  process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL ??
  process.env.NEXT_PUBLIC_REALTIME_TRANSCRIPTION_MODEL ??
  "gpt-4o-mini-transcribe";

const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "verse";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    const sessionPayload = {
      model: REALTIME_MODEL,
      voice: REALTIME_VOICE,
      modalities: ["text", "audio"],
      output_modalities: ["text", "audio"],
      outputModalities: ["text", "audio"],
      audio: {
        input: {
          transcription: {
            model: REALTIME_TRANSCRIPTION_MODEL,
          },
        },
        output: {
          voice: REALTIME_VOICE,
        },
      },
    };

    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sessionPayload),
      }
    );
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in /session:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
