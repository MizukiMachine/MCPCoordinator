import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildOpenAIConfig } from "@/framework/config/openai";

// Proxy endpoint for the OpenAI Responses API
export async function POST(req: NextRequest) {
  const body = await req.json();
  const openaiConfig = buildOpenAIConfig();
  const openai = new OpenAI({ apiKey: openaiConfig.apiKey });
  const requestBody = {
    ...body,
    model: body.model ?? openaiConfig.responsesModel,
  };

  if (body.text?.format?.type === "json_schema") {
    return await structuredResponse(openai, requestBody);
  } else {
    return await textResponse(openai, requestBody);
  }
}

async function structuredResponse(openai: OpenAI, body: any) {
  try {
    const response = await openai.responses.parse({
      ...(body as any),
      stream: false,
    });

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("responses proxy error", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

async function textResponse(openai: OpenAI, body: any) {
  try {
    const response = await openai.responses.create({
      ...(body as any),
      stream: false,
    });

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("responses proxy error", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
  
