/**
 * Design Decomposer — the classical (non-neural) segmentation provider.
 *
 * It is always available and never claims otherwise: `neural` is false and `modelId` is null, so the
 * pipeline and the UI can tell a colour analysis apart from real model inference. It uses the same
 * `classicalForeground` the region splitter uses, so one code path defines what "classical" means.
 */
import { classicalForeground } from '../regionSegment'
import type { SegmentationOutput, SegmentationProvider, SegmentationRequest } from '../types'

export function createClassicalSegmentationProvider(): SegmentationProvider {
  return {
    id: 'classical',
    neural: false,
    isAvailable: async () => true,

    /**
     * Background colour comes from the image border and every pixel far enough from it becomes
     * foreground. A truly uniform image has no foreground: this returns the measured empty mask (a real
     * negative) and the pipeline reports `no-elements`, rather than inventing a region.
     */
    async segment(request: SegmentationRequest): Promise<SegmentationOutput> {
      if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const { raster } = request
      if (raster.width <= 0 || raster.height <= 0) {
        throw new RangeError('The image has no pixels to segment.')
      }
      request.onProgress?.(10)
      const foreground = classicalForeground(raster)
      request.onProgress?.(100)
      return {
        foreground,
        width: raster.width,
        height: raster.height,
        neural: false,
        modelId: null,
      }
    },
  }
}
