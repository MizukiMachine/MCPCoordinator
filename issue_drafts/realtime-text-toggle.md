Title: クライアントから音声/テキスト応答モードを切り替えられるようにする

Body:
## 背景
- 現状の Realtime セッションは `clientCapabilities.audio=true` を前提にしており、レスポンスには常に音声と文字起こしイベントの両方が含まれる。
- スマホ/PC のように画面表示があるクライアントでは文字情報が便利だが、音声専用デバイス（スマートスピーカー/ウェアラブルなど）では不要な帯域と処理コストになる。
- 音声のみ・音声+テキストをリクエスト単位で切り替えられれば、UIがある端末と音声専用デバイスの両方で同じAPIを再利用できる。

## 要件
1. `POST /api/session` でクライアントがレスポンスのテキスト要否を指定できるパラメータ（例: `clientCapabilities.outputText: boolean`）を追加する。
2. SessionHost → Realtime Transport に渡す `outputModalities` を `['audio']` / `['text']` / `['audio','text?']` のいずれかに切り替え、OpenAI Realtime API の仕様に沿った組み合わせのみを送る。
3. SSE (`/api/session/{id}/stream`) では、テキスト出力を無効化したセッションの場合は transcription 系イベントを送らないか、空イベント扱いにしてクライアント側で無視できるようにする。
4. UI Hook (`useRealtimeSession`) に新パラメータを追加し、ブラウザ/UI側から「音声のみ」「音声+文字表示」を切り替えられるようにする。
5. ドキュメント（`doc/api-spec.md` / `.env.sample` など）にパラメータ追加と運用ガイドラインを追記する。

## 受け入れ条件
- 音声+テキストを要求したときは現行動作と同じく文字起こしが SSE で流れ続ける。
- 音声のみを要求したときは OpenAI Realtime に text 出力が要求されず、SSE に transcription イベントが届かない（メトリクスも確認できる）。
- 既存クライアント（パラメータ未指定）は後方互換で音声+テキストになる。
