# エージェントデモ

OpenAI Realtime API + Agents SDK デモです。  
シナリオ（エージェント集合）の切り替え、イベントログ、モデレーション結果などをブラウザ上で追跡できます。

## TL;DR
- Realtime API と @openai/agents@0.3.0 を使ったマルチエージェントのPoC実装
- Next.js 15 + React 19 + TypeScript で構築し、UIは日本語化済み
- 5つのデモシナリオを試せる（Simple / Retail / Chat Supervisor / Tech Parallel / Med Parallel）

## プロジェクト概要
- Web クライアントは `src/app` にあり、Transcript／イベントログ／ツールバーを個別コンポーネントとして分離
- エージェント定義は `src/app/agentConfigs/` 以下にまとまっており、SDK へそのまま渡せる JSON 互換構造

## 手順
1.  `npm install` 
2.  `.env` に`OPENAI_API_KEY` など必要な環境変数を設定
3.  `npm run dev`
4. ブラウザで [http://localhost:3000](http://localhost:3000) 
- 右上の「シナリオ」「エージェント」プルダウンで構成を切り替え可能 (`?agentConfig=` クエリにも対応)


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

