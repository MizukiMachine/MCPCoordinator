import { RealtimeAgent, tool, RealtimeItem } from '@openai/agents/realtime';
import { switchScenarioTool, switchAgentTool } from '../voiceControlTools';
import { japaneseLanguagePreamble, commonInteractionRules } from '../languagePolicy';

const returnsInstructions = `
${japaneseLanguagePreamble}
${commonInteractionRules}
# キャラクター
- 返品専門のジェーンとして、温かい日本語でユーザーを迎える。
- スノーボード経験者らしい親近感と専門性をバランス良く示し、ユーザーの不満や不安を丁寧に受け止める。

# 役割
1. 認証済みユーザーから注文情報を聞き出し、対象アイテムと状況を特定する。
2. 返品理由を短くヒアリングし、必要に応じて追加質問で詳細を整理する。
3. 「lookupOrders」→「retrievePolicy」→「checkEligibilityAndPossiblyInitiateReturn」の順でツールを実行し、結果を日本語で説明する。
4. 承認された場合は返送手順と SMS 連絡について案内し、非承認や追加情報が必要な場合はその理由を丁寧に伝える。

# 会話の流れ
- 挨拶: 「こんにちは、返品担当のジェーンです。□□の件ですね、こちらで確認いたします。」
- アイテム特定: 注文番号・商品名・購入日を一つずつ復唱しながら確認。
- 返品理由ヒアリング: 「どういった状況で不具合がありましたか？」など開かれた質問で引き出す。
- 進捗共有: ツール実行前後には必ず「ポリシーを確認しますので少しお待ちください」と案内。

# 重要ルール
- 常に最新ポリシーを引用し、自己判断で約束しない。
- ユーザーが別エージェントやシナリオを希望したら、switchScenario / switchAgent を呼ぶ。
- 10秒以上沈黙しない。確認中であっても短い日本語フィラーを挟む。
- 不足情報がある場合は「checkEligibilityAndPossiblyInitiateReturn」の結果を参考に、ヒアリング項目を明確に伝える。

# フレーズ例
- 「ご注文を照会しますので、お電話番号と商品名を教えていただけますか？」
- 「返品ポリシーを確認しています。完了まで数秒お待ちください。」
- 「承認されましたら、登録の電話番号に SMS をお送りします。」
- 「判断に追加情報が必要です。梱包状態や使用回数を教えていただけますか？」
`;

export const returnsAgent = new RealtimeAgent({
  name: 'returns',
  voice: 'sage',
  handoffDescription:
    'Customer Service Agent specialized in order lookups, policy checks, and return initiations.',

  instructions: returnsInstructions,
  tools: [
    switchScenarioTool,
    switchAgentTool,
    tool({
      name: 'lookupOrders',
      description:
        "Retrieve detailed order information by using the user's phone number, including shipping status and item details. Please be concise and only provide the minimum information needed to the user to remind them of relevant order details.",
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: {
            type: 'string',
            description: "The user's phone number tied to their order(s).",
          },
        },
        required: ['phoneNumber'],
        additionalProperties: false,
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      execute: async (input: any) => {
        return {
          orders: [
            {
              order_id: 'SNP-20230914-001',
              order_date: '2024-09-14T09:30:00Z',
              delivered_date: '2024-09-16T14:00:00Z',
              order_status: 'delivered',
              subtotal_usd: 409.98,
              total_usd: 471.48,
              items: [
                {
                  item_id: 'SNB-TT-X01',
                  item_name: 'Twin Tip Snowboard X',
                  retail_price_usd: 249.99,
                },
                {
                  item_id: 'SNB-BOOT-ALM02',
                  item_name: 'All-Mountain Snowboard Boots',
                  retail_price_usd: 159.99,
                },
              ],
            },
            {
              order_id: 'SNP-20230820-002',
              order_date: '2023-08-20T10:15:00Z',
              delivered_date: null,
              order_status: 'in_transit',
              subtotal_usd: 339.97,
              total_usd: 390.97,
              items: [
                {
                  item_id: 'SNB-PKbk-012',
                  item_name: 'Park & Pipe Freestyle Board',
                  retail_price_usd: 189.99,
                },
                {
                  item_id: 'GOG-037',
                  item_name: 'Mirrored Snow Goggles',
                  retail_price_usd: 89.99,
                },
                {
                  item_id: 'SNB-BIND-CPRO',
                  item_name: 'Carving Pro Binding Set',
                  retail_price_usd: 59.99,
                },
              ],
            },
          ],
        };
      },
    }),
    tool({
      name: 'retrievePolicy',
      description:
        "Retrieve and present the store’s policies, including eligibility for returns. Do not describe the policies directly to the user, only reference them indirectly to potentially gather more useful information from the user.",
      parameters: {
        type: 'object',
        properties: {
          region: {
            type: 'string',
            description: 'The region where the user is located.',
          },
          itemCategory: {
            type: 'string',
            description: 'The category of the item the user wants to return (e.g., shoes, accessories).',
          },
        },
        required: ['region', 'itemCategory'],
        additionalProperties: false,
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      execute: async (input: any) => {
        return {
          policy: `
At Snowy Peak Boards, we believe in transparent and customer-friendly policies to ensure you have a hassle-free experience. Below are our detailed guidelines:

1. GENERAL RETURN POLICY
• Return Window: We offer a 30-day return window starting from the date your order was delivered. 
• Eligibility: Items must be unused, in their original packaging, and have tags attached to qualify for refund or exchange. 
• Non-Refundable Shipping: Unless the error originated from our end, shipping costs are typically non-refundable.

2. CONDITION REQUIREMENTS
• Product Integrity: Any returned product showing signs of use, wear, or damage may be subject to restocking fees or partial refunds. 
• Promotional Items: If you received free or discounted promotional items, the value of those items might be deducted from your total refund if they are not returned in acceptable condition.
• Ongoing Evaluation: We reserve the right to deny returns if a pattern of frequent or excessive returns is observed.

3. DEFECTIVE ITEMS
• Defective items are eligible for a full refund or exchange within 1 year of purchase, provided the defect is outside normal wear and tear and occurred under normal use. 
• The defect must be described in sufficient detail by the customer, including how it was outside of normal use. Verbal description of what happened is sufficient, photos are not necessary.
• The agent can use their discretion to determine whether it’s a true defect warranting reimbursement or normal use.
## Examples
- "It's defective, there's a big crack": MORE INFORMATION NEEDED
- "The snowboard has delaminated and the edge came off during normal use, after only about three runs. I can no longer use it and it's a safety hazard.": ACCEPT RETURN

4. REFUND PROCESSING
• Inspection Timeline: Once your items reach our warehouse, our Quality Control team conducts a thorough inspection which can take up to 5 business days. 
• Refund Method: Approved refunds will generally be issued via the original payment method. In some cases, we may offer store credit or gift cards. 
• Partial Refunds: If products are returned in a visibly used or incomplete condition, we may process only a partial refund.

5. EXCHANGE POLICY
• In-Stock Exchange: If you wish to exchange an item, we suggest confirming availability of the new item before initiating a return. 
• Separate Transactions: In some cases, especially for limited-stock items, exchanges may be processed as a separate transaction followed by a standard return procedure.

6. ADDITIONAL CLAUSES
• Extended Window: Returns beyond the 30-day window may be eligible for store credit at our discretion, but only if items remain in largely original, resalable condition. 
• Communication: For any clarifications, please reach out to our customer support team to ensure your questions are answered before shipping items back.

We hope these policies give you confidence in our commitment to quality and customer satisfaction. Thank you for choosing Snowy Peak Boards!
`,
        };
      },
    }),
    tool({
      name: 'checkEligibilityAndPossiblyInitiateReturn',
      description: `Check the eligibility of a proposed action for a given order, providing approval or denial with reasons. This will send the request to an experienced agent that's highly skilled at determining order eligibility, who may agree and initiate the return.

# Details
- Note that this agent has access to the full conversation history, so you only need to provide high-level details.
- ALWAYS check retrievePolicy first to ensure we have relevant context.
- Note that this can take up to 10 seconds, so please provide small updates to the user every few seconds, like 'I just need a little more time'
- Feel free to share an initial assessment of potential eligibility with the user before calling this function.
`,
      parameters: {
        type: 'object',
        properties: {
          userDesiredAction: {
            type: 'string',
            description: "The proposed action the user wishes to be taken.",
          },
          question: {
            type: 'string',
            description: "The question you'd like help with from the skilled escalation agent.",
          },
        },
        required: ['userDesiredAction', 'question'],
        additionalProperties: false,
      },
      execute: async (input: any, details) => {
        const { userDesiredAction, question } = input as {
          userDesiredAction: string;
          question: string;
        };
        const nMostRecentLogs = 10;
        const history: RealtimeItem[] = (details?.context as any)?.history ?? [];
        const filteredLogs = history.filter((log) => log.type === 'message');
        const messages = [
          {
            role: "system",
            content:
              "あなたは返品ポリシーを厳格に適用する審査担当です。与えられた指示に忠実に従い、日本語で簡潔に結論と理由をまとめてください。",
          },
          {
            role: "user",
            content: `以下の文脈を読み、ユーザーが希望する処理がポリシーに沿って実行可能かどうかを判断してください。判断根拠を日本語で端的に説明し、不明点があれば必ず「Additional Information Needed」で質問してください。

<modelContext>
userDesiredAction: ${userDesiredAction}
question: ${question}
</modelContext>

<conversationContext>
${JSON.stringify(filteredLogs.slice(-nMostRecentLogs), null, 2)}
</conversationContext>

<output_format>
# Rationale
// 判断理由（日本語で1〜2文）

# User Request
// ユーザーの希望内容を日本語で要約

# Is Eligible
true/false/need_more_information
// need_more_information を選ぶのは追加情報が無ければ判断できない場合のみ

# Additional Information Needed
// 追加で必要な情報。不要なら "None"

# Return Next Steps
// 承認された場合のみ、SMS連絡予定など具体的な次の手順を日本語で記載。非承認なら "None"。
</output_format>  
`,
          },
        ];
        const model = "gpt-5";
        console.log(`checking order eligibility with model=${model}`);

        const response = await fetch("/api/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model, input: messages }),
        });

        if (!response.ok) {
          console.warn("Server returned an error:", response);
          return { error: "Something went wrong." };
        }

        const { output = [] } = await response.json();
        const text = output
          .find((i: any) => i.type === 'message' && i.role === 'assistant')
          ?.content?.find((c: any) => c.type === 'output_text')?.text ?? '';

        console.log(text || output);
        return { result: text || output };
      },
    }),
  ],

  handoffs: [],
});
