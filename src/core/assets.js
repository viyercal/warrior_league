import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { rand } from './utils.js'

/** Draw into an offscreen canvas and return a color-managed texture. */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Vertical (or horizontal) gradient texture from [offset,color] stops. */
export function gradientTexture(stops, { size = 256, vertical = true } = {}) {
  return canvasTexture(vertical ? 4 : size, vertical ? size : 4, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, vertical ? 0 : w, vertical ? h : 0)
    for (const [off, col] of stops) g.addColorStop(off, col)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

/** N-step grayscale ramp for MeshToonMaterial.gradientMap. */
export function toonRamp(steps = 3, lo = 0.32) {
  const n = Math.max(2, steps)
  const data = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) {
    const v = Math.round(255 * (lo + (1 - lo) * (i / (n - 1))))
    data.set([v, v, v, 255], i * 4)
  }
  const tex = new THREE.DataTexture(data, n, 1)
  tex.minFilter = tex.magFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}

let _glow = null
/** Cached soft radial glow sprite texture (white — tint via material color). */
export function glowTexture() {
  if (_glow) return _glow
  _glow = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
  return _glow
}

let _star = null
/** Cached 4-point star flare sprite texture. */
export function starTexture() {
  if (_star) return _star
  _star = canvasTexture(64, 64, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.25, 'rgba(255,255,255,.35)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(255,255,255,.8)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx, 4); ctx.lineTo(cx, h - 4)
    ctx.moveTo(4, cy); ctx.lineTo(w - 4, cy)
    ctx.stroke()
  })
  return _star
}

let _cloud = null
/** Cached soft cloud/puff sprite texture. */
export function cloudTexture() {
  if (_cloud) return _cloud
  _cloud = canvasTexture(256, 128, (ctx, w, h) => {
    for (let i = 0; i < 14; i++) {
      const x = rand(w * 0.15, w * 0.85), y = rand(h * 0.35, h * 0.7), r = rand(18, 44)
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, 'rgba(255,255,255,.16)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }
  })
  return _cloud
}

/**
 * Painterly ground texture: base color splattered with soft blotches.
 * opts: { base, blotches: [colors], size, count, alpha }
 */
export function groundTexture({ base = '#3a7d4f', blotches = ['#468f5c', '#2f6b42', '#4f9d63'], size = 1024, count = 420, alpha = 0.16 } = {}) {
  const tex = canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < count; i++) {
      const x = rand(w), y = rand(h), r = rand(w * 0.01, w * 0.06)
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      const col = blotches[Math.floor(rand(blotches.length))]
      g.addColorStop(0, col)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.globalAlpha = rand(alpha * 0.5, alpha)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  })
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

let _env = null
/** Cached PMREM environment for subtle PBR reflections (scene.environment). */
export function makeEnvMap(renderer) {
  if (_env) return _env
  const pmrem = new THREE.PMREMGenerator(renderer)
  _env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  return _env
}

// ============================================================================
// REALISM KIT — procedural PBR texture generation (all tileable, one-time
// cost; the material presets in src/art/materials.js cache the results).
// Every *Texture() set returns { map (sRGB), normalMap (linear),
// roughnessMap (linear) } at `size` px, RepeatWrapping.
// ============================================================================

const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v

/** Deterministic seedable RNG (mulberry32). */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hashInt = (x, y, s) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** Single-octave tileable value noise; fx/fy = lattice cells per tile. */
function valueNoise2(u, v, fx, fy, seed) {
  const x = u * fx, y = v * fy
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const tx = x - x0, ty = y - y0
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
  const w = (ix, iy) => hashInt(((ix % fx) + fx) % fx, ((iy % fy) + fy) % fy, seed)
  const a = w(x0, y0), b = w(x0 + 1, y0), c = w(x0, y0 + 1), d = w(x0 + 1, y0 + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/** Multi-octave tileable value noise (fbm), u/v in 0..1 → ~0..1. */
export function fbmNoise(u, v, { octaves = 4, scale = 4, scaleY = null, seed = 1, persistence = 0.55 } = {}) {
  let amp = 1, sum = 0, norm = 0, fx = Math.max(1, Math.round(scale)), fy = Math.max(1, Math.round(scaleY ?? scale))
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise2(u, v, fx, fy, seed + o * 131) * amp
    norm += amp
    amp *= persistence
    fx *= 2; fy *= 2
  }
  return sum / norm
}

/** Float32 height field (size*size) from fbm — shared by the set builders. */
export function noiseField(size, opts = {}) {
  const f = new Float32Array(size * size)
  const inv = 1 / size
  for (let y = 0; y < size; y++) {
    const v = y * inv
    for (let x = 0; x < size; x++) f[y * size + x] = fbmNoise(x * inv, v, opts)
  }
  return f
}

function makeCanvas(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

function texFromCanvas(c, { srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}

/** Grayscale field → canvas texture via per-pixel fn(i, h) → [r,g,b]. */
function fieldToCanvas(field, size, px, { srgb = true } = {}) {
  const c = makeCanvas(size), ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size), d = img.data
  for (let i = 0; i < field.length; i++) {
    const [r, g, b] = px(i, field[i])
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return texFromCanvas(c, { srgb })
}

/** Color ramp helper: stops = [[t, '#hex'], …] → fn(t) → [r,g,b]. */
function colorRamp(stops) {
  const pts = stops.map(([t, h]) => [t, hexRGB(h)])
  return t => {
    if (t <= pts[0][0]) return pts[0][1]
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) {
        const [t0, a] = pts[i - 1], [t1, b] = pts[i]
        const k = (t - t0) / (t1 - t0)
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
      }
    }
    return pts[pts.length - 1][1]
  }
}

/** Rasterize deterministic strokes wrapped at tile edges → Float32 mask 0..1. */
function strokeMask(size, draw) {
  const c = makeCanvas(size), ctx = c.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      ctx.save()
      ctx.translate(ox, oy)
      draw(ctx, size)
      ctx.restore()
    }
  }
  const d = ctx.getImageData(0, 0, size, size).data
  const f = new Float32Array(size * size)
  for (let i = 0; i < f.length; i++) f[i] = d[i * 4] / 255
  return f
}

/**
 * Tileable multi-octave value-noise texture.
 * opts: { size, octaves, scale, scaleY, seed, lo, hi (output levels), srgb }
 */
export function noiseTexture({ size = 256, octaves = 4, scale = 6, scaleY = null, seed = 1, lo = 0, hi = 1, srgb = false } = {}) {
  const field = noiseField(size, { octaves, scale, scaleY, seed })
  return fieldToCanvas(field, size, (i, h) => {
    const v = Math.round(255 * clamp01(lo + (hi - lo) * h))
    return [v, v, v]
  }, { srgb })
}

/**
 * Tangent-space normal map from a height source.
 * src: Float32Array field | canvas | draw fn (ctx, w, h). opts: { strength, size }.
 */
export function normalMapFromHeight(src, { strength = 1, size = 512 } = {}) {
  let field, s
  if (src instanceof Float32Array) {
    field = src
    s = Math.round(Math.sqrt(src.length))
  } else {
    const c = typeof src === 'function'
      ? (() => { const cv = makeCanvas(size); src(cv.getContext('2d'), size, size); return cv })()
      : src
    s = c.width
    const d = c.getContext('2d').getImageData(0, 0, s, s).data
    field = new Float32Array(s * s)
    for (let i = 0; i < field.length; i++) field[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255
  }
  const c = makeCanvas(s), ctx = c.getContext('2d')
  const img = ctx.createImageData(s, s), out = img.data
  const at = (x, y) => field[(((y % s) + s) % s) * s + (((x % s) + s) % s)]
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1)
      const i = (y * s + x) * 4
      out[i] = Math.round((dx * inv * 0.5 + 0.5) * 255)
      out[i + 1] = Math.round((dy * inv * 0.5 + 0.5) * 255)
      out[i + 2] = Math.round((inv * 0.5 + 0.5) * 255)
      out[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return texFromCanvas(c, { srgb: false })
}

/** Noise-driven roughness map (linear). Effective roughness = material.roughness × this. */
export function roughnessTexture({ size = 256, base = 0.85, variation = 0.15, octaves = 3, scale = 12, seed = 5 } = {}) {
  return noiseTexture({ size, octaves, scale, seed, lo: base - variation, hi: base + variation, srgb: false })
}

/**
 * Composite grime + edge wear onto an EXISTING canvas texture (mutates + returns it).
 * opts: { amount (grime 0..1), edge (corner-AO 0..1 — use 0 on tiling textures
 * unless the painted-in corner darkening is wanted), speckle, color, seed }
 */
export function dirtOverlay(baseTex, { amount = 0.35, edge = 0.35, speckle = 0.4, color = '#241a10', seed = 7 } = {}) {
  let c = baseTex.image
  if (!(c instanceof HTMLCanvasElement)) {
    const copy = makeCanvas(c.width || 512)
    copy.getContext('2d').drawImage(c, 0, 0, copy.width, copy.height)
    baseTex.image = c = copy
  }
  const ctx = c.getContext('2d'), s = c.width
  const rng = mulberry32(seed * 7919 + 13)
  ctx.save()
  // grime blotches (multiply)
  ctx.globalCompositeOperation = 'multiply'
  const n = Math.round(46 * amount)
  for (let i = 0; i < n; i++) {
    const x = rng() * s, y = rng() * s, r = s * (0.03 + rng() * 0.11)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const a = 0.12 + rng() * 0.3 * amount
    g.addColorStop(0, `rgba(${hexRGB(color).join(',')},${a.toFixed(3)})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // edge / corner darkening (painted-in AO feel)
  if (edge > 0) {
    const [er, eg, eb] = hexRGB(color)
    const w = s * 0.16
    for (const [x0, y0, x1, y1] of [[0, 0, 0, w], [0, s, 0, s - w], [0, 0, w, 0], [s, 0, s - w, 0]]) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1)
      g.addColorStop(0, `rgba(${er},${eg},${eb},${(0.5 * edge).toFixed(3)})`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, s, s)
    }
  }
  // speckle: fine dark flecks + sparse light dust
  ctx.globalCompositeOperation = 'source-over'
  const flecks = Math.round(320 * speckle)
  for (let i = 0; i < flecks; i++) {
    const x = rng() * s, y = rng() * s, r = 0.6 + rng() * 1.6
    ctx.fillStyle = rng() < 0.72 ? `rgba(20,14,8,${0.1 + rng() * 0.2})` : `rgba(230,220,200,${0.05 + rng() * 0.1})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
  baseTex.needsUpdate = true
  return baseTex
}

/** Cracked stone: mottled granite base, dark mortar-recess cracks. */
export function crackedStoneTexture({ size = 512, dark = '#453f37', base = '#6b655b', light = '#847c6f', mortar = '#2e2922', seed = 11 } = {}) {
  const coarse = noiseField(size, { octaves: 4, scale: 5, seed })
  const fine = noiseField(size, { octaves: 3, scale: 24, seed: seed + 57 })
  const rng = mulberry32(seed)
  // crack polylines (random walks, some branching), precomputed → wrapped raster
  const paths = []
  for (let i = 0; i < 13; i++) {
    let x = rng() * size, y = rng() * size, ang = rng() * Math.PI * 2
    const pts = [[x, y]]
    const steps = 8 + Math.floor(rng() * 14)
    for (let sIdx = 0; sIdx < steps; sIdx++) {
      ang += (rng() - 0.5) * 1.1
      x += Math.cos(ang) * (size * 0.02 + rng() * size * 0.03)
      y += Math.sin(ang) * (size * 0.02 + rng() * size * 0.03)
      pts.push([x, y])
      if (rng() < 0.18) paths.push([[x, y], [x + Math.cos(ang + 1.4) * size * 0.05, y + Math.sin(ang + 1.4) * size * 0.05]])
    }
    paths.push(pts)
  }
  const crack = strokeMask(size, (ctx, s) => {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = Math.max(1.5, s / 512 * 2.4)
    ctx.lineJoin = 'round'
    for (const pts of paths) {
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
      ctx.stroke()
    }
  })
  const height = new Float32Array(size * size)
  for (let i = 0; i < height.length; i++) height[i] = clamp01(coarse[i] * 0.62 + fine[i] * 0.38 - crack[i] * 0.5)
  const ramp = colorRamp([[0, dark], [0.5, base], [1, light]])
  const [mr, mg, mb] = hexRGB(mortar)
  const map = fieldToCanvas(height, size, i => {
    const t = clamp01(coarse[i] * 0.62 + fine[i] * 0.38)
    let [r, g, b] = ramp(t)
    const mottle = 0.92 + fine[(i * 7 + 31) % fine.length] * 0.14
    r *= mottle; g *= mottle; b *= mottle
    const k = crack[i] * 0.85
    return [r + (mr - r) * k, g + (mg - g) * k, b + (mb - b) * k]
  })
  const normalMap = normalMapFromHeight(height, { strength: 2.2 })
  const roughnessMap = fieldToCanvas(height, size, i => {
    const v = Math.round(255 * clamp01(0.93 + (fine[i] - 0.5) * 0.12 + crack[i] * 0.06))
    return [v, v, v]
  }, { srgb: false })
  return { map, normalMap, roughnessMap }
}

/** Weathered wood planks: per-plank shade, stretched grain, dark gap recesses. */
export function woodPlankTexture({ size = 512, planks = 6, dark = '#4a3018', base = '#6b4a2e', light = '#8a6a42', gap = '#1d1206', seed = 23 } = {}) {
  const grain = noiseField(size, { octaves: 4, scale: 3, scaleY: 28, seed }) // stretched along v
  const fine = noiseField(size, { octaves: 2, scale: 40, seed: seed + 9 })
  const inv = 1 / size, pw = 1 / planks
  const plankShade = [], jointU = []
  const rng = mulberry32(seed + 5)
  for (let p = 0; p < planks; p++) { plankShade.push(0.82 + rng() * 0.3); jointU.push(rng()) }
  const gapPx = Math.max(1.5, size / 512 * 2.5) * inv
  const height = new Float32Array(size * size)
  const gapMask = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    const u = y * inv // planks run vertically in canvas-x? keep planks horizontal rows in v
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const v = y * inv, uu = x * inv
      const p = Math.min(planks - 1, Math.floor(v * planks))
      const dEdge = Math.min(v - p * pw, (p + 1) * pw - v)
      let gapK = dEdge < gapPx * 1.4 ? 1 - dEdge / (gapPx * 1.4) : 0
      const dj = Math.min(Math.abs(uu - jointU[p]), 1 - Math.abs(uu - jointU[p]))
      if (dj < gapPx) gapK = Math.max(gapK, 1 - dj / gapPx)
      gapMask[i] = gapK
      height[i] = clamp01(0.35 + grain[i] * 0.3 + (plankShade[p] - 0.97) * 0.5 + fine[i] * 0.08 - gapK * 0.55)
    }
  }
  const ramp = colorRamp([[0, dark], [0.55, base], [1, light]])
  const [gr, gg, gb] = hexRGB(gap)
  const map = fieldToCanvas(height, size, (i, h) => {
    const p = Math.min(planks - 1, Math.floor((Math.floor(i / size) * inv) * planks))
    const t = clamp01(grain[i] * 0.75 + fine[i] * 0.25)
    let [r, g, b] = ramp(t)
    const sh = plankShade[p]
    r *= sh; g *= sh; b *= sh
    const k = Math.min(1, gapMask[i] * 1.15)
    return [r + (gr - r) * k, g + (gg - g) * k, b + (gb - b) * k]
  })
  const normalMap = normalMapFromHeight(height, { strength: 1.7 })
  const roughnessMap = fieldToCanvas(height, size, i => {
    const v = Math.round(255 * clamp01(0.88 + (grain[i] - 0.5) * 0.16 + gapMask[i] * 0.08))
    return [v, v, v]
  }, { srgb: false })
  return { map, normalMap, roughnessMap }
}

/** Packed earth: trodden dirt, damp patches, embedded pebbles. */
export function packedEarthTexture({ size = 512, dark = '#3a2c1c', base = '#57452f', light = '#71603f', seed = 31 } = {}) {
  const coarse = noiseField(size, { octaves: 4, scale: 4, seed })
  const fine = noiseField(size, { octaves: 3, scale: 30, seed: seed + 17 })
  const rng = mulberry32(seed + 3)
  const pebbles = []
  for (let i = 0; i < 150; i++) pebbles.push([rng() * size, rng() * size, size * (0.004 + rng() * 0.008)])
  const pebble = strokeMask(size, (ctx, s) => {
    ctx.fillStyle = '#fff'
    for (const [x, y, r] of pebbles) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, '#fff')
      g.addColorStop(0.7, '#999')
      g.addColorStop(1, '#000')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  const height = new Float32Array(size * size)
  for (let i = 0; i < height.length; i++) height[i] = clamp01(coarse[i] * 0.55 + fine[i] * 0.3 + pebble[i] * 0.35)
  const ramp = colorRamp([[0, dark], [0.55, base], [1, light]])
  const map = fieldToCanvas(height, size, i => {
    const t = clamp01(coarse[i] * 0.6 + fine[i] * 0.4)
    let [r, g, b] = ramp(t)
    const damp = coarse[(i * 13 + 101) % coarse.length]
    if (damp < 0.34) { const k = 0.78 + damp * 0.6; r *= k; g *= k; b *= k }
    const pk = pebble[i]
    if (pk > 0.15) { const grey = (r + g + b) / 3; r += (grey * 1.25 - r) * pk; g += (grey * 1.22 - g) * pk; b += (grey * 1.2 - b) * pk }
    return [r, g, b]
  })
  const normalMap = normalMapFromHeight(height, { strength: 1.9 })
  const roughnessMap = fieldToCanvas(height, size, i => {
    const v = Math.round(255 * clamp01(0.95 + (fine[i] - 0.5) * 0.08 - pebble[i] * 0.12))
    return [v, v, v]
  }, { srgb: false })
  return { map, normalMap, roughnessMap }
}

/**
 * Worn metal: NEUTRAL bright-grey albedo (tint via material.color), bare-metal
 * scratches (shinier), grime patches (rougher). Shared by iron + bronze presets.
 */
export function wornMetalTexture({ size = 512, seed = 41 } = {}) {
  const fine = noiseField(size, { octaves: 3, scale: 34, seed })
  const patch = noiseField(size, { octaves: 3, scale: 5, seed: seed + 29 })
  const rng = mulberry32(seed + 1)
  const lines = []
  for (let i = 0; i < 220; i++) {
    const x = rng() * size, y = rng() * size, a = rng() * Math.PI * 2, l = size * (0.015 + rng() * 0.07)
    lines.push([x, y, x + Math.cos(a) * l, y + Math.sin(a) * l])
  }
  const scratch = strokeMask(size, (ctx, s) => {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    for (const [x0, y0, x1, y1] of lines) {
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
  })
  const height = new Float32Array(size * size)
  for (let i = 0; i < height.length; i++) height[i] = clamp01(0.5 + (fine[i] - 0.5) * 0.16 - scratch[i] * 0.22)
  const map = fieldToCanvas(height, size, i => {
    let l = 206 + (fine[i] - 0.5) * 44 // bright neutral so color tint dominates
    if (patch[i] < 0.45) l *= 0.58 + patch[i] * 0.85 // grime dip (edge-wear feel)
    l += scratch[i] * 26 // bare-metal scratches (subtle in albedo, strong in roughness)
    l = Math.max(0, Math.min(255, l))
    return [l, l, l * 0.985]
  })
  const normalMap = normalMapFromHeight(height, { strength: 1.6 })
  const roughnessMap = fieldToCanvas(height, size, i => {
    let r = 0.8 + (fine[i] - 0.5) * 0.22
    if (patch[i] < 0.45) r += (0.45 - patch[i]) * 0.95 // grime = rougher
    r -= scratch[i] * 0.32 // scratches = shinier
    const v = Math.round(255 * clamp01(r))
    return [v, v, v]
  }, { srgb: false })
  return { map, normalMap, roughnessMap }
}

/** Fine surface grain (leather/cloth/bone): neutral albedo — tint via material.color. */
export function fabricGrainTexture({ size = 256, scale = 36, seed = 51, contrast = 0.14, lum = 0.86, rough = 0.92, roughVar = 0.08 } = {}) {
  const field = noiseField(size, { octaves: 3, scale, seed })
  const map = fieldToCanvas(field, size, (i, h) => {
    const l = Math.round(255 * clamp01(lum + (h - 0.5) * contrast * 2))
    return [l, l, l]
  })
  const normalMap = normalMapFromHeight(field, { strength: 1.1 })
  const roughnessMap = fieldToCanvas(field, size, (i, h) => {
    const v = Math.round(255 * clamp01(rough + (h - 0.5) * roughVar * 2))
    return [v, v, v]
  }, { srgb: false })
  return { map, normalMap, roughnessMap }
}
