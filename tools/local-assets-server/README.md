# Local assets endpoint (Express)

Doory's application backend is **Django**, not Express. The editor's asset library calls
`GET /api/v1/local-assets/`, implemented in `backend/apps/assets/local_assets.py`. This folder is the
standalone Node/Express equivalent of that endpoint for setups that serve the frontend from Node and do
not run Django.

Both versions return the same JSON and scan the same folder (`frontend/public/assets/premium_stickers`
by default).

## Run it

```bash
cd tools/local-assets-server
npm install
npm start
# Local assets: http://127.0.0.1:3001/api/local-assets
```

Point it at another folder or port:

```bash
node server.js --dir ./public/assets/premium_stickers --port 3001
# or
LOCAL_ASSETS_DIR=./public/assets/premium_stickers PORT=3001 node server.js
```

The server also serves the files under the URL it advertises (`/assets/premium_stickers/...`), so the
JSON's `url` fields load without another web server.

## Endpoint

`GET /api/local-assets?q=star&type=svg`

| Field | Meaning |
|-------|---------|
| `enabled` | `false` when the folder does not exist (the editor then shows the setup hint) |
| `url` | Public prefix the files are served at |
| `count` | Files in this response |
| `total` | Files found before `q`/`type` filtering |
| `truncated` | The folder has more files than `maxFiles` |
| `assets` | `{ name, path, url, type, size }`, where `type` is `svg` or `image` |

The scan is recursive, skips hidden folders, `node_modules`, `__pycache__` and symlinks, and caps the
result at `LOCAL_ASSETS_MAX_FILES` (default 2000).

## Settings

| CLI flag | Environment | Default |
|----------|-------------|---------|
| `--dir` | `LOCAL_ASSETS_DIR` | `../../frontend/public/assets/premium_stickers` |
| `--port` | `PORT` | `3001` |
| `--host` | `HOST` | `127.0.0.1` |
| `--url-prefix` | `LOCAL_ASSETS_URL` | `/assets/premium_stickers/` |
| `--max-files` | `LOCAL_ASSETS_MAX_FILES` | `2000` |
| `--cors` | `CORS_ORIGIN` | `*` |

## Test

```bash
npm test
```

`scan.js` has no dependencies, so the tests run before `npm install`.

## Using it from the editor

The React hook (`frontend/src/editor/hooks/useLocalAssets.ts`) calls `/api/v1/local-assets/` through
Doory's API client. To use this Express service instead, proxy `/api/v1/local-assets/` (or
`/api/local-assets`) to this port in your dev server or reverse proxy, or call
`http://127.0.0.1:3001/api/v1/local-assets/` directly. The JSON is the same, so no frontend change is
needed.
