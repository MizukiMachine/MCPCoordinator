# Cloud Run デプロイ手順

Next.js 製の BFF（API）とフロントエンドを **1つの Cloud Run サービス** としてデプロイする手順です。  
プロジェクトIDは Issue 指定の `ai-conversation-engine` をデフォルトにしています。

## 前提
- `gcloud` CLI がインストール済みで `gcloud auth login` 済み。
- Google Cloud APIs の有効化権限を持つこと（Cloud Run / Cloud Build / Artifact Registry）。
- 必須シークレットをローカル環境変数として用意すること  
  `OPENAI_API_KEY`, `BFF_SERVICE_SHARED_SECRET`, `NEXT_PUBLIC_BFF_KEY`（プロトタイプでは同一値でOK）。

## スクリプトで実行（推奨）
```bash
export PROJECT_ID=ai-conversation-engine
export REGION=asia-northeast1               # 任意: 東京リージョン
export SERVICE_NAME=mcp-coordinator         # 任意: サービス名
export OPENAI_API_KEY=sk-xxxx
export BFF_SERVICE_SHARED_SECRET=dev-change-me
export NEXT_PUBLIC_BFF_KEY=dev-change-me

./scripts/deploy-cloud-run.sh
gcloud run services describe ${SERVICE_NAME} \
  --project ${PROJECT_ID} --region ${REGION} \
  --format='value(status.url)'
```
- スクリプト内部で必要APIを自動有効化し、`gcr.io/${PROJECT_ID}/${SERVICE_NAME}:<git-short-sha>` へビルド→Cloud Runへデプロイします。

## 手動で行う場合（参考）
```bash
IMAGE=gcr.io/${PROJECT_ID}/${SERVICE_NAME}:$(git rev-parse --short HEAD)
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project ${PROJECT_ID}
gcloud builds submit --project ${PROJECT_ID} --tag ${IMAGE}
gcloud run deploy ${SERVICE_NAME} \
  --project ${PROJECT_ID} --region ${REGION} \
  --image ${IMAGE} --platform managed --allow-unauthenticated --port 3000 \
  --set-env-vars "OPENAI_API_KEY=${OPENAI_API_KEY},BFF_SERVICE_SHARED_SECRET=${BFF_SERVICE_SHARED_SECRET},NEXT_PUBLIC_BFF_KEY=${NEXT_PUBLIC_BFF_KEY}"
```

## CI/CD（Cloud Build トリガー）で自動デプロイする
1. `cloudbuild.yaml` をリポジトリ直下に追加済みです。`_REGION`（デフォルト asia-northeast1）と `_SERVICE_NAME`（デフォルト mcp-coordinator）は必要に応じて書き換えてください。
2. Secret Manager に以下のシークレットを作成し、最新バージョンに値をセットします。
   - `OPENAI_API_KEY`
   - `BFF_SERVICE_SHARED_SECRET`
   - `NEXT_PUBLIC_BFF_KEY`
3. Cloud Build のデフォルトサービスアカウント（`${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com`）にロールを付与します。
   - Cloud Run Admin (`roles/run.admin`)
   - Artifact Registry Writer (`roles/artifactregistry.writer`)
   - Service Account User (`roles/iam.serviceAccountUser`)  ※デプロイ先の実行SAを利用するため
   - Secret Manager Secret Accessor (`roles/secretmanager.secretAccessor`)
4. Cloud Console → Cloud Build → トリガー → 「トリガーを作成」
   - ソース: GitHub の `main`（または `develop`）ブランチ
   - ビルド構成: リポジトリの `cloudbuild.yaml`
   - 置換: 必要に応じて `_REGION`, `_SERVICE_NAME` を設定
5. 以後、対象ブランチに push すると Cloud Build がコンテナをビルド → Artifact Registry に push → Cloud Run にデプロイし、Secrets を Cloud Run 環境変数として注入します。

## 環境変数メモ
- **必須**: `OPENAI_API_KEY`, `BFF_SERVICE_SHARED_SECRET`, `NEXT_PUBLIC_BFF_KEY`
- **Realtime 音声/モデル**（指定がなければスクリプトがデフォルトを投入）  
  `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_TRANSCRIPTION_MODEL`, `OPENAI_REALTIME_VOICE`, `NEXT_PUBLIC_REALTIME_MODEL`, `NEXT_PUBLIC_REALTIME_TRANSCRIPTION_MODEL`, `NEXT_PUBLIC_REALTIME_VOICE`
- **ログ転送**: `NEXT_PUBLIC_CLIENT_LOG_ENDPOINT`（デフォルト `/api/client-logs`）
- **GCP/RAG**: `GOOGLE_CLOUD_PROJECT_ID`（既定で `PROJECT_ID`）、`GOOGLE_APPLICATION_CREDENTIALS`, `GEMINI_FILE_SEARCH_DATA_STORE`, `RAG_SOURCE_DRIVE_ID` などは必要に応じて Secret Manager から参照させる。
- **ファイルアップロード**: `IMAGE_UPLOAD_TARGET=gcs` を推奨。`IMAGE_UPLOAD_GCS_BUCKET` と任意の `IMAGE_UPLOAD_GCS_PREFIX` を設定する。ローカル開発・簡易検証は `IMAGE_UPLOAD_TARGET=local` で `IMAGE_UPLOAD_DIR`（既定 `/app/var/uploads/images`）へ保存。

## 動作確認チェックリスト
1. サービスURLにブラウザでアクセスし、通常の UI 表示とマイク権限が動作すること
2. `curl -H "x-bff-key: ${NEXT_PUBLIC_BFF_KEY}" -X POST "$SERVICE_URL/api/session" -d '{"agentSetKey":"上司"}'` が `200` を返すこと
3. `gcloud run logs read ${SERVICE_NAME}` で BFF の structured log が流れていること
4. 画像アップロードや Google カレンダー MCP が必要な場合は、該当環境変数と認証情報を Secret Manager 経由で注入する

## 設計メモ
- `next.config.ts` を `output: "standalone"` に設定し、Dockerfile で `.next/standalone` を用いた最小ランタイムを構築しています。
- BFF とフロントを同一オリジンでホストするため、クライアントは相対パス `/api/*` のまま利用できます（CORS設定不要）。
