# このプロジェクトで採用する並列実装の基本方針

## MoA + Multi-Judge + Aggregation 式

- ゴールは「並列アーキテクチャ自体で回答クオリティを底上げする」こと。単なる比較ではなく、MoA (Mixture-of-Agents) を通じて品質改善を狙う。
- 生成・評価ともに並列化し、**速い**・**単純**・**安定して勝者を決めやすい**という条件を満たす。
- 勝者単独採用をベースラインとしつつ、必要に応じて優勝・準優勝をマージすることでさらなる品質向上を図る。


##  評価AI（審判側）がやること

### 役割

* 審判は3人（A/B/C）。全員が**同じ候補群**を見て、各候補に点数と理由をつける
* 3人は**同時並行**で動く（順番待ちしない）


### 進め方（流れ）

1. **提示順をランダム化**
   候補を見せる順番を毎回シャッフルします。特定の順番に引っぱられないようにするためです。

2. **各審判が独立に採点**
   Aは「正確さ」、Bは「論理の組み立て」、Cは「指示どおりか」を重視して採点します。
   例：候補1に対して A=8点/B=7点/C=9点…のように。

3. **時間切れの扱い**
   3人のうち1人が時間切れでも、残り2人の点で先に進みます（最低2人分あればOK）。

4. **集計（平均するだけ）**
   候補ごとに3人（または2人）の**平均点**を出します。
   この段階では重み付けや難しい合意はしません。まずは**単純平均**です。

5. **早期決定（早期停止）**
   1位と2位の平均点の差が一定以上（例：1.0点以上）あれば、そこで勝者を確定します。
   差が小さいときだけ次の判定へ。

6. **タイブレーク（同点のときの決め方）**
   平均点が並んだら、次の順で1回だけ決めます。
   ①短く簡潔な方 → ②返答が返るまでの速さ
   これでも同じなら先着で決めて終了。

7. **最終回答（条件付きマージ）**
   - デフォルト: 勝者テキストをそのまま採用し、MoAの選抜効果を計測する。
   - マージON条件（例）: 平均差 < 0.5 かつ Runner-up 平均 ≥ 8点。条件を満たすと「マージエージェント」が勝者テキストを骨格に Runner-up の独自価値を1行だけ追加する。
   - マージON/OFFと勝者原文は両方ログに残し、品質向上への寄与を解析できるようにする。

## Realtime BFF / Cloud Run レイヤー (2025-11)

- **framework/**: `auth/JwtVerifier` + `errors/HttpError` で横断的な認証・例外ハンドリングを提供。
- **services/realtime/**: `SessionManager` が JWT ベースのセッションを生成し、`OpenAIRealtimeWebSocket` と `FfmpegWebmOpusTranscoder` で音声をPCM化 → Realtime APIへ中継。EventBusでUIへ配信。
- **API Gateway (Next.js App Router)**:
  - `POST /api/session` : セッション作成（Cloud RunでもNode runtimeで稼働）。
  - `GET /api/session/{id}/stream` : WebSocket (JWTはクエリ `token` で受理)。
  - `POST /api/session/{id}/event` : WebSocket非対応デバイス向けフォールバック。
  - `POST /api/auth/token` : 開発用JWT発行（本番はIdPで置換予定）。
- **Cloud Run デプロイ**:
  - プロジェクトID: `ai-conversation-engine`
  - `gcloud run deploy voice-bff --source . --region=asia-northeast1 --allow-unauthenticated` を想定。環境変数で `OPENAI_API_KEY`, `BFF_JWT_*`, `BFF_ALLOW_DEV_TOKENS=false` を指定。
  - WebSocketサポートのため、最小インスタンス1・コネクション900/インスタンスを目安にし、将来的にはRedisを介したpub/subを検討。
