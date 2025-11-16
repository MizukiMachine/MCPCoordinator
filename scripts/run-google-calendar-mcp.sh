#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRED_FILE_DEFAULT="$ROOT_DIR/secrets/google-oauth-desktop.json"
TOKEN_FILE_DEFAULT="$ROOT_DIR/secrets/google-oauth-token.json"

export GOOGLE_OAUTH_CREDENTIALS="${GOOGLE_OAUTH_CREDENTIALS:-$CRED_FILE_DEFAULT}"
export GOOGLE_CALENDAR_MCP_TOKEN_PATH="${GOOGLE_CALENDAR_MCP_TOKEN_PATH:-$TOKEN_FILE_DEFAULT}"
export GOOGLE_OAUTH_SCOPES="${GOOGLE_OAUTH_SCOPES:-https://www.googleapis.com/auth/calendar}"

if [[ ! -f "$GOOGLE_OAUTH_CREDENTIALS" ]]; then
  echo "[run-google-calendar-mcp] Credentials file not found: $GOOGLE_OAUTH_CREDENTIALS" >&2
  exit 1
fi

echo "[run-google-calendar-mcp] using creds=$GOOGLE_OAUTH_CREDENTIALS token=$GOOGLE_CALENDAR_MCP_TOKEN_PATH" >&2
exec npx -y @cocal/google-calendar-mcp "$@"
