export interface EnvProvider {
  get(key: string): string | undefined;
}

export interface OpenAIConfig {
  apiKey: string;
  realtimeModel: string;
  responsesModel: string;
  projectId?: string;
}

export const processEnvProvider: EnvProvider = {
  get: (key) => process.env[key],
};

const DEFAULT_REALTIME_MODEL = "gpt-4o-realtime-preview-2025-06-03";
const DEFAULT_RESPONSES_MODEL = "gpt-4o-mini";

const requireEnv = (provider: EnvProvider, key: string): string => {
  const value = provider.get(key);
  if (!value) {
    throw new Error(
      `環境変数 ${key} が設定されていません。`.concat(
        key === "OPENAI_API_KEY"
          ? " .env にAPIキーを設定してください。"
          : ""
      )
    );
  }
  return value;
};

export const buildOpenAIConfig = (
  provider: EnvProvider = processEnvProvider
): OpenAIConfig => ({
  apiKey: requireEnv(provider, "OPENAI_API_KEY"),
  realtimeModel: provider.get("OPENAI_REALTIME_MODEL") ?? DEFAULT_REALTIME_MODEL,
  responsesModel:
    provider.get("OPENAI_RESPONSES_MODEL") ?? DEFAULT_RESPONSES_MODEL,
  projectId: provider.get("OPENAI_PROJECT_ID"),
});
