import * as THREE from 'three'
import { glowTexture } from '../core/assets.js'
import { TAU } from '../core/utils.js'

/**
 * Distant background silhouette rings — the "background work" layer.
 * A ridge ring is a single unlit triangle-strip band (one draw call, a few
 * hundred verts) placed far outside the playfield. Rings IGNORE scene fog
 * (most scenes fog out well before backdrop distance) — aerial perspective
 * is hand-graded matte-painting style: pick colors between the playfield
 * darkness and the sky's horizon color, farther rings paler.
 *
 * Kinds: 'peaks' (mountain ranges), 'spires' (volcanic strata needles),
 * 'pines' (conifer treeline), 'citadel' (ruined battlement skyline).
 */

function lcg(seed) {
  let a = (seed | 0) || 1
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) | 0
    return (a >>> 0) / 4294967296
  }
}

/** Height profiles h(t01) ∈ 0..1 — deterministic per seed. */
function makeProfile(kind, seed, segments) {
  const rand = lcg(seed)
  if (kind === 'peaks') {
    const waves = []
    for (let k = 0; k < 4; k++) waves.push({ f: 2 + Math.floor(rand() * 8), a: 0.42 / (k + 1), p: rand() * TAU })
    return t => {
      let h = 0.22
      for (const w of waves) h += w.a * (0.5 + 0.5 * Math.sin(t * TAU * w.f + w.p))
      return Math.min(1, h)
    }
  }
  if (kind === 'spires') {
    const base = []
    for (let k = 0; k < 2; k++) base.push({ f: 3 + Math.floor(rand() * 5), a: 0.12, p: rand() * TAU })
    const spikes = []
    const n = 8 + Math.floor(rand() * 8)
    for (let s = 0; s < n; s++) spikes.push({ c: rand(), w: 0.004 + rand() * 0.012, h: 0.45 + rand() * 0.55 })
    return t => {
      let h = 0.1
      for (const w of base) h += w.a * (0.5 + 0.5 * Math.sin(t * TAU * w.f + w.p))
      for (const s of spikes) {
        let d = Math.abs(t - s.c); d = Math.min(d, 1 - d) // wrap distance
        h += s.h * Math.exp(-(d * d) / (2 * s.w * s.w))
      }
      return Math.min(1, h)
    }
  }
  if (kind === 'pines') {
    const swell = { f: 2 + Math.floor(rand() * 4), p: rand() * TAU }
    const jag = 18 + Math.floor(rand() * 14) // tree points per revolution
    return t => {
      const tri = Math.abs(((t * jag) % 1) - 0.5) * 2 // 0..1 triangle
      const canopy = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * TAU * swell.f + swell.p))
      return canopy * (0.45 + 0.55 * tri)
    }
  }
  // citadel: quantized battlement blocks, crenellation notches, rare tall towers
  const blocks = 26 + Math.floor(rand() * 16)
  const heights = []
  const bRand = lcg(seed * 31 + 7)
  for (let b = 0; b < blocks; b++) {
    const tower = bRand() < 0.16
    heights.push({ h: tower ? 0.75 + bRand() * 0.25 : 0.28 + bRand() * 0.32, tower })
  }
  return t => {
    const bi = Math.min(blocks - 1, Math.floor(t * blocks))
    const b = heights[bi]
    const inBlock = (t * blocks) % 1
    if (!b.tower && inBlock > 0.28 && inBlock < 0.44) return b.h * 0.72 // merlon gap
    return b.h
  }
}

/**
 * Ring (or arc) of silhouette geometry.
 * opts: { kind, radius, height, skirt (depth below y=0), color, seed,
 *         arc, angle (start), y (base height), segments }
 * Returns a Mesh; mesh.userData.profile(t01) samples the height fraction.
 */
export function ridgeRing({
  kind = 'peaks', radius = 320, height = 46, skirt = 10, color = '#17121a',
  seed = 7, arc = TAU, angle = 0, y = 0, segments = 240,
} = {}) {
  const profile = makeProfile(kind, seed, segments)
  const pos = new Float32Array((segments + 1) * 2 * 3)
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const a = angle + arc * t
    const x = Math.cos(a) * radius
    const z = Math.sin(a) * radius
    const h = y + profile(t) * height
    pos.set([x, y - skirt, z], i * 6)
    pos.set([x, h, z], i * 6 + 3)
  }
  const idx = []
  for (let i = 0; i < segments; i++) {
    const b0 = i * 2, t0 = i * 2 + 1, b1 = i * 2 + 2, t1 = i * 2 + 3
    idx.push(b0, b1, t0, t0, b1, t1)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, fog: false, side: THREE.DoubleSide,
  }))
  mesh.frustumCulled = false
  mesh.userData.profile = profile
  mesh.userData.ringParams = { radius, height, y, skirt, arc, angle }
  return mesh
}

/**
 * Ember watch-fires sprinkled along a ridge ring's crest — tiny warm
 * additive points that read as distant campfires/beacons. Returns Points
 * with .tick(dt) for a slow collective breathing pulse.
 * opts: { ring, count, color, size, yMin, yMax, seed }
 */
export function watchFires({ ring, count = 26, color = '#ff9a4d', size = 3.4, yMin = 0.3, yMax = 0.85, seed = 3 } = {}) {
  const rand = lcg(seed)
  const { radius, height, y: baseY, arc, angle } = ring.userData.ringParams
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const t = rand()
    const a = angle + t * arc
    const r = radius * (0.985 + rand() * 0.02)
    const h = baseY + ring.userData.profile(t) * height * (yMin + rand() * (yMax - yMin))
    pos.set([Math.cos(a) * r, h, Math.sin(a) * r], i * 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    map: glowTexture(), color, size, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  })
  const pts = new THREE.Points(geo, mat)
  let t = rand(TAU)
  pts.tick = dt => { t += dt; mat.opacity = 0.55 + 0.3 * Math.sin(t * 1.7) + 0.08 * Math.sin(t * 5.3) }
  return pts
}

/** Convenience: a layered horizon — N rings with fog-depth falloff + optional fires. */
export function horizonLayers({
  kind = 'peaks', count = 2, radius = [300, 420], height = [52, 68], colors = ['#241820', '#2e1f28'],
  seeds = null, skirt = 12, firesOn = 0, fireColor = '#ff9a4d', y = 0,
} = {}) {
  const group = new THREE.Group()
  const ticks = []
  for (let i = 0; i < count; i++) {
    const ring = ridgeRing({
      kind, radius: radius[i], height: height[i], color: colors[i % colors.length],
      seed: seeds?.[i] ?? (11 + i * 17), skirt, y,
    })
    group.add(ring)
    if (i === firesOn) {
      const fires = watchFires({ ring, color: fireColor })
      group.add(fires)
      ticks.push(fires.tick)
    }
  }
  group.tick = dt => { for (const tk of ticks) tk(dt) }
  return group
}
