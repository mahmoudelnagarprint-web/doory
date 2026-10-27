import { alphaToMask, blackPathsFromSvg, dilateMask, maskCount, maskToRgba } from './mask'

const maskOf = (rows: string[]): Uint8Array => Uint8Array.from(rows.flatMap((row) => [...row].map((c) => (c === '#' ? 1 : 0))))

const rows = (mask: Uint8Array, width: number, height: number): string[] =>
  Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (mask[y * width + x] ? '#' : '.')).join(''))

describe('cut-line masks', () => {
  it('keeps pixels above the alpha threshold', () => {
    const data = new Uint8ClampedArray([
      0, 0, 0, 0,
      0, 0, 0, 200,
      0, 0, 0, 16,
      0, 0, 0, 15,
    ])
    const mask = alphaToMask(data, 2, 2)
    expect([...mask]).toEqual([0, 1, 1, 0])
    expect(maskCount(mask)).toBe(2)
  })

  it('grows a pixel into a Euclidean disc, not a square', () => {
    const mask = maskOf([
      '.....',
      '.....',
      '..#..',
      '.....',
      '.....',
    ])
    expect(rows(dilateMask(mask, 5, 5, 1), 5, 5)).toEqual([
      '.....',
      '..#..',
      '.###.',
      '..#..',
      '.....',
    ])
    expect(rows(dilateMask(mask, 5, 5, 1.5), 5, 5)).toEqual([
      '.....',
      '.###.',
      '.###.',
      '.###.',
      '.....',
    ])
    expect(rows(dilateMask(mask, 5, 5, 3), 5, 5).every((row) => row === '#####')).toBe(true)
  })

  it('leaves a zero bleed exactly as it was', () => {
    const mask = maskOf(['.#.', '###', '.#.'])
    expect([...dilateMask(mask, 3, 3, 0)]).toEqual([...mask])
  })

  it('makes black foreground on opaque white for the tracer', () => {
    const image = maskToRgba(Uint8Array.from([1, 0]), 2, 1)
    expect(image.width).toBe(2)
    expect([...image.data]).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 255,
    ])
  })

  it('reads only the black contours of a trace', () => {
    const svg = [
      '<svg><path d="M0 0L1 0L1 1Z" fill="rgb(255,255,255)" stroke="rgb(255,255,255)" />',
      '<path d="M2 2L3 2L3 3Z" fill="rgb(0,0,0)" stroke="rgb(0,0,0)" stroke-width="0" />',
      '<path d="M4 4L5 4L5 5Z" fill="#000000" />',
      '<path d="M6 6L7 6L7 7Z" fill="none" />',
      '</svg>',
    ].join('')
    expect(blackPathsFromSvg(svg)).toEqual(['M2 2L3 2L3 3Z', 'M4 4L5 4L5 5Z'])
  })
})
