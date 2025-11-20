#!/usr/bin/env bash
set -euo pipefail

DEFAULT_SECRET_DIR="/var/secrets/google"

# Auto-detect Cloud Run Secret Manager mounts if env vars are unset
if [[ -z "${GOOGLE_OAUTH_CREDENTIALS:-}" && -f "${DEFAULT_SECRET_DIR}/credentials/google-oauth-desktop.json" ]]; then
  export GOOGLE_OAUTH_CREDENTIALS="${DEFAULT_SECRET_DIR}/credentials/google-oauth-desktop.json"
fi
if [[ -z "${GOOGLE_CALENDAR_MCP_TOKEN_PATH:-}" && -f "${DEFAULT_SECRET_DIR}/token/google-oauth-token.json" ]]; then
  export GOOGLE_CALENDAR_MCP_TOKEN_PATH="${DEFAULT_SECRET_DIR}/token/google-oauth-token.json"
fi

export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/home/nodejs/.config}"
TOKEN_DEST="${XDG_CONFIG_HOME}/google-calendar-mcp/tokens.json"

if [[ -n "${GOOGLE_CALENDAR_MCP_TOKEN_PATH:-}" && -f "${GOOGLE_CALENDAR_MCP_TOKEN_PATH}" ]]; then
  mkdir -p "$(dirname "${TOKEN_DEST}")"
  if [[ "${GOOGLE_CALENDAR_MCP_TOKEN_PATH}" != "${TOKEN_DEST}" ]]; then
    TMP_DEST="${TOKEN_DEST}.tmp"
    if cat "${GOOGLE_CALENDAR_MCP_TOKEN_PATH}" > "${TMP_DEST}"; then
      mv "${TMP_DEST}" "${TOKEN_DEST}"
      chmod 600 "${TOKEN_DEST}"
    else
      echo "[google-calendar-mcp] warning: failed to copy token file" >&2
      rm -f "${TMP_DEST}"
    fi
  else
    chmod 600 "${TOKEN_DEST}"
  fi
fi

PORT="${PORT:-8080}"
HOST="${HOST:-0.0.0.0}"
TRANSPORT_MODE="${TRANSPORT:-http}"

echo "[google-calendar-mcp] starting http server on ${HOST}:${PORT} (transport=${TRANSPORT_MODE})" >&2
exec node build/index.js --transport "${TRANSPORT_MODE}" --host "${HOST}" --port "${PORT}"
