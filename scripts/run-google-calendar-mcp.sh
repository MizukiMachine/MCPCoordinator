#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_DIR="$ROOT_DIR/external/google-calendar-mcp"
CRED_FILE_DEFAULT="$ROOT_DIR/secrets/google-oauth-desktop.json"
TOKEN_FILE_DEFAULT="$ROOT_DIR/secrets/google-oauth-token.json"

export GOOGLE_OAUTH_CREDENTIALS="${GOOGLE_OAUTH_CREDENTIALS:-$CRED_FILE_DEFAULT}"
export GOOGLE_CALENDAR_MCP_TOKEN_PATH="${GOOGLE_CALENDAR_MCP_TOKEN_PATH:-$TOKEN_FILE_DEFAULT}"
export GOOGLE_OAUTH_SCOPES="${GOOGLE_OAUTH_SCOPES:-https://www.googleapis.com/auth/calendar}"

if [[ ! -d "$MCP_DIR" ]]; then
  echo "[run-google-calendar-mcp] Submodule not found: $MCP_DIR" >&2
  exit 1
fi

if [[ ! -f "$GOOGLE_OAUTH_CREDENTIALS" ]]; then
  echo "[run-google-calendar-mcp] Credentials file not found: $GOOGLE_OAUTH_CREDENTIALS" >&2
  exit 1
fi

cd "$MCP_DIR"

npm_common_flags=(--install-strategy=hoisted --install-links=false)

if [[ ! -d "node_modules" ]]; then
  echo "[run-google-calendar-mcp] Installing dependencies via npm ci..." >&2
  if ! npm ci "${npm_common_flags[@]}"; then
    echo "[run-google-calendar-mcp] npm ci failed, retrying with npm install --package-lock=false (will resolve latest compatible versions)" >&2
    rm -rf node_modules
    npm install --package-lock=false "${npm_common_flags[@]}"
  fi
fi

BUILD_MAIN="$MCP_DIR/build/index.js"
needs_build=0
if [[ ! -f "$BUILD_MAIN" ]]; then
  needs_build=1
elif find "$MCP_DIR/src" -type f -newer "$BUILD_MAIN" | read -r _; then
  needs_build=1
fi

if [[ $needs_build -eq 1 ]]; then
  echo "[run-google-calendar-mcp] Building google-calendar-mcp (local submodule)..." >&2
  npm run build
fi

echo "[run-google-calendar-mcp] starting local server | creds=$GOOGLE_OAUTH_CREDENTIALS token=$GOOGLE_CALENDAR_MCP_TOKEN_PATH" >&2
exec node "$BUILD_MAIN" "$@"
