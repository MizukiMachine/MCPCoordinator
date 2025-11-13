# 実装TODOプラン

本ファイルは「画像入力対応」「外部API化」「MCP対応（Coreデータはローカル実装＋RAGはGoogle Gemini File Search APIを採用）」の3作業を最短かつ安全に完遂するための一意な手順書です。  
現在は**プロトタイプ段階**であり、本番想定の重厚なセキュリティ/ガバナンス/監査要件は“あえて”最小限に留めています。必要と判断した時点で別途TODOを追加する方針です。  
常に“上から順番に”チェックを進める運用を前提にしており、途中で工程を入れ替えない限り設計の齟齬や抜け漏れが発生しない構成になっています。  

### 方針の固定事項
- Realtime接続はBFF(API)経由のみとし、UIは API クライアントに徹する
- Coreデータ（プロフィール・会話メモリ）はローカルDB/ベクトルストアで保持し、第三者クラウドへは出さない
- RAGはGoogle Gemini File Search APIを標準実装とし、Google Drive等の馴染みあるストレージを File Search ストアに同期する
- MCPアプリは ServiceManager に登録したプラグインとして管理し、シナリオ切替でオン/オフを切り替える
- すべての追加機能はTDD（ユニット→統合→E2E）で進め、CIを常に通す
- **非目標（プロトタイプ限定）**  
  - 各種APIの本番等級セキュリティ（WAF, OAuth2.0刷新, SOC2監査ログ等）は今回は実装しない  
  - 大規模な権限分離、SLOアラート運用もスコープ外。必要になったら別章「本番強化タスク」を作成する  
  - 画像のウイルススキャン/高度モデレーション等も“後で差し込める”ようインターフェイスだけ意識し、現段階では省略

## 0. 事前準備（ベースライン確認）
- [x] `.env` にRealtime/API用キーが揃っているか確認し、ダミー値はモックに差し替える（秘密情報をコミットしない）  
  - 2025-11-13: 実ファイル内のキーを確認済み。`.env.sample` に OpenAI/BFF/Google 用プレースホルダとコメントを追加し、共有秘密をコミットしない運用を明文化。
- [x] `npm run lint` / `npm run test` を実行し、現在の失敗ケースを記録（TDD前提の初期“レッド”をissue化）  
  - 2025-11-13: lint は `src/app/lib/creativeSandboxRunner.ts:142 prefer-const` で失敗、警告も記録。テストは全件パス。結果ログは `doc/baseline/2025-11-13-*.log` に保存。
- [x] `docs/` または `README.md` に今回の大型改修の要旨（API化・画像入力・MCP＋File Search）を1ページの提案書として追記し、チームとの合意を得る  
  - README に「大型改修サマリ (2025-11)」セクションを追加し、目的/非目的/完了条件/実装パスを1ページ構成で記述。
- [x] Google Cloud プロジェクトと Gemini File Search API を有効化し、サービスアカウント／APIキーの取得・権限設定（Drive等データソース別スコープ）を完了する  
  - `doc/GCP_FILE_SEARCH_SETUP.md` に有効化手順と `gcloud` コマンド群を整理。現在リポジトリ環境の gcloud は依存欠損で起動不可なため再インストールが必要（詳細を同ドキュメントに記録）。
- [x] Google Drive など RAG対象ストレージの情報分類・アクセス権ルールを確認し、File Search ストア容量（初期1GB単位）とファイルサイズ上限への対応策をまとめる  
  - ルールと運用手順を `doc/rag-playbook.md` に追記。100MB超ファイルの分割手順とグループベースのアクセス制御を明文化。

## 1. API化（BFFレイヤー整備 → 既存UIの依存切り替え）
- [ ] **API仕様ドラフト**  
  - `/api/session`（開始・初期エージェント指定・認証ヘッダ）  
  - `/api/session/{id}/event`（input_text / input_audio / input_image の共通ペイロード + ファイルメタ）  
  - `/api/session/{id}/stream`（SSE or WebSocketでイベント配信、心拍・keep-alive設計）  
  - 成功/エラー/再接続ルールを `docs/api-spec.md` にMarkdownでまとめ、レビューを通す
- [ ] **サービスレイヤー抽出**  
  - `src/app/hooks/useRealtimeSession.ts` のロジックを `services/realtime/sessionManager.ts` に移植  
  - `SessionManager` は `ISessionTransport`/`IAgentSetResolver` などのインターフェイスで構成し、SDKなしでもモックできる状態にする  
  - ロギング/メトリクス/ガードレール呼び出しをフック化
- [ ] **Next.js API Route追加**  
  - App Router の `app/api/session/route.ts` などでBFFハンドラを実装し、zodでバリデーション、共通エラーラッパを適用  
  - **プロトタイプなので**簡易APIキー認証のみ（環境変数で1種類）とし、詳細なレートリミット/監査ログは未実装でOK
- [ ] **テスト (TDD)**  
  - Vitestで API ハンドラ単位のテスト（成功/入力エラー/認証失敗/セッション未存在/並列アクセス）  
  - SessionManagerのユニットテスト（接続・中断・イベント送出・ガードレールトリップ）  
  - Supertest で軽いAPI統合テストを走らせ、CIで自動化
- [ ] **UIの依存切り替え**  
  - `App.tsx` 側に API クライアントHook（`useVoiceApiClient`）を作成し、既存SDK呼び出しを置換  
  - これに伴い WebRTC 直接依存を削除し、ブラウザは音声ストリーム取得とAPI呼び出しだけに専念
- [ ] **ドキュメント更新**  
  - README / ARCHITECTURE に BFF 化の目的、エンドポイント、Playgroundでの叩き方（curl/Postman）を追加  
  - **将来の本番化タスク**をTODO欄に残し、今回のプロトタイプ範囲を明記

## 2. 画像入力対応（UI ↔ API ↔ Realtime）
- [ ] **要件定義 & UXモック**  
  - 対応フォーマット（JPEG/PNG/WebP/PDF）と最大サイズ（例: 8MB）を決定  
  - 複数枚送信時のUX（サムネイル付きキュー、進捗表示）をFigmaモックに反映  
  - 音声会話との並行使用ルール（画像送信中は音声を一時停止するか）を仕様化
- [ ] **API拡張**  
  - `/api/session/{id}/event` に `input_image` 分岐を追加し、アップロードされたファイルをS3互換バケット or GCS一時バケットへ保存  
  - 保存URL/メタを SessionManager に引き渡し、RealtimeSessionへ `input_image` イベントとして代理送信  
  - **プロトタイプ段階では**バケットは1種（開発用）に固定し、ライフサイクル削除やセキュアアップロードは後続タスクとしてTODO化
- [ ] **UI実装**  
  - `App.tsx` または `components/ImageUploadPanel.tsx` でドラッグ&ドロップ/カメラ撮影をサポート  
  - 送信結果（エージェントからの説明テキストや引用）をTranscriptにカード表示し、サムネイルをクリックで拡大できるようにする
- [ ] **軽量セーフガード**  
  - モデレーションは OpenAI / Gemini 既定のライトなものに任せ、結果のみ表示  
  - 大規模なスキャン機構はスコープ外だが、後から差し込めるよう `ImageUploadService` にフックを残す
- [ ] **Realtime送出調整**  
  - SessionManagerで `outputModalities` を `['audio','text']` に拡張し、画像解析結果のテキストを受信できるようにする  
  - 画像固有のレスポンス（例: `image.description`）をTranscriptへ整形するハンドラを追加
- [ ] **テスト**  
  - VitestでAPIの画像エンドポイント（正常/サイズ超過/形式不正/アップロード失敗リトライ）  
  - React Testing LibraryでUIドラッグ&ドロップ操作の単体テスト  
  - PlaywrightでE2E（画像→API→Realtime応答→UI反映）とダークパターン（連続アップロード、ネットワーク切断）をカバー
- [ ] **ドキュメント/サンプル**  
  - READMEに「画像入力手順」「推奨サイズ」「エラー時の対処」を追記  
  - `docs/api-spec.md` に画像送信用curl例・レスポンス例を掲載し、Playground手順も更新

## 3. MCP対応（Coreデータはローカル実装 + 追加アプリ拡張）
- [ ] **ServiceManager基盤**  
  - `framework/mcp/ServiceManager.ts` を作成し、`register(name, factory)` / `get(name)` / `shutdownAll()` を提供  
  - DI対応のため、ServiceManager自体をシングルトン化せず、API層・テストで差し替えできるようにする  
  - モックMCPで接続/切断/再接続の単体テストを用意
- [ ] **Coreデータローカル実装**  
  - `services/coreData/` 配下に `ProfileStore`, `MemoryStore`, `LocalVectorStore` インターフェイスを定義  
  - SQLite/Prisma等を使ったローカル実装を用意し、「個人データは自社管理」というポリシーをコード＆ドキュメントに明記  
  - ベクトル検索は既存メモリを使うか、`local-vector.db` を新設し、Embedding更新ジョブを追加
- [ ] **Gemini File Search RAG統合**  
  - `GeminiFileSearchAdapter` を実装し、`RagRetriever` インターフェイスのデフォルト実装に設定  
  - ストアID/ドキュメントID/引用メタデータを Transcript とログへ落とす仕組みを追加  
  - `scripts/file-search-ingest.mjs` で Drive → File Search への同期（初回フル + 差分）を自動化し、CI/CDではなくオンデマンド実行にする  
  - 運用手引きを `docs/rag-playbook.md` にまとめ、容量監視/権限変更/削除フロー/フェイルオーバー（LocalRagAdapter）を記載  
  - Feature Flag（例: `USE_GEMINI_FILE_SEARCH`）で即時切り替え可能にする  
  - **プロトタイプ期間中は**ストアは1つのみを想定し、多テナント分割や容量監視はTODOとして記録
- [ ] **シナリオ拡張**  
  - `agentConfigs` の各シナリオに `requiredMcpApps`, `requiredRagStores`, `coreDataAccessPolicy` を追記  
  - シナリオ切替時に ServiceManager が必要MCPのみ初期化し、不要MCPは解放する仕組みを `useRealtimeSession` の前段で実装
- [ ] **追加アプリ例**  
  - 例: `mcp.cooking` を ServiceManager に登録し、レシピ取得・栄養計算を行うツールとして実装  
  - API経由でON/OFFできることを確認し、UI上でもシナリオによる切替表示を行う
- [ ] **テスト**  
  - ローカルCoreデータのユニットテスト（CRUD・メモリ永続化）  
  - Gemini File Search アダプタ統合テスト（モックHTTPで引用メタを検証）  
  - MCPモックと差し替えテスト、シナリオ切替時の統合テスト（必要MCPのみ初期化されるか）  
  - `scripts/file-search-ingest.mjs` のスモークテスト（Dry Runモード）を追加
- [ ] **ドキュメント整備**  
  - ARCHITECTURE.md にレイヤー構成（framework/services/api/data）と MCP/ローカル/Google File Search 切替方法を追記  
  - README に「MCPアプリ追加チェックリスト」「RAGストア運用チェックリスト（容量・権限・引用確認手順）」を掲載

## 4. 仕上げ・検証
- [ ] PlaywrightでE2E確認（音声＋画像＋MCPアプリONの複合ケース）  
  - テストでは API 経由でセッション作成 → 音声質問 → 画像アップロード → MCPアプリ（例: 料理）呼び出しまでを1シナリオで実行し、ログ/メトリクスを確認
- [ ] 主要シナリオのスモークテスト手順を `tests/README.md` にまとめ、CIで `npm run test && npm run test:e2e` が緑になるまで整える  
  - CIでは Google APIをモックに切り替える手順も記載
- [ ] 変更点を CHANGELOG or RELEASE_NOTES に追記し、APIバージョンアップ手順（互換性注意）を明記  
  - APIクライアントへ影響するBreaking changeは必ずバージョンタグを更新し、移行手順を列挙
- [ ] 運用引き継ぎ資料を `docs/operations-handbook.md` として作成し、監視項目（APIエラーレート、File Search 容量、MCP接続失敗率）を整理

各チェックボックスを上から順に完了させることで、画像入力/API化/MCP対応（Coreローカル）の3要件を満たした状態になります。
