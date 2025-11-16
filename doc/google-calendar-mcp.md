# Google カレンダー MCP 連携ガイド

## 目的
- Google カレンダー MCP を接続し、複数人の空き時間を比較して候補を提示・予定作成まで実行する。

## セットアップ手順
1. `config/mcp.servers.yaml.example` を参考に、`config/mcp.servers.yaml` を配置（デフォルトは OSS 版 `nspady/google-calendar-mcp` を `npx @cocal/google-calendar-mcp` でSTDIO起動）。
2. GCP で「デスクトップ アプリ」OAuth クライアントを作成し、JSON をダウンロードして `.env` の `GOOGLE_OAUTH_CREDENTIALS` にファイルパスを設定。トークン保存先を `GOOGLE_OAUTH_TOKEN_PATH` に設定する。
3. サーバー起動後、ブラウザでシナリオ `Schedule Coordinator` を選択し、Google 同意ポップアップで許可する（初回のみ）。
4. 別実装を使いたい場合は `config/mcp.servers.yaml` の `command/args` を差し替える。SSE/HTTP 版を使うなら `transport` と `url` を変更。
5. 複数人比較を行う際は、参加者のメールアドレス/カレンダーIDと希望期間を必ず入力する。期間が広すぎるとレスポンスが長くなるため、まずは 1〜2 週間に絞るのが推奨。

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
- OAuth 失敗: ブラウザのポップアップブロックを解除し、再度シナリオを開始して許可をやり直す。デスクトップアプリ型のOAuthかを確認。
- 401 / 接続失敗: `GOOGLE_OAUTH_CREDENTIALS` が正しいか、ファイルパスが存在するかを確認。`npm run dev` 再起動後に再試行。
- Free/Busy が空で返る: 期間が１日未満など極端に短い可能性。開始/終了日時を見直す。
