import { describe, expect, test } from "vitest";
import type { EnvProvider } from "@/framework/config/openai";
import { buildOpenAIConfig } from "@/framework/config/openai";

const buildProvider = (values: Record<string, string | undefined>): EnvProvider => ({
  get: (key: string) => values[key],
});

describe("buildOpenAIConfig", () => {
  test("環境変数をインターフェイス経由で読み取り、設定を返す", () => {
    const provider = buildProvider({
      OPENAI_API_KEY: "sk-test",
      OPENAI_REALTIME_MODEL: "gpt-4o-realtime-preview-2025-06-03",
      OPENAI_RESPONSES_MODEL: "gpt-4.1-mini",
    });

    const config = buildOpenAIConfig(provider);

    expect(config).toEqual({
      apiKey: "sk-test",
      realtimeModel: "gpt-4o-realtime-preview-2025-06-03",
      responsesModel: "gpt-4.1-mini",
    });
  });

  test("OPENAI_API_KEYが未設定の場合は具体的なメッセージで例外を投げる", () => {
    const provider = buildProvider({
      OPENAI_REALTIME_MODEL: "gpt-4o-realtime-preview-2025-06-03",
    });

    expect(() => buildOpenAIConfig(provider)).toThrowError(
      /OPENAI_API_KEY/i
    );
  });
});
