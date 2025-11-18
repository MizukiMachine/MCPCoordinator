import { RealtimeAgent, tool } from '@openai/agents/realtime';
import { switchScenarioTool, switchAgentTool } from '../voiceControlTools';
import { japaneseLanguagePreamble, commonInteractionRules } from '../languagePolicy';

const authenticationInstructions = `
${japaneseLanguagePreamble}
${commonInteractionRules}
# パーソナリティと話し方
- 穏やかで頼れる受付として、落ち着いた丁寧語で案内する。
- スノーボード好きのスタッフらしく、時折ワクワク感をにじませつつも押しつけない。

# 役割
- すべての会話の入り口となり、本人確認とニーズ把握を担当する。
- 認証が完了するまでは注文状況や個人情報を一切共有しない。
- 目的を把握したら「transferAgents」で返品・販売・人間担当へ渡す。

# 会話フロー
1. 「Snowy Peak Boards 受付の〇〇です」と挨拶し、本人確認が必要であることを伝える。
2. 電話番号→生年月日→下4桁（クレカ or SSN）→住所の順で取得し、数字は一桁ずつ復唱する。
3. 認証結果を簡潔に伝えたうえで、ユーザーの用件（返品／購入／相談など）を質問する。
4. 必要があれば追加質問で背景を整理し、適切なエージェントへハンドオフする。

# 注意事項
- 情報が不足している状態でハンドオフしない。
- ユーザーが「人間につないで」と言った場合のみ simulatedHuman を許可。
- 「switchScenario / switchAgent」は音声指示があった場合だけ使用する。
- 不明点は遠慮なく聞き返し、「確認中です」と10秒以内にフォローする。

# ツール利用
- 「authenticate_user_information」: 必要項目が揃ったタイミングで1回実行。成功時のみ次工程へ。
- 「save_or_update_address」や「update_user_offer_response」などはユーザーから具体的な依頼があった場合のみ使用し、処理結果を必ずフィードバックする。

# フレーズ例
- 挨拶: 「こんにちは、Snowy Peak Boards 受付の〇〇です。本日はどのようなご用件でしょうか。」
- 確認: 「お電話番号は（4）（1）（5）…でお間違いないでしょうか？」
- 進捗共有: 「ただいま認証システムを確認しております。数秒お待ちください。」
- ハンドオフ: 「ご本人確認ができましたので、返品担当のジェーンにつなぎますね。」
`;

export const authenticationAgent = new RealtimeAgent({
  name: 'authentication',
  voice: 'sage',  
  handoffDescription:
    'The initial agent that greets the user, does authentication and routes them to the correct downstream agent.',

  instructions: authenticationInstructions,

  tools: [
    switchScenarioTool,
    switchAgentTool,
    tool({
      name: "authenticate_user_information",
      description:
        "Look up a user's information with phone, last_4_cc_digits, last_4_ssn_digits, and date_of_birth to verify and authenticate the user. Should be run once the phone number and last 4 digits are confirmed.",
      parameters: {
        type: "object",
        properties: {
          phone_number: {
            type: "string",
            description:
              "User's phone number used for verification. Formatted like '(111) 222-3333'",
            pattern: "^\\(\\d{3}\\) \\d{3}-\\d{4}$",
          },
          last_4_digits: {
            type: "string",
            description:
              "Last 4 digits of the user's credit card for additional verification. Either this or 'last_4_ssn_digits' is required.",
          },
          last_4_digits_type: {
            type: "string",
            enum: ["credit_card", "ssn"],
            description:
              "The type of last_4_digits provided by the user. Should never be assumed, always confirm.",
          },
          date_of_birth: {
            type: "string",
            description: "User's date of birth in the format 'YYYY-MM-DD'.",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          },
        },
        required: [
          "phone_number",
          "date_of_birth",
          "last_4_digits",
          "last_4_digits_type",
        ],
        additionalProperties: false,
      },
      execute: async () => {
        return { success: true };
      },
    }),
    tool({
      name: "save_or_update_address",
      description:
        "Saves or updates an address for a given phone number. Should be run only if the user is authenticated and provides an address. Only run AFTER confirming all details with the user.",
      parameters: {
        type: "object",
        properties: {
          phone_number: {
            type: "string",
            description: "The phone number associated with the address",
          },
          new_address: {
            type: "object",
            properties: {
              street: {
                type: "string",
                description: "The street part of the address",
              },
              city: {
                type: "string",
                description: "The city part of the address",
              },
              state: {
                type: "string",
                description: "The state part of the address",
              },
              postal_code: {
                type: "string",
                description: "The postal or ZIP code",
              },
            },
            required: ["street", "city", "state", "postal_code"],
            additionalProperties: false,
          },
        },
        required: ["phone_number", "new_address"],
        additionalProperties: false,
      },
      execute: async () => {
        return { success: true };
      },
    }),
    tool({
      name: "update_user_offer_response",
      description:
        "A tool definition for signing up a user for a promotional offer",
      parameters: {
        type: "object",
        properties: {
          phone: {
            type: "string",
            description: "The user's phone number for contacting them",
          },
          offer_id: {
            type: "string",
            description: "The identifier for the promotional offer",
          },
          user_response: {
            type: "string",
            description: "The user's response to the promotional offer",
            enum: ["ACCEPTED", "DECLINED", "REMIND_LATER"],
          },
        },
        required: ["phone", "offer_id", "user_response"],
        additionalProperties: false,
      },
      execute: async () => {
        return { success: true };
      },
    }),
  ],

  handoffs: [], // populated later in index.ts
});
