import OpenAI from 'openai';

import type {
  HotwordDictionary,
  HotwordLlmClassifier,
  LlmHotwordClassificationResult,
} from './HotwordListener';

interface LlmScenarioNameClassifierOptions {
  model?: string;
  minimumConfidence?: number;
  logger?: { warn: (msg: string, meta?: Record<string, any>) => void };
  client?: OpenAI;
}

/**
 * LLM に「この文字起こしはどのシナリオ名に最も近いか」を分類させる軽量ヘルパー。
 * 返答は JSON 固定で、モデルは gpt-5-mini を既定にする（高速・低コスト）。
 */
export class LlmScenarioNameClassifier implements HotwordLlmClassifier {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly minimumConfidence: number;
  private readonly logger?: LlmScenarioNameClassifierOptions['logger'];

  constructor(options: LlmScenarioNameClassifierOptions = {}) {
    this.client = options.client ?? new OpenAI();
    this.model = options.model ?? 'gpt-5-mini';
    this.minimumConfidence = options.minimumConfidence ?? 0.6;
    this.logger = options.logger;
  }

  async classify(params: {
    transcript: string;
    dictionary: HotwordDictionary;
  }): Promise<LlmHotwordClassificationResult | null> {
    const { transcript, dictionary } = params;

    const choices = (dictionary.entries ?? []).map((entry) => ({
      key: entry.scenarioKey,
      aliases: entry.aliases?.slice(0, 50) ?? [],
    }));

    if (!transcript?.trim() || choices.length === 0) {
      return null;
    }

    const system =
      'あなたは音声文字起こしを読み、全文から最も近いシナリオ名を1つ推定する分類器です。' +
      ' 文頭だけでなく文中・文末に現れてもよいので、最も尤もらしいシナリオを選び、出力は必ず JSON オブジェクト1つにしてください。' +
      ' 該当が無ければ scenarioKey は null を返します。';

    const user = {
      transcript,
      choices,
      instruction:
        'transcript 全文を読んで、choices 内のシナリオで最も近いものを 1 つ選んでください。' +
        '文頭に無くても構いません。可能なら先頭に近い候補を優先してください。' +
        '確信度 (0.0-1.0) を confidence に入れてください。該当なしの場合は scenarioKey を null、confidence を 0 にしてください。' +
        'matchedAlias に使ったエイリアス文字列、reason に短い理由を書いてください。',
    };

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(user) },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 200,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) return null;
      const parsed = JSON.parse(content) as Partial<LlmHotwordClassificationResult>;
      const scenarioKey = typeof parsed.scenarioKey === 'string' ? parsed.scenarioKey : null;
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;

      const result: LlmHotwordClassificationResult = {
        scenarioKey,
        confidence,
        matchedAlias: typeof parsed.matchedAlias === 'string' ? parsed.matchedAlias : undefined,
        reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      };

      if (!result.scenarioKey || result.confidence < this.minimumConfidence) {
        return null;
      }

      return result;
    } catch (error) {
      this.logger?.warn?.('LLM hotword classification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
