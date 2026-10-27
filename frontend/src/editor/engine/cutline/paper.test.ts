import { Path } from 'fabric'
import { traceToPagePath } from './paper'

describe('traceToPagePath', () => {
  it('moves traced pixels into page coordinates and keeps every contour', async () => {
    const d = await traceToPagePath('M0 0L4 0L4 4L0 4Z M10 10L12 10L12 12L10 12Z', { scale: 2, left: 30, top: 40 })
    const path = new Path(d, { strokeWidth: 0 })
    const bounds = path.getBoundingRect()
    expect(bounds.left).toBeCloseTo(30)
    expect(bounds.top).toBeCloseTo(40)
    expect(bounds.width).toBeCloseTo(6)
    expect(bounds.height).toBeCloseTo(6)
  }, 20000)
})
