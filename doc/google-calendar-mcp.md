# Google カレンダー MCP 連携ガイド

## 目的
- Google カレンダー MCP を接続し、複数人の空き時間を比較して候補を提示・予定作成まで実行する。

## セットアップ手順
1. `config/mcp.servers.yaml.example` を参考に、`config/mcp.servers.yaml` を配置する。既定では Cloud Run にデプロイした Google Calendar MCP (streamable_http) を `GOOGLE_CALENDAR_MCP_URL` / `GOOGLE_CALENDAR_MCP_SHARED_SECRET` で参照する構成になっている。ローカル開発のみ STDIO 版を使いたい場合は example の `google-calendar-local` セクションをコピーして ID を変更する。
2. GCP で「デスクトップ アプリ」OAuth クライアントを作成し、JSON をダウンロードして Secret Manager (`google-oauth-desktop-json`) に登録する。リフレッシュトークン (`google-oauth-token-json`) も同様に Secret Manager に保存する（`scripts/run-google-calendar-mcp.sh` と Cloud Run エントリポイントが起動時に `~/.config/google-calendar-mcp/tokens.json` へコピーする）。
3. `cloudbuild.yaml` が本体サービス (`${_SERVICE_NAME}`) と Google Calendar MCP (`${_MCP_SERVICE_NAME}`) の 2 つの Cloud Run サービスを自動ビルド/デプロイする。`GOOGLE_CALENDAR_MCP_SHARED_SECRET` という共通鍵シークレットを用意し、両サービスへ注入する。Cloud Build ログに表示される `google-calendar-mcp` URL は `GOOGLE_CALENDAR_MCP_URL` 環境変数としてメインサービスに反映される。
4. サーバー起動後、ブラウザでシナリオ `kate` を選択し、Google 同意ポップアップで許可する（初回のみ）。HTTP モードではトークンファイルが存在しない場合でもサーバーは起動し、ログに表示される認証URLへアクセスして認証を完了させる。
5. 別実装を使いたい場合は `config/mcp.servers.yaml` の該当項目を差し替える。SSE/HTTP 版を使うなら `transport` と `url/headers` を変更する。
6. 複数人比較を行う際は、参加者のメールアドレス/カレンダーIDと希望期間を必ず入力する。期間が広すぎるとレスポンスが長くなるため、まずは 1〜2 週間に絞るのが推奨。

## シナリオ仕様
- シナリオキー: `kate`
- 必要な MCP: `google-calendar`（`scenarioMcpBindings.requiredMcpServers` で指定）
- 代表的なツール呼び出しフロー:
  1. `list_calendars` で対象カレンダーの存在を確認（任意）
  2. 参加者ごとに `get_freebusy` または `get_calendar_events` を同一期間で実行
  3. 共通の空き時間を 30/60 分枠で算出し、最大 3 件提示
  4. 同意が得られたら `create_event` で予定登録し招待を送付

## トラブルシュート
- ツール一覧に Google カレンダー MCP が見えない: `config/mcp.servers.yaml` の `id` が `scenarioMcpBindings` の `requiredMcpServers` と一致しているか確認。
- OAuth 失敗: ブラウザのポップアップブロックを解除し、再度シナリオを開始して許可をやり直す。Cloud Run 版ではログに出る URL を直接ブラウザで開けることを確認する。
- 401 / 接続失敗: `GOOGLE_CALENDAR_MCP_SHARED_SECRET` の値が本体サービスと Cloud Run MCP で一致しているか確認。`MCP_HTTP_SHARED_SECRET` が設定されている場合、HTTP リクエストヘッダー `x-mcp-shared-secret` が必須になる。
- Free/Busy が空で返る: 期間が１日未満など極端に短い可能性。開始/終了日時を見直す。
- `No existing trace found` が出る: BFF (`sessionHost.createSession`) 側でトレースを必ず生成する前提に統一したので、`npm ci` でクリーンな依存状態に戻し、`node_modules` への手パッチは行わない。
