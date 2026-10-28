import { test, expect, type Locator, type Page } from '@playwright/test'
import { drag, openEditor, pageObjects, pngBuffer, type DocObjectLike } from './helpers'

/**
 * The collage stage: panning a photo inside its frame, editing the frame itself, trading two photos by
 * dropping one frame on another, and changing a frame's crop shape.
 */

interface SlotLike {
  cx: number
  cy: number
  mask?: string
}

const slotObjects = async (page: Page): Promise<DocObjectLike[]> => (await pageObjects(page)).filter((object) => object.slot)
const byId = (objects: DocObjectLike[], id: string) => objects.find((object) => object.id === id)!
const frameOf = (object: DocObjectLike): SlotLike => object.slot as unknown as SlotLike

/** Picks a solid photo for the slot selected in the panel. */
async function fill(page: Page, panel: Locator, rgb: [number, number, number]): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    panel.getByRole('button', { name: /Choose photo|Replace photo/ }).click(),
  ])
  await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: pngBuffer(160, 120, rgb) })
}

test('collage stage: pan photo, edit frame, swap and shape', async ({ page }) => {
  await openEditor(page, 'doc=blank&w=1080&h=1080')
  await page.locator('[data-testid="ed-add-entry-collage"]').click()
  const panel = page.locator('[data-testid="collage-panel"]')
  await panel.getByRole('button', { name: 'Create collage' }).click()
  await panel.getByRole('tab', { name: 'Slots' }).click()

  // Two photos, so a swap has something to trade. An empty frame has no `slot` until it holds a picture.
  await fill(page, panel, [225, 29, 72])
  await expect.poll(async () => (await slotObjects(page)).length).toBe(1)
  await panel.getByRole('button', { name: /Slot 2/ }).click()
  await fill(page, panel, [37, 99, 235])
  await expect.poll(async () => (await slotObjects(page)).length).toBe(2)

  const [first, second] = await slotObjects(page)

  // Pan photo: the picture moves inside its frame, the frame stays.
  await panel.getByRole('button', { name: 'Pan photo' }).click()
  await drag(page, { x: frameOf(first).cx, y: frameOf(first).cy }, { x: frameOf(first).cx + 40, y: frameOf(first).cy + 30 })
  let objects = await slotObjects(page)
  expect(byId(objects, first.id).slot).toEqual(first.slot)

  // Edit frame: the frame itself moves.
  await panel.getByRole('button', { name: 'Edit frame' }).click()
  const start = frameOf(byId(objects, first.id))
  await drag(page, { x: start.cx, y: start.cy }, { x: start.cx + 60, y: start.cy + 40 })
  objects = await slotObjects(page)
  const moved = frameOf(byId(objects, first.id))
  expect(moved.cx - start.cx).toBeGreaterThan(20)
  expect(moved.cy - start.cy).toBeGreaterThan(10)

  // Dropping a frame on the other slot trades the two photos and leaves both frames in place.
  const frameB = frameOf(byId(objects, second.id))
  await drag(page, { x: moved.cx, y: moved.cy }, { x: frameB.cx, y: frameB.cy })
  objects = await slotObjects(page)
  expect(byId(objects, first.id).docSrc).toBe(second.docSrc)
  expect(byId(objects, second.id).docSrc).toBe(first.docSrc)
  expect(byId(objects, first.id).slot).toEqual(moved)

  // Shape chips clip the frame; undo restores the plain shape.
  await panel.getByRole('button', { name: 'Circle' }).click()
  await expect.poll(async () => frameOf(byId(await slotObjects(page), first.id)).mask).toBe('circle')
  await page.keyboard.press('Control+z')
  await expect.poll(async () => frameOf(byId(await slotObjects(page), first.id)).mask).not.toBe('circle')
})
