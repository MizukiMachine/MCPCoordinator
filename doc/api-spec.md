# BFF API Specification (Session Service)

本書は `src/app/api/session` 配下で提供するBFF APIの仕様を定義する。Realtime通信は**必ず**本API経由で行い、ブラウザは音声/テキスト/画像イベントをHTTP + SSE/WebSocket over HTTPで受け取るクライアントに徹する。

## 1. 認証
- 共有シークレット `BFF_SERVICE_SHARED_SECRET` を HTTP ヘッダ `x-bff-key` に設定する。
- 未設定 or 不一致の場合は 401 を返す。
- 将来はOAuth等に置き換え予定のため、ヘッダ名はラップせず固定。

## 2. エンドポイント一覧
| Method | Path | 用途 |
| --- | --- | --- |
| POST | `/api/session` | セッション作成・初期接続設定 |
| DELETE | `/api/session/{id}` | セッション終了（クライアントが離脱する際に呼び出し） |
| POST | `/api/session/{id}/event` | 入力イベント（テキスト/音声/画像/生イベント）送信 |
| GET | `/api/session/{id}/stream` | サーバー送信イベント（SSE）購読 |

> 将来 `/api/session/{id}/stream` のみ WebSocket を提供する案もあるが、現時点では Node.js ランタイム互換性の観点で SSE をデフォルトとする。

## 3. リクエスト/レスポンス詳細

### 3.1 POST /api/session
- **ヘッダ**: `x-bff-key`
- **リクエストBody** (`application/json`)
```jsonc
{
  "agentSetKey": "chatSupervisor",      // 必須: `allAgentSets` に存在するキー
  "preferredAgentName": "Alice",        // 任意: シナリオ内の優先エージェント
  "sessionLabel": "web-client:abc",     // 任意: ログ分離用ラベル
  "clientCapabilities": {
    "audio": true,
    "images": true,
    "outputText": true
  },
  "metadata": {
    "browser": "chrome",
    "locale": "ja-JP"
  }
}
```
- **レスポンス**
```jsonc
{
  "sessionId": "sess_c1d704ef9a",           // BFF側で払い出すID
  "streamUrl": "/api/session/sess_c1d704ef9a/stream",
  "expiresAt": "2025-11-16T01:23:45.000Z",
  "heartbeatIntervalMs": 25000,
  "allowedModalities": ["audio", "text"],
  "textOutputEnabled": true,
  "capabilityWarnings": [],
  "agentSet": {
    "key": "chatSupervisor",
    "primary": "SupervisorAgent"
  }
}
```
- `capabilityWarnings`: サーバーのRealtime設定に関する警告一覧。音声権限が無効な場合の理由などを含み、UIがフォールバックUIを表示する際に利用する。
- `allowedModalities`: クライアント視点の利用可能モード。音声が有効なら `"audio"`、`clientCapabilities.outputText !== false` であれば `"text"` が含まれる。
- `textOutputEnabled`: サーバーがテキスト出力を送信するかどうかの真偽値。UI はこの値を見て transcription 処理を有効/無効にする。
- `clientCapabilities.outputText`: 省略時は `true`。`false` にするとサーバー→クライアント間でテキスト転送をスキップする。
- **エラー**: 400（不正入力） / 401（認証） / 500（内部）

### 3.2 DELETE /api/session/{id}
- **用途**: クライアント明示終了。一定時間通信がない場合はBFF側でもTTLで自動終了するが、UI終了時に呼ぶ。
- **クエリ**: `reason`（任意）を付与すると BFF ログに切断理由が記録される。明示指定がない場合は `client_request`。
- **レスポンス**: `{ "ok": true }` or 404/410 when already終了。

### 3.3 POST /api/session/{id}/event
- **リクエストBody** はユニオンタイプ。
```jsonc
{
  "kind": "input_text",
  "text": "こんにちは!",
  "triggerResponse": true,
  "metadata": { "requestId": "req-123" }
}
```
```jsonc
{
  "kind": "input_audio",
  "audio": "<base64 PCM16 chunk>",
  "commit": true,
  "response": true
}
```
```jsonc
{
  "kind": "input_image",
  "encoding": "base64",
  "mimeType": "image/png",
  "data": "<base64>",
  "text": "画像について教えて",
  "triggerResponse": true
}
```
```jsonc
{
  "kind": "event",
  "event": { "type": "session.update", "session": { "modalities": ["text"] } }
}
```
```jsonc
{
  "kind": "control",
  "action": "interrupt" | "mute" | "push_to_talk_start" | "push_to_talk_stop",
  "value": true
}
```
- **レスポンス**: `{ "accepted": true, "sessionStatus": "CONNECTED" }`
- **エラー**: 400 / 401 / 404 / 409 (セッション未接続) / 410 (期限切れ)

### 3.4 GET /api/session/{id}/stream
- **プロトコル**: HTTP/1.1 `text/event-stream`
- **ヘッダ**: `Cache-Control: no-cache`, `Connection: keep-alive`
- **イベント構造**
```
event: status
data: {"status":"CONNECTED","timestamp":"2025-11-15T16:23:45.000Z"}


event: history_added
data: {...Realtime item...}

event: transport_event
data: {...raw Realtime event...}

event: heartbeat
data: {"ts": ... }

event: session_error
data: {"code":"access_denied","message":"Audio output disabled"}
```
- 25秒ごとに `heartbeat` イベントを送信。
- `session_error` は Realtime API の `error` を要約したイベントで、`code`/`message`/`status` を含む。受信時はクライアントが切断処理とユーザー通知を行う。
- `textOutputEnabled=false` のセッションでは、`response.output_text.*` や transcription 系の `transport_event` は SSE 上で送信されない（バンド幅節約）。
- SSE切断時はセッション購読者から除外し、全購読者が0になったら一定時間(60s)後に自動終了。

## 4. エラーコード
| code | 説明 |
| --- | --- |
| `session_not_found` | ID不正 or TTL切れ |
| `session_not_connected` | OpenAI Realtime との接続未確立 |
| `invalid_event_payload` | Zodバリデーション失敗 |
| `upstream_realtime_error` | OpenAI Realtime API からのエラー |
| `storage_failure` | 一時的なセッションストア異常 |

## 5. レート制御 / TTL
- セッションTTL 10分（延長イベントが来るたびに更新）。
- 最長接続は 30分。経過後は強制終了し、`session.expired` イベントを送信。
- `POST /api/session/{id}/event` は 1秒あたり 10 リクエスト上限（429）。暫定的にインメモリカウンタで実装。

## 6. ロギング & メトリクス
- すべてのBFFハンドラは `framework/logging/structuredLogger` を利用し、`component=bff.session` を付与。
- 主要メトリクス
  - `bff.session.created_total`
  - `bff.session.active_gauge`
  - `bff.session.event_forwarded_total{kind=...}`
  - `bff.session.heartbeat_missed_total`
  - `bff.session.errors_total{code=...}`

## 7. 今後の拡張TODO
- WebSocket双方向ストリームモード
- Redis等へのセッションストア移行
- APIキー個別スコープ化 & 認証基盤刷新
