/** imagetracerjs ships as a browser global and has no type declarations. */
declare module 'imagetracerjs' {
  interface ImageTracerPaletteEntry {
    r: number
    g: number
    b: number
    a: number
  }

  interface ImageTracerOptions {
    pal?: ImageTracerPaletteEntry[]
    colorsampling?: number
    numberofcolors?: number
    colorquantcycles?: number
    ltres?: number
    qtres?: number
    pathomit?: number
    rightangleenhance?: boolean
    layering?: number
    strokewidth?: number
    linefilter?: boolean
    scale?: number
    roundcoords?: number
    viewbox?: boolean
    desc?: boolean
    blurradius?: number
    [key: string]: unknown
  }

  interface ImageTracer {
    imagedataToSVG(image: { data: Uint8ClampedArray; width: number; height: number }, options?: ImageTracerOptions | string): string
  }

  const ImageTracer: ImageTracer
  export default ImageTracer
}
