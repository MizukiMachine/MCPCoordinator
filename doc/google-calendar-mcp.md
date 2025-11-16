# Google カレンダー MCP 連携ガイド

## 目的
- Google カレンダー MCP を接続し、複数人の空き時間を比較して候補を提示・予定作成まで実行する。

## セットアップ手順
1. `config/mcp.servers.yaml.example` を参考に、`config/mcp.servers.yaml` を配置（リポジトリ同梱のデフォルトは MintMCP ホスト版 `https://gcal.mintmcp.com/mcp`）。
2. サーバー起動後、ブラウザでシナリオ `Schedule Coordinator` を選択し、カレンダー連携の OAuth 画面で許可する。
3. 自前デプロイしたい場合は MintMCP の README に従い、GCP プロジェクト `ai-conversation-engine` で OAuth クライアントID/Secret を作成し、`google-calendar` エントリの URL か `command/args` を自分のエンドポイントに差し替える。
4. 複数人比較を行う際は、参加者のメールアドレス/カレンダーIDと希望期間を必ず入力する。期間が広すぎるとレスポンスが長くなるため、まずは 1〜2 週間に絞るのが推奨。

## シナリオ仕様
- シナリオキー: `scheduleCoordinator`
- 必要な MCP: `google-calendar`（`scenarioMcpBindings.requiredMcpServers` で指定）
- 代表的なツール呼び出しフロー:
  1. `list_calendars` で対象カレンダーの存在を確認（任意）
  2. 参加者ごとに `get_freebusy` または `get_calendar_events` を同一期間で実行
  3. 共通の空き時間を 30/60 分枠で算出し、最大 3 件提示
  4. 同意が得られたら `create_event` で予定登録し招待を送付

## トラブルシュート
- ツール一覧に Google カレンダー MCP が見えない: `config/mcp.servers.yaml` の `id` が `scenarioMcpBindings` の `requiredMcpServers` と一致しているか確認。
- OAuth 失敗: ブラウザのポップアップブロックを解除し、再度シナリオを開始して許可をやり直す。
- Free/Busy が空で返る: 期間が１日未満など極端に短い可能性。開始/終了日時を見直す。

