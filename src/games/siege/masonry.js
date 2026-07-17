import * as THREE from 'three'
import { noiseField, normalMapFromHeight } from '../../core/assets.js'

/**
 * Procedural keep masonry — running-bond block courses with dark mortar
 * recesses, per-block tone shifts, and weather streaks bleeding down the
 * courses. Returns { map, normalMap, roughnessMap }, tileable, cached.
 */

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v)
const blockHash = (x, y, s) => {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(s, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

let _set = null

export function masonryTextureSet({ size = 512, courses = 7, blocksPerRow = 3, seed = 47 } = {}) {
  if (_set) return _set
  const rowH = size / courses
  const blockW = size / blocksPerRow
  const mortarPx = Math.max(2.5, size / 512 * 4)
  const bevelPx = mortarPx * 3.2

  const fine = noiseField(size, { octaves: 4, scale: 18, seed })
  const grime = noiseField(size, { octaves: 3, scale: 5, seed: seed + 31 })

  const height = new Float32Array(size * size)
  const albedo = document.createElement('canvas')
  albedo.width = albedo.height = size
  const aCtx = albedo.getContext('2d')
  const aImg = aCtx.createImageData(size, size)
  const rough = document.createElement('canvas')
  rough.width = rough.height = size
  const rCtx = rough.getContext('2d')
  const rImg = rCtx.createImageData(size, size)

  // stone ramp: cool charcoal-tan granite range (desaturated, natural, dark)
  const lo = [40, 37, 33], mid = [70, 66, 59], hi = [97, 91, 81]
  const mortar = [24, 21, 18]

  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / rowH)
    const yIn = y - row * rowH
    const ey = Math.min(yIn, rowH - yIn)
    const xOff = (row % 2) * blockW * 0.5
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const xs = (x + xOff) % size
      const bx = Math.floor(xs / blockW)
      const xIn = xs - bx * blockW
      const ex = Math.min(xIn, blockW - xIn)
      const edge = Math.min(ex, ey)
      // 0 in mortar seam -> 1 on the block face (soft bevel)
      const face = clamp01((edge - mortarPx) / bevelPx)
      const bh = blockHash(bx, row, seed)
      const tone = 0.42 + bh * 0.4 + (fine[i] - 0.5) * 0.34
      height[i] = clamp01(0.16 + face * (0.42 + tone * 0.4))

      // albedo: mortar -> block ramp, plus warm/cool per-block cast + grime
      let r, g, b
      if (tone < 0.5) {
        const k = tone / 0.5
        r = lo[0] + (mid[0] - lo[0]) * k; g = lo[1] + (mid[1] - lo[1]) * k; b = lo[2] + (mid[2] - lo[2]) * k
      } else {
        const k = (tone - 0.5) / 0.5
        r = mid[0] + (hi[0] - mid[0]) * k; g = mid[1] + (hi[1] - mid[1]) * k; b = mid[2] + (hi[2] - mid[2]) * k
      }
      const warm = (blockHash(bx * 7 + 3, row * 5 + 1, seed) - 0.5) * 18
      r += warm; g += warm * 0.6; b -= warm * 0.4
      if (grime[i] < 0.4) { const k = 0.72 + grime[i] * 0.7; r *= k; g *= k; b *= k }
      const m = 1 - face
      r += (mortar[0] - r) * m; g += (mortar[1] - g) * m; b += (mortar[2] - b) * m
      const o = i * 4
      aImg.data[o] = r; aImg.data[o + 1] = g; aImg.data[o + 2] = b; aImg.data[o + 3] = 255

      const rv = Math.round(255 * clamp01(0.97 - face * 0.08 + (fine[i] - 0.5) * 0.1 + m * 0.06))
      rImg.data[o] = rv; rImg.data[o + 1] = rv; rImg.data[o + 2] = rv; rImg.data[o + 3] = 255
    }
  }
  aCtx.putImageData(aImg, 0, 0)
  rCtx.putImageData(rImg, 0, 0)

  // weather streaks: dark mineral drips bleeding down from course seams
  aCtx.save()
  let sSeed = seed * 31 + 7
  const srand = () => { sSeed = (sSeed * 1103515245 + 12345) & 0x7fffffff; return sSeed / 0x7fffffff }
  for (let i = 0; i < 30; i++) {
    const sx = srand() * size
    const sy = Math.floor(srand() * courses) * rowH + mortarPx
    const len = rowH * (0.6 + srand() * 2.6)
    const wdt = 2 + srand() * 6
    const grad = aCtx.createLinearGradient(0, sy, 0, sy + len)
    grad.addColorStop(0, `rgba(24,20,15,${0.16 + srand() * 0.2})`)
    grad.addColorStop(1, 'rgba(24,20,15,0)')
    aCtx.fillStyle = grad
    aCtx.fillRect(sx - wdt / 2, sy, wdt, len)
  }
  aCtx.restore()

  const map = new THREE.CanvasTexture(albedo)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.anisotropy = 4
  const roughnessMap = new THREE.CanvasTexture(rough)
  roughnessMap.colorSpace = THREE.NoColorSpace
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping
  const normalMap = normalMapFromHeight(height, { strength: 2.6 })
  _set = { map, normalMap, roughnessMap }
  return _set
}

/** Scale a geometry's UVs so shared tiling textures land at sane world density. */
export function scaleUV(geo, su, sv = su) {
  const uv = geo.attributes.uv
  if (!uv) return geo
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  uv.needsUpdate = true
  return geo
}
