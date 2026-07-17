import * as THREE from 'three'
import { canvasTexture, noiseField, normalMapFromHeight, packedEarthTexture } from '../../core/assets.js'
import {
  pbrMaterial, stoneMaterial, ironMaterial, woodMaterial,
  boneMaterial, fireMaterial, emberGlowMaterial, glowSpriteMaterial,
} from '../../art/materials.js'
import { skyDome, cloudLayer, starField, fireflies } from '../../art/environment.js'
import { rand, TAU, clamp, damp } from '../../core/utils.js'

export const TRACK_HALF_W = 5.5
export const WALL_DIST = 26 // soft invisible wall, lateral distance from center line
const N = 1024 // curve samples

const _v = new THREE.Vector3()
const _m4 = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _s3 = new THREE.Vector3()

/** Tiny deterministic RNG so every texture/scatter tiles + reloads identically. */
function lcg(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/* ------------------------------------------------------------------ */
/* road texture set — packed earth + worn flagstones, wheel ruts,      */
/* hoof scuffs, dusty edges. v runs along the track (RepeatWrapping).  */
/* ------------------------------------------------------------------ */

function roadTextureSet() {
  const S = 512
  const coarse = noiseField(S, { octaves: 4, scale: 5, seed: 61 })
  const fine = noiseField(S, { octaves: 3, scale: 26, seed: 88 })

  // deterministic flagstone layout: 8 rows of 64px (rows align to the tile
  // edge so wrapT is seamless), slabs 70-150px wide with per-slab shade
  const rng = lcg(4242)
  const slabs = []
  const rows = 8, rowH = S / rows
  for (let r = 0; r < rows; r++) {
    let x = -Math.floor(rng() * 60)
    while (x < S) {
      const w = 70 + rng() * 80
      // ~1 in 5 slabs is missing (bare packed earth) or scorched dark
      const roll = rng()
      slabs.push({
        x0: x + 2.5, y0: r * rowH + 2.5, x1: Math.min(x + w, S + 20) - 2.5, y1: (r + 1) * rowH - 2.5,
        sh: 0.68 + rng() * 0.34, gone: roll < 0.14, burnt: roll > 0.9,
      })
      x += w
    }
  }
  const rutX = [0.31 * S, 0.69 * S]

  // hoof scuffs + grit flecks (drawn wrapped at ±S so v tiles)
  const scuffs = []
  for (let i = 0; i < 170; i++) {
    scuffs.push({
      x: S * (0.12 + rng() * 0.76), y: rng() * S,
      len: 8 + rng() * 14, ang: (rng() - 0.5) * 0.9, w: 1.6 + rng() * 2, a: 0.16 + rng() * 0.22,
    })
  }
  const flecks = []
  for (let i = 0; i < 380; i++) flecks.push({ x: rng() * S, y: rng() * S, r: 0.6 + rng() * 1.5, d: rng() < 0.7 })

  const wrapped = (ctx, draw) => { for (const oy of [-S, 0, S]) { ctx.save(); ctx.translate(0, oy); draw(ctx); ctx.restore() } }

  // wavy wheel-rut strokes — 3 feathered passes, NOT accumulated stamps
  // (overlapping multiply stamps dig a glossy black trench that reads as a
  // white specular streak at grazing sun angles)
  const drawRuts = (ctx, fill, alpha, w) => {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.lineCap = 'round'
    for (const cx of rutX) {
      for (const [ww, a] of [[w * 2, alpha * 0.42], [w * 1.2, alpha * 0.33], [w * 0.55, alpha * 0.28]]) {
        ctx.strokeStyle = `rgba(${fill},${a.toFixed(3)})`
        ctx.lineWidth = ww
        ctx.beginPath()
        for (let y = -8; y <= S + 8; y += 8) {
          const x = cx + Math.sin((y / S) * TAU * 2) * 6
          y === -8 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  // ---------- albedo ----------
  const map = canvasTexture(S, S, (ctx, w, h) => {
    // packed-earth base modulated by noise
    const img = ctx.createImageData(S, S)
    const d = img.data
    for (let i = 0; i < S * S; i++) {
      const t = coarse[i] * 0.6 + fine[i] * 0.4
      d[i * 4] = 48 + t * 42
      d[i * 4 + 1] = 39 + t * 33
      d[i * 4 + 2] = 28 + t * 23
      d[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    // worn flagstone slabs (translucent so earth grit shows through)
    for (const s of slabs) {
      if (s.gone) continue
      const k = s.burnt ? 0.45 : 1
      const l = Math.round(86 * s.sh * k), g2 = Math.round(77 * s.sh * k), b = Math.round(64 * s.sh * k)
      ctx.fillStyle = `rgba(${l},${g2},${b},0.5)`
      ctx.beginPath()
      ctx.roundRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0, 7)
      ctx.fill()
      ctx.strokeStyle = 'rgba(22,16,10,0.6)' // mortar/dirt recess
      ctx.lineWidth = 3
      ctx.stroke()
    }
    // wheel ruts — broad shallow depressions worn by iron tyres
    drawRuts(ctx, '70,52,36', 0.55, 13)
    // hoof scuffs
    wrapped(ctx, c => {
      c.lineCap = 'round'
      for (const sc of scuffs) {
        c.strokeStyle = `rgba(30,22,14,${sc.a})`
        c.lineWidth = sc.w
        c.beginPath()
        c.moveTo(sc.x - Math.sin(sc.ang) * sc.len, sc.y - Math.cos(sc.ang) * sc.len)
        c.lineTo(sc.x + Math.sin(sc.ang) * sc.len, sc.y + Math.cos(sc.ang) * sc.len)
        c.stroke()
      }
    })
    // dust drifts at the road edges
    for (const [x0, x1] of [[0, 40], [S, S - 40]]) {
      const g = ctx.createLinearGradient(x0, 0, x1, 0)
      g.addColorStop(0, 'rgba(140,114,80,0.55)')
      g.addColorStop(1, 'rgba(140,114,80,0)')
      ctx.fillStyle = g
      ctx.fillRect(Math.min(x0, x1), 0, 40, S)
    }
    // faded crimson kill-strip paint, chipped away in patches
    const rr = lcg(99)
    for (const x of [9, S - 15]) {
      for (let y = 0; y < S; y += 14) {
        if (rr() < 0.72) { ctx.fillStyle = `rgba(118,40,32,${0.22 + rr() * 0.2})`; ctx.fillRect(x, y, 6, 13) }
      }
    }
    // grit flecks
    wrapped(ctx, c => {
      for (const f of flecks) {
        c.fillStyle = f.d ? 'rgba(22,16,10,0.28)' : 'rgba(196,176,140,0.2)'
        c.beginPath(); c.arc(f.x, f.y, f.r, 0, TAU); c.fill()
      }
    })
  })
  map.wrapT = THREE.RepeatWrapping
  map.anisotropy = 8

  // ---------- height → normal ----------
  const hc = document.createElement('canvas')
  hc.width = hc.height = S
  {
    const ctx = hc.getContext('2d')
    const img = ctx.createImageData(S, S)
    const d = img.data
    for (let i = 0; i < S * S; i++) {
      const v = Math.round(110 + (coarse[i] - 0.5) * 26 + (fine[i] - 0.5) * 22)
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
      d[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    for (const s of slabs) { // slabs sit proud, mortar recessed
      if (s.gone) continue
      ctx.fillStyle = `rgba(158,158,158,0.75)`
      ctx.beginPath()
      ctx.roundRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0, 7)
      ctx.fill()
      ctx.strokeStyle = 'rgba(30,30,30,0.9)'
      ctx.lineWidth = 3.5
      ctx.stroke()
    }
    drawRuts(ctx, '0,0,0', 0.22, 13)
    wrapped(ctx, c => {
      c.lineCap = 'round'
      for (const sc of scuffs) {
        c.strokeStyle = `rgba(0,0,0,${sc.a * 0.7})`
        c.lineWidth = sc.w
        c.beginPath()
        c.moveTo(sc.x - Math.sin(sc.ang) * sc.len, sc.y - Math.cos(sc.ang) * sc.len)
        c.lineTo(sc.x + Math.sin(sc.ang) * sc.len, sc.y + Math.cos(sc.ang) * sc.len)
        c.stroke()
      }
    })
  }
  const normalMap = normalMapFromHeight(hc, { strength: 2.6 })

  // ---------- roughness (linear) ----------
  const roughnessMap = canvasTexture(S, S, (ctx, w, h) => {
    ctx.fillStyle = '#f7f7f7' // dusty earth: very rough
    ctx.fillRect(0, 0, S, S)
    for (const s of slabs) {
      if (s.gone) continue
      ctx.fillStyle = 'rgba(226,226,226,0.8)' // stone slightly less rough
      ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0)
    }
    drawRuts(ctx, '208,208,208', 0.28, 13) // ruts lightly burnished by wheels
  })
  roughnessMap.colorSpace = THREE.NoColorSpace
  roughnessMap.wrapT = THREE.RepeatWrapping

  return { map, normalMap, roughnessMap }
}

/* ------------------------------------------------------------------ */
/* curb texture — alternating war-painted stone blocks (crimson/bone)  */
/* ------------------------------------------------------------------ */

function curbTextureSet() {
  const S = 128
  const noise = noiseField(S, { octaves: 3, scale: 10, seed: 17 })
  const rng = lcg(1717)
  const chips = []
  for (let i = 0; i < 46; i++) chips.push({ x: rng() * S, y: rng() * S, r: 1 + rng() * 3 })
  const map = canvasTexture(S, S, (ctx) => {
    const img = ctx.createImageData(S, S)
    const d = img.data
    for (let y = 0; y < S; y++) {
      const bone = y >= S / 2
      for (let x = 0; x < S; x++) {
        const i = y * S + x
        const t = 0.82 + noise[i] * 0.3
        if (bone) { d[i * 4] = 144 * t; d[i * 4 + 1] = 130 * t; d[i * 4 + 2] = 104 * t }
        else { d[i * 4] = 106 * t; d[i * 4 + 1] = 38 * t; d[i * 4 + 2] = 30 * t }
        d[i * 4 + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    // block joints (wrap at 0 / S/2 / S)
    ctx.fillStyle = 'rgba(20,15,10,0.85)'
    for (const y of [0, S / 2 - 2, S - 4]) ctx.fillRect(0, y, S, 4)
    // paint chips down to grey stone
    for (const c of chips) {
      ctx.fillStyle = 'rgba(104,98,88,0.8)'
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill()
    }
  })
  map.wrapT = THREE.RepeatWrapping
  const hc = document.createElement('canvas')
  hc.width = hc.height = S
  {
    const ctx = hc.getContext('2d')
    ctx.fillStyle = '#969696'
    ctx.fillRect(0, 0, S, S)
    ctx.fillStyle = '#2c2c2c'
    for (const y of [0, S / 2 - 2, S - 4]) ctx.fillRect(0, y, S, 4)
    for (const c of chips) { ctx.fillStyle = '#787878'; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill() }
  }
  const normalMap = normalMapFromHeight(hc, { strength: 2 })
  return { map, normalMap, roughnessMap: null }
}

function checkerTexture() {
  return canvasTexture(128, 64, (ctx, w, h) => {
    const s = 16
    const rng = lcg(31)
    for (let y = 0; y < h / s; y++) {
      for (let x = 0; x < w / s; x++) {
        const sh = 0.8 + rng() * 0.25
        ctx.fillStyle = (x + y) % 2
          ? `rgb(${28 * sh | 0},${24 * sh | 0},${19 * sh | 0})`
          : `rgb(${176 * sh | 0},${163 * sh | 0},${134 * sh | 0})`
        ctx.fillRect(x * s, y * s, s, s)
      }
    }
    for (let i = 0; i < 90; i++) { // trampled grime
      ctx.fillStyle = 'rgba(26,19,12,0.25)'
      ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3)
    }
  })
}

/** Ember-rune chevrons for boost slabs (additive — only the glow drawn). */
function runeTexture() {
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#ffcf9a'
    ctx.lineWidth = 14
    ctx.lineCap = 'square'
    for (const y of [98, 62, 26]) {
      ctx.beginPath()
      ctx.moveTo(22, y + 13)
      ctx.lineTo(w / 2, y - 13)
      ctx.lineTo(w - 22, y + 13)
      ctx.stroke()
    }
    // flanking rune ticks
    ctx.lineWidth = 6
    for (const x of [10, w - 10]) {
      ctx.beginPath()
      ctx.moveTo(x, 20)
      ctx.lineTo(x, 108)
      ctx.stroke()
    }
  })
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function signTexture() {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    // ragged war-banner silhouette
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(w, 0)
    ctx.lineTo(w, h - 26)
    for (let x = w; x > 0; x -= 64) {
      ctx.lineTo(x - 32, h - rand(0, 14))
      ctx.lineTo(x - 64, h - 26 - rand(0, 10))
    }
    ctx.closePath()
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#4e1418')
    g.addColorStop(0.55, '#3a0f12')
    g.addColorStop(1, '#280b0d')
    ctx.fillStyle = g
    ctx.fill()
    ctx.save()
    ctx.clip()
    // leather grime
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(232,220,196,0.03)'
      ctx.fillRect(rand(w), rand(h), rand(2, 9), rand(2, 9))
    }
    ctx.restore()
    // bronze frame
    ctx.strokeStyle = '#8a6030'
    ctx.lineWidth = 10
    ctx.strokeRect(12, 12, w - 24, h - 60)
    ctx.strokeStyle = 'rgba(216, 168, 96, 0.4)'
    ctx.lineWidth = 3
    ctx.strokeRect(24, 24, w - 48, h - 84)
    // rivets
    ctx.fillStyle = '#a8813f'
    for (const x of [40, w - 40]) for (const y of [40, h - 76]) {
      ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill()
    }
    // painted-pigment lettering, no neon halo
    ctx.font = '900 116px Palatino, "Book Antiqua", Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.85)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 4
    ctx.fillStyle = '#d8b478'
    ctx.fillText('WAR CHARIOTS', w / 2, h / 2 - 14)
  })
}

/** Trackside war banner: ragged cloth with a faded sword emblem. */
function flagTexture(color) {
  return canvasTexture(64, 96, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    // ragged-bottom banner silhouette
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(w, 0)
    ctx.lineTo(w, h - 16)
    ctx.lineTo(w * 0.75, h - 6)
    ctx.lineTo(w * 0.5, h - 18)
    ctx.lineTo(w * 0.25, h - 4)
    ctx.lineTo(0, h - 14)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    ctx.save()
    ctx.clip()
    // grime + shading
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 48; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.14)'
      ctx.fillRect(rand(w), rand(h), rand(2, 6), rand(2, 6))
    }
    // faded sword emblem
    ctx.fillStyle = 'rgba(226,214,188,0.5)'
    ctx.beginPath() // blade
    ctx.moveTo(w / 2, 16)
    ctx.lineTo(w / 2 + 4, 26)
    ctx.lineTo(w / 2 + 4, 54)
    ctx.lineTo(w / 2 - 4, 54)
    ctx.lineTo(w / 2 - 4, 26)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(w / 2 - 11, 52, 22, 5) // guard
    ctx.fillRect(w / 2 - 2, 57, 4, 13) // grip
    ctx.restore()
  })
}

/* ------------------------------------------------------------------ */
/* mesas — layered strata buttes for the badlands horizon              */
/* ------------------------------------------------------------------ */

function strataMaps() {
  const S = 256
  const bandNoise = noiseField(S, { octaves: 3, scale: 4, scaleY: 18, seed: 71 })
  const fine = noiseField(S, { octaves: 3, scale: 22, seed: 45 })
  const bands = [[86, 52, 38], [104, 64, 44], [66, 42, 31], [112, 74, 50], [78, 49, 36], [96, 58, 40]]
  const heightF = new Float32Array(S * S)
  const map = canvasTexture(S, S, (ctx) => {
    const img = ctx.createImageData(S, S)
    const d = img.data
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x
        const bandPos = (y / S) * 9 + (bandNoise[i] - 0.5) * 1.6
        const b = bands[Math.abs(Math.floor(bandPos)) % bands.length]
        const frac = bandPos - Math.floor(bandPos)
        const edge = frac < 0.14 ? 0.72 : 1 // dark parting line between strata
        const t = (0.86 + (fine[i] - 0.5) * 0.34) * edge
        d[i * 4] = b[0] * t; d[i * 4 + 1] = b[1] * t; d[i * 4 + 2] = b[2] * t; d[i * 4 + 3] = 255
        heightF[i] = clamp(0.5 + (frac < 0.14 ? -0.3 : 0.08 * Math.sin(frac * Math.PI)) + (fine[i] - 0.5) * 0.3, 0, 1)
      }
    }
    ctx.putImageData(img, 0, 0)
  })
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  const normalMap = normalMapFromHeight(heightF, { strength: 2.2 })
  return { map, normalMap, roughnessMap: null }
}

function mesaGeometry(seed) {
  const rng = lcg(seed)
  const geo = new THREE.CylinderGeometry(0.52, 1, 1, 11, 4)
  const p = geo.attributes.position
  // stepped butte profile: broad talus base, sheer cliff, narrow capstone
  const profile = [1, 0.72 + rng() * 0.08, 0.66 + rng() * 0.08, 0.55 + rng() * 0.07, 0.52]
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const row = Math.round((y + 0.5) * 4)
    const ang = Math.atan2(p.getZ(i), p.getX(i))
    const j = profile[row] * (1
      + 0.2 * Math.sin(ang * 3 + seed + row * 1.7)
      + 0.11 * Math.sin(ang * 6 + seed * 2)
      + 0.06 * Math.sin(ang * 11 + row))
    p.setX(i, p.getX(i) * j)
    p.setZ(i, p.getZ(i) * j)
  }
  geo.computeVertexNormals()
  return geo
}

/** Low-poly jittered boulder (flat facets, shared stone material). */
function boulder(mat, scale) {
  const geo = new THREE.IcosahedronGeometry(0.55, 0)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * rand(0.8, 1.3), p.getY(i) * rand(0.55, 1.15), p.getZ(i) * rand(0.8, 1.3))
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, mat)
  m.scale.setScalar(scale)
  m.position.y = 0.3 * scale
  m.rotation.y = rand(TAU)
  m.castShadow = true
  return m
}

/* ------------------------------------------------------------------ */
/* track                                                               */
/* ------------------------------------------------------------------ */

/**
 * Builds the full circuit + scorched-badlands war-road into `scene`.
 * Returns geometry helpers, pads, rings, sun light and tickables.
 */
export function buildTrack(scene) {
  // control points: long top straight, right sweeper, east hairpin,
  // mid chicane, south sweeper, west hairpin, return sweeper.
  const ctrl = [
    [-70, 90], [10, 100], [70, 88], [105, 45], [95, -10], [55, -30],
    [30, 8], [-5, -18], [-45, -60], [-100, -45], [-115, 20], [-95, 65],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z))
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'catmullrom', 0.5)
  const length = curve.getLength()

  // dense samples: pos / tangent / left / curvature
  const pos = [], tan = [], left = [], curvArr = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const t = i / N
    pos.push(curve.getPointAt(t))
    tan.push(curve.getTangentAt(t).normalize())
    left.push(new THREE.Vector3(tan[i].z, 0, -tan[i].x)) // up x tangent
  }
  const segLen = length / N
  for (let i = 0; i < N; i++) {
    const a = tan[i], b = tan[(i + 6) % N]
    curvArr[i] = Math.acos(clamp(a.dot(b), -1, 1)) / (segLen * 6) // 1/turn-radius
  }

  const track = {
    curve, length, halfW: TRACK_HALF_W, N, pos, tan, left, curv: curvArr,
    tickables: [], pads: [], rings: [],
    minimapPts: pos.filter((_, i) => i % 8 === 0).map(p => [p.x, p.z]),
    // final-lap torch flare (presentation): scene sets flareTarget, torches ease to it
    flare: 1, flareTarget: 1,
    // badlands scatter registries so the podium ceremony can clear its stage
    mesas: [], clutter: [],
  }

  track.posAt = (s, out) => {
    const f = ((s % 1) + 1) % 1 * N
    const i = Math.floor(f) % N, j = (i + 1) % N
    return out.copy(pos[i]).lerp(pos[j], f - Math.floor(f))
  }
  track.tanAt = (s, out) => {
    const i = Math.floor(((s % 1) + 1) % 1 * N) % N
    return out.copy(tan[i])
  }
  track.leftAt = (s, out) => {
    const i = Math.floor(((s % 1) + 1) % 1 * N) % N
    return out.copy(left[i])
  }
  /** Windowed nearest-sample search (cheap, call with last known idx). */
  track.nearestIdx = (p, lastIdx, window = 60) => {
    let best = lastIdx, bd = Infinity
    for (let o = -window; o <= window; o++) {
      const i = (lastIdx + o + N) % N
      const dx = pos[i].x - p.x, dz = pos[i].z - p.z
      const d = dx * dx + dz * dz
      if (d < bd) { bd = d; best = i }
    }
    return best
  }
  track.maxCurvAhead = (idx, count = 46) => {
    let m = 0
    for (let o = 0; o < count; o += 3) m = Math.max(m, curvArr[(idx + o) % N])
    return m
  }
  /** Min distance from point to track centerline (coarse). */
  const distToTrack = p => {
    let bd = Infinity
    for (let i = 0; i < N; i += 12) {
      const dx = pos[i].x - p.x, dz = pos[i].z - p.z
      bd = Math.min(bd, dx * dx + dz * dz)
    }
    return Math.sqrt(bd)
  }

  // shared fire materials (auto-ticked); three speeds so flames desync.
  // warm core, capped intensity — fire, not neon (esp. unfogged at distance)
  const fireOpts = { intensity: 1.45, edgeColor: '#8e1c0c', midColor: '#ff8226', coreColor: '#ffdca0' }
  track.fireMats = [
    fireMaterial({ ...fireOpts, speed: 1.35 }),
    fireMaterial({ ...fireOpts, speed: 1.7 }),
    fireMaterial({ ...fireOpts, speed: 2.0 }),
  ]

  buildRoad(scene, track)
  buildStartArch(scene, track)
  buildPads(scene, track)
  buildRings(scene, track)
  buildEnvironment(scene, track, distToTrack)
  return track
}

/* ------------------------------------------------------------------ */

function buildRoad(scene, track) {
  const { pos, left, curv } = track
  const hw = TRACK_HALF_W
  // road ribbon
  const verts = new Float32Array((N + 1) * 2 * 3)
  const uvs = new Float32Array((N + 1) * 2 * 2)
  const idx = []
  for (let i = 0; i <= N; i++) {
    const k = i % N
    const p = pos[k], l = left[k]
    verts.set([p.x + l.x * hw, 0.02, p.z + l.z * hw, p.x - l.x * hw, 0.02, p.z - l.z * hw], i * 6)
    const v = (i / N) * 96
    uvs.set([0, v, 1, v], i * 4)
    if (i < N) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const roadMaps = roadTextureSet()
  const road = new THREE.Mesh(geo, pbrMaterial({
    maps: roadMaps, roughness: 1.0, metalness: 0, normalScale: 1.15, envMapIntensity: 0.06,
  }))
  road.receiveShadow = true
  scene.add(road)

  // painted stone curbs on tight corners (merged strips, PBR blocks)
  const curbVerts = []
  const curbUvs = []
  const curbIdx = []
  let vi = 0
  const rowCount = { 1: 0, [-1]: 0 }
  for (let i = 0; i < N; i += 2) {
    if (curv[i] < 0.028) continue
    const j = (i + 2) % N
    for (const side of [1, -1]) {
      for (const [a, b] of [[i, j]]) {
        const pa = pos[a], pb = pos[b], la = left[a], lb = left[b]
        curbVerts.push(
          pa.x + la.x * hw * side, 0.06, pa.z + la.z * hw * side,
          pa.x + la.x * (hw + 0.55) * side, 0.06, pa.z + la.z * (hw + 0.55) * side,
          pb.x + lb.x * hw * side, 0.06, pb.z + lb.z * hw * side,
          pb.x + lb.x * (hw + 0.55) * side, 0.06, pb.z + lb.z * (hw + 0.55) * side,
        )
        const v0 = rowCount[side] * 0.5
        curbUvs.push(0, v0, 1, v0, 0, v0 + 0.5, 1, v0 + 0.5)
        rowCount[side]++
        curbIdx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2)
        vi += 4
      }
    }
  }
  const cgeo = new THREE.BufferGeometry()
  cgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(curbVerts), 3))
  cgeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(curbUvs), 2))
  cgeo.setIndex(curbIdx)
  cgeo.computeVertexNormals()
  const curb = new THREE.Mesh(cgeo, pbrMaterial({
    maps: curbTextureSet(), roughness: 0.95, metalness: 0, normalScale: 1.4,
    envMapIntensity: 0.2, side: THREE.DoubleSide,
  }))
  curb.receiveShadow = true
  scene.add(curb)
}

function buildStartArch(scene, track) {
  const p = track.pos[0], l = track.left[0], tn = track.tan[0]
  const g = new THREE.Group()
  const stoneMat = stoneMaterial('#a89c8c')
  const stoneDark = stoneMaterial('#7a7266')
  const pgeo = new THREE.BoxGeometry(1.7, 9, 1.7)
  const capGeo = new THREE.BoxGeometry(2.3, 0.55, 2.3)
  const baseGeo = new THREE.BoxGeometry(2.5, 0.8, 2.5)
  const flameGeo = new THREE.ConeGeometry(0.42, 1.25, 10)
  const flames = []
  for (const side of [1, -1]) {
    const px = p.x + l.x * (TRACK_HALF_W + 1.8) * side
    const pz = p.z + l.z * (TRACK_HALF_W + 1.8) * side
    const pl = new THREE.Mesh(pgeo, stoneMat)
    pl.position.set(px, 4.5, pz)
    pl.castShadow = true
    g.add(pl)
    const base = new THREE.Mesh(baseGeo, stoneDark)
    base.position.set(px, 0.4, pz)
    g.add(base)
    const cap = new THREE.Mesh(capGeo, stoneDark)
    cap.position.set(px, 9.2, pz)
    cap.castShadow = true
    g.add(cap)
    // pillar-top brazier fire — real flame + decay-2 firelight
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.28, 0.45, 8), ironMaterial('#3f4148'))
    bowl.position.set(px, 9.7, pz)
    g.add(bowl)
    const fl = new THREE.Mesh(flameGeo, track.fireMats[side > 0 ? 0 : 2])
    fl.position.set(px, 10.4, pz)
    g.add(fl)
    const halo = new THREE.Sprite(glowSpriteMaterial('#ff8c3b', 0.22))
    halo.scale.setScalar(2.4)
    halo.position.set(px, 10.3, pz)
    g.add(halo)
    const light = new THREE.PointLight('#ff8a48', 13, 20, 2)
    light.position.set(px, 10.1, pz)
    g.add(light)
    flames.push({ fl, halo, light, ph: rand(TAU) })
  }
  let ft = 0
  track.tickables.push({ tick: dt => {
    ft += dt
    for (const { fl, halo, light, ph } of flames) {
      const s = 1 + 0.14 * Math.sin(ft * 11 + ph) + 0.08 * Math.sin(ft * 23 + ph * 2)
      fl.scale.set(s, 1 + 0.24 * Math.abs(Math.sin(ft * 7 + ph)), s)
      halo.material.opacity = 0.18 + 0.07 * Math.sin(ft * 9 + ph)
      light.intensity = 13 * (0.88 + 0.16 * Math.sin(ft * 13 + ph) + 0.06 * Math.sin(ft * 29 + ph * 3))
    }
  } })
  // timber crossbar lashed between the pillars
  const barW = (TRACK_HALF_W + 1.8) * 2 + 1.7
  const bar = new THREE.Mesh(new THREE.BoxGeometry(barW, 0.75, 0.6), woodMaterial('#5a4430'))
  bar.position.set(p.x, 9.35, p.z)
  bar.rotation.y = Math.atan2(l.x, l.z) + Math.PI / 2
  bar.castShadow = true
  g.add(bar)
  // WAR CHARIOTS banner hangs from the bar (both faces, lit like cloth)
  const signMat = new THREE.MeshStandardMaterial({
    map: signTexture(), transparent: true, roughness: 0.96, metalness: 0,
  })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(barW - 2.4, 2.3), signMat)
  sign.position.set(p.x - tn.x * 0.32, 7.9, p.z - tn.z * 0.32)
  sign.rotation.y = Math.atan2(-tn.x, -tn.z) // faces the approaching grid
  const sign2 = sign.clone()
  sign2.position.set(p.x + tn.x * 0.32, 7.9, p.z + tn.z * 0.32)
  sign2.rotation.y = Math.atan2(tn.x, tn.z)
  g.add(sign2)
  g.add(sign)
  // bone-mosaic start strip on the road
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_HALF_W * 2, 3),
    new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.94, metalness: 0 }),
  )
  strip.rotation.x = -Math.PI / 2
  strip.rotation.z = bar.rotation.y
  strip.position.set(p.x, 0.035, p.z)
  strip.receiveShadow = true
  g.add(strip)
  scene.add(g)
}

function buildPads(scene, track) {
  // rune slabs on straights / sweeper exits — chiseled stone, ember-lit grooves
  const at = [30, 150, 380, 560, 760, 930]
  const tex = runeTexture()
  const geo = new THREE.PlaneGeometry(3.4, 4.6)
  const slabGeo = new THREE.BoxGeometry(3.8, 0.05, 5.0)
  const slabMat = stoneMaterial('#5c554b')
  for (const i of at) {
    const p = track.pos[i], tn = track.tan[i], l = track.left[i]
    const off = rand(-1.6, 1.6)
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      color: new THREE.Color('#ff8c3b').multiplyScalar(0.9), opacity: 0.85,
    })
    const slab = new THREE.Mesh(slabGeo, slabMat)
    slab.rotation.y = Math.atan2(-tn.x, -tn.z)
    slab.position.set(p.x + l.x * off, 0.03, p.z + l.z * off)
    slab.receiveShadow = true
    scene.add(slab)
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = -Math.PI / 2
    m.rotation.z = Math.atan2(-tn.x, -tn.z)
    m.position.set(p.x + l.x * off, 0.07, p.z + l.z * off)
    scene.add(m)
    const pad = { x: m.position.x, z: m.position.z, mat, t: rand(4) }
    track.pads.push(pad)
    track.tickables.push({ tick: dt => {
      pad.t += dt
      // ember smolder: hot coals breathing, never LED-bright
      mat.color.set('#ff8c3b').multiplyScalar(0.62 + 0.34 * (0.5 + 0.5 * Math.sin(pad.t * 5)))
    } })
  }
}

function buildRings(scene, track) {
  // flaming hoops — dark iron armature wreathed in real fire
  const ringGeo = new THREE.TorusGeometry(1.45, 0.11, 8, 36)
  const fireGeo = new THREE.TorusGeometry(1.45, 0.29, 10, 40)
  const ringMat = ironMaterial('#33353b')
  const at = [70, 145, 220, 300, 372, 450, 528, 610, 690, 768, 845, 906, 960]
  for (let k = 0; k < at.length; k++) {
    const i = at[k]
    const p = track.pos[i], tn = track.tan[i], l = track.left[i]
    const off = ((k % 3) - 1) * 2.6
    const g = new THREE.Group()
    const m = new THREE.Mesh(ringGeo, ringMat)
    m.rotation.y = Math.atan2(tn.x, tn.z)
    g.add(m)
    const fire = new THREE.Mesh(fireGeo, track.fireMats[k % 3])
    fire.rotation.y = m.rotation.y
    g.add(fire)
    const halo = new THREE.Sprite(glowSpriteMaterial('#ff7a36', 0.16))
    halo.scale.setScalar(4.2)
    g.add(halo)
    g.position.set(p.x + l.x * off, 1.15, p.z + l.z * off)
    scene.add(g)
    const ring = { pos: g.position, home: g.position.clone(), group: g, active: true, respawnT: 0, t: rand(TAU) }
    track.rings.push(ring)
    track.tickables.push({ tick: dt => {
      ring.t += dt
      if (!ring.active) return
      g.position.y = 1.15 + Math.sin(ring.t * 2.2) * 0.16
      m.rotation.z += dt * 1.4
      fire.rotation.z -= dt * 0.6
      halo.material.opacity = 0.13 + 0.05 * Math.sin(ring.t * 11)
    } })
  }
}

/* ------------------------------------------------------------------ */

/** Gnarled dead tree: bare trunk + angled branches (shared geo/material). */
function deadTree(shared, scale) {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(shared.trunkGeo, shared.wood)
  trunk.position.y = 0.8
  trunk.rotation.z = rand(-0.09, 0.09)
  trunk.castShadow = true
  g.add(trunk)
  const n = 2 + Math.floor(rand(0, 2.4))
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(shared.branchGeo, shared.wood)
    const a = rand(TAU)
    b.position.set(Math.cos(a) * 0.12, rand(1.0, 1.6), Math.sin(a) * 0.12)
    b.rotation.set(Math.cos(a) * rand(0.5, 1.0), 0, Math.sin(a) * rand(0.5, 1.0) + rand(-0.2, 0.2))
    b.castShadow = true
    g.add(b)
  }
  g.scale.setScalar(scale * rand(0.85, 1.2))
  g.rotation.y = rand(TAU)
  return g
}

/** Colossal bone rib-arch spanning the war road. */
function boneArch(track, idx, boneMat) {
  const g = new THREE.Group()
  const p = track.pos[idx], tn = track.tan[idx]
  const arc = new THREE.Mesh(new THREE.TorusGeometry(8.2, 0.5, 8, 26, Math.PI), boneMat)
  arc.castShadow = true
  g.add(arc)
  // vertebral spurs along the crown
  for (const a of [Math.PI * 0.32, Math.PI * 0.5, Math.PI * 0.68]) {
    const spur = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.3, 6), boneMat)
    spur.position.set(Math.cos(a) * 8.9, Math.sin(a) * 8.9, 0)
    spur.rotation.z = a - Math.PI / 2
    g.add(spur)
  }
  g.position.set(p.x, 0, p.z)
  g.rotation.y = Math.atan2(tn.x, tn.z)
  g.rotation.x = rand(-0.05, 0.05)
  return g
}

/** Instanced scatter helper: places `count` copies near the track edge. */
function scatterInstanced(scene, track, geo, mat, count, { latMin = 1, latMax = 8, sMin = 0.5, sMax = 1.6, tilt = 0.3, sink = 0 } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  for (let n = 0; n < count; n++) {
    const i = Math.floor(rand(track.N))
    const side = Math.random() > 0.5 ? 1 : -1
    const lat = (TRACK_HALF_W + rand(latMin, latMax)) * side
    const p = track.pos[i], l = track.left[i]
    const sc = rand(sMin, sMax)
    _e.set(rand(-tilt, tilt), rand(TAU), rand(-tilt, tilt))
    _q.setFromEuler(_e)
    _s3.setScalar(sc)
    _v.set(p.x + l.x * lat, sink * sc, p.z + l.z * lat)
    _m4.compose(_v, _q, _s3)
    mesh.setMatrixAt(n, _m4)
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.receiveShadow = true
  scene.add(mesh)
  return mesh
}

function buildEnvironment(scene, track, distToTrack) {
  // dusk over the scorched badlands: dusty haze, low sun, embered horizon
  scene.fog = new THREE.Fog('#5a3a28', 50, 340)
  const sunDir = new THREE.Vector3(-0.5, 0.38, -0.65).normalize()
  scene.add(skyDome({
    top: '#191823', mid: '#422c33', bottom: '#96522c', radius: 520,
    sunDir, sunColor: '#f08a44', sunSize: 320,
  }))
  const stars = starField({ count: 240, radius: 500, size: 1.7 })
  stars.material.opacity = 0.34 // dusk — barely-there stars
  scene.add(stars)
  const clouds = cloudLayer({ count: 10, radius: 330, height: [85, 150], color: '#5c3f34', opacity: 0.22, scale: [100, 190] })
  scene.add(clouds)
  track.tickables.push(clouds)

  // scorched-earth ground: own texture set (repeat mutated → never share cache)
  const groundSet = packedEarthTexture({ dark: '#332416', base: '#4c3a26', light: '#635231', seed: 77 })
  for (const t of Object.values(groundSet)) t.repeat.set(46, 46)
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(460, 64),
    pbrMaterial({ color: '#9a8468', maps: groundSet, roughness: 1, metalness: 0, normalScale: 0.9, envMapIntensity: 0.14 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // lights — one low forge-fire sun, faint warm/cool hemisphere bounce
  scene.add(new THREE.HemisphereLight('#5c4238', '#191009', 0.34))
  const sun = new THREE.DirectionalLight('#ffa25e', 2.35)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 220
  const sc = sun.shadow.camera
  sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42
  sc.updateProjectionMatrix()
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  scene.add(sun, sun.target)
  track.sun = sun
  track.sunDir = sunDir

  // strata mesas ringing the badlands + boulders
  const place = (min, max) => {
    for (let tries = 0; tries < 40; tries++) {
      _v.set(rand(-230, 230), 0, rand(-200, 210))
      const d = distToTrack(_v)
      if (d > min && d < max) return _v.clone()
    }
    return null
  }
  const strataMat = pbrMaterial({ maps: strataMaps(), roughness: 1, metalness: 0, normalScale: 1.3, envMapIntensity: 0.12 })
  const mesaGeos = [mesaGeometry(3), mesaGeometry(11), mesaGeometry(27)]
  for (let i = 0; i < 15; i++) {
    const p = place(20, 215)
    if (!p) continue
    const w = rand(9, 30), h = rand(7, 24)
    const mesa = new THREE.Mesh(mesaGeos[i % 3], strataMat)
    mesa.scale.set(w, h, w)
    mesa.position.set(p.x, h / 2 - 0.3, p.z)
    mesa.rotation.y = rand(TAU)
    mesa.castShadow = distToTrack(p) < 70
    mesa.receiveShadow = true
    scene.add(mesa)
    track.mesas.push({ mesh: mesa, x: p.x, z: p.z, r: w * 1.3 })
  }
  const rockMat = stoneMaterial('#8a6a52')
  rockMat.flatShading = true
  for (let i = 0; i < 20; i++) {
    const p = place(11, 160)
    if (!p) continue
    const b = boulder(rockMat, rand(1.2, 5))
    b.position.x = p.x; b.position.z = p.z
    scene.add(b)
    track.clutter.push({ mesh: b, x: p.x, z: p.z, r: 2.5 })
  }

  // dead trees silhouetted across the wastes
  const treeShared = {
    trunkGeo: new THREE.CylinderGeometry(0.08, 0.2, 1.7, 6),
    branchGeo: new THREE.CylinderGeometry(0.03, 0.08, 1.1, 5),
    wood: woodMaterial('#4c3a2a'),
  }
  for (let i = 0; i < 42; i++) {
    const p = place(9, 170)
    if (!p) continue
    const t = deadTree(treeShared, rand(1.2, 2.6))
    t.position.x = p.x; t.position.z = p.z
    scene.add(t)
    track.clutter.push({ mesh: t, x: p.x, z: p.z, r: 2 })
  }

  // bone — giant rib arches over the road + scattered rib spurs
  const boneMat = boneMaterial('#b3a488')
  for (const idx of [258, 522, 792]) scene.add(boneArch(track, idx, boneMat))
  const ribGeo = new THREE.ConeGeometry(0.16, 2.6, 5)
  for (let i = 0; i < 10; i++) {
    const p = place(10, 120)
    if (!p) continue
    const cluster = new THREE.Group()
    for (let r = 0; r < 3; r++) {
      const rib = new THREE.Mesh(ribGeo, boneMat)
      rib.position.set(rand(-1.2, 1.2), rand(0.7, 1.1), rand(-0.5, 0.5))
      rib.rotation.z = rand(-0.65, 0.65)
      rib.rotation.x = rand(-0.3, 0.3)
      rib.castShadow = true
      cluster.add(rib)
    }
    cluster.position.set(p.x, 0, p.z)
    cluster.rotation.y = rand(TAU)
    scene.add(cluster)
    track.clutter.push({ mesh: cluster, x: p.x, z: p.z, r: 2.5 })
  }

  // ground clutter: pebbles, charred splinters, bone shards (instanced, shared mats)
  const pebbleGeo = new THREE.DodecahedronGeometry(0.09, 0)
  scatterInstanced(scene, track, pebbleGeo, rockMat, 240, { latMin: 0.7, latMax: 9, sMin: 0.5, sMax: 1.9, tilt: 0.6 })
  const splinterGeo = new THREE.BoxGeometry(0.05, 0.05, 0.6)
  scatterInstanced(scene, track, splinterGeo, treeShared.wood, 90, { latMin: 0.6, latMax: 6, sMin: 0.6, sMax: 1.4, tilt: 0.25, sink: 0.02 })
  const shardGeo = new THREE.ConeGeometry(0.06, 0.45, 5)
  scatterInstanced(scene, track, shardGeo, boneMat, 70, { latMin: 1, latMax: 7, sMin: 0.6, sMax: 1.5, tilt: 1.2, sink: 0.05 })

  // standing runestones flanking the road (ember-lit obelisks)
  const runeGlow = emberGlowMaterial(1.35, '#ff8c3b')
  const obeliskGeo = new THREE.CylinderGeometry(0.32, 0.55, 1, 4)
  const runeStripGeo = new THREE.BoxGeometry(0.09, 0.62, 0.04)
  const stonePbr = stoneMaterial('#8a8175')
  const runeStrips = []
  for (let i = 0; i < 9; i++) {
    const idx = Math.floor(rand(track.N))
    const p = track.pos[idx], l = track.left[idx]
    const side = Math.random() > 0.5 ? 1 : -1
    const h = rand(2.2, 4)
    const ob = new THREE.Mesh(obeliskGeo, stonePbr)
    ob.scale.set(1, h, 1)
    ob.position.set(
      p.x + l.x * (TRACK_HALF_W + rand(2.5, 5)) * side, h / 2,
      p.z + l.z * (TRACK_HALF_W + rand(2.5, 5)) * side,
    )
    ob.rotation.y = rand(TAU)
    ob.castShadow = true
    scene.add(ob)
    const strip = new THREE.Mesh(runeStripGeo, runeGlow)
    strip.scale.y = h * 0.55
    strip.position.set(ob.position.x, h * 0.55, ob.position.z)
    strip.rotation.y = ob.rotation.y
    strip.translateZ(0.42)
    scene.add(strip)
    runeStrips.push({ strip, ph: rand(TAU) })
    track.clutter.push({ mesh: ob, x: ob.position.x, z: ob.position.z, r: 1.2 })
    track.clutter.push({ mesh: strip, x: ob.position.x, z: ob.position.z, r: 1.2 })
  }
  let rt = 0
  track.tickables.push({ tick: dt => {
    rt += dt
    for (const { strip, ph } of runeStrips) {
      // material is shared — shimmer via scale only
      const s = 1 + 0.06 * Math.sin(rt * 3 + ph)
      strip.scale.x = s
      strip.scale.z = s
    }
  } })

  // torch-lined track edges — real flames, a few decay-2 firelight pools
  const torchPole = new THREE.CylinderGeometry(0.06, 0.1, 2.3, 6)
  const torchBowl = new THREE.CylinderGeometry(0.19, 0.08, 0.26, 7)
  const torchFlameGeo = new THREE.ConeGeometry(0.19, 0.62, 8)
  const poleWood = woodMaterial('#463527')
  const bowlIron = ironMaterial()
  const torchFlames = []
  for (let k = 0; k < 18; k++) {
    const i = Math.floor((k / 18) * track.N + 46) % track.N
    const p = track.pos[i], l = track.left[i]
    const side = k % 2 ? 1 : -1
    const x = p.x + l.x * (TRACK_HALF_W + 1.5) * side
    const z = p.z + l.z * (TRACK_HALF_W + 1.5) * side
    const pole = new THREE.Mesh(torchPole, poleWood)
    pole.position.set(x, 1.15, z)
    pole.castShadow = true
    const bowl = new THREE.Mesh(torchBowl, bowlIron)
    bowl.position.set(x, 2.36, z)
    const flame = new THREE.Mesh(torchFlameGeo, track.fireMats[k % 3])
    flame.position.set(x, 2.78, z)
    const halo = new THREE.Sprite(glowSpriteMaterial('#ff8c3b', 0.18))
    halo.scale.setScalar(1.5)
    halo.position.set(x, 2.7, z)
    scene.add(pole, bowl, flame, halo)
    const entry = { flame, halo, light: null, ph: rand(TAU) }
    if (k % 3 === 0) { // 6 real firelight pools around the lap
      const light = new THREE.PointLight('#ff8a48', 5.5, 12, 2)
      light.position.set(x, 2.8, z)
      scene.add(light)
      entry.light = light
    }
    torchFlames.push(entry)
  }
  let tt = 0
  track.tickables.push({ tick: dt => {
    tt += dt
    // final-lap flare: torches burn taller and brighter while the ending nears
    track.flare = damp(track.flare, track.flareTarget, 1.6, dt)
    const fl = track.flare
    for (const { flame, halo, light, ph } of torchFlames) {
      const s = 1 + 0.18 * Math.sin(tt * 12 + ph) + 0.09 * Math.sin(tt * 27 + ph * 2)
      flame.scale.set(
        s * (1 + (fl - 1) * 0.35),
        (1 + 0.26 * Math.abs(Math.sin(tt * 8 + ph))) * (1 + (fl - 1) * 0.55),
        s * (1 + (fl - 1) * 0.35),
      )
      halo.material.opacity = (0.15 + 0.06 * Math.sin(tt * 10 + ph)) * fl
      if (light) light.intensity = 5.5 * fl * (0.85 + 0.2 * Math.sin(tt * 14 + ph) + 0.08 * Math.sin(tt * 31 + ph * 2))
    }
  } })

  // trackside war banners — lit cloth, no self-glow
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 4.6, 6)
  const poleMat = woodMaterial('#4c3826')
  const flagGeo = new THREE.PlaneGeometry(1.5, 2.1, 4, 4)
  const flagCols = ['#8e2a2c', '#96683a', '#4a352a']
  for (let k = 0; k < 12; k++) {
    const i = Math.floor((k / 12) * track.N + 20) % track.N
    const p = track.pos[i], l = track.left[i]
    const side = k % 2 ? 1 : -1
    const pole = new THREE.Mesh(poleGeo, poleMat)
    pole.position.set(p.x + l.x * (TRACK_HALF_W + 2.2) * side, 2.3, p.z + l.z * (TRACK_HALF_W + 2.2) * side)
    pole.castShadow = true
    const fmat = new THREE.MeshStandardMaterial({
      map: flagTexture(flagCols[k % 3]), side: THREE.DoubleSide, transparent: true,
      alphaTest: 0.4, roughness: 0.97, metalness: 0,
    })
    const flag = new THREE.Mesh(flagGeo.clone(), fmat)
    flag.position.set(pole.position.x, 3.7, pole.position.z)
    flag.rotation.y = rand(TAU)
    flag.castShadow = true
    scene.add(pole, flag)
    const base = flag.geometry.attributes.position.array.slice()
    let ft = rand(10)
    track.tickables.push({ tick: dt => {
      ft += dt
      const attr = flag.geometry.attributes.position
      for (let vi = 0; vi < attr.count; vi++) {
        const bx = base[vi * 3]
        attr.setZ(vi, Math.sin(ft * 4 + bx * 3) * 0.14 * (bx + 0.75))
      }
      attr.needsUpdate = true
    } })
  }
  // drifting embers on the wind
  const embers = fireflies({ count: 56, area: [250, 230], height: [0.5, 9], color: '#ff8c3b', size: 0.3 })
  scene.add(embers)
  track.tickables.push(embers)
}
