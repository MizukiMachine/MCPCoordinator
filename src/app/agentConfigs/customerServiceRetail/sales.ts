import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { switchScenarioTool, switchAgentTool } from '../voiceControlTools';
import { japaneseLanguagePreamble } from '../languagePolicy';

const salesInstructions = `
${japaneseLanguagePreamble}
# 役割
- Snowy Peak Boards の販売スペシャリストとして、日本語で丁寧に製品紹介とキャンペーン案内を行う。
- ユーザーのレベル・用途・予算を素早く把握し、最適な商品と割引情報を組み合わせて提案する。
- 追加シナリオ／担当の要望があれば「switchScenario / switchAgent」を用いて即座に切り替える。

# 会話指針
- 挨拶後すぐに「どのようなシーンで使われますか？」と利用目的を質問。
- 2〜3 個の候補を提示する際は、長所・価格・在庫状況を一文ずつ説明し、最後に「どれが気になりますか？」と確認。
- セール情報は数値を日本語で読み上げ、「本日中」「在庫僅少」など制約があれば明確に伝える。
- ユーザーが購入に進む場合は「addToCart」→「checkout」の順を案内し、入力が必要な情報を整理して伝える。

# 注意事項
- 在庫や価格を推測で答えず、提供されているデータのみで説明する。
- 迷っているユーザーには用途別の比較ポイント（安定性、軽さなど）を提示し、押し売りはしない。
- 5秒以上沈黙する場合は必ず「候補を整理していますので少々お待ちください」と声をかける。

# フレーズ例
- 「現在のライディングスタイルやご予算を教えていただけますか？」
- 「こちらのモデルは通常 499ドルですが、今なら25%オフで374ドルになります。」
- 「カートに追加してもよろしければ、お電話番号をもう一度確認させてください。」
`;

export const salesAgent = new RealtimeAgent({
  name: 'salesAgent',
  voice: 'sage',
  handoffDescription:
    "Handles sales-related inquiries, including new product details, recommendations, promotions, and purchase flows. Should be routed if the user is interested in buying or exploring new offers.",

  instructions: salesInstructions,


  tools: [
    switchScenarioTool,
    switchAgentTool,
    tool({
      name: 'lookupNewSales',
      description:
        "Checks for current promotions, discounts, or special deals. Respond with available offers relevant to the user’s query.",
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['snowboard', 'apparel', 'boots', 'accessories', 'any'],
            description: 'The product category or general area the user is interested in (optional).',
          },
        },
        required: ['category'],
        additionalProperties: false,
      },
      execute: async (input: any) => {
        const { category } = input as { category: string };
        const items = [
          { item_id: 101, type: 'snowboard', name: 'Alpine Blade', retail_price_usd: 450, sale_price_usd: 360, sale_discount_pct: 20 },
          { item_id: 102, type: 'snowboard', name: 'Peak Bomber', retail_price_usd: 499, sale_price_usd: 374, sale_discount_pct: 25 },
          { item_id: 201, type: 'apparel', name: 'Thermal Jacket', retail_price_usd: 120, sale_price_usd: 84, sale_discount_pct: 30 },
          { item_id: 202, type: 'apparel', name: 'Insulated Pants', retail_price_usd: 150, sale_price_usd: 112, sale_discount_pct: 25 },
          { item_id: 301, type: 'boots', name: 'Glacier Grip', retail_price_usd: 250, sale_price_usd: 200, sale_discount_pct: 20 },
          { item_id: 302, type: 'boots', name: 'Summit Steps', retail_price_usd: 300, sale_price_usd: 210, sale_discount_pct: 30 },
          { item_id: 401, type: 'accessories', name: 'Goggles', retail_price_usd: 80, sale_price_usd: 60, sale_discount_pct: 25 },
          { item_id: 402, type: 'accessories', name: 'Warm Gloves', retail_price_usd: 60, sale_price_usd: 48, sale_discount_pct: 20 },
        ];
        const filteredItems =
          category === 'any'
            ? items
            : items.filter((item) => item.type === category);
        filteredItems.sort((a, b) => b.sale_discount_pct - a.sale_discount_pct);
        return {
          sales: filteredItems,
        };
      },
    }),

    tool({
      name: 'addToCart',
      description: "Adds an item to the user's shopping cart.",
      parameters: {
        type: 'object',
        properties: {
          item_id: {
            type: 'string',
            description: 'The ID of the item to add to the cart.',
          },
        },
        required: ['item_id'],
        additionalProperties: false,
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      execute: async (input: any) => ({ success: true }),
    }),

    tool({
      name: 'checkout',
      description:
        "Initiates a checkout process with the user's selected items.",
      parameters: {
        type: 'object',
        properties: {
          item_ids: {
            type: 'array',
            description: 'An array of item IDs the user intends to purchase.',
            items: {
              type: 'string',
            },
          },
          phone_number: {
            type: 'string',
            description: "User's phone number used for verification. Formatted like '(111) 222-3333'",
            pattern: '^\\(\\d{3}\\) \\d{3}-\\d{4}$',
          },
        },
        required: ['item_ids', 'phone_number'],
        additionalProperties: false,
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      execute: async (input: any) => ({ checkoutUrl: 'https://example.com/checkout' }),
    }),
  ],

  handoffs: [],
});
