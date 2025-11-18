# タイトル案
Tracing整備: BFFでトレースコンテキストを必須化し、node_modules 手パッチを除去する

# 背景
- Google Calendar MCP シナリオ「ケイト」でセッション作成時に `No existing trace found` が発生していた。
- 応急対応として `node_modules/@openai/agents-realtime/dist/bundle/openai-realtime-agents.mjs` に「トレース不在時にダミーTraceを生成する」手パッチを実施した。
- 現状は BFF (`sessionHost.createSession`) 側で `getOrCreateTrace` によりトレースを必ず生成するようにしたため、ライブラリ手パッチなしでも動く構造になっているはず。
- 将来の安定運用とライブラリ更新容易性のため、手パッチを撤廃し、BFF側の正式なトレース生成だけで成立することを確認したい。

# やりたいこと
1. BFFでのトレース生成を前提に、`node_modules` 手パッチを削除する。
   - パッチ対象: `node_modules/@openai/agents-realtime/dist/bundle/openai-realtime-agents.mjs` （`ks` / `as` まわりのダミーTrace生成コード）
2. `npm install` し直してクリーンな依存状態に戻し、手パッチが不要で動くことを確認する。
3. Realtimeセッションの生成・MCP接続・OAuth フローが成功することを再検証する。
4. 必要なら README / doc に「トレース前提（BFFでTraceを張る）」の運用メモを追記する。

# 受け入れ条件
- `npm run dev` 起動 → 「ケイトシナリオに切り替えて」でセッション作成が成功し、（未認証なら）OAuth 同意ウィンドウが開く。  
- `node_modules` に手パッチが存在しない（再インストール後のクリーン状態）。  
- `terminallog.log` に `No existing trace found` が再発しない。  
- `npm run lint` / `npm test` がグリーン。

# 実装メモ / 手順案
1. `node_modules` 手パッチを削除（差分クリア）。`npm ci` でクリーンインストール。
2. BFF側のトレース付与（現状 `sessionHost.createSession` で `getOrCreateTrace` を呼んでいる）が十分か再確認。必要なら他のエントリポイントにも `getOrCreateTrace` を追加。
3. ローカルで再起動し、`kate` シナリオで動作確認。OAuth 初回フロー、MCP接続、予定取得/作成を手動スモーク。
4. 確認ログ（成功時の `terminallog.log` 抜粋）を残す。
5. README または doc/google-calendar-mcp.md に「トレースはBFFで生成、ライブラリパッチ不要」の方針を一文追記（必要なら）。

# 参考情報 / 現状
- BFF側トレース生成: `services/api/bff/sessionHost.ts` の `createSession` で `getOrCreateTrace(() => createSessionImpl(), { name: session:create:${agentSetKey} })` を実装済み。
- Realtime tracing は `openAIRealtimeTransport.ts` で `tracing: false` を明示（今はトレース情報を外部送信していない）。
- パッチ箇所: `node_modules/@openai/agents-realtime/dist/bundle/openai-realtime-agents.mjs` の `ks` / `as` で「Trace不在ならダミー生成」を追加済み（要削除）。
