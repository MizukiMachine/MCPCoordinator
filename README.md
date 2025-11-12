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



