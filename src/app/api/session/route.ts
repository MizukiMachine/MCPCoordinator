import { NextResponse } from "next/server";
import type { ClientSecretCreateParams } from "openai/resources/realtime/client-secrets";

const REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL ??
  process.env.NEXT_PUBLIC_REALTIME_MODEL ??
  "gpt-realtime";

const REALTIME_TRANSCRIPTION_MODEL =
  process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL ??
  process.env.NEXT_PUBLIC_REALTIME_TRANSCRIPTION_MODEL ??
  "gpt-4o-mini-transcribe";

const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "cedar";

const API_KEY_PATTERN = /(sk-(?:live|test|proj)-[A-Za-z0-9]+)/g;
const DEFAULT_OUTPUT_MODALITIES: Array<"text" | "audio"> = ["audio"];

type OpenAIError = {
  error?: {
    message?: string;
    code?: string;
    type?: string;
  };
};

function scrubApiKeys(input?: string | null) {
  if (!input) return input ?? undefined;
  return input.replace(API_KEY_PATTERN, "sk-xxxxxx");
}

function normalizeOpenAIError(payload: OpenAIError) {
  const rawMessage =
    typeof payload?.error?.message === "string"
      ? payload.error.message
      : "Failed to create realtime client secret.";
  return {
    message: scrubApiKeys(rawMessage) ?? "Failed to create realtime client secret.",
    code: payload?.error?.code ?? "openai_realtime_error",
    type: payload?.error?.type ?? "invalid_request_error",
  };
}

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
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        output_modalities: DEFAULT_OUTPUT_MODALITIES,
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
      },
    } satisfies ClientSecretCreateParams;

    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
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

    if (!response.ok) {
      const normalizedError = normalizeOpenAIError(data);
      console.error("Realtime client secret request failed", normalizedError);
      return NextResponse.json(
        {
          error: normalizedError.message,
          code: normalizedError.code,
        },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in /session:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
