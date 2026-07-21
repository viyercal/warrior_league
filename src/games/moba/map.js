import * as THREE from 'three'
import { fireflies } from '../../art/environment.js'
import { sky } from '../../art/sky.js'
import { horizonLayers, ridgeRing } from '../../art/backdrop.js'
import {
  canvasTexture, glowTexture, noiseField, normalMapFromHeight, dirtOverlay,
  crackedStoneTexture, woodPlankTexture, packedEarthTexture, fabricGrainTexture,
} from '../../core/assets.js'
import {
  pbrMaterial, ironMaterial, leatherMaterial, boneMaterial, clothMaterial,
  fireMaterial, emberGlowMaterial, contactShadow, waterMaterial,
} from '../../art/materials.js'
import { rand, TAU, clamp } from '../../core/utils.js'
import { NEXUS_X, TOWER_XS, TOWER_Z, RIVER_ANGLE, TEAMS } from './constants.js'

/* ============================================================
 * WAR RIFT — realism pass. A war-torn battlefield lane at
 * storm-dusk: packed-earth lane with wheel ruts, dead-patched
 * grass field, cracked-stone watchtowers with wooden hoardings,
 * real nexus fires, dark reflective river, contact-grounded props.
 * All PBR (shared texture sets), one warm key light, FogExp2 haze.
 * ============================================================ */

// banner cloth: deep dyed fabric per team (pigment, not glow)
const CLOTH = { blue: '#26425c', red: '#5e181c' }

// team flame ramps — BOTH blackbody firelight (contract: no cyan/neon).
// West burns pale torch-gold, east deep forge-orange; team identity lives in
// cloth/banners/healthbars, not flame hue.
const FLAME = {
  red: { edge: '#7a1a08', mid: '#ff8c2e', core: '#ffe9bd', halo: '#ff9440', spark: '#ffa050' },
  blue: { edge: '#6e3a10', mid: '#ffb84d', core: '#fff3d6', halo: '#ffc06a', spark: '#ffd08a' },
}

/** Bake flat facet normals for hewn-stone silhouettes. */
function facet(geo) {
  const g = geo.toNonIndexed()
  g.computeVertexNormals()
  return g
}

// ============================== shared PBR materials ==============================
// Private texture sets (NOT the module-cached preset sets — we dirty ours).

let M = null
function mats() {
  if (M) return M
  const stoneSet = crackedStoneTexture()
  dirtOverlay(stoneSet.map, { amount: 0.5, edge: 0, speckle: 0.55, seed: 9 })
  const woodSet = woodPlankTexture()
  dirtOverlay(woodSet.map, { amount: 0.45, edge: 0, speckle: 0.45, color: '#1c1208', seed: 17 })
  const earthSet = packedEarthTexture()
  const barkSet = fabricGrainTexture({ scale: 26, contrast: 0.3, lum: 0.8 })

  M = {
    stoneSet, woodSet, earthSet,
    STONE: pbrMaterial({ color: '#b5aea0', maps: stoneSet, roughness: 1, metalness: 0, normalScale: 1.1, envMapIntensity: 0.28 }),
    STONE_DK: pbrMaterial({ color: '#7b7266', maps: stoneSet, roughness: 1, metalness: 0, normalScale: 1.2, envMapIntensity: 0.22 }),
    WOOD: pbrMaterial({ color: '#a89a88', maps: woodSet, roughness: 0.92, metalness: 0, normalScale: 1, envMapIntensity: 0.22 }),
    WOOD_DK: pbrMaterial({ color: '#6e6255', maps: woodSet, roughness: 0.95, metalness: 0, normalScale: 1, envMapIntensity: 0.18 }),
    IRON: ironMaterial('#4e5158'),
    LEATHER: leatherMaterial('#4a352a'),
    LEATHER_DK: leatherMaterial('#382a20'),
    BONE: boneMaterial(),
    BARK: pbrMaterial({ color: '#3a2e22', maps: barkSet, roughness: 1, metalness: 0, normalScale: 1.2, envMapIntensity: 0.15 }),
    PINE_A: pbrMaterial({ color: '#2a3626', maps: barkSet, roughness: 1, metalness: 0, normalScale: 0.7, envMapIntensity: 0.12 }),
    PINE_B: pbrMaterial({ color: '#222d1f', maps: barkSet, roughness: 1, metalness: 0, normalScale: 0.7, envMapIntensity: 0.12 }),
    CLOTH_BLUE: clothMaterial(CLOTH.blue),
    CLOTH_RED: clothMaterial(CLOTH.red),
    // aged bronze trim — template; towers clone it (flash tint pokes color)
    bronzeTrim: () => pbrMaterial({
      color: '#6b4a26', roughness: 0.6, metalness: 1,
      maps: { map: null, normalMap: stoneSet.normalMap, roughnessMap: null }, normalScale: 0.3, envMapIntensity: 0.5,
    }),
  }
  return M
}

const cloth = team => (team === 'blue' ? mats().CLOTH_BLUE : mats().CLOTH_RED)

// ============================== ground textures ==============================

const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const mixRGB = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

/** Trampled grass field with dead patches + scorch — {map, normalMap, roughnessMap}, tileable. */
function grassFieldTexture() {
  const size = 512
  const coarse = noiseField(size, { octaves: 4, scale: 5, seed: 61 })
  const fine = noiseField(size, { octaves: 3, scale: 34, seed: 87 })
  const patch = noiseField(size, { octaves: 3, scale: 3, seed: 43 })
  const DARK = hexRGB('#20260f'), BASE = hexRGB('#37391c'), LIGHT = hexRGB('#4a4722')
  const DEAD = hexRGB('#5c4c2e'), SCORCH = hexRGB('#2a2318')
  const map = canvasTexture(size, size, (ctx, w, h) => {
    const img = ctx.createImageData(w, h), d = img.data
    for (let i = 0; i < w * h; i++) {
      const t = clamp(coarse[i] * 0.55 + fine[i] * 0.45, 0, 1)
      let c = t < 0.5 ? mixRGB(DARK, BASE, t * 2) : mixRGB(BASE, LIGHT, (t - 0.5) * 2)
      const p = patch[i]
      if (p < 0.48) c = mixRGB(c, DEAD, Math.min(1, (0.48 - p) * 2.4) * (0.6 + fine[i] * 0.5)) // dried-out patches
      if (p > 0.7) c = mixRGB(c, SCORCH, Math.min(1, (p - 0.7) * 2.6)) // scorched ground
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    // trampled blade strokes
    for (let i = 0; i < 1400; i++) {
      const x = rand(size), y = rand(size)
      ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(122,116,66,0.14)' : 'rgba(20,18,10,0.18)'
      ctx.lineWidth = rand(0.8, 1.8)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + rand(-3, 3), y - rand(2, 6))
      ctx.stroke()
    }
  })
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  dirtOverlay(map, { amount: 0.32, edge: 0, speckle: 0.35, seed: 5 })
  const height = new Float32Array(size * size)
  for (let i = 0; i < height.length; i++) height[i] = clamp(coarse[i] * 0.35 + fine[i] * 0.65 - (patch[i] < 0.44 ? 0.12 : 0), 0, 1)
  const normalMap = normalMapFromHeight(height, { strength: 1.5 })
  const roughnessMap = canvasTexture(size / 2, size / 2, (ctx, w, h) => {
    const img = ctx.createImageData(w, h), d = img.data
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = Math.round(255 * clamp(0.95 + (fine[(y * 2) * size + x * 2] - 0.5) * 0.1, 0, 1))
        const i = (y * w + x) * 4
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  })
  roughnessMap.colorSpace = THREE.NoColorSpace
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping
  return { map, normalMap, roughnessMap }
}

/** Packed-earth lane albedo: tiled earth set + painted wheel ruts, boot scars, mud spatter, alpha edges. */
function laneAlbedo(earthSet) {
  const w = 1024, h = 256
  const tex = canvasTexture(w, h, ctx => {
    const src = earthSet.map.image
    for (let i = 0; i < 4; i++) ctx.drawImage(src, i * 256, 0, 256, 256)
    // churn blotches
    for (let i = 0; i < 240; i++) {
      const x = rand(w), y = rand(h * 0.1, h * 0.9), r = rand(6, 24)
      const dark = Math.random() < 0.58
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, dark ? 'rgba(30,20,12,0.38)' : 'rgba(112,90,60,0.26)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
    }
    // wheel ruts: dark groove + displaced-earth highlight ridge (two ages of tracks)
    const rut = (off, alpha, lw) => {
      for (const s of [-1, 1]) {
        ctx.strokeStyle = `rgba(20,13,8,${alpha})`
        ctx.lineWidth = lw
        ctx.beginPath()
        for (let x = 0; x <= w; x += 24) {
          const y = h / 2 + s * off + Math.sin(x * 0.019 + off) * 7 + Math.sin(x * 0.041) * 3
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.strokeStyle = `rgba(138,110,74,${alpha * 0.55})`
        ctx.lineWidth = lw * 0.55
        ctx.beginPath()
        for (let x = 0; x <= w; x += 24) {
          const y = h / 2 + s * off + Math.sin(x * 0.019 + off) * 7 + Math.sin(x * 0.041) * 3 + lw * 0.75
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }
    rut(22, 0.5, 8)
    rut(50, 0.24, 6)
    // boot scars
    ctx.fillStyle = 'rgba(18,12,8,0.3)'
    for (let i = 0; i < 150; i++) {
      const x = rand(w), y = rand(h * 0.15, h * 0.85)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rand(TAU))
      ctx.fillRect(-3, -1.4, 6, 2.8)
      ctx.restore()
    }
    // soft alpha edges so packed earth blends into the field
    ctx.globalCompositeOperation = 'destination-out'
    for (const [y0, y1] of [[0, h * 0.2], [h, h * 0.8]]) {
      const g = ctx.createLinearGradient(0, y0, 0, y1)
      g.addColorStop(0, 'rgba(0,0,0,1)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0))
    }
    // mud spatter thrown past the lane edge (drawn after the mask, keeps its own alpha)
    ctx.globalCompositeOperation = 'source-over'
    for (let i = 0; i < 130; i++) {
      const nearTop = Math.random() < 0.5
      const y = nearTop ? rand(2, h * 0.24) : rand(h * 0.76, h - 2)
      const x = rand(w), r = rand(1.5, 6)
      ctx.fillStyle = `rgba(38,26,16,${rand(0.25, 0.6)})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
    }
  })
  return tex
}

/** Muted painted team-stain decal (pigment ground into the dirt, not glow). */
function tintDecal(color, radius) {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.16, depthWrite: false }),
  )
  m.rotation.x = -Math.PI / 2
  return m
}

/** Dark mud/AO skirt hugging a structure's foot (grounding + splash grime). */
let _skirtTex = null
function mudSkirt(radius, height = 0.85) {
  _skirtTex ??= canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, 'rgba(16,11,7,0)')
    g.addColorStop(0.55, 'rgba(16,11,7,0.28)')
    g.addColorStop(1, 'rgba(14,10,6,0.62)')
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 40; i++) { // splash flecks climbing the wall
      ctx.fillStyle = `rgba(20,14,9,${rand(0.2, 0.5)})`
      ctx.beginPath()
      ctx.arc(rand(w), rand(h * 0.2, h), rand(1, 3), 0, TAU)
      ctx.fill()
    }
  })
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.04, height, 12, 1, true),
    new THREE.MeshBasicMaterial({ map: _skirtTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  )
  m.position.y = height / 2
  m.renderOrder = 2
  return m
}

// ============================== fire ==============================

// Per-buildMap cache (NOT module-lifetime): scene teardown disposes materials,
// which untracks them from the kit's animation ticker — reuse would freeze flames.
let FIRE_MATS = {}
function fireMat(team) {
  const F = FLAME[team] || FLAME.red
  if (!FIRE_MATS[team]) {
    const fm = fireMaterial({
      intensity: team === 'blue' ? 0.72 : 0.95, // blue witchfire burns dimmer
      speed: 1.6, edgeColor: F.edge, midColor: F.mid, coreColor: F.core,
    })
    fm.side = THREE.FrontSide // stop back-face additive doubling — keeps the core hot, not blown white
    FIRE_MATS[team] = fm
  }
  return FIRE_MATS[team]
}

function haloSprite(color, opacity) {
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
}

/**
 * Real layered flame: two fire-shader cones + warm halo sprite.
 * Returns { group, flick } — push flick into the shared flicker ticker.
 */
function flame(team, scale = 1) {
  const F = FLAME[team] || FLAME.red
  const group = new THREE.Group()
  const fm = fireMat(team)
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.82, 8, 3, true), fm)
  outer.position.y = 0.34
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.5, 8, 2, true), fm)
  inner.position.y = 0.22
  inner.rotation.y = 1.2
  const halo = haloSprite(F.halo, 0.1)
  halo.scale.setScalar(0.92)
  halo.position.y = 0.34
  group.add(outer, inner, halo)
  group.scale.setScalar(scale)
  return { group, flick: { outer, inner, halo, phase: rand(TAU), baseOp: 0.1 } }
}

/** One tickable animating every flame in the scene (cheap flicker). */
function flameTicker(flicks) {
  let t = rand(10)
  return {
    tick: dt => {
      t += dt
      for (const f of flicks) {
        const k = 0.84 + 0.16 * Math.sin(t * 11 + f.phase) * Math.sin(t * 5.3 + f.phase * 2)
        f.outer.scale.set(1, k, 1)
        f.inner.scale.set(1, 0.72 + 0.28 * k, 1)
        f.halo.material.opacity = f.baseOp * (0.7 + 0.4 * k)
      }
    },
  }
}

/** Rising ember sparks — Points cycling upward with sway. Call .tick(dt). */
function emberSparks({ count = 22, radius = 0.55, height = 3.4, color = '#ffa050', size = 0.17 } = {}) {
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    seed[i * 3] = rand(TAU)               // phase
    seed[i * 3 + 1] = rand(0.7, 1.6)      // speed
    seed[i * 3 + 2] = rand(0.2, 1)        // radial
    pos[i * 3 + 1] = rand(height)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    map: glowTexture(), color: new THREE.Color(color).multiplyScalar(1.25), size,
    transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const pts = new THREE.Points(geo, mat)
  let t = rand(20)
  pts.tick = dt => {
    t += dt
    const p = pts.geometry.attributes.position
    for (let i = 0; i < count; i++) {
      const ph = seed[i * 3], sp = seed[i * 3 + 1], rr = seed[i * 3 + 2]
      const y = ((t * sp + ph) % 1.6) / 1.6 * height
      const spread = radius * rr * (0.4 + y / height)
      p.setXYZ(i, Math.sin(t * 1.7 + ph * 7) * spread, y, Math.cos(t * 1.3 + ph * 5) * spread)
    }
    p.needsUpdate = true
  }
  return pts
}

/**
 * The war-fire that replaces the old nexus crystal: iron cauldron, ember coals,
 * layered flame cones, spark column, drifting smoke. Group has .tick(dt).
 */
function nexusFlame(team) {
  const F = FLAME[team] || FLAME.red
  const { IRON } = mats()
  const group = new THREE.Group()
  const fm = fireMat(team)

  const bowl = new THREE.Mesh(facet(new THREE.CylinderGeometry(1.05, 0.7, 0.62, 10)), IRON)
  bowl.position.y = 0.3
  bowl.castShadow = true
  const coals = new THREE.Mesh(
    new THREE.CylinderGeometry(0.88, 0.88, 0.1, 10),
    emberGlowMaterial(1.4, F.mid),
  )
  coals.position.y = 0.62
  group.add(bowl, coals)

  const fOuter = new THREE.Mesh(new THREE.ConeGeometry(0.68, 3.9, 10, 4, true), fm)
  fOuter.position.y = 2.55
  const fMid = new THREE.Mesh(new THREE.ConeGeometry(0.46, 2.8, 8, 3, true), fm)
  fMid.position.y = 2
  fMid.rotation.y = 1.1
  const fInner = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.9, 8, 2, true), fm)
  fInner.position.y = 1.6
  fInner.rotation.y = 2.3
  group.add(fOuter, fMid, fInner)

  const sparks = emberSparks({ count: 26, radius: 0.7, height: 4.6, color: F.spark })
  sparks.position.y = 0.6
  group.add(sparks)

  const halo = haloSprite(F.halo, 0.16)
  halo.scale.setScalar(3)
  halo.position.y = 2.2
  group.add(halo)

  // smoke-tinted drift above the fire
  const smoke = []
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: '#171310', transparent: true, opacity: 0.26, depthWrite: false,
    }))
    s.scale.setScalar(1.6)
    smoke.push({ s, ph: rand(1) })
    group.add(s)
  }

  let t = rand(10)
  group.tick = dt => {
    if (!group.visible) return
    t += dt
    sparks.tick(dt)
    const k = 0.9 + 0.1 * Math.sin(t * 9.2) * Math.sin(t * 4.1)
    fOuter.scale.set(1, k, 1)
    fMid.scale.set(1, 0.85 + 0.15 * k, 1)
    halo.material.opacity = 0.16 + 0.1 * k
    for (const sm of smoke) {
      const y = ((t * 0.35 + sm.ph) % 1)
      sm.s.position.set(Math.sin(t * 0.8 + sm.ph * 9) * 0.5, 3.2 + y * 3.4, Math.cos(t * 0.6 + sm.ph * 7) * 0.5)
      sm.s.material.opacity = 0.26 * (1 - y) * (0.4 + 0.6 * Math.min(1, y * 4))
      sm.s.scale.setScalar(1.2 + y * 2.4)
    }
  }
  return group
}

/** Wooden torch post with an iron cup and live flame. */
function torchPost(flicks, team = 'red') {
  const { WOOD, IRON } = mats()
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.5, 6), WOOD)
  pole.position.y = 1.25
  pole.rotation.z = rand(-0.05, 0.05)
  pole.castShadow = true
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.12, 0.24, 7), IRON)
  cup.position.y = 2.58
  const f = flame(team, 1)
  f.group.position.y = 2.68
  flicks.push(f.flick)
  g.add(pole, cup, f.group, contactShadow(0.42, 0.34))
  return g
}

// ============================== battlefield props ==============================

/** Cone with a ruffled, irregular silhouette (wind-worn pine tiers). */
function ruffledCone(r, h, seg = 8, amt = 0.2) {
  const seed = rand(100)
  let geo = new THREE.ConeGeometry(r, h, seg, 2)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    if (y > h * 0.49) continue // keep the tip sharp
    const a = Math.atan2(z, x)
    const k = 1 + amt * Math.sin(a * 3.1 + seed + y * 2.7) * (0.55 + 0.45 * Math.sin(seed * 2 + a * 5.3))
    p.setXYZ(i, x * k, y + Math.sin(a * 2.3 + seed) * 0.05 * h, z * k)
  }
  geo = geo.toNonIndexed()
  geo.computeVertexNormals()
  return geo
}

/** Storm-bent pine: bark trunk, ruffled irregular tiers, slight lean. */
function pine() {
  const { BARK, PINE_A, PINE_B } = mats()
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 1.3, 7), BARK)
  trunk.position.y = 0.6
  trunk.rotation.z = rand(-0.06, 0.06)
  trunk.castShadow = true
  g.add(trunk)
  const tiers = [[1.35, 1.1, 1.45], [2.25, 0.82, 1.15], [3.05, 0.55, 0.95]]
  for (const [y, r, h] of tiers) {
    const c = new THREE.Mesh(ruffledCone(r, h, 8, rand(0.16, 0.3)), Math.random() < 0.5 ? PINE_A : PINE_B)
    c.position.set(rand(-0.07, 0.07), y, rand(-0.07, 0.07))
    c.rotation.y = rand(TAU)
    c.castShadow = true
    g.add(c)
  }
  return g
}

/** Dead oak: bare trunk with clawed branches — a burnt battlefield silhouette. */
function deadOak() {
  const { BARK } = mats()
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, 2, 6), BARK)
  trunk.position.y = 1
  trunk.rotation.z = rand(-0.08, 0.08)
  trunk.castShadow = true
  g.add(trunk)
  const nb = 3 + Math.floor(rand(3))
  for (let i = 0; i < nb; i++) {
    const len = rand(0.9, 1.7)
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.085, len, 5), BARK)
    const a = (i / nb) * TAU + rand(0.6)
    b.position.set(Math.cos(a) * 0.16, rand(1.5, 2), Math.sin(a) * 0.16)
    b.rotation.set(Math.sin(a) * rand(0.6, 1.1), 0, Math.cos(a) * rand(0.6, 1.1))
    b.translateY(len / 2)
    b.castShadow = true
    g.add(b)
    if (Math.random() < 0.7) {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, len * 0.55, 4), BARK)
      tw.position.copy(b.position)
      tw.rotation.set(b.rotation.x + rand(-0.7, 0.7), rand(TAU), b.rotation.z + rand(-0.7, 0.7))
      tw.translateY(len * 0.28)
      g.add(tw)
    }
  }
  return g
}

/** Low-poly rock with baked facet normals. */
function flatRock(scale, dark = false) {
  const { STONE, STONE_DK } = mats()
  let geo = new THREE.IcosahedronGeometry(0.55, 0)
  const p = geo.attributes.position
  const seed = rand(100)
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + 0.5 * Math.abs(Math.sin(p.getX(i) * 12.9 + p.getY(i) * 7.1 + p.getZ(i) * 3.7 + seed))
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k)
  }
  geo = geo.toNonIndexed()
  geo.computeVertexNormals()
  const g = new THREE.Group()
  const m = new THREE.Mesh(geo, dark ? STONE_DK : STONE)
  m.scale.setScalar(scale)
  m.position.y = 0.26 * scale
  m.rotation.y = rand(TAU)
  m.castShadow = true
  g.add(m, contactShadow(0.62 * scale, 0.38))
  return g
}

/** Sharpened wooden palisade segment (a few leaning stakes lashed together). */
function palisade(count = 6) {
  const { WOOD, WOOD_DK } = mats()
  const g = new THREE.Group()
  for (let i = 0; i < count; i++) {
    const h = rand(1.5, 2.1)
    const stake = new THREE.Group()
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, h, 6), Math.random() < 0.5 ? WOOD : WOOD_DK)
    shaft.position.y = h / 2
    shaft.castShadow = true
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 6), WOOD_DK)
    tip.position.y = h + 0.14
    tip.castShadow = true
    stake.add(shaft, tip)
    stake.position.x = (i - count / 2) * 0.42 + rand(-0.06, 0.06)
    stake.rotation.z = rand(-0.1, 0.1)
    stake.rotation.x = rand(-0.16, 0.05)
    g.add(stake)
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(count * 0.42, 0.09, 0.09), WOOD_DK)
  beam.position.y = 1.1
  beam.rotation.z = rand(-0.04, 0.04)
  g.add(beam)
  const blob = contactShadow(1, 0.36)
  blob.scale.set(count * 0.26, 0.7, 1)
  g.add(blob)
  return g
}

/** War tent: leather pyramid + pole, with a small pennant. */
function tent(team) {
  const { LEATHER, LEATHER_DK, WOOD_DK } = mats()
  const g = new THREE.Group()
  const canvas = new THREE.Mesh(facet(new THREE.ConeGeometry(1.5, 1.7, 5)), Math.random() < 0.5 ? LEATHER : LEATHER_DK)
  canvas.position.y = 0.85
  canvas.rotation.y = rand(TAU)
  canvas.castShadow = true
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 5), WOOD_DK)
  pole.position.y = 2
  const pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.3), cloth(team))
  pennant.position.set(0.28, 2.28, 0)
  g.add(canvas, pole, pennant, contactShadow(1.75, 0.42))
  g.userData.pennant = pennant
  return g
}

/** Tall war banner: wooden pole, crossbar, hanging dyed cloth. */
function warBanner(team, cloths) {
  const { WOOD, WOOD_DK, BONE } = mats()
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 3.6, 6), WOOD)
  pole.position.y = 1.8
  pole.castShadow = true
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.08), WOOD_DK)
  bar.position.y = 3.42
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.7), cloth(team))
  banner.position.set(0, 2.52, 0)
  banner.userData.phase = rand(TAU)
  banner.castShadow = true
  cloths.push(banner)
  const skullish = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), BONE)
  skullish.position.y = 3.68
  g.add(pole, bar, banner, skullish, contactShadow(0.4, 0.34))
  return g
}

/** Rune monolith: hewn standing stone with a faint ember rune-strip. */
function runeStone(team, h = 2.2) {
  const F = FLAME[team] || FLAME.red
  const { STONE_DK } = mats()
  const g = new THREE.Group()
  const stone = new THREE.Mesh(facet(new THREE.BoxGeometry(0.72, h, 0.5)), STONE_DK)
  stone.position.y = h / 2
  stone.rotation.set(rand(-0.06, 0.06), rand(TAU), rand(-0.08, 0.08))
  stone.castShadow = true
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.1, h * 0.52), emberGlowMaterial(team === 'blue' ? 0.72 : 0.95, F.mid))
  rune.position.set(0, h * 0.52, 0.26)
  stone.add(rune)
  const rune2 = rune.clone()
  rune2.position.z = -0.26
  rune2.rotation.y = Math.PI
  stone.add(rune2)
  g.add(stone, contactShadow(0.66, 0.4))
  return g
}

/** Cluster of river reeds with cattail heads. */
function reedClump() {
  const { LEATHER_DK, PINE_A } = mats()
  const g = new THREE.Group()
  const n = 4 + Math.floor(rand(4))
  for (let i = 0; i < n; i++) {
    const h = rand(0.7, 1.35)
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, h, 4), PINE_A)
    blade.position.set(rand(-0.22, 0.22), h / 2, rand(-0.22, 0.22))
    blade.rotation.set(rand(-0.18, 0.18), 0, rand(-0.18, 0.18))
    g.add(blade)
    if (Math.random() < 0.45) {
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 5), LEATHER_DK)
      tail.position.copy(blade.position)
      tail.position.y = h + 0.08
      tail.rotation.copy(blade.rotation)
      g.add(tail)
    }
  }
  return g
}

/** Instanced ground clutter: pebbles, wood splinters, bone shards. */
function scatterClutter(scene) {
  const { BONE } = mats()
  const tmp = new THREE.Object3D()
  const place = (inst, i, x, z, s, y = 0.02) => {
    tmp.position.set(x, y, z)
    tmp.rotation.set(rand(TAU), rand(TAU), rand(TAU))
    tmp.scale.setScalar(s)
    tmp.updateMatrix()
    inst.setMatrixAt(i, tmp.matrix)
  }

  // pebbles along lane edges + riverbanks + scattered field
  const pebbleGeo = new THREE.IcosahedronGeometry(0.09, 0)
  const pebbleMat = pbrMaterial({ color: '#867e6e', roughness: 1, metalness: 0, flatShading: true, envMapIntensity: 0.2 })
  const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, 150)
  const col = new THREE.Color()
  for (let i = 0; i < 150; i++) {
    const kind = Math.random()
    let x, z
    if (kind < 0.55) { x = rand(-48, 48); z = (Math.random() < 0.5 ? -1 : 1) * rand(3.8, 6.6) }
    else if (kind < 0.8) {
      const u = (Math.random() < 0.5 ? -1 : 1) * rand(4.4, 6.6), v = rand(-26, 26)
      x = u * Math.cos(RIVER_ANGLE) + v * Math.sin(RIVER_ANGLE)
      z = -u * Math.sin(RIVER_ANGLE) + v * Math.cos(RIVER_ANGLE)
    } else { x = rand(-50, 50); z = rand(-20, 20) }
    place(pebbles, i, x, z, rand(0.5, 1.7))
    pebbles.setColorAt(i, col.setHSL(0.09, rand(0.04, 0.12), rand(0.32, 0.5)))
  }
  pebbles.receiveShadow = true
  scene.add(pebbles)

  // splinters near lane + palisades
  const splinterGeo = new THREE.BoxGeometry(0.36, 0.045, 0.055)
  const splinterMat = pbrMaterial({ color: '#5c452c', roughness: 1, metalness: 0, envMapIntensity: 0.15 })
  const splinters = new THREE.InstancedMesh(splinterGeo, splinterMat, 50)
  for (let i = 0; i < 50; i++) {
    place(splinters, i, rand(-46, 46), (Math.random() < 0.5 ? -1 : 1) * rand(2.5, 8), rand(0.6, 1.6), 0.03)
  }
  splinters.receiveShadow = true
  scene.add(splinters)

  // bone shards
  const boneGeo = new THREE.TetrahedronGeometry(0.13)
  const bones = new THREE.InstancedMesh(boneGeo, BONE, 22)
  for (let i = 0; i < 22; i++) {
    place(bones, i, rand(-46, 46), (Math.random() < 0.5 ? -1 : 1) * rand(3, 18), rand(0.6, 1.4), 0.04)
  }
  bones.receiveShadow = true
  scene.add(bones)
}

// ============================== bases + towers ==============================

function buildBase(scene, tickables, flicks, cloths, team) {
  const T = TEAMS[team]
  const F = FLAME[team]
  const { STONE, STONE_DK, IRON, WOOD } = mats()
  const x = T.sign * NEXUS_X
  const g = new THREE.Group()
  g.position.set(x, 0, 0)

  // two-step hewn stone shrine platform
  const plat = new THREE.Mesh(facet(new THREE.CylinderGeometry(6.9, 7.7, 0.42, 8)), STONE_DK)
  plat.position.y = 0.21
  plat.rotation.y = Math.PI / 8
  plat.receiveShadow = true
  plat.castShadow = true
  const step = new THREE.Mesh(facet(new THREE.CylinderGeometry(4.9, 5.6, 0.44, 8)), STONE)
  step.position.y = 0.62
  step.receiveShadow = true
  step.castShadow = true
  g.add(plat, step)

  // aged-bronze trim ring catching the firelight
  const trim = new THREE.Mesh(new THREE.TorusGeometry(6.75, 0.09, 8, 48), mats().bronzeTrim())
  trim.rotation.x = Math.PI / 2
  trim.position.y = 0.44
  g.add(trim)

  // faint ember ring around the shrine heart (firelight cast onto stone)
  const inner = new THREE.Mesh(
    new THREE.RingGeometry(3.6, 3.95, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(F.mid).multiplyScalar(0.85), transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  )
  inner.rotation.x = -Math.PI / 2
  inner.position.y = 0.86
  g.add(inner)

  // WAR FIRE on a stone plinth — the team's nexus heart
  const plinth = new THREE.Mesh(facet(new THREE.CylinderGeometry(1.25, 1.65, 0.85, 8)), STONE)
  plinth.position.y = 1.2
  plinth.castShadow = true
  g.add(plinth)
  const nex = nexusFlame(team)
  nex.position.y = 1.62
  g.add(nex)
  tickables.push(nex)

  // four shrine pillars with team-flame braziers
  for (const a of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4]) {
    const px = Math.cos(a) * 3.4, pz = Math.sin(a) * 3.4
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.5, 0.6), STONE)
    pil.position.set(px, 2.05, pz)
    pil.castShadow = true
    g.add(pil)
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.28, 7), IRON)
    cup.position.set(px, 3.42, pz)
    g.add(cup)
    const f = flame(team, 1.5)
    f.group.position.set(px, 3.5, pz)
    flicks.push(f.flick)
    g.add(f.group)
  }

  // firelight — real falloff
  const light = new THREE.PointLight(F.mid, team === 'red' ? 16 : 12, 26, 2)
  light.position.set(0, 5, 0)
  g.add(light)

  // war banners around the platform rim
  const flags = []
  const flagMat = cloth(team)
  for (const a of [0.7, 2.44, -0.7, -2.44]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 3.8, 6), WOOD)
    pole.position.set(Math.cos(a) * 6.1, 2.2, Math.sin(a) * 6.1)
    pole.castShadow = true
    g.add(pole)
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), flagMat)
    flag.position.set(Math.cos(a) * 6.1 + 0.75, 3.6, Math.sin(a) * 6.1)
    flag.castShadow = true
    flag.userData.baseYaw = rand(TAU)
    g.add(flag)
    flags.push(flag)
  }
  let ft = rand(10)
  tickables.push({
    tick: dt => {
      ft += dt
      for (let i = 0; i < flags.length; i++) {
        flags[i].rotation.y = Math.sin(ft * 1.7 + i * 1.3) * 0.28
        flags[i].rotation.z = Math.sin(ft * 2.3 + i) * 0.08
      }
    },
  })

  scene.add(g)
  const tint = tintDecal(team === 'blue' ? 'rgba(92,116,140,0.5)' : 'rgba(150,66,38,0.5)', 15)
  tint.position.set(x * 0.92, 0.012, 0)
  scene.add(tint)
  const ao = contactShadow(8.6, 0.4)
  ao.position.set(x, 0.015, 0)
  scene.add(ao)

  return {
    team, x, group: g, nexGroup: nex,
    topPos: new THREE.Vector3(x, 4.6, 0),
    light,
  }
}

function buildTower(scene, tickables, flicks, team, tier) {
  const T = TEAMS[team]
  const F = FLAME[team]
  const { STONE, STONE_DK, WOOD, WOOD_DK, IRON } = mats()
  const x = T.sign * TOWER_XS[tier]
  const z = TOWER_Z[tier]
  const g = new THREE.Group()
  g.position.set(x, 0, z)

  // hewn cracked-stone watchtower
  const base = new THREE.Mesh(facet(new THREE.CylinderGeometry(2.15, 2.6, 0.7, 8)), STONE_DK)
  base.position.y = 0.35
  base.castShadow = base.receiveShadow = true
  const body = new THREE.Mesh(facet(new THREE.CylinderGeometry(1.02, 1.72, 4.4, 8)), STONE)
  body.position.y = 2.55
  body.castShadow = true
  const collar = new THREE.Mesh(facet(new THREE.CylinderGeometry(1.42, 1.12, 0.62, 8)), STONE_DK)
  collar.position.y = 4.95
  collar.castShadow = true
  g.add(base, body, collar)

  // wooden hoarding: plank skirt braced below the battlement
  const hoard = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.38, 0.92, 8, 1, true), WOOD)
  hoard.position.y = 4.28
  hoard.castShadow = true
  g.add(hoard)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 8
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.15, 0.09), WOOD_DK)
    strut.position.set(Math.cos(a) * 1.32, 3.5, Math.sin(a) * 1.32)
    strut.rotation.z = Math.cos(a) * 0.34
    strut.rotation.x = -Math.sin(a) * 0.34
    strut.castShadow = true
    g.add(strut)
  }

  // crenellated battlement
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.24), STONE)
    c.position.set(Math.cos(a) * 1.28, 5.4, Math.sin(a) * 1.28)
    c.rotation.y = -a
    c.castShadow = true
    g.add(c)
  }

  // bronze trim band (flash-tinted when the tower takes damage)
  const trim = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.09, 8, 28), mats().bronzeTrim())
  trim.rotation.x = Math.PI / 2
  trim.position.y = 4.62
  g.add(trim)

  // signal brazier crowning the tower (the tower's "eye")
  const gem = new THREE.Group()
  const bowl = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.62, 0.4, 0.34, 8)), IRON)
  const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.07, 8), emberGlowMaterial(1.35, F.mid))
  coals.position.y = 0.15
  const f = flame(team, 2.1)
  f.group.position.y = 0.16
  flicks.push(f.flick)
  gem.add(bowl, coals, f.group)
  gem.position.y = 5.85
  g.add(gem)

  const halo = haloSprite(F.halo, 0.16)
  halo.scale.setScalar(2.4)
  halo.position.y = 6.2
  g.add(halo)

  // targeting flare (pulses while the tower aims)
  const aimSpr = haloSprite('#ffffff', 0)
  aimSpr.scale.setScalar(2.2)
  aimSpr.position.y = 6.2
  g.add(aimSpr)

  // invulnerability ward ring — pale bone-gold runes
  const shield = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.07, 8, 40), emberGlowMaterial(0.72, '#c9bd97'))
  shield.rotation.x = Math.PI / 2
  shield.position.y = 0.78
  g.add(shield)

  // defensive stake ring around the foot
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rand(0.2)
    const h = rand(1, 1.4)
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.1, h, 5), WOOD_DK)
    stake.position.set(Math.cos(a) * 2.85, h * 0.42, Math.sin(a) * 2.85)
    stake.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55)
    stake.castShadow = true
    g.add(stake)
  }

  // grounding: mud skirt + contact shadow
  g.add(mudSkirt(2.62, 0.95))
  g.add(contactShadow(3.2, 0.46))

  scene.add(g)
  return {
    team, tier, x, z, group: g,
    topPos: new THREE.Vector3(x, 5.9, z),
    aimSpr, halo, shield, trimMesh: trim, gem,
  }
}

/** Distance from point (x,z) to the river center line through origin. */
export function riverDist(x, z) {
  const dx = Math.sin(RIVER_ANGLE), dz = Math.cos(RIVER_ANGLE)
  return Math.abs(x * dz - z * dx)
}

/**
 * Builds the whole war-torn Rift into `scene`.
 * Returns { tickables, towerDefs, nexusDefs } — caller ticks tickables each frame.
 */
export function buildMap(scene) {
  FIRE_MATS = {} // fresh tracked fire materials per scene entry
  const tickables = []
  const flicks = [] // every torch/brazier flame, one shared ticker
  const cloths = [] // war-banner cloths, one shared sway ticker
  mats()

  // ---------- storm-dusk sky: umber horizon haze under a cold indigo vault ----------
  scene.fog = new THREE.FogExp2('#221a1c', 0.0085)
  scene.add(sky({
    top: '#100e18', mid: '#2c1f28', bottom: '#5e3220', radius: 470,
    haze: '#6b3a22', hazeAmt: 0.34, hazeBand: 0.34,
    sunDir: new THREE.Vector3(-0.55, 0.1, -0.4), sunColor: '#c96a35', sunSize: 22, sunBoost: 1.5,
    stars: 0.35,
    clouds: { color: '#33222c', shade: '#17111a', amount: 0.6, scale: 1.0, speed: 1.2 },
  }))
  // world-ends: pine treeline hugging the map edge, then siege-camp peaks
  const treeline = ridgeRing({ kind: 'pines', radius: 96, height: 16, color: '#251c1e', seed: 41 })
  scene.add(treeline)
  const ranges = horizonLayers({
    kind: 'peaks', count: 2, radius: [150, 240], height: [30, 48],
    colors: ['#2c2024', '#3a2830'], seeds: [13, 59],
    firesOn: 1, fireColor: '#ff8c3b',
  })
  scene.add(ranges)
  tickables.push(ranges)

  // ---------- ground: dead-patched grass field + packed-earth lane + dark river ----------
  const grass = grassFieldTexture()
  grass.map.repeat.set(5, 3)
  grass.normalMap.repeat.set(5, 3)
  grass.roughnessMap.repeat.set(5, 3)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(170, 100),
    pbrMaterial({ color: '#ffffff', maps: grass, roughness: 1, metalness: 0, normalScale: 0.9, envMapIntensity: 0.16 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const earth = mats().earthSet
  const laneMat = pbrMaterial({
    color: '#a8998a', maps: { map: laneAlbedo(earth), normalMap: earth.normalMap, roughnessMap: earth.roughnessMap },
    roughness: 1, metalness: 0, normalScale: 1.1, envMapIntensity: 0.16, transparent: true,
  })
  laneMat.normalMap.repeat.set(4, 1)
  laneMat.roughnessMap.repeat.set(4, 1)
  laneMat.depthWrite = false
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(102, 11.4), laneMat)
  lane.rotation.x = -Math.PI / 2
  lane.position.y = 0.02
  lane.receiveShadow = true
  scene.add(lane)

  // river: dark reflective water over a silt bed
  const riverGeo = new THREE.PlaneGeometry(9, 72)
  riverGeo.rotateX(-Math.PI / 2)
  const riverMat = waterMaterial({ shallow: '#39503f', deep: '#0d1418', opacity: 0.52, speed: 0.5 })
  // my instance only: mute the hard white sparkle cells into faint moonlit glints
  riverMat.fragmentShader = riverMat.fragmentShader.replace('col += sp * vec3(1.4);', 'col += sp * vec3(0.05, 0.06, 0.055);')
  const river = new THREE.Mesh(riverGeo, riverMat)
  river.rotation.y = RIVER_ANGLE
  river.position.y = 0.055
  scene.add(river)
  const bedGeo = new THREE.PlaneGeometry(10.2, 73)
  bedGeo.rotateX(-Math.PI / 2)
  const bed = new THREE.Mesh(bedGeo, pbrMaterial({ color: '#131a12', roughness: 0.85, metalness: 0, envMapIntensity: 0.12 }))
  bed.rotation.y = RIVER_ANGLE
  bed.position.y = 0.035
  bed.receiveShadow = true
  scene.add(bed)

  // reed banks along the stream
  const cosA = Math.cos(RIVER_ANGLE), sinA = Math.sin(RIVER_ANGLE)
  for (let v = -30; v <= 30; v += 2.6) {
    for (const s of [-1, 1]) {
      if (Math.random() < 0.3) continue
      const u = s * rand(4.7, 6.3)
      const wx = u * cosA + v * sinA
      const wz = -u * sinA + v * cosA
      if (Math.abs(wx) > 50 || Math.abs(wz) > 20) continue
      if (Math.abs(wz) < 4.5 && Math.random() < 0.65) continue // keep the mid crossing readable
      const r = reedClump()
      r.position.set(wx + rand(-0.5, 0.5), 0, wz + rand(-0.5, 0.5))
      r.rotation.y = rand(TAU)
      scene.add(r)
    }
  }

  // pale marsh-motes over the water (cold, faint)
  const riverGlow = fireflies({ count: 8, area: [7, 56], height: [0.35, 1.8], color: '#7a8f84', size: 0.22 })
  riverGlow.rotation.y = RIVER_ANGLE
  scene.add(riverGlow)
  tickables.push(riverGlow)

  const riverLight = new THREE.PointLight('#46605a', 4, 16, 2)
  riverLight.position.set(0, 2.5, 0)
  scene.add(riverLight)

  // drifting embers over the battlefield
  const embers = fireflies({ count: 28, area: [95, 34], height: [0.6, 5], color: '#ff8c3b', size: 0.36 })
  scene.add(embers)
  tickables.push(embers)

  // ---------- forest framing the lane: pines west, dead oaks east ----------
  const templates = {
    west: [pine(), pine(), deadOak()],
    east: [deadOak(), deadOak(), pine()],
  }
  const forest = new THREE.Group()
  const place = (x, z, big) => {
    if (riverDist(x, z) < 8.5 || Math.abs(x) > 57 || Math.abs(z) > 34) return
    const side = x < -4 ? 'west' : x > 4 ? 'east' : (Math.random() < 0.5 ? 'west' : 'east')
    const t = templates[side][Math.floor(rand(3))].clone()
    t.position.set(x, 0, z)
    t.rotation.y = rand(TAU)
    t.scale.setScalar(rand(0.85, 1.25) * (big ? 1.5 : 1))
    forest.add(t)
  }
  for (let x = -52; x <= 52; x += 4.2) {
    for (const zs of [-1, 1]) {
      if (Math.random() < 0.92) place(x + rand(-1.6, 1.6), zs * rand(8.6, 12.5), false)
      if (Math.random() < 0.8) place(x + rand(-2, 2), zs * rand(13.5, 19), Math.random() < 0.6)
      if (Math.random() < 0.85) place(x + rand(-2, 2), zs * rand(19.5, 30), true)
    }
  }
  scene.add(forest)

  // underbrush: moor scrub + dead bracken sharing two materials
  const bushMats = [
    pbrMaterial({ color: '#39401f', roughness: 1, metalness: 0, envMapIntensity: 0.12 }),
    pbrMaterial({ color: '#41301f', roughness: 1, metalness: 0, envMapIntensity: 0.12 }),
  ]
  const bushGeo = new THREE.SphereGeometry(0.55, 9, 7)
  const bushes = new THREE.Group()
  for (let i = 0; i < 60; i++) {
    const x = rand(-52, 52)
    const z = (Math.random() < 0.5 ? -1 : 1) * rand(6.6, 22)
    if (riverDist(x, z) < 7.5) continue
    const b = new THREE.Mesh(bushGeo, bushMats[x > 4 ? 1 : 0])
    b.position.set(x, 0.28, z)
    b.scale.set(rand(0.7, 1.5), rand(0.5, 0.85), rand(0.7, 1.5))
    b.rotation.y = rand(TAU)
    b.castShadow = true
    bushes.add(b)
  }
  scene.add(bushes)

  // rocks near lane edges + river banks
  for (let i = 0; i < 14; i++) {
    const x = rand(-44, 44)
    const z = (Math.random() < 0.5 ? -1 : 1) * rand(6.8, 9.5)
    if (riverDist(x, z) < 7) continue
    const rk = flatRock(rand(0.7, 1.6), Math.random() < 0.5)
    rk.position.set(x, 0.12, z)
    scene.add(rk)
  }

  // instanced clutter: pebbles, splinters, bone shards
  scatterClutter(scene)

  // ---------- war-camp dressing: torches, palisades, banners, tents ----------
  for (let x = -46; x <= 46; x += 11.5) {
    for (const s of [-1, 1]) {
      const tx = x + rand(-1, 1), tz = s * rand(6.6, 7.2)
      if (riverDist(tx, tz) < 7.5) continue
      const tp = torchPost(flicks, tx < 0 ? 'blue' : 'red')
      tp.position.set(tx, 0, tz)
      tp.rotation.y = rand(TAU)
      scene.add(tp)
    }
  }
  for (const [px, pzs] of [[-33, 1], [-19, -1], [21, 1], [35, -1], [-41, -1], [43, 1]]) {
    const pz = pzs * rand(6.4, 7)
    if (riverDist(px, pz) < 8) continue
    const pal = palisade(5 + Math.floor(rand(3)))
    pal.position.set(px, 0, pz)
    pal.rotation.y = rand(-0.25, 0.25)
    scene.add(pal)
  }
  for (const [bx, bz] of [[-24, 7.4], [-12, -7.4], [14, -7.4], [27, 7.4]]) {
    if (riverDist(bx, bz) < 8) continue
    const wb = warBanner(bx < 0 ? 'blue' : 'red', cloths)
    wb.position.set(bx, 0, bz)
    wb.rotation.y = rand(TAU)
    scene.add(wb)
  }
  for (const [tx, tz, team] of [[-38, 11, 'blue'], [-43, -12, 'blue'], [39, -11, 'red'], [44, 12, 'red']]) {
    const t = tent(team)
    t.position.set(tx, 0, tz)
    scene.add(t)
    cloths.push(t.userData.pennant)
  }

  // rune monoliths where ley-crystals once stood
  const runeSpots = [
    [-14, 9, 'blue'], [16, -9.5, 'red'], [-30, -8.5, 'blue'], [32, 8.5, 'red'], [-8, 16, 'blue'],
  ]
  for (const [cx, cz, tm] of runeSpots) {
    const rs = runeStone(tm, rand(1.9, 2.6))
    rs.position.set(cx, 0, cz)
    scene.add(rs)
  }

  // one shared flicker + one shared cloth sway
  tickables.push(flameTicker(flicks))
  let ct = rand(10)
  tickables.push({
    tick: dt => {
      ct += dt
      for (const c of cloths) {
        c.rotation.y = Math.sin(ct * 1.6 + c.userData.phase) * 0.24
        c.rotation.z = Math.sin(ct * 2.4 + c.userData.phase * 1.7) * 0.07
      }
    },
  })

  // ---------- structures ----------
  const nexusDefs = { blue: buildBase(scene, tickables, flicks, cloths, 'blue'), red: buildBase(scene, tickables, flicks, cloths, 'red') }
  const towerDefs = [
    buildTower(scene, tickables, flicks, 'blue', 0), buildTower(scene, tickables, flicks, 'blue', 1),
    buildTower(scene, tickables, flicks, 'red', 0), buildTower(scene, tickables, flicks, 'red', 1),
  ]

  // ---------- lighting: one low ember key + faint cold bounce (let blacks be black) ----------
  scene.add(new THREE.HemisphereLight('#353a4a', '#151008', 0.2))
  const dir = new THREE.DirectionalLight('#ff9648', 1.35)
  dir.position.set(36, 17, 20)
  dir.castShadow = true
  dir.shadow.mapSize.set(2048, 2048)
  dir.shadow.camera.left = -60
  dir.shadow.camera.right = 60
  dir.shadow.camera.top = 34
  dir.shadow.camera.bottom = -34
  dir.shadow.camera.near = 4
  dir.shadow.camera.far = 110
  dir.shadow.bias = -0.0004
  dir.shadow.normalBias = 0.03
  scene.add(dir)

  return { tickables, towerDefs, nexusDefs }
}
