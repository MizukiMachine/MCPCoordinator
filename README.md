# エージェントデモ

OpenAI Realtime API + Agents SDK デモです。  
シナリオ（エージェント集合）の切り替え、イベントログ、モデレーション結果などをブラウザ上で追跡できます。

## TL;DR
- Realtime API と @openai/agents@0.3.0 を使ったマルチエージェントのPoC実装
- Next.js 15 + React 19 + TypeScript で構築し、UIは日本語化済み
- 5つのデモシナリオを試せる（Simple / Retail / Chat Supervisor / Tech Parallel / Med Parallel）

## 大型改修サマリ (2025-11)
### 目的
- Realtime機能をBFF(API)化してクライアント依存を分離
- 画像入力と外部APIブリッジを統一インターフェイスで扱い、今後のMCPプラグイン拡張に備える
- CoreデータはローカルDB/ベクトルストアで保持しつつ、RAGにはGemini File Search + Drive同期を採用

### 非目的
- SOC2/ISMAP等の本番セキュリティ監査、WAF、OAuth再設計は本タスクでは未着手
- 画像ウイルススキャンや高度モデレーションはインターフェイスのみ準備し後続タスクで実装

### 完了条件
1. `doc/IMPLEMENTATION_PLAN.md` に沿ってBFF/API設計→実装→UI切り替えが完了
2. 画像入力・外部API・MCP連携がテスト駆動で検証され、CI（lint/test/e2e）がグリーン
3. `doc/GCP_FILE_SEARCH_SETUP.md`/`doc/rag-playbook.md` の手順に従い、Gemini File Search + Drive同期が有効化され容量/権限管理を満たす

### 実装パス概要
1. **0. 事前準備**: 環境変数整備、lint/testベースライン記録、1ページ提案書の追加、GCP/RAG運用要件の整理
2. **1. API化**: SessionManager抽出、Next.js API Route化、zodバリデーションと共通エラーハンドラの導入
3. **2. 画像入力**: `/api/session/{id}/event` に画像・メタデータを追加し、ストレージへのオフロードHookを設計
4. **3. MCP対応**: ServiceManager配下にMCPプラグインを登録し、シナリオごとのオン/オフ切替を実装
5. **4. File Search統合**: Google Drive分類/容量設計に沿って同期し、RAGハンドラから File Search を叩く

詳細は `doc/IMPLEMENTATION_PLAN.md` を参照してください。

## プロジェクト概要
- Web クライアントは `src/app` にあり、Transcript／イベントログ／ツールバーを個別コンポーネントとして分離
- エージェント定義は `src/app/agentConfigs/` 以下にまとまっており、SDK へそのまま渡せる JSON 互換構造

## 手順
1.  `npm install` 
2.  `.env` に`OPENAI_API_KEY` など必要な環境変数を設定
3.  `npm run dev`
4. ブラウザで [http://localhost:3000](http://localhost:3000) 
- 右上の「シナリオ」「エージェント」プルダウンで構成を切り替え可能 (`?agentConfig=` クエリにも対応)

## BFF Session API
- `/api/session` でセッションを作成し、レスポンスに含まれる `streamUrl` を `EventSource` で購読すると、RealtimeイベントをSSEで受信できます。
- クライアントは `x-bff-key` ヘッダ（`NEXT_PUBLIC_BFF_KEY`）を付与して各APIを呼び出します。サーバー側は `BFF_SERVICE_SHARED_SECRET` と突き合わせます。
- `/api/session/{id}/event` は `kind` ベースの汎用コマンド（`input_text` / `input_audio` / `input_image` / `control` など）でRealtimeにイベントを転送します。
- `/api/session/{id}/stream` は 25 秒ごとの `heartbeat` とセッション状態イベント（history/guardrail/agent_handoff等）を SSE で配信します。
- 詳細なパラメータとエラールールは `doc/api-spec.md` を参照してください。`curl -H "x-bff-key: $NEXT_PUBLIC_BFF_KEY" -X POST http://localhost:3000/api/session -d '{"agentSetKey":"chatSupervisor"}'` でローカル動作確認できます。

## クライアント実装メモ（BFF利用時に必要な対応）
本BFFサーバーは「どのデバイスからでも Realtime API + Agents SDK を **外部APIとして安定稼働させる**」ことを目的にしています。ただしBFFは「セッション管理・APIキー隠蔽・イベント中継」を担うレイヤーであり、**クライアント側にも下記の実装／工夫が必要**です。READMEを参照しながらAPIリファレンスを書く場合も、以下を前提としてください。

| 目的 | ブラウザ実装サンプル | 他デバイスで必要なこと |
| --- | --- | --- |
| 音声入力（Upload） | `useMicrophoneStream` が `MediaDevices.getUserMedia` → `ScriptProcessorNode` で `24kHz mono PCM` を生成し、`sendAudioChunk` で `/api/session/{id}/event` へ `input_audio` を送信 | 端末固有のマイクAPIでPCMを取得し、同じ `input_audio` イベントを組み立てる。Push-to-Talk 切替時は `input_audio_buffer.clear/commit` を忘れずに送る |
| 割り込み（Barge-in）検知 | `SpeechActivityDetector` + `useMicrophoneStream` でユーザー音声を検知し、`interrupt()` を呼ぶ前に `PcmAudioPlayer.stop()` でローカル再生を停止 | 端末側でも「音声エネルギー検知 → `control: { action: 'interrupt' }` 送信 → ローカル再生停止」の3ステップを用意する |
| 音声再生（Playback） | `PcmAudioPlayer` が `transport_event` の `response.output_audio.delta` をキューイング。`mute` / `interrupt` 時は `stop()` を呼んで即停止 | デバイス固有のオーディオプレイヤーで同様にキュー管理し、任意タイミングで停止できるよう抽象化する |
| セッション維持と再接続 | `useRealtimeSession` が SSE (`/api/session/{id}/stream`) を EventSource で購読し、`status` や `heartbeat` を監視。`x-bff-key` もここで付与 | どのクライアントでも SSE/WS を購読し、`DISCONNECTED` 時の再接続ハンドリングと `x-bff-key` 付与を実装する |
| ログとメトリクス | `useEvent().logClientEvent` から `barge_in_detected` などを送信し、BFFの `terminallog.log` に残す | 同じイベント名でログを送れば、BFF側の監査や運用ツールをそのまま流用できる |

実装そのものはデバイスごとに書き直す必要がありますが、参照すべきAPI・制御フロー・ログ粒度はこの表に沿って共通化できます。


## 言語・仕様しているモデルの説明
- すべてのエージェントは、日本語で挨拶・案内・フィラーを行うようプロンプトを統一しています。ユーザーが他言語を希望した場合のみ一時的に切り替わります。
- 背後で使用しているモデルは以下の通りです。
  - `gpt-realtime` : 現場エージェント（chatSupervisor / customerServiceRetail / simpleHandoff）
  - `gpt-4o-transcribe` : 音声入力のリアルタイム文字起こし
- `gpt-5-mini` : ガードレール／モデレーション
  - `gpt-5` : スーパーバイザーおよび返品可否判定など高リスク判断

## Creative Parallel Lab（開発者向け）
- ルート: [http://localhost:3000/creative-lab](http://localhost:3000/creative-lab)
- 映画評論家／文学評論家／コピーライターをプルダウンで切り替え、テキスト入力だけで単独 vs 並列の差分を比較できます。
- 単独レーン: 選択ロールのシステムプロンプトで gpt-5-mini を1回実行。Latency/Token情報をカード表示。
- 並列レーン: **MoA + Multi-Judge + Aggregation** 方式。4候補を完全並列生成 → 3審判が独立に採点 → 平均スコアとタイブレーク（短さ→レイテンシ→生成順）で勝者/Runner-upを決定。勝者テキストを基本採用しつつ、スコア差が小さく Runner-up が高得点だった場合のみ1行追加マージを行います。
- 審査サマリ・決定理由・平均スコア表・審判別スコアをUIに表示し、`terminallog.log` にもJSONログを残すため、比較実験や振り返りが容易です。
