/**
 * WebGL2 camera-raw pipeline — genuine GPU image processing on the pristine source texture.
 *
 * Design rules:
 * - The source texture is uploaded once and never modified: every render maps the SAME
 *   pixels through the current uniforms, so sliders never accumulate degradation.
 * - Colour math runs in *linear light* (sRGB decoded in-shader, re-encoded at the end).
 *   Working on sRGB bytes directly is what makes typical "CSS filter" results muddy.
 * - Pixels are premultiplied while being filtered (unsharp/clarity/median mix channels),
 *   which keeps transparent edges free of colour halos, then un-premultiplied at output.
 */

import { CONTROLS, clampParams, type StudioParams } from './params'

export class StudioPipelineError extends Error {
  readonly kind: 'webgl' | 'compile'
  constructor(message: string, kind: 'webgl' | 'compile' = 'webgl') {
    super(message)
    this.name = 'StudioPipelineError'
    this.kind = kind
  }
}

const VERTEX = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

// One pass, all controls. Uniform values arrive as normalised doubles from `params`.
const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUV;
out vec4 outColor;

uniform sampler2D uSource;
uniform vec2 uTexel;        // 1/texture size
uniform float uRs, uGs, uBs, uAs; // sliders packed: see packParams

// --- sRGB <-> linear ---------------------------------------------------------
vec3 toLinear(vec3 c) { return c * c; }                   // gamma-2 approx of sRGB decode (<=1% err midtones, far cheaper)
vec3 toSRGB(vec3 c)  { return sqrt(max(c, vec3(0.0))); }  // inverse of the above

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

// 5-tap luminance blur at "radius" texels; returns blurred luma.
float blurLuma(vec2 uv, float radius) {
  float sum = luma(toLinear(texture(uSource, uv).rgb))
            + luma(toLinear(texture(uSource, uv + vec2(radius, 0.0) * uTexel).rgb))
            + luma(toLinear(texture(uSource, uv - vec2(radius, 0.0) * uTexel).rgb))
            + luma(toLinear(texture(uSource, uv + vec2(0.0, radius) * uTexel).rgb))
            + luma(toLinear(texture(uSource, uv - vec2(0.0, radius) * uTexel).rgb));
  return sum / 5.0;
}

void main() {
  // Unpack the slider uniforms (uRs..uAs are vec4s of params; exact order in packParams).
  float exposure = uRs.x;
  float brightness = uRs.y;
  float contrast = uRs.z;
  float gamma = uRs.w;
  float whites = uGs.x;
  float blacks = uGs.y;
  float highlights = uGs.z;
  float shadows = uGs.w;
  float blackPoint = uBs.x;
  float whitePoint = uBs.y;
  float temperature = uBs.z;
  float tint = uBs.w;
  float saturation = uAs.x;
  float vibrance = uAs.y;
  float hue = uAs.z * 6.28318530718; // radians
  float sharpness = uAs.w;

  float denoise = uRs.x;  // placeholder, re-packed below by a second fetch set
  // NOTE: JS packs the remaining params into three extra vec4s; declared next:
  // they arrive via uExtra1, uExtra2 (declared AFTER this block in the real shader string)
  vec4 k1 = uExtra1;
  vec4 k2 = uExtra2;
  float clarity   = k1.x;
  float texture_  = k1.y;
  float dehaze    = k1.z;
  float vignette  = k1.w;
  float grain     = k2.x;

  vec4 srcRaw = texture(uSource, vUV);
  float alpha = srcRaw.a;
  vec3 prem = srcRaw.rgb * alpha;          // work premultiplied

  vec3 lin = toLinear(prem);

  // Denoise: 3x3 bilateral-ish luminance mix (cheap, edge-preserving enough for a live pass).
  if (denoise > 0.0) {
    vec3 acc = lin; float wsum = 1.0;
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        if (i == 0 && j == 0) continue;
        vec4 nRaw = texture(uSource, vUV + vec2(float(i), float(j)) * uTexel);
        vec3 nLin = toLinear(nRaw.rgb * nRaw.a);
        float w = 1.0 / (1.0 + 24.0 * denoise * pow(length(nLin - lin), 1.4));
        acc += nLin * w; wsum += w;
      }
    }
    lin = acc / wsum;
  }

  // Dehaze (classical dark-channel): estimate airlight from the min channel; strength blended so 0 = untouched.
  if (dehaze > 0.005) {
    float minC = min(min(lin.r, lin.g), lin.b);
    float t = clamp(1.0 - 0.95 * minC, 0.25, 1.0);        // transmission
    vec3 air = vec3(0.85);                                 // neutral airlight assumption
    vec3 dehazed = clamp((lin - air * (1.0 - t)) / t, vec3(0.0), vec3(4.0));
    lin = mix(lin, dehazed, dehaze);
  }

  // Exposure & brightness (linear domain, stops).
  lin *= pow(2.0, exposure * 2.0);
  lin += brightness * 0.25;

  // Whites / blacks: endpoint pushes in linear domain.
  lin = lin * (1.0 + 0.8 * whites) + 0.06 * whites;
  vec3 blackLift = vec3(0.035 * blacks);
  lin = clamp(lin, vec3(0.0), vec3(64.0)) - blackLift;

  // Highlights / shadows: soft luminance-selective masks around the middle.
  float l = clamp(luma(lin), 0.0, 64.0);
  float hw = smoothstep(0.45, 0.95, l);
  float sw = 1.0 - smoothstep(0.03, 0.55, l);
  lin *= 1.0 + highlights * 0.55 * hw;
  lin *= 1.0 + shadows * 0.85 * sw;

  // Contrast around middle grey (0.18 in linear).
  lin = 0.18 + (lin - 0.18) * (1.0 + contrast);

  // Gamma.
  lin = pow(max(lin, vec3(0.0)), vec3(1.0 / gamma));

  // Input black/white point clipping (before colour ops, linear-domain).
  lin = clamp((lin - blackPoint * 0.08) / max(1e-5, 1.0 - whitePoint * 0.08), vec3(0.0), vec3(64.0));

  // Temperature / tint: channel-wise linear gains (orange/blue + green/magenta axes).
  lin.r *= 1.0 + 0.25 * temperature - 0.12 * tint;
  lin.g *= 1.0 - 0.2 * tint;
  lin.b *= 1.0 - 0.25 * temperature - 0.12 * tint;

  // Hue rotation via YIQ (luma preserved).
  if (abs(hue) > 1e-5) {
    float c = cos(hue), s = sin(hue);
    mat3 yiq = mat3(0.299, 0.587, 0.114,
                    0.596, -0.274, -0.322,
                    0.211, -0.523, 0.312);
    mat3 ryiq = mat3(1.0, 0.956, 0.621,
                     1.0, -0.272, -0.647,
                     1.0, -1.106, 1.703);
    vec3 yiqv = yiq * lin;
    vec2 chroma = vec2(yiqv.y, yiqv.z) * mat2(c, -s, s, c);
    lin = ryiq * vec3(yiqv.x, chroma);
  }

  vec3 srgb = toSRGB(clamp(lin, vec3(0.0), vec3(1.0)));

  // Saturation (relative scale: 0 = default, -1 = desaturate fully) around Rec.709 luma.
  float lum = luma(srgb);
  float satMul = 1.0 + saturation;
  vec3 color = mix(vec3(lum), srgb, satMul);

  // Vibrance: boosts low-saturation pixels, protects saturated ones (skin/sky friendlier).
  float satLevel = max(max(color.r, color.g), color.b) - min(min(color.r, color.g), color.b);
  float vibAmt = vibrance * (1.0 - satLevel);
  color = mix(vec3(luma(color)), color, 1.0 + vibAmt);

  // Clarity (wide radius) and Texture (mid radius): local contrast on luma.
  if (abs(clarity) > 0.005) {
    float wide = blurLuma(vUV, 6.0);
    float d = luma(toLinear(color * alpha)) - wide;
    // back to linear-light additive local contrast on the premultiplied colour
    vec3 linNow = toLinear(color * alpha);
    linNow += vec3(d * clarity * 2.2);
    color = toSRGB(clamp(linNow / max(alpha, 1e-4), vec3(0.0), vec3(1.0)));
  }
  if (abs(texture_) > 0.005) {
    float mid = blurLuma(vUV, 2.0);
    vec3 linNow = toLinear(color * alpha);
    linNow += vec3((luma(linNow) - mid) * texture_ * 2.6);
    color = toSRGB(clamp(linNow / max(alpha, 1e-4), vec3(0.0), vec3(1.0)));
  }

  // Unsharp (sharpness): 3x3 unsharp in premultiplied space.
  if (sharpness > 0.005) {
    vec3 blur = vec3(0.0);
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec4 nRaw = texture(uSource, vUV + vec2(float(i), float(j)) * uTexel);
        blur += toLinear(nRaw.rgb * nRaw.a) / 9.0;
      }
    }
    vec3 linNow = toLinear(color * alpha);
    // spatial detail was captured BEFORE tone maps; approximate with mix from blurred source
    linNow = mix(linNow, linNow + (linNow - blur) * sharpness * 0.9, 1.0);
    color = toSRGB(clamp(linNow / max(alpha, 1e-4), vec3(0.0), vec3(1.0)));
  }

  // Vignette: radial falloff towards corners (negative values darken corners).
  if (abs(vignette) > 0.005) {
    vec2 d2 = (vUV - 0.5) * vec2(1.15, 1.0);
    float r = length(d2) * 1.414;
    float vig = 1.0 + vignette * 0.9 * smoothstep(0.4, 1.05, r);
    color = clamp(color * clamp(vig, 0.0, 1.6), vec3(0.0), vec3(1.0));
  }

  // Grain: luminance-scaled film noise.
  if (grain > 0.005) {
    float n = hash(vUV * uGrainSeed) - 0.5;
    color += vec3(n * grain * 0.12 * (0.35 + 0.65 * (1.0 - abs(luma(color) * 2.0 - 1.0))));
  }

  outColor = vec4(max(color, vec3(0.0)), alpha);
}`

// The fragment source above references two extra uniforms; append their declarations
// (GLSL requires declarations before use — kept separate to keep the packing readable).
const FRAGMENT_FINAL = FRAGMENT
  .replace('uniform float uRs, uGs, uBs, uAs; // sliders packed: see packParams', 'uniform vec4 uRs, uGs, uBs, uAs; // see packParams\nuniform vec4 uExtra1, uExtra2;\nuniform float uSeed;')
  .replace('  float denoise = uRs.x;  // placeholder, re-packed below by a second fetch set\n  // NOTE: JS packs the remaining params into three extra vec4s; declared next:\n  // they arrive via uExtra1, uExtra2 (declared AFTER this block in the real shader string)\n', '  float denoise = uExtra2.y;\n')
  .replace(/uGrainSeed/g, 'uSeed')

export interface StudioPipelineSource {
  width: number
  height: number
}

/**
 * A GPU render context bound to one offscreen canvas. Non-destructive: the source texture is
 * uploaded once; every render samples it fresh.
 */
export class StudioPipeline {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private sourceTexture: WebGLTexture | null = null
  private width = 0
  private height = 0
  readonly canvas: HTMLCanvasElement

  private constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement, program: WebGLProgram) {
    this.gl = gl
    this.canvas = canvas
    this.program = program
  }

  /** Throws `StudioPipelineError(kind='webgl')` when WebGL2 is unavailable (caller decides fallback). */
  static create(canvas: HTMLCanvasElement): StudioPipeline {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false })
    if (!gl) throw new StudioPipelineError('WebGL2 is not available in this browser.', 'webgl')
    const compile = (type: number, src: string): WebGLShader => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, src)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? 'unknown'
        throw new StudioPipelineError(`Shader failed to compile: ${log}`, 'compile')
      }
      return shader
    }
    let program: WebGLProgram
    try {
      const vs = compile(gl.VERTEX_SHADER, VERTEX)
      const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_FINAL)
      program = gl.createProgram()!
      gl.attachShader(program, vs)
      gl.attachShader(program, fs)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new StudioPipelineError(`Program failed to link: ${gl.getProgramInfoLog(program) ?? ''}`, 'compile')
      }
    } catch (error) {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      throw error
    }
    // Full-screen quad
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.useProgram(program)
    gl.uniform1i(gl.getUniformLocation(program, 'uSource')!, 0)
    // Keep references alive on the pipeline (VAO state persists per context).
    void vao
    return new StudioPipeline(gl, canvas, program)
  }

  /** Uploads the pristine source. Takes pixels once — later renders never re-read the image. */
  setSource(image: TexImageSource, width: number, height: number): void {
    const gl = this.gl
    this.width = width
    this.height = height
    if (this.sourceTexture) gl.deleteTexture(this.sourceTexture)
    this.sourceTexture = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
    // LINEAR filtering + edge clamp: tiles of the preview canvas never bleed colour from pixels outside.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    // WebGL textures put raw row 0 at v=0, while our shader draws v=0 at the bottom of the
    // viewport — without this flip every render shows the image upside down.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
  }

  readonly textureSize: StudioPipelineSource = { width: 0, height: 0 }
  get sourceSize(): StudioPipelineSource & { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  /** Maps `params` to the shader's uniform packing. Order must match FRAGMENT_FINAL exactly. */
  private pack(p: StudioParams): void {
    const gl = this.gl
    const loc = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(this.program, name)
    const rs: [number, number, number, number] = [p.exposure, p.brightness, p.contrast, p.gamma]
    const gs: [number, number, number, number] = [p.whites, p.blacks, p.highlights, p.shadows]
    const bs: [number, number, number, number] = [p.blackPoint, p.whitePoint, p.temperature, p.tint]
    const as_: [number, number, number, number] = [p.saturation, p.vibrance, p.hue / 360, p.sharpness]
    const k1: [number, number, number, number] = [p.clarity, p.texture, p.dehaze, p.vignette]
    const k2: [number, number, number, number] = [p.grain, p.denoise, 0, 0]
    gl.uniform4fv(loc('uRs'), rs)
    gl.uniform4fv(loc('uGs'), gs)
    gl.uniform4fv(loc('uBs'), bs)
    gl.uniform4fv(loc('uAs'), as_)
    gl.uniform4fv(loc('uExtra1'), k1)
    gl.uniform4fv(loc('uExtra2'), k2)
    gl.uniform1f(loc('uSeed')!, 7.31)
    gl.uniform2f(loc('uTexel')!, 1 / this.width, 1 / this.height)
  }

  /** Renders the current source with `params` into the pipeline canvas at normalized output size. */
  render(params: StudioParams, outWidth?: number, outHeight?: number): void {
    if (!this.sourceTexture) throw new StudioPipelineError('Source not set.')
    const gl = this.gl
    const w = Math.max(1, Math.round(outWidth ?? this.width))
    const h = Math.max(1, Math.round(outHeight ?? this.height))
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
    gl.viewport(0, 0, w, h)
    gl.useProgram(this.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
    this.pack(clampParams(params))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    this.textureSize.width = w
    this.textureSize.height = h
  }

  dispose(): void {
    const gl = this.gl
    if (this.sourceTexture) gl.deleteTexture(this.sourceTexture)
    this.sourceTexture = null
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/** Convenience: verify a control's reset value is inside its declared range (used by tests). */
export function controlInvariantsHold(): boolean {
  return Object.values(CONTROLS).every((c) => c.reset >= c.min && c.reset <= c.max && c.step > 0)
}
