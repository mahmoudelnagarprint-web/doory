/**
 * Standalone Express version of Doory's local-asset listing.
 *
 * The application itself has no Express server: it is React + Django, and the editor calls
 * `/api/v1/local-assets/` (see `backend/apps/assets/local_assets.py`). This script exists for setups
 * that serve the frontend from Node and want the same `GET /api/local-assets` JSON without running
 * Django. It also serves the files, so a `<img src>` works while trying it out.
 *
 *   node server.js --dir ../../frontend/public/assets/premium_stickers --port 3001
 */
import express from 'express'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalisePrefix, scanFolder } from './scan.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=', 2)
    if (inline !== undefined) out[key] = inline
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out[key] = argv[i + 1]
      i += 1
    } else out[key] = 'true'
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const dir = path.resolve(
  args.dir || process.env.LOCAL_ASSETS_DIR || path.join(HERE, '..', '..', 'frontend', 'public', 'assets', 'premium_stickers'),
)
const port = Number(args.port || process.env.PORT || 3001)
const host = args.host || process.env.HOST || '127.0.0.1'
const urlPrefix = normalisePrefix(args['url-prefix'] || process.env.LOCAL_ASSETS_URL || '/assets/premium_stickers/')
const maxFiles = Number(args['max-files'] || process.env.LOCAL_ASSETS_MAX_FILES || 2000)
const origin = args.cors || process.env.CORS_ORIGIN || '*'
const prefixPath = urlPrefix.startsWith('http') ? new URL(urlPrefix).pathname : urlPrefix

const app = express()
app.disable('x-powered-by')

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type')
  res.setHeader('Vary', 'Origin')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

async function localAssets(req, res) {
  const payload = { enabled: false, url: urlPrefix, count: 0, total: 0, truncated: false, assets: [] }
  const kind = typeof req.query.type === 'string' ? req.query.type : ''
  if (kind && kind !== 'svg' && kind !== 'image') {
    return res.status(400).json({ error: { code: 'validation_error', message: 'Invalid input.', fields: { type: ['Must be svg or image.'] } } })
  }
  const exists = await fs.stat(dir).then((stat) => stat.isDirectory()).catch(() => false)
  if (!exists) {
    return res.json({ ...payload, detail: 'The local asset folder does not exist on this server.' })
  }

  let scanned
  try {
    scanned = await scanFolder(dir, { urlPrefix, maxFiles })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: { code: 'scan_failed', message: 'Could not read the local asset folder.' } })
  }

  const query = String(req.query.q || '').trim().toLowerCase()
  let assets = scanned.assets
  const total = assets.length
  if (query) assets = assets.filter((asset) => asset.name.toLowerCase().includes(query) || asset.path.toLowerCase().includes(query))
  if (kind) assets = assets.filter((asset) => asset.type === kind)
  res.json({ ...payload, enabled: true, count: assets.length, total, truncated: scanned.truncated, assets })
}

// The versioned path matches Doory's Django route, so the same client/proxy configuration works.
app.get(['/api/local-assets', '/api/v1/local-assets'], localAssets)

// Same files under the URL the JSON advertises, so this server stands on its own.
app.use(prefixPath, express.static(dir, { fallthrough: true, maxAge: '1h' }))

app.listen(port, host, () => {
  console.log(`Local assets: http://${host}:${port}/api/local-assets`)
  console.log(`Folder:       ${dir}`)
  console.log(`Files:        ${urlPrefix}`)
  if (!process.env.LOCAL_ASSETS_DIR && !args.dir) console.log('(pass --dir to scan another folder)')
})
