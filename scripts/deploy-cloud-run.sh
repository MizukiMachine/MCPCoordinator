#!/usr/bin/env bash
set -euo pipefail

# Cloud Run へBFF+フロントをデプロイするための簡易スクリプト。
# 事前に `gcloud auth login` と `gcloud config set project ${PROJECT_ID}` を実施してください。

PROJECT_ID=${PROJECT_ID:-ai-conversation-engine}
REGION=${REGION:-asia-northeast1}
SERVICE_NAME=${SERVICE_NAME:-mcp-coordinator}
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:$(git rev-parse --short HEAD)"
PORT=${PORT:-3000}

REQUIRED_ENVS=(OPENAI_API_KEY BFF_SERVICE_SHARED_SECRET NEXT_PUBLIC_BFF_KEY)
for env_name in "${REQUIRED_ENVS[@]}"; do
  if [ -z "${!env_name:-}" ]; then
    echo "環境変数 ${env_name} が未設定です。デプロイ前に export ${env_name}=... を指定してください。" >&2
    exit 1
  fi
done

echo "Enabling required APIs (run, cloudbuild, artifactregistry) for project ${PROJECT_ID}..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  --project "${PROJECT_ID}" --quiet

echo "Building image: ${IMAGE}"
gcloud builds submit --project "${PROJECT_ID}" --tag "${IMAGE}"

echo "Deploying to Cloud Run service: ${SERVICE_NAME} (${REGION})"
gcloud run deploy "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --image "${IMAGE}" \
  --platform managed \
  --allow-unauthenticated \
  --port "${PORT}" \
  --set-env-vars "OPENAI_API_KEY=${OPENAI_API_KEY},BFF_SERVICE_SHARED_SECRET=${BFF_SERVICE_SHARED_SECRET},NEXT_PUBLIC_BFF_KEY=${NEXT_PUBLIC_BFF_KEY},OPENAI_REALTIME_MODEL=${OPENAI_REALTIME_MODEL:-gpt-realtime},OPENAI_REALTIME_TRANSCRIPTION_MODEL=${OPENAI_REALTIME_TRANSCRIPTION_MODEL:-gpt-4o-transcribe},OPENAI_REALTIME_VOICE=${OPENAI_REALTIME_VOICE:-marin},NEXT_PUBLIC_REALTIME_MODEL=${NEXT_PUBLIC_REALTIME_MODEL:-gpt-realtime},NEXT_PUBLIC_REALTIME_TRANSCRIPTION_MODEL=${NEXT_PUBLIC_REALTIME_TRANSCRIPTION_MODEL:-gpt-4o-transcribe},NEXT_PUBLIC_REALTIME_VOICE=${NEXT_PUBLIC_REALTIME_VOICE:-marin},NEXT_PUBLIC_CLIENT_LOG_ENDPOINT=${NEXT_PUBLIC_CLIENT_LOG_ENDPOINT:-/api/client-logs},GOOGLE_CLOUD_PROJECT_ID=${GOOGLE_CLOUD_PROJECT_ID:-${PROJECT_ID}}"

echo "Deployment completed. Run the following to open the service URL:"
echo "gcloud run services describe ${SERVICE_NAME} --project ${PROJECT_ID} --region ${REGION} --format='value(status.url)'"
