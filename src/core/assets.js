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
