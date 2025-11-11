import { UiText } from "./types";

export const jaText: UiText = {
  metadata: {
    title: "Realtime API エージェントデモ",
    description: "OpenAI Realtime API と Agents SDK を使った音声エージェントのデモアプリです。",
    lang: "ja",
  },
  page: {
    loading: "読み込み中...",
  },
  header: {
    titleMain: "Realtime API",
    titleAccent: "エージェント",
    scenarioLabel: "シナリオ",
    agentLabel: "エージェント",
    logoAlt: "OpenAIのロゴ",
  },
  session: {
    agentBreadcrumbLabel: "エージェント: ",
    errorMessageTemplate:
      "リアルタイムセッションの初期化に失敗しました: {{error}}。OPENAI_API_KEY とモデル設定を再確認してから再試行してください。",
  },
  transcript: {
    title: "会話ログ",
    copyLabel: "コピー",
    copiedLabel: "コピーしました",
    downloadAudioLabel: "音声をダウンロード",
    placeholder: "メッセージを入力...",
    sendIconAlt: "送信",
    unknownItemTypeTemplate: "不明な項目タイプ: {{type}}",
    expertContest: {
      title: "並列エキスパート勝負の結果",
      winnerLabel: "勝者",
      runnerUpLabel: "次点",
      totalLatencyLabel: "合計レイテンシー",
      tieBreakerLabel: "タイブレーク",
      judgeSummaryLabel: "評価メモ",
      scoreboardLabel: "上位スコア",
      expertHeading: "Expert",
      scoreHeading: "Score",
      confidenceHeading: "Confidence",
      latencyHeading: "Latency",
      baselineLabel: "単体エージェントの回答",
    },
  },
  toolbar: {
    connectLabel: "接続",
    disconnectLabel: "切断",
    connectingLabel: "接続中...",
    pushToTalkLabel: "プッシュトゥトーク",
    talkButtonLabel: "話す",
    audioPlaybackLabel: "音声再生",
    logsLabel: "ログ",
    codecLabel: "コーデック",
    codecOptions: {
      opus: "Opus (48 kHz)",
      pcmu: "PCMU (8 kHz)",
      pcma: "PCMA (8 kHz)",
    },
  },
  events: {
    title: "ログ",
    expertContestSummary:
      "勝者={{winnerId}} ({{winnerScore}}点/{{winnerLatency}}ms)｜次点={{runnerUpId}} ({{runnerUpScore}}点)｜合計レイテンシー={{totalLatencyMs}}ms｜単体={{baselinePreview}}",
  },
  guardrail: {
    label: "ガードレール",
    states: {
      pending: "判定待ち",
      pass: "合格",
      fail: "警告",
    },
    categoryLabel: "判定カテゴリ",
  },
  voiceControl: {
    unknownScenario: "シナリオ『{{scenarioKey}}』は存在しません。",
    alreadyInScenario: "すでにシナリオ『{{scenarioKey}}』を利用中です。",
    switchingScenario: "シナリオ『{{scenarioKey}}』へ切り替えます。",
    unknownAgent: "エージェント『{{agentName}}』はこのシナリオに存在しません。",
    alreadyWithAgent: "すでにエージェント『{{agentName}}』と接続しています。",
    switchingAgent: "エージェント『{{agentName}}』に切り替えます。",
  },
};
