/**
 * Normalise ImageTracer's SVG path data with Paper.js and place it in page coordinates.
 *
 * Paper keeps the contours apart (including holes) and rewrites them in a predictable form, which
 * makes one Fabric `Path` from a trace that may have several detached islands.
 */
export interface CutLineMatrix {
  /** Pixel → page scale. */
  scale: number
  /** Page coordinate of pixel (0, 0). */
  left: number
  top: number
}

export async function traceToPagePath(pathData: string, matrix: CutLineMatrix): Promise<string> {
  const { default: paper } = await import('paper')
  const scope = new paper.PaperScope()
  scope.setup(new scope.Size(1, 1))
  try {
    const path = new scope.CompoundPath(pathData)
    if (path.children.length === 0 || path.bounds.width <= 0 || path.bounds.height <= 0) {
      throw new Error('The cut line is empty.')
    }
    path.transform(new scope.Matrix(1 / matrix.scale, 0, 0, 1 / matrix.scale, matrix.left, matrix.top))
    const result = path.pathData
    path.remove()
    if (!result.trim()) throw new Error('The cut line is empty.')
    return result
  } finally {
    scope.remove()
  }
}
