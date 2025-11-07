import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ResponseCreateParams } from "openai/resources/responses/responses";
import { buildOpenAIConfig } from "@/framework/config/openai";

type ResponsesRequestBody = Partial<ResponseCreateParams>;

const isJsonSchemaFormat = (body: ResponsesRequestBody): boolean =>
  body.text?.format?.type === "json_schema";

const withModel = (
  body: ResponsesRequestBody,
  fallbackModel: string
): ResponseCreateParams => ({
  ...body,
  model: body.model ?? fallbackModel,
}) as ResponseCreateParams;

// Proxy endpoint for the OpenAI Responses API
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ResponsesRequestBody;
    const openaiConfig = buildOpenAIConfig();
    const openai = new OpenAI({ apiKey: openaiConfig.apiKey });
    const requestBody = withModel(body, openaiConfig.responsesModel);

    if (isJsonSchemaFormat(body)) {
      return await structuredResponse(openai, requestBody);
    }
    return await textResponse(openai, requestBody);
  } catch (error) {
    console.error("responses proxy fatal error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to process response request", details: message },
      { status: 500 }
    );
  }
}

async function structuredResponse(
  openai: OpenAI,
  body: ResponseCreateParams
) {
  try {
    const response = await openai.responses.parse({
      ...body,
      stream: false,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("responses proxy parse error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to parse structured response", details: message },
      { status: 500 }
    );
  }
}

async function textResponse(openai: OpenAI, body: ResponseCreateParams) {
  try {
    const response = await openai.responses.create({
      ...body,
      stream: false,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("responses proxy text error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create response", details: message },
      { status: 500 }
    );
  }
}
