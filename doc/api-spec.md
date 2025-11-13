# Voice Session BFF API (2025-11 プロトタイプ)

## 認証
- すべてのエンドポイントは **JWT (HS256)** を必須とする。
- Authorization ヘッダ `Bearer <token>` で送信。WebSocket はクエリ `?token=` で代替可能。

| Claim | 説明 |
| --- | --- |
| `sub` | ユーザーID (必須) |
| `device_id` | 端末ID (任意) |
| `scope` | スペース区切りスコープ。最低 `voice:session` |
| `locale` | 既定ロケール |

## POST /api/session

新しいRealtimeセッションを確立。レスポンスには WebSocket/HTTP イベントURLを含む。

### Request Body
```json
{
  "agentKey": "chatSupervisor",
  "locale": "ja-JP",
  "deviceInfo": {
    "model": "prototype-glasses",
    "firmware": "0.3.1"
  }
}
```

### Response
```json
{
  "sessionId": "a15f...",
  "expiresAt": "2025-11-13T10:05:00.000Z",
  "streamPath": "/api/session/a15f/stream",
  "eventPath": "/api/session/a15f/event",
  "absoluteStreamUrl": "wss://host/api/session/a15f/stream",
  "absoluteEventUrl": "https://host/api/session/a15f/event"
}
```

## GET /api/session/{id}/stream

- WebSocketエンドポイント。ブラウザは `wss://.../stream?token=<JWT>` で接続（ヘッダでBearerを送れないため）。
- 送信メッセージは **Client Event JSON**。受信は `ServerEvent`。

### Client Event
```ts
type ClientEvent =
  | { type: 'audio_chunk'; mimeType: 'audio/webm;codecs=opus'; data: string /* base64 */ }
  | { type: 'audio_commit' }
  | { type: 'text_message'; text: string }
  | { type: 'interrupt' }
  | { type: 'mute'; value: boolean };
```

## POST /api/session/{id}/event

- WebSocketを利用できない端末向けのHTTPフォールバック。`ClientEvent` をJSONで送付。

## ServerEvent (WebSocket Downlink)
```ts
type ServerEvent =
  | { type: 'status'; status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' }
  | { type: 'transport'; payload: TransportEvent /* OpenAI Realtime raw */ }
  | { type: 'history_added'; item: any }
  | { type: 'history_updated'; items: any[] }
  | { type: 'error'; message: string };
```

UIは `transport` の `response.output_*` イベントをハンドリングしてTranscript/音声再生を行う。

## POST /api/auth/token (dev only)

- 開発時の簡易トークン発行。`NODE_ENV=production` では `BFF_ALLOW_DEV_TOKENS=true` を設定しない限り無効。

```json
{
  "userId": "mizuki",
  "deviceId": "chrome",
  "scopes": ["voice:session"]
}
```

レスポンス: `{ "token": "...", "expiresInSeconds": 900 }`

## 今後のTODO
- WebSocketサーバーをCloud Run環境でスケールさせる際の sticky session 設計
- 画像アップロード (`input_image`) のBFF実装
- SessionManager の永続化 (Redis) および多リージョンレプリケーション
