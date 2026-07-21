import * as THREE from 'three'
import {
  canvasTexture, cloudTexture, glowTexture,
  noiseField, normalMapFromHeight, crackedStoneTexture, dirtOverlay,
} from '../../core/assets.js'
import {
  pbrMaterial, stoneMaterial, ironMaterial, bronzeMaterial, boneMaterial,
  fireMaterial, emberGlowMaterial, contactShadow, glowSpriteMaterial,
} from '../../art/materials.js'
import { cloudLayer, fireflies } from '../../art/environment.js'
import { sky } from '../../art/sky.js'
import { horizonLayers } from '../../art/backdrop.js'
import { dragon, dragonFlight } from '../../art/otherworld.js'
import { rand, TAU } from '../../core/utils.js'

/** Collision data — index 0 is the solid main arena, the rest are pass-through. */
export const MAIN = { x: 0, y: 0, halfW: 13, solid: true }
export const PLATFORMS = [
  MAIN,
  { x: -7.5, y: 3.6, halfW: 3.4, solid: false },
  { x: 7.2, y: 6.2, halfW: 3.1, solid: false },
]
export const BLAST = { x: 26, bottom: -14, top: 22 }

// MORTAL ARENA palette — torchlight, stone, iron, bronze, ember. No neon.
const EMBER = '#ff8c3b'
const TORCH_GOLD = '#ffb84d'
const FORGE = '#ff5a26'
const CRIMSON = '#a1252c'

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v)
/** Position-keyed hash so coincident box-face verts displace identically (no cracks). */
const hashv = (x, y, z, s) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 53.13) * 43758.5453
  return v - Math.floor(v)
}

/** Jittered cone with baked flat normals — fracture-surface look. */
function jitterCone(radius, height, seg = 10) {
  let geo = new THREE.ConeGeometry(radius, height, seg, 3)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    if (Math.abs(y - height / 2) < 0.01) continue // keep apex sharp
    p.setX(i, p.getX(i) * rand(0.82, 1.2))
    p.setZ(i, p.getZ(i) * rand(0.82, 1.2))
  }
  geo = geo.toNonIndexed()
  geo.computeVertexNormals()
  return geo
}

/**
 * Box with chipped/hewn edges: every vert on an outer wall is pulled inward by a
 * position-keyed hash (faces stay stitched), top rim dips slightly — no perfect
 * machine edges. Displacement only ever shrinks, so collision stays honest.
 */
function chipBox(w, h, d, { sx = 20, sy = 2, sz = 6, amp = 0.12 } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d, sx, sy, sz)
  const p = geo.attributes.position
  const hw = w / 2, hh = h / 2, hd = d / 2
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const onX = Math.abs(Math.abs(x) - hw) < 1e-4
    const onZ = Math.abs(Math.abs(z) - hd) < 1e-4
    if (!onX && !onZ) continue
    if (onX) p.setX(i, x - Math.sign(x) * hashv(x, y, z, 1) * amp)
    if (onZ) p.setZ(i, z - Math.sign(z) * hashv(x, y, z, 2) * amp)
    if (Math.abs(y - hh) < 1e-4) p.setY(i, y - hashv(x, y, z, 3) * amp * 0.45)
  }
  geo.computeVertexNormals()
  return geo
}

/** Low-poly rubble rock, flat fracture facets. */
function stageRock({ tint = '#b3a996', scale = 1 } = {}) {
  const S = shared()
  let geo = new THREE.IcosahedronGeometry(0.55, 0)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * rand(0.8, 1.25), p.getY(i) * rand(0.6, 1.1), p.getZ(i) * rand(0.8, 1.25))
  }
  geo = geo.toNonIndexed()
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, pbrMaterial({
    color: tint, roughness: 1, metalness: 0, maps: S.slabSet, normalScale: 0.8,
    envMapIntensity: 0.05, flatShading: true,
  }))
  m.scale.setScalar(scale)
  m.position.y = 0.3 * scale
  m.rotation.y = rand(TAU)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ---------- procedural texture work (one-time cost, module cached) ----------

/**
 * Carved war-rune band, square tile (repeats ~11x along the slab face):
 * height field -> deep-relief normal map, recessed sooty albedo, faint ember
 * emissive down in the grooves. Returns { map, normalMap, emissiveMap }.
 */
function runeCarvingSet() {
  const S = 512
  // stroke mask: 2 glyph columns + chiseled border grooves, drawn squashed (tile is ~2.2:1 in world)
  const rc = document.createElement('canvas')
  rc.width = rc.height = S
  const rctx = rc.getContext('2d')
  rctx.fillStyle = '#000'
  rctx.fillRect(0, 0, S, S)
  rctx.strokeStyle = '#fff'
  rctx.lineCap = 'round'
  for (let g = 0; g < 2; g++) {
    const cx = S * (0.27 + g * 0.48)
    rctx.lineWidth = 22
    for (let s = 0; s < 6; s++) {
      rctx.beginPath()
      rctx.moveTo(cx + rand(-64, 64), S * rand(0.2, 0.8))
      rctx.lineTo(cx + rand(-64, 64), S * rand(0.2, 0.8))
      rctx.stroke()
    }
  }
  rctx.lineWidth = 10
  for (const y of [S * 0.09, S * 0.91]) {
    rctx.beginPath()
    rctx.moveTo(0, y)
    rctx.lineTo(S, y)
    rctx.stroke()
  }
  const rd = rctx.getImageData(0, 0, S, S).data
  const runes = new Float32Array(S * S)
  for (let i = 0; i < runes.length; i++) runes[i] = rd[i * 4] / 255

  const grain = noiseField(S, { octaves: 3, scale: 14, seed: 91 })
  const height = new Float32Array(S * S)
  for (let i = 0; i < height.length; i++) height[i] = clamp01(0.55 + (grain[i] - 0.5) * 0.3 - runes[i] * 0.55)
  const normalMap = normalMapFromHeight(height, { strength: 3 })

  const map = canvasTexture(S, S, ctx => {
    const img = ctx.createImageData(S, S), d = img.data
    for (let i = 0; i < height.length; i++) {
      const t = clamp01(0.42 + (grain[i] - 0.5) * 0.5)
      let r = 42 + t * 30, g = 39 + t * 27, b = 34 + t * 22
      const k = runes[i] * 0.85 // groove recess: dark soot in the carving
      r += (16 - r) * k; g += (12 - g) * k; b += (9 - b) * k
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  })
  map.wrapS = map.wrapT = THREE.RepeatWrapping

  const emissiveMap = canvasTexture(S, S, ctx => {
    const img = ctx.createImageData(S, S), d = img.data
    for (let i = 0; i < height.length; i++) {
      const k = Math.max(0, runes[i] - 0.45) * (0.4 + grain[i] * 0.4)
      d[i * 4] = 235 * k; d[i * 4 + 1] = 96 * k; d[i * 4 + 2] = 28 * k; d[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  })
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping
  return { map, normalMap, emissiveMap }
}

/** Horizontal strata stone (pillar shafts): banded height -> normal + tinted map. */
function strataSet() {
  const S = 256
  const bands = noiseField(S, { octaves: 4, scale: 2, scaleY: 14, seed: 143 })
  const fine = noiseField(S, { octaves: 2, scale: 22, seed: 77 })
  const height = new Float32Array(S * S)
  for (let i = 0; i < height.length; i++) height[i] = clamp01(bands[i] * 0.72 + fine[i] * 0.28)
  const map = canvasTexture(S, S, ctx => {
    const img = ctx.createImageData(S, S), d = img.data
    for (let i = 0; i < height.length; i++) {
      const t = height[i]
      d[i * 4] = 74 + t * 52; d[i * 4 + 1] = 68 + t * 47; d[i * 4 + 2] = 58 + t * 40; d[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  })
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  return { map, normalMap: normalMapFromHeight(height, { strength: 2.4 }) }
}

/**
 * Cooled magma: near-black crust plates over an emissive crack network.
 * Bright pixels stay thin so only the hottest veins catch bloom.
 */
function lavaTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    // molten base — hot but mostly to be buried under crust
    ctx.fillStyle = '#993c12'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 20; i++) {
      const x = rand(0, w), y = rand(0, h), r = rand(20, 70)
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, 'rgba(255, 176, 84, 0.95)')
      grad.addColorStop(1, 'rgba(255, 176, 84, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
    // heavy basalt crust — gaps between plates read as glowing veins
    for (let i = 0; i < 430; i++) {
      const x = rand(0, w), y = rand(0, h), r = rand(14, 52)
      const n = 5 + Math.floor(rand(0, 4))
      const g = Math.round(rand(8, 18))
      ctx.fillStyle = `rgb(${g + 4}, ${g - 2}, ${Math.max(2, g - 6)})`
      ctx.beginPath()
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2
        const rr = r * rand(0.68, 1.12)
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
      }
      ctx.fill()
    }
  })
}

/** Ragged crimson war banner — muted pigment, soot hem, bone sigil. */
function bannerTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#451316'
    ctx.fillRect(0, 0, w, h)
    // cloth shading: dim top light, heavy grime toward the hem
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(150, 96, 60, 0.12)')
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.12)')
    grad.addColorStop(1, 'rgba(10, 6, 4, 0.7)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    // weave streaks
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${rand(0, 1) < 0.5 ? '20, 10, 8' : '120, 70, 50'}, ${rand(0.04, 0.1)})`
      ctx.fillRect(rand(0, w), 0, rand(1, 3), h)
    }
    // mud spatter low
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(36, 26, 16, ${rand(0.25, 0.5)})`
      ctx.beginPath()
      ctx.arc(rand(0, w), h - rand(0, h * 0.3), rand(1.5, 4.5), 0, TAU)
      ctx.fill()
    }
    // bone sigil: crossed axes glyph, faded pigment
    ctx.strokeStyle = 'rgba(178, 164, 138, 0.6)'
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(w * 0.28, h * 0.3); ctx.lineTo(w * 0.72, h * 0.62)
    ctx.moveTo(w * 0.72, h * 0.3); ctx.lineTo(w * 0.28, h * 0.62)
    ctx.moveTo(w * 0.5, h * 0.25); ctx.lineTo(w * 0.5, h * 0.7)
    ctx.stroke()
    // ragged bottom edge
    ctx.globalCompositeOperation = 'destination-out'
    for (let x = 0; x < w; x += 10) {
      ctx.beginPath()
      ctx.moveTo(x, h)
      ctx.lineTo(x + 5, h - rand(8, 34))
      ctx.lineTo(x + 10, h)
      ctx.fill()
    }
  })
}

/** Fake contact-AO overlay for the slab top: edge darkening, soot, worn path. */
function slabAOTexture() {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    // edge vignette
    for (const [x0, y0, x1, y1, len] of [
      [0, 0, 1, 0, 0.1], [1, 0, -1, 0, 0.1], [0, 0, 0, 1, 0.2], [0, 1, 0, -1, 0.2],
    ]) {
      const g = ctx.createLinearGradient(x0 * w, y0 * h, (x0 + x1 * len) * w, (y0 + y1 * len) * h)
      g.addColorStop(0, 'rgba(8, 5, 3, 0.55)')
      g.addColorStop(1, 'rgba(8, 5, 3, 0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }
    // soot / grime blotches
    for (let i = 0; i < 46; i++) {
      const x = rand(0, w), y = rand(0, h), r = rand(10, 46)
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(12, 8, 5, ${rand(0.1, 0.28)})`)
      g.addColorStop(1, 'rgba(12, 8, 5, 0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
    // scorch rings under the two braziers (world x ±11.4, back half)
    for (const u of [0.062, 0.938]) {
      const x = u * w, y = h * 0.17, r = 34
      const g = ctx.createRadialGradient(x, y, 4, x, y, r)
      g.addColorStop(0, 'rgba(6, 3, 2, 0.6)')
      g.addColorStop(0.6, 'rgba(14, 7, 4, 0.3)')
      g.addColorStop(1, 'rgba(14, 7, 4, 0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
  })
}

// ---------- shared geometry / materials for repeated props ----------
const SHARED = {}
function shared() {
  if (SHARED.ready) return SHARED
  SHARED.ready = true
  // own cracked-stone set (NOT the module-cached preset set — we dirty this one)
  SHARED.slabSet = crackedStoneTexture({
    size: 512, seed: 87, dark: '#3b352d', base: '#5d574c', light: '#7a7160', mortar: '#221d17',
  })
  dirtOverlay(SHARED.slabSet.map, { amount: 0.5, edge: 0, speckle: 0.7, seed: 19 })
  SHARED.strata = strataSet()
  // presets share the module texture cache; env intensities are retuned per
  // material because the PMREM room env is far too hot for a torchlit night
  SHARED.stoneMat = stoneMaterial()
  SHARED.stoneMat.envMapIntensity = 0.06
  SHARED.stoneDarkMat = stoneMaterial('#8f867a')
  SHARED.stoneDarkMat.envMapIntensity = 0.05
  SHARED.ironMat = ironMaterial('#565a63')
  SHARED.ironMat.envMapIntensity = 0.35
  SHARED.bronzeMat = bronzeMaterial()
  SHARED.bronzeMat.envMapIntensity = 0.4
  SHARED.silhouetteMat = new THREE.MeshBasicMaterial({ color: '#140d11' }) // fog does the aerial fade
  SHARED.linkGeo = new THREE.TorusGeometry(0.16, 0.045, 6, 10)
  SHARED.flameGeo = new THREE.PlaneGeometry(0.62, 1.5)
  SHARED.flameGeo.translate(0, 0.75, 0) // v=0 at flame base
  SHARED.fireMats = [
    fireMaterial({ intensity: 1.55, speed: 1.35 }),
    fireMaterial({ intensity: 1.55, speed: 1.7, midColor: '#ff9a3e' }),
    fireMaterial({ intensity: 0.85, speed: 1.1, coreColor: '#ffd489' }), // distant, calmer
  ]
  return SHARED
}

/** Clone a texture set with its own repeat (images shared, transforms not). */
function cloneSet(set, rx, ry) {
  const out = {}
  for (const k of ['map', 'normalMap', 'roughnessMap']) {
    if (!set[k]) continue
    out[k] = set[k].clone()
    out[k].repeat.set(rx, ry)
  }
  return out
}

const _m4 = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

/** Hanging iron chain — alternating torus links, one instanced draw call. */
function chain(len, scale = 1) {
  const S = shared()
  const n = Math.max(2, Math.round(len / (0.26 * scale)))
  const inst = new THREE.InstancedMesh(S.linkGeo, S.ironMat, n)
  _s.setScalar(scale)
  for (let i = 0; i < n; i++) {
    _e.set(i % 2 ? 0.12 : -0.08, i % 2 ? Math.PI / 2 : 0, 0)
    _q.setFromEuler(_e)
    _p.set(0, -i * 0.26 * scale, 0)
    _m4.compose(_p, _q, _s)
    inst.setMatrixAt(i, _m4)
  }
  inst.instanceMatrix.needsUpdate = true
  return inst
}

/**
 * Real fire: two crossed flame-shader planes (hot core where they overlap)
 * + one faint warm halo sprite. `far` picks the calmer distant material.
 */
function flame({ size = 1, far = false } = {}) {
  const S = shared()
  const g = new THREE.Group()
  const mat = far ? S.fireMats[2] : S.fireMats[Math.floor(rand(0, 2))]
  const a = new THREE.Mesh(S.flameGeo, mat)
  const b = new THREE.Mesh(S.flameGeo, mat)
  b.rotation.y = Math.PI / 2
  const halo = new THREE.Sprite(glowSpriteMaterial('#ff9448', far ? 0.05 : 0.11))
  halo.scale.set(1.1, 1.5, 1)
  halo.position.y = 0.6
  g.add(a, b, halo)
  g.scale.setScalar(size)
  let t = rand(10)
  g.tick = dt => {
    t += dt
    const f = 0.86 + 0.14 * Math.sin(t * 8.3) * Math.sin(t * 5.1 + 1.7)
    g.scale.set(size * (0.92 + 0.1 * f), size * f, size * (0.92 + 0.1 * f))
    halo.material.opacity = (far ? 0.04 : 0.08) + 0.05 * f
  }
  return g
}

/** Bronze brazier bowl on a stone base, real fire + decay-2 torchlight. */
function brazier(tickables, { light = false } = {}) {
  const S = shared()
  const g = new THREE.Group()
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.44, 0.5, 10), S.stoneDarkMat)
  base.position.y = 0.25
  base.castShadow = true
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 8), S.ironMat)
  stem.position.y = 0.85
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.24, 0.34, 12), S.bronzeMat)
  bowl.position.y = 1.3
  bowl.castShadow = true
  const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 10), emberGlowMaterial(1.25, FORGE))
  coals.position.y = 1.45
  const f = flame({ size: 1.35 })
  f.position.y = 1.55
  const blob = contactShadow(0.72, 0.42)
  g.add(base, stem, bowl, coals, f, blob)
  tickables.push(f)
  if (light) {
    const pl = new THREE.PointLight(TORCH_GOLD, 22, 18, 2)
    pl.position.y = 2
    g.add(pl)
    let t = rand(10)
    tickables.push({ tick: dt => { t += dt; pl.intensity = 20 + 5 * Math.sin(t * 8.7) * Math.sin(t * 5.1) } })
  }
  return g
}

/** Ragged war banner on an iron pole; cloth sways. */
function warBanner(tickables, { h = 3.4 } = {}) {
  const S = shared()
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, h, 6), S.ironMat)
  pole.position.y = h / 2
  pole.castShadow = true
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), S.ironMat)
  arm.rotation.z = Math.PI / 2
  arm.position.set(0.5, h - 0.15, 0)
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), S.bronzeMat)
  finial.position.y = h + 0.15
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 2.1, 1, 6),
    new THREE.MeshStandardMaterial({
      map: bannerTexture(), roughness: 0.98, metalness: 0,
      side: THREE.DoubleSide, transparent: true, envMapIntensity: 0.05,
    }),
  )
  cloth.position.set(0.55, h - 1.25, 0)
  cloth.castShadow = true
  const blob = contactShadow(0.34, 0.4)
  g.add(pole, arm, finial, cloth, blob)
  let t = rand(10)
  tickables.push({ tick: dt => {
    t += dt
    cloth.rotation.y = Math.sin(t * 1.3) * 0.16
    cloth.rotation.x = Math.sin(t * 1.9 + 1) * 0.05
  } })
  return g
}

/** Instanced ground clutter on the slab top: pebbles + bone shards. */
function slabClutter(g) {
  const S = shared()
  const pebGeo = new THREE.IcosahedronGeometry(0.05, 0)
  const pebbles = new THREE.InstancedMesh(pebGeo, S.stoneDarkMat, 46)
  for (let i = 0; i < 46; i++) {
    let z = rand(-3, 3)
    if (Math.abs(z) < 0.9) z += Math.sign(z || 1) * 1.4
    const s = rand(0.5, 1.7)
    _q.setFromEuler(_e.set(rand(TAU), rand(TAU), rand(TAU)))
    _m4.compose(_p.set(rand(-12.6, 12.6), 0.02 * s, z), _q, _s.setScalar(s))
    pebbles.setMatrixAt(i, _m4)
  }
  pebbles.instanceMatrix.needsUpdate = true
  pebbles.receiveShadow = true
  const shardGeo = new THREE.BoxGeometry(0.34, 0.045, 0.07)
  const shardMat = boneMaterial('#b6aa90')
  shardMat.envMapIntensity = 0.1
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, 12)
  for (let i = 0; i < 12; i++) {
    const x = rand(0, 1) < 0.5 ? rand(-12.5, -6) : rand(6, 12.5)
    _q.setFromEuler(_e.set(0, rand(TAU), rand(-0.1, 0.1)))
    _m4.compose(_p.set(x, 0.025, rand(-2.9, 2.9)), _q, _s.setScalar(rand(0.7, 1.5)))
    shards.setMatrixAt(i, _m4)
  }
  shards.instanceMatrix.needsUpdate = true
  shards.receiveShadow = true
  g.add(pebbles, shards)
}

/** The main dueling platform: carved stone slab with deep-relief runes. */
function mainArena(tickables) {
  const S = shared()
  const g = new THREE.Group()

  const topSet = cloneSet(S.slabSet, 2.6, 0.8)
  const topMat = pbrMaterial({ color: '#a89f90', roughness: 1, maps: topSet, normalScale: 1.1, envMapIntensity: 0.07 })
  const sideSet = cloneSet(S.slabSet, 2.2, 0.5)
  const sideMat = pbrMaterial({ color: '#6f675c', roughness: 1, maps: sideSet, normalScale: 1.2, envMapIntensity: 0.05 })
  const bottomMat = pbrMaterial({ color: '#4f463c', roughness: 1, maps: cloneSet(S.slabSet, 2, 0.6), envMapIntensity: 0.03 })
  // front face: normal-mapped rune carvings, ember heat down in the grooves
  const rs = runeCarvingSet()
  rs.map.repeat.set(11, 1)
  rs.normalMap.repeat.set(11, 1)
  rs.emissiveMap.repeat.set(11, 1)
  const runeMat = new THREE.MeshStandardMaterial({
    map: rs.map, normalMap: rs.normalMap, emissiveMap: rs.emissiveMap,
    emissive: '#ff7a30', emissiveIntensity: 0.5, roughness: 0.98, metalness: 0,
  })
  runeMat.normalScale.setScalar(1.6)
  runeMat.envMapIntensity = 0.04
  let runeT = 0
  tickables.push({ tick: dt => {
    runeT += dt
    runeMat.emissiveIntensity = 0.34 + 0.16 * Math.sin(runeT * 1.7) * Math.sin(runeT * 0.9 + 2)
  } })

  const slab = new THREE.Mesh(
    chipBox(26, 1.1, 6.6, { sx: 26, sy: 2, sz: 7, amp: 0.14 }),
    [sideMat, sideMat, topMat, bottomMat, runeMat, sideMat],
  )
  slab.position.y = -0.55
  slab.castShadow = true
  slab.receiveShadow = true
  g.add(slab)

  // painted contact-AO on the walking surface (edge darkening, soot, scorch)
  const ao = new THREE.Mesh(
    new THREE.PlaneGeometry(25.9, 6.5),
    new THREE.MeshBasicMaterial({ map: slabAOTexture(), transparent: true, depthWrite: false }),
  )
  ao.rotation.x = -Math.PI / 2
  ao.position.y = 0.012
  g.add(ao)
  slabClutter(g)

  // rocky basalt underside tapering into the chasm — fracture facets
  const under = new THREE.Mesh(
    jitterCone(8.6, 8.6, 11),
    pbrMaterial({ color: '#2f2922', roughness: 1, maps: cloneSet(S.slabSet, 2, 2), envMapIntensity: 0.02, flatShading: true }),
  )
  under.rotation.x = Math.PI
  under.position.y = -5.15
  under.castShadow = true
  g.add(under)

  // worn bronze inlay strip along the top front edge — catches torchlight, no glow
  const trim = new THREE.Mesh(new THREE.BoxGeometry(25.6, 0.05, 0.07), S.bronzeMat)
  trim.position.set(0, -0.03, 3.24)
  g.add(trim)

  // faint magma under-glow licking the underside
  const halo = new THREE.Sprite(glowSpriteMaterial(FORGE, 0.09))
  halo.scale.set(26, 13, 1)
  halo.position.y = -4
  g.add(halo)

  // iron chains anchored to the slab flanks, trailing into the chasm
  for (const [x, len, sway] of [[-13.2, 6, 0.1], [13.2, 7.5, -0.12], [-10.8, 4.5, 0.07]]) {
    const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.24), S.ironMat)
    anchor.position.set(x, -0.6, 2.6)
    const ch = chain(len, 0.9)
    ch.position.set(x, -0.9, 2.6)
    ch.rotation.z = sway
    g.add(anchor, ch)
    let t = rand(10)
    tickables.push({ tick: dt => { t += dt; ch.rotation.z = sway + Math.sin(t * 0.7) * 0.05 } })
  }

  // top decoration (kept behind the fight plane)
  const b1 = brazier(tickables, { light: true })
  b1.position.set(-11.4, 0, -2.2)
  const b2 = brazier(tickables, { light: true })
  b2.position.set(11.4, 0, -2.2)
  g.add(b1, b2)
  const w1 = warBanner(tickables)
  w1.position.set(-12.6, 0, -2.8)
  const w2 = warBanner(tickables, { h: 3 })
  w2.position.set(12.7, 0, -2.9)
  g.add(w1, w2)
  const r1 = stageRock({ tint: '#bcb2a0', scale: 0.9 })
  r1.position.set(-9.3, 0, -2.5)
  const r2 = stageRock({ tint: '#a2988a', scale: 0.6 })
  r2.position.set(9, 0, -2.6)
  const rb1 = contactShadow(0.62, 0.42)
  rb1.position.set(-9.3, 0.018, -2.5)
  const rb2 = contactShadow(0.44, 0.4)
  rb2.position.set(9, 0.018, -2.6)
  g.add(r1, r2, rb1, rb2)
  // fallen column drum + broken stub, old-temple wreckage
  const drumMat = pbrMaterial({ color: '#8f8577', roughness: 1, maps: cloneSet(S.strata, 1.6, 1), normalScale: 1.2, envMapIntensity: 0.05 })
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 12), drumMat)
  drum.rotation.z = Math.PI / 2
  drum.rotation.y = 0.4
  drum.position.set(6.4, 0.55, -2.5)
  drum.castShadow = true
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 1.1, 12), drumMat)
  stub.position.set(-6.8, 0.55, -2.6)
  stub.castShadow = true
  const db = contactShadow(1, 0.5)
  db.position.set(6.4, 0.018, -2.5)
  const sb = contactShadow(0.85, 0.5)
  sb.position.set(-6.8, 0.018, -2.6)
  g.add(drum, stub, db, sb)
  return g
}

/** Pass-through side platform: a broken pillar capital hung on chains. */
function brokenPillar(p, tickables) {
  const S = shared()
  const g = new THREE.Group()
  g.position.set(p.x, p.y, 0)
  const topMat = pbrMaterial({ color: '#aca293', roughness: 1, maps: cloneSet(S.slabSet, 1.2, 0.5), normalScale: 1.1, envMapIntensity: 0.06 })
  const sideMat = pbrMaterial({ color: '#8a8172', roughness: 1, maps: cloneSet(S.slabSet, 1.1, 0.3), normalScale: 1.2, envMapIntensity: 0.05 })
  const slab = new THREE.Mesh(
    chipBox(p.halfW * 2, 0.42, 2.8, { sx: 10, sy: 1, sz: 4, amp: 0.1 }),
    [sideMat, sideMat, topMat, sideMat, sideMat, sideMat],
  )
  slab.position.y = -0.21
  slab.castShadow = true
  slab.receiveShadow = true
  g.add(slab)

  // strata column stub, snapped off jagged below — fracture cone
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(p.halfW * 0.34, p.halfW * 0.4, 1.1, 12),
    pbrMaterial({ color: '#6b6255', roughness: 1, maps: cloneSet(S.strata, 2, 1.2), normalScale: 1.3, envMapIntensity: 0.05 }),
  )
  shaft.position.y = -0.95
  shaft.castShadow = true
  const jag = new THREE.Mesh(
    jitterCone(p.halfW * 0.42, 1.4, 8),
    pbrMaterial({ color: '#38312a', roughness: 1, maps: cloneSet(S.slabSet, 1, 1), envMapIntensity: 0.02, flatShading: true }),
  )
  jag.rotation.x = Math.PI
  jag.position.y = -2
  jag.castShadow = true
  g.add(shaft, jag)

  // worn bronze banding on the front edge
  const band = new THREE.Mesh(new THREE.BoxGeometry(p.halfW * 2 - 0.2, 0.06, 0.06), S.bronzeMat)
  band.position.set(0, -0.4, 1.32)
  g.add(band)

  // suspension chains rising out of frame — the arena's shackled ruins
  for (const s of [-1, 1]) {
    const ch = chain(16, 0.8)
    ch.position.set(s * (p.halfW - 0.5), 16, 0)
    ch.rotation.z = -s * 0.05
    g.add(ch)
  }

  // barely-there heat shimmer from the chasm below
  const halo = new THREE.Sprite(glowSpriteMaterial(FORGE, 0.06))
  halo.scale.set(p.halfW * 2.4, 3.4, 1)
  halo.position.y = -1.2
  g.add(halo)
  let tt = rand(10)
  tickables.push({ tick: dt => { tt += dt; halo.material.opacity = 0.05 + 0.025 * Math.sin(tt * 1.8) } })
  return g
}

/** Chained colossus statue — a kneeling stone warlord, shackled to its pedestal. */
function chainedStatue({ x, z, s = 1, flip = 1 }, tickables) {
  const S = shared()
  const g = new THREE.Group()
  const mat = pbrMaterial({ color: '#4c4438', roughness: 1, maps: cloneSet(S.slabSet, 1.4, 1.4), normalScale: 1, envMapIntensity: 0.03 })
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.4, 3, 8), pbrMaterial({
    color: '#3f3830', roughness: 1, maps: cloneSet(S.strata, 3, 1), normalScale: 1.2, envMapIntensity: 0.03,
  }))
  pedestal.position.y = 1.5
  g.add(pedestal)
  // kneeling body
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.5, 3.2, 8), mat)
  torso.position.set(0, 4.4, 0)
  torso.rotation.x = 0.22
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 1.05), mat)
  head.position.set(0, 6.35, 0.4)
  head.rotation.x = 0.35 // head bowed
  const pauldronL = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), mat)
  pauldronL.position.set(-1.4, 5.4, 0.1)
  const pauldronR = pauldronL.clone()
  pauldronR.position.x = 1.4
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.6, 7), mat)
  armL.position.set(-1.7, 4, 0.7)
  armL.rotation.x = 0.9
  const armR = armL.clone()
  armR.position.x = 1.7
  const knee = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 1.6), mat)
  knee.position.set(0.9 * flip, 3.3, 1.3)
  g.add(torso, head, pauldronL, pauldronR, armL, armR, knee)
  // shackle chains wrist -> pedestal
  for (const sx of [-1, 1]) {
    const ch = chain(2.6, 1.4)
    ch.position.set(sx * 1.7, 3, 1.5)
    ch.rotation.z = sx * 0.5
    g.add(ch)
  }
  // ember eyes smoldering under the brow
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.06), emberGlowMaterial(1.4, FORGE))
    eye.position.set(sx * 0.26, 6.3, 0.95)
    eye.rotation.x = 0.35
    g.add(eye)
  }
  // votive fire at the statue's knees, lighting the stone from below
  const f = flame({ size: 2.1, far: true })
  f.position.set(0, 3.6, 2.6)
  g.add(f)
  tickables.push(f)
  g.position.set(x, -9, z)
  g.scale.setScalar(s)
  g.rotation.y = flip * 0.35
  return g
}

/** Distant ruined colonnade / temple silhouettes — aerial-perspective layers. */
function ruinBackdrop(tickables) {
  const S = shared()
  const g = new THREE.Group()
  // mid layer: lit PBR stone, partially fogged
  const colMat = pbrMaterial({ color: '#4a4238', roughness: 1, maps: cloneSet(S.strata, 1, 3), normalScale: 1, envMapIntensity: 0.02 })
  // far layer: pure silhouette, the fog paints the aerial fade
  const farMat = S.silhouetteMat
  const colGeo = new THREE.CylinderGeometry(1.3, 1.55, 1, 9)
  const capGeo = new THREE.BoxGeometry(3.6, 1, 3.6)

  // mid-ground broken colonnade with torch flames — instanced, 2 draw calls
  const cols = [
    [-34, 15, -34, true], [-24, 22, -38, false], [-15, 12, -33, true],
    [15, 19, -36, false], [25, 11, -33, true], [35, 24, -40, false], [45, 14, -36, true],
  ]
  const colInst = new THREE.InstancedMesh(colGeo, colMat, cols.length)
  const capInst = new THREE.InstancedMesh(capGeo, colMat, cols.length)
  cols.forEach(([x, h, z, torch], i) => {
    _q.setFromEuler(_e.set(0, 0, 0))
    _m4.compose(_p.set(x, h / 2 - 12, z), _q, _s.set(1.5, h, 1.5))
    colInst.setMatrixAt(i, _m4)
    _q.setFromEuler(_e.set(0, rand(-0.1, 0.1), 0))
    _m4.compose(_p.set(x, h - 11.6, z), _q, _s.set(1, 1, 1))
    capInst.setMatrixAt(i, _m4)
    if (torch) {
      const f = flame({ size: 1.7, far: true })
      f.position.set(x, h - 10.2, z)
      g.add(f)
      tickables.push(f)
    }
  })
  colInst.instanceMatrix.needsUpdate = true
  capInst.instanceMatrix.needsUpdate = true
  g.add(colInst, capInst)
  // architrave beams bridging two pairs — the ruined arcade line
  for (const [x1, x2, y, z] of [[-34, -24, 8.5, -36], [25, 35, 10.5, -36.5]]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x2 - x1) + 3, 1.4, 2.6), colMat)
    beam.position.set((x1 + x2) / 2, y, z)
    beam.rotation.z = rand(-0.03, 0.03)
    g.add(beam)
  }

  // great ruined gate, dead center back
  const gate = new THREE.Group()
  for (const s of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 34, 7), farMat)
    tower.position.set(s * 12, 5, 0)
    gate.add(tower)
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(32, 5, 6), farMat)
  lintel.position.y = 19.5
  const crown = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 6), farMat)
  crown.position.set(-6, 24, 0)
  crown.rotation.z = 0.08
  gate.add(lintel, crown)
  // two watch-fires smoldering on the gate towers
  for (const s of [-1, 1]) {
    const f = flame({ size: 3.1, far: true })
    f.position.set(s * 12, 24.5, 0)
    gate.add(f)
    tickables.push(f)
  }
  gate.position.set(4, -8, -150)
  gate.scale.setScalar(1.35)
  g.add(gate)

  // farthest broken towers, pure silhouette
  for (const [x, h, z, w] of [[-70, 40, -150, 12], [-45, 26, -135, 9], [62, 48, -160, 14], [88, 30, -130, 10], [-100, 34, -140, 11]]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), farMat)
    t.position.set(x, h / 2 - 16, z)
    t.rotation.y = rand(TAU)
    g.add(t)
  }
  return g
}

/** Rising ember updraft particles out of the chasm — kept subtle. */
function emberUpdraft({ count = 110, area = [64, 30], bottom = -24, top = 15, size = 0.3, color = EMBER } = {}) {
  const pos = new Float32Array(count * 3)
  const spd = new Float32Array(count)
  const phase = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos.set([rand(-area[0] / 2, area[0] / 2), rand(bottom, top), rand(-area[1] / 2, area[1] * 0.2)], i * 3)
    spd[i] = rand(1.4, 4)
    phase[i] = rand(TAU)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    map: glowTexture(), color, size, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const pts = new THREE.Points(geo, mat)
  let t = 0
  pts.tick = dt => {
    t += dt
    const p = pts.geometry.attributes.position
    for (let i = 0; i < count; i++) {
      let y = p.getY(i) + spd[i] * dt
      if (y > top) y = bottom + rand(0, 3)
      p.setY(i, y)
      p.setX(i, p.getX(i) + Math.sin(t * 1.3 + phase[i]) * dt * 0.8)
    }
    p.needsUpdate = true
    mat.opacity = 0.48 + 0.1 * Math.sin(t * 3.1)
  }
  return pts
}

/** Blood-red moon disc — dim, hazed, veiled by the smoke sky. */
function bloodMoon() {
  const g = new THREE.Group()
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.5)
    grad.addColorStop(0, '#b34a3a')
    grad.addColorStop(0.75, '#822622')
    grad.addColorStop(1, '#5c1a1a')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, w * 0.5 - 2, 0, Math.PI * 2)
    ctx.fill()
    // craters
    ctx.fillStyle = 'rgba(64, 16, 16, 0.45)'
    for (let i = 0; i < 14; i++) {
      const a = rand(TAU), r = rand(0, w * 0.36)
      ctx.beginPath()
      ctx.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, rand(4, 16), 0, Math.PI * 2)
      ctx.fill()
    }
    // horizon-haze bite across the lower limb
    const hz = ctx.createLinearGradient(0, h * 0.55, 0, h)
    hz.addColorStop(0, 'rgba(26, 16, 20, 0)')
    hz.addColorStop(1, 'rgba(26, 16, 20, 0.85)')
    ctx.fillStyle = hz
    ctx.fillRect(0, 0, w, h)
  })
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(15, 40),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }),
  )
  const halo = new THREE.Sprite(glowSpriteMaterial(CRIMSON, 0.18))
  halo.scale.set(70, 70, 1)
  g.add(halo, disc)
  g.position.set(58, 92, -300)
  g.lookAt(0, 4, 0)
  return g
}

/** Build the whole torchlit arena-over-the-chasm stage. Returns { tickables }. */
export function buildStage(scene) {
  const tickables = []
  scene.fog = new THREE.Fog('#1a1013', 46, 330)

  scene.add(sky({
    top: '#0d0a15', mid: '#221520', bottom: '#372023', radius: 460,
    haze: '#401e22', hazeAmt: 0.26,
    sunDir: new THREE.Vector3(0.42, 0.6, -0.68), sunColor: '#6e1f1e', sunSize: 26, sunBoost: 1.3,
    stars: 0.55,
    clouds: { color: '#2a1620', shade: '#120c14', amount: 0.45, scale: 1.1, speed: 0.8 },
  }))
  scene.add(bloodMoon())
  // jagged ranges crowding the chasm horizon, ember vents on the nearer crest
  const chasm = horizonLayers({
    kind: 'peaks', count: 2, radius: [190, 300], height: [42, 64],
    colors: ['#1e1216', '#2b1a20'], seeds: [29, 97],
    firesOn: 0, fireColor: '#ff5a26', y: -26.5,
  })
  scene.add(chasm)
  tickables.push(chasm)
  // a drake riding the chasm winds behind the arena, breathing fire at the moon
  const drake = dragonFlight(dragon({ scale: 3, fireBreath: true, breathPeriod: 19, seed: 11 }), {
    center: [0, 0, -55], radius: 50, height: 30, speed: 0.07, bob: 5, seed: 0.53,
  })
  scene.add(drake.group)
  tickables.push(drake)

  // ---------- the lava chasm ----------
  // fog-aware basalt floor to the horizon, with a molten seam under the arena
  const basaltFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 600),
    new THREE.MeshStandardMaterial({ color: '#120806', roughness: 1, metalness: 0 }),
  )
  basaltFloor.rotation.x = -Math.PI / 2
  basaltFloor.position.y = -26.5
  scene.add(basaltFloor)
  const lavaTex = lavaTexture()
  lavaTex.repeat.set(3, 1.4)
  const lava = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 62),
    new THREE.MeshBasicMaterial({ map: lavaTex }),
  )
  lava.rotation.x = -Math.PI / 2
  lava.position.set(0, -26, -30) // molten river kept back in the chasm; foreground stays dark
  scene.add(lava)
  let lavaT = 0
  tickables.push({ tick: dt => {
    lavaT += dt
    lavaTex.offset.x += dt * 0.0035 // crust slowly drifting
    lava.material.color.setScalar(0.68 + 0.12 * Math.sin(lavaT * 1.3)) // molten breathing, kept buried
  } })
  // molten heart directly beneath the arena
  const heart = new THREE.Sprite(glowSpriteMaterial(FORGE, 0.1))
  heart.scale.set(36, 12, 1)
  heart.position.set(0, -24, -10)
  scene.add(heart)

  // rolling smoke band that veils the lava/floor seam
  const smokeTex = cloudTexture()
  const band = new THREE.Group()
  const bandData = []
  for (const [x, y, z, s, o] of [
    [-58, -18, -34, 70, 0.75], [-20, -19, -30, 84, 0.8], [22, -18, -32, 78, 0.75],
    [60, -19, -36, 72, 0.7],
    [0, -16, -52, 100, 0.7], [-46, -15, -56, 92, 0.6], [48, -15, -58, 96, 0.6],
  ]) {
    const mat = new THREE.SpriteMaterial({ map: smokeTex, color: '#1c100d', transparent: true, opacity: o, depthWrite: false })
    const sp = new THREE.Sprite(mat)
    sp.position.set(x, y, z)
    sp.scale.set(s, s * 0.32, 1)
    band.add(sp)
    bandData.push({ sp, x, speed: rand(0.15, 0.4), amp: rand(5, 11), phase: rand(TAU) })
  }
  scene.add(band)
  let bandT = 0
  tickables.push({ tick: dt => {
    bandT += dt
    for (const b of bandData) b.sp.position.x = b.x + Math.sin(bandT * b.speed + b.phase) * b.amp
  } })

  // smoke rolling over the lava + high haze
  const smokeLow = cloudLayer({ count: 15, radius: 150, height: [-24, -13], opacity: 0.45, scale: [45, 100], color: '#3a2015' })
  const hazeFar = cloudLayer({ count: 9, radius: 300, height: [22, 70], opacity: 0.12, scale: [80, 150], color: '#2c161c' })
  scene.add(smokeLow, hazeFar)
  tickables.push(smokeLow, hazeFar)

  // hand-placed smoke plumes drifting under the arena, visible in frame
  const puffTex = cloudTexture()
  const puffs = new THREE.Group()
  const puffData = []
  for (const [x, y, z, s] of [[-20, -11, -14, 38], [12, -15, -10, 48], [30, -10, -20, 34], [-34, -17, -8, 44], [2, -19, -16, 56], [-9, -8.5, 5, 24], [16, -12, 6, 28]]) {
    const mat = new THREE.SpriteMaterial({ map: puffTex, color: '#463228', transparent: true, opacity: rand(0.3, 0.45), depthWrite: false })
    const sp = new THREE.Sprite(mat)
    sp.position.set(x, y, z)
    sp.scale.set(s, s * 0.4, 1)
    puffs.add(sp)
    puffData.push({ sp, x, speed: rand(0.25, 0.6), amp: rand(4, 9), phase: rand(TAU) })
  }
  scene.add(puffs)
  let puffT = 0
  tickables.push({ tick: dt => {
    puffT += dt
    for (const p of puffData) p.sp.position.x = p.x + Math.sin(puffT * p.speed * 0.2 + p.phase) * p.amp
  } })

  // ---------- lights ----------
  // Warm firelight key (the arena's watch-fires) vs cool blood-moon rim from
  // behind; low bounced fill; blacks stay black.
  scene.add(new THREE.HemisphereLight('#241b2c', '#2e130b', 0.5))
  const key = new THREE.DirectionalLight('#ffc389', 1.55)
  key.position.set(-15, 25, 19)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -19, right: 19, top: 26, bottom: -14, near: 4, far: 90 })
  key.shadow.camera.updateProjectionMatrix()
  key.shadow.bias = -0.00035
  key.shadow.normalBias = 0.02
  scene.add(key, key.target)
  const moonRim = new THREE.DirectionalLight('#8c2b26', 1.15)
  moonRim.position.set(36, 50, -70)
  scene.add(moonRim, moonRim.target)

  // magma up-light rimming the underside of the arena — real falloff
  const lavaLight = new THREE.PointLight(FORGE, 15, 36, 2)
  lavaLight.position.set(0, -9, 3)
  scene.add(lavaLight)
  let lt = 0
  tickables.push({ tick: dt => { lt += dt; lavaLight.intensity = 13 + 4 * Math.sin(lt * 2.3) * Math.sin(lt * 1.1 + 2) } })

  // ---------- stage ----------
  scene.add(mainArena(tickables))
  for (let i = 1; i < PLATFORMS.length; i++) scene.add(brokenPillar(PLATFORMS[i], tickables))

  // ---------- backdrop: temple ruins + chained colossi ----------
  scene.add(ruinBackdrop(tickables))
  scene.add(chainedStatue({ x: -42, z: -54, s: 2.1, flip: 1 }, tickables))
  scene.add(chainedStatue({ x: 44, z: -60, s: 2.4, flip: -1 }, tickables))

  // ---------- atmosphere particles ----------
  const updraft = emberUpdraft({})
  const updraftNear = emberUpdraft({ count: 30, area: [30, 8], bottom: -12, top: 8, size: 0.24, color: '#ffb27a' })
  scene.add(updraft, updraftNear)
  tickables.push(updraft, updraftNear)
  const sparks = fireflies({ count: 26, area: [36, 12], height: [0.5, 9], color: '#ff9a3b', size: 0.3 })
  const ash = fireflies({ count: 40, area: [80, 34], height: [-6, 16], color: '#5c5248', size: 0.2 })
  scene.add(sparks, ash)
  tickables.push(sparks, ash)

  return { tickables }
}
