# VOICEVOX Proxy

GitHub Pages などの HTTPS フロントから，VOICEVOX Engine を呼ぶための中継サーバーです．

## Environment Variables

- `PORT`（省略可，既定 `8787`）
- `VOICEVOX_ENGINE_URL`（既定 `http://127.0.0.1:50021`）
- `CORS_ALLOW_ORIGINS`（カンマ区切り．既定 `*`）

## Run

```powershell
cd proxy
npm install
$env:VOICEVOX_ENGINE_URL="http://127.0.0.1:50021"
$env:CORS_ALLOW_ORIGINS="https://takumayellow.github.io"
npm start
```

## Endpoints

- `GET /health`
- `GET /voicevox/speakers`
- `POST /voicevox/audio_query?text=...&speaker=...`
- `POST /voicevox/synthesis?speaker=...`
