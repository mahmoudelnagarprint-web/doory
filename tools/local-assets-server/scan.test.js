import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { encodePath, normalisePrefix, scanFolder } from './scan.js'

async function givenFolder(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'doory-assets-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'badges'))
  await writeFile(path.join(root, 'badges', 'star-badge.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  await writeFile(path.join(root, 'photo.PNG'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  await writeFile(path.join(root, 'my sticker #1.svg'), '<svg/>')
  await writeFile(path.join(root, 'notes.txt'), 'not an asset')
  await mkdir(path.join(root, '.hidden'))
  await writeFile(path.join(root, '.hidden', 'secret.svg'), '<svg/>')
  return root
}

test('lists supported files recursively and skips noise', async (t) => {
  const root = await givenFolder(t)

  const { assets, truncated } = await scanFolder(root, { urlPrefix: '/assets/premium_stickers/' })
  const byPath = Object.fromEntries(assets.map((asset) => [asset.path, asset]))

  assert.equal(truncated, false)
  assert.deepEqual(Object.keys(byPath).sort(), ['badges/star-badge.svg', 'my sticker #1.svg', 'photo.PNG'])
  assert.equal(byPath['badges/star-badge.svg'].name, 'Star Badge')
  assert.equal(byPath['badges/star-badge.svg'].type, 'svg')
  assert.equal(byPath['badges/star-badge.svg'].url, '/assets/premium_stickers/badges/star-badge.svg')
  assert.equal(byPath['photo.PNG'].type, 'image')
  assert.ok(byPath['photo.PNG'].size > 0)
  assert.equal(byPath['my sticker #1.svg'].url, '/assets/premium_stickers/my%20sticker%20%231.svg')
})

test('caps the scan and reports truncation', async (t) => {
  const root = await givenFolder(t)

  const { assets, truncated } = await scanFolder(root, { maxFiles: 2 })

  assert.equal(assets.length, 2)
  assert.equal(truncated, true)
})

test('skips symlinked files', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'doory-assets-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const outside = path.join(root, 'outside.svg')
  await writeFile(outside, '<svg/>')
  await mkdir(path.join(root, 'premium_stickers'))
  try {
    await symlink(outside, path.join(root, 'premium_stickers', 'link.svg'))
  } catch {
    t.skip('this platform cannot create symlinks')
    return
  }

  const { assets } = await scanFolder(path.join(root, 'premium_stickers'))

  assert.deepEqual(assets, [])
})

test('normalises the URL prefix and encodes each path segment', () => {
  assert.equal(normalisePrefix('assets/stickers'), '/assets/stickers/')
  assert.equal(normalisePrefix('/assets/stickers//'), '/assets/stickers/')
  assert.equal(encodePath('a b/c#1.svg'), 'a%20b/c%231.svg')
})
