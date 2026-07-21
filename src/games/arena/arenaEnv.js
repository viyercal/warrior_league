import * as THREE from 'three'
import { cloudLayer, fireflies } from '../../art/environment.js'
import { sky } from '../../art/sky.js'
import { horizonLayers } from '../../art/backdrop.js'
import { dragon, dragonFlight } from '../../art/otherworld.js'
import {
  canvasTexture, glowTexture, normalMapFromHeight, roughnessTexture, dirtOverlay,
} from '../../core/assets.js'
import {
  pbrMaterial, stoneMaterial, ironMaterial, boneMaterial,
  emberGlowMaterial, fireMaterial, energyMaterial,
} from '../../art/materials.js'
import { rand, TAU } from '../../core/utils.js'

export const ARENA_R = 26

// ============================================================================
// Rocks — jagged basalt with baked base-AO in vertex colors so every boulder
// sits dark against the ground (cheap contact occlusion, no extra passes).
// ============================================================================

function rockGeo(scaleY = 0.85, detail = 0) {
  const geo = new THREE.IcosahedronGeometry(0.55, detail)
  const p = geo.attributes.position
  const seed = rand(100)
  const jit = v => 0.72 + 0.5 * Math.abs(Math.sin(v * 437.5453 + seed))
  let minY = Infinity, maxY = -Infinity
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const k = jit(x * 12.9 + y * 7.13 + z * 3.71)
    p.setXYZ(i, x * k, y * k * scaleY, z * k)
    const ny = p.getY(i)
    if (ny < minY) minY = ny
    if (ny > maxY) maxY = ny
  }
  // baked AO: base of the rock falls toward black, crown stays lit
  const col = new Float32Array(p.count * 3)
  const span = maxY - minY || 1
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, ((p.getY(i) - minY) / span) * 1.45)
    const v = 0.38 + 0.62 * t
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.computeVertexNormals()
  return geo
}

/** Jagged pit boulder. Yaw-only rotation (+ slight tilt) keeps the baked AO grounded. */
function pitRock(mat, scale, { detail = 0 } = {}) {
  const m = new THREE.Mesh(rockGeo(0.85, detail), mat)
  m.scale.setScalar(scale)
  m.rotation.set(rand(-0.22, 0.22), rand(TAU), rand(-0.22, 0.22))
  return m
}

// ============================================================================
// Floor — one shared layout drives albedo + height (-> normal map) + emissive
// magma fissures, so recesses, soot and ember veins all agree per-pixel.
// All coords normalized to [0,1] canvas space; center (0.5, 0.5), radius 0.5.
// ============================================================================

function walkLine(x, y, steps, stepLo, stepHi, turn) {
  const pts = [[x, y]]
  let dir = rand(TAU)
  for (let s = 0; s < steps; s++) {
    dir += rand(-turn, turn)
    const len = rand(stepLo, stepHi)
    x += Math.cos(dir) * len
    y += Math.sin(dir) * len
    pts.push([x, y])
  }
  return pts
}

function buildFloorLayout() {
  const bands = [0.105, 0.2, 0.32, 0.44, 0.56, 0.7, 0.86, 0.985]
  const blocks = []
  for (let bi = 0; bi < bands.length - 1; bi++) {
    const n = 9 + bi * 6
    const off = rand(TAU)
    for (let b = 0; b < n; b++) {
      // hand-laid irregularity: jittered joints + wobbling band edges
      blocks.push({
        r0: bands[bi] * 0.5 + rand(-0.0022, 0.0022),
        r1: bands[bi + 1] * 0.5 + rand(-0.0022, 0.0022),
        a0: off + (b * TAU) / n + rand(-0.006, 0.006),
        a1: off + ((b + 1) * TAU) / n + rand(-0.006, 0.006),
        tone: Math.random(), roll: Math.random(),
      })
    }
  }
  const cracks = []
  for (let i = 0; i < 30; i++) {
    const a = rand(TAU), r = rand(0.06, 0.42)
    cracks.push(walkLine(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, 3 + Math.floor(rand(4)), 0.008, 0.026, 0.7))
  }
  const fissures = []
  for (let i = 0; i < 15; i++) {
    const a = rand(TAU)
    const r = i < 11 ? rand(0.25, 0.455) : rand(0.07, 0.2)
    fissures.push(walkLine(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, 3 + Math.floor(rand(4)), 0.008, 0.024, 0.8))
  }
  const coals = []
  for (let i = 0; i < 26; i++) {
    const a = rand(TAU), r = Math.sqrt(Math.random()) * 0.46
    coals.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, rand(0.0006, 0.0014)])
  }
  return { blocks, cracks, fissures, coals }
}

function traceLine(ctx, pts, w) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0] * w, pts[0][1] * w)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * w, pts[i][1] * w)
  ctx.stroke()
}

function fillBlock(ctx, b, w) {
  ctx.beginPath()
  ctx.arc(w / 2, w / 2, b.r1 * w, b.a0, b.a1)
  ctx.arc(w / 2, w / 2, b.r0 * w, b.a1, b.a0, true)
  ctx.closePath()
  ctx.fill()
}

/** Grayscale height: slabs proud, mortar/cracks/fissures recessed. Feeds the normal map. */
function drawFloorHeight(layout, ctx, w) {
  ctx.fillStyle = '#8c8c8c'
  ctx.fillRect(0, 0, w, w)
  for (const b of layout.blocks) {
    const l = Math.round(122 + b.tone * 40)
    ctx.fillStyle = `rgb(${l},${l},${l})`
    fillBlock(ctx, b, w)
  }
  // surface grain: soft bumps/dips so slabs aren't machine-flat
  for (let i = 0; i < 520; i++) {
    const a = rand(TAU), r = Math.sqrt(Math.random()) * 0.49
    const x = (0.5 + Math.cos(a) * r) * w, y = (0.5 + Math.sin(a) * r) * w
    const s = rand(6, 34)
    ctx.globalAlpha = rand(0.04, 0.1)
    ctx.fillStyle = Math.random() < 0.5 ? '#6e6e6e' : '#a4a4a4'
    ctx.beginPath()
    ctx.ellipse(x, y, s, s * rand(0.4, 0.9), rand(TAU), 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // mortar joints (deep recesses)
  ctx.strokeStyle = '#2e2e2e'
  for (const b of layout.blocks) {
    ctx.lineWidth = w * 0.0038
    ctx.beginPath()
    ctx.moveTo(w / 2 + Math.cos(b.a0) * b.r0 * w, w / 2 + Math.sin(b.a0) * b.r0 * w)
    ctx.lineTo(w / 2 + Math.cos(b.a0) * b.r1 * w, w / 2 + Math.sin(b.a0) * b.r1 * w)
    ctx.stroke()
    ctx.lineWidth = w * 0.0042
    ctx.beginPath()
    ctx.arc(w / 2, w / 2, b.r0 * w, b.a0, b.a1)
    ctx.stroke()
  }
  // hairline cracks + deep fissure recesses
  ctx.strokeStyle = '#3a3a3a'
  ctx.lineWidth = w * 0.0014
  for (const pts of layout.cracks) traceLine(ctx, pts, w)
  ctx.strokeStyle = '#1c1c1c'
  ctx.lineWidth = w * 0.0052
  for (const pts of layout.fissures) traceLine(ctx, pts, w)
}

/** Albedo: desaturated worn sandstone, soot, ash, faded war-paint, charred fissures. */
function drawFloorAlbedo(layout, ctx, w) {
  const cx = w / 2, cy = w / 2, R = w / 2
  ctx.fillStyle = '#201913'
  ctx.fillRect(0, 0, w, w)

  const stones = ['#473c2e', '#3f352a', '#3a3026', '#4e4232', '#44392b', '#362d23']
  for (const b of layout.blocks) {
    ctx.fillStyle = stones[Math.floor(b.tone * stones.length) % stones.length]
    fillBlock(ctx, b, w)
    // per-slab warm/cool cast so no two neighbours match
    ctx.globalAlpha = 0.05 + b.tone * 0.06
    ctx.fillStyle = b.roll < 0.5 ? '#54402a' : '#2e2d2e'
    fillBlock(ctx, b, w)
    ctx.globalAlpha = 1
    // occasional soot-charred or heat-tinged slab (kept subtle + desaturated)
    if (b.roll < 0.26) {
      ctx.globalAlpha = b.roll < 0.15 ? rand(0.1, 0.2) : rand(0.05, 0.1)
      ctx.fillStyle = b.roll < 0.15 ? '#0c0906' : '#5c3520'
      fillBlock(ctx, b, w)
      ctx.globalAlpha = 1
    }
  }

  // mortar seams — dark earth in the recesses (alpha varies so the grid never reads mechanical)
  ctx.lineCap = 'round'
  for (const b of layout.blocks) {
    ctx.strokeStyle = `rgba(13, 9, 5, ${(0.45 + b.tone * 0.32).toFixed(2)})`
    ctx.lineWidth = w * (0.0026 + b.tone * 0.0012)
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(b.a0) * b.r0 * w, cy + Math.sin(b.a0) * b.r0 * w)
    ctx.lineTo(cx + Math.cos(b.a0) * b.r1 * w, cy + Math.sin(b.a0) * b.r1 * w)
    ctx.stroke()
    ctx.lineWidth = w * (0.0028 + b.roll * 0.001)
    ctx.beginPath()
    ctx.arc(cx, cy, b.r0 * w, b.a0, b.a1)
    ctx.stroke()
  }

  // center slab where the champion stands
  ctx.fillStyle = '#453d33'
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.105, 0, TAU)
  ctx.fill()

  // sandstone mottling, ash drifts, dust
  for (let i = 0; i < 460; i++) {
    const a = rand(TAU), r = Math.sqrt(Math.random()) * R
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
    const s = rand(10, 64)
    ctx.globalAlpha = rand(0.03, 0.08)
    const roll = Math.random()
    ctx.fillStyle = roll < 0.4 ? '#524839' : roll < 0.72 ? '#15100b' : '#5c5344'
    ctx.beginPath()
    ctx.ellipse(x, y, s, s * rand(0.35, 0.9), rand(TAU), 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // faded crimson war-paint rings — pigment worn into stone, not glow
  ctx.save()
  ctx.strokeStyle = '#552019'
  ctx.globalAlpha = 0.34
  ctx.lineWidth = w * 0.011
  ctx.setLineDash([w * 0.1, w * 0.023])
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.59, 0, TAU)
  ctx.stroke()
  ctx.globalAlpha = 0.26
  ctx.lineWidth = w * 0.0045
  ctx.setLineDash([w * 0.045, w * 0.017])
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.545, rand(TAU), rand(TAU) + TAU)
  ctx.stroke()
  ctx.setLineDash([w * 0.013, w * 0.01])
  ctx.globalAlpha = 0.28
  ctx.lineWidth = w * 0.004
  ctx.strokeStyle = '#5e231c'
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.155, 0, TAU)
  ctx.stroke()
  ctx.restore()

  // worn bone-paint rune ticks around the outer band
  for (let i = 0; i < 36; i++) {
    const a = (i * TAU) / 36 + rand(-0.03, 0.03)
    ctx.save()
    ctx.translate(cx + Math.cos(a) * R * 0.925, cy + Math.sin(a) * R * 0.925)
    ctx.rotate(a + Math.PI / 2)
    ctx.globalAlpha = rand(0.08, 0.16)
    ctx.fillStyle = '#b3a382'
    ctx.fillRect(-w * 0.0015, -rand(w * 0.005, w * 0.011), w * 0.003, rand(w * 0.01, w * 0.022))
    ctx.restore()
  }

  // hairline cracks + charred fissure mouths (emissive magma lives inside these)
  ctx.strokeStyle = 'rgba(14, 9, 6, 0.6)'
  ctx.lineWidth = w * 0.0013
  for (const pts of layout.cracks) traceLine(ctx, pts, w)
  ctx.strokeStyle = 'rgba(5, 3, 2, 0.94)'
  ctx.lineWidth = w * 0.0074
  for (const pts of layout.fissures) traceLine(ctx, pts, w)

  // radial grounding: warm torchlit center falling into charred edge AO
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
  g.addColorStop(0, 'rgba(96, 74, 48, 0.1)')
  g.addColorStop(0.5, 'rgba(20, 14, 9, 0.28)')
  g.addColorStop(0.85, 'rgba(8, 5, 3, 0.6)')
  g.addColorStop(1, 'rgba(2, 1, 1, 0.92)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, w)

  // carved center sigil, dim
  ctx.save()
  ctx.globalAlpha = 0.4
  ctx.strokeStyle = '#191009'
  ctx.lineWidth = w * 0.0035
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.05, 0, TAU)
  ctx.stroke()
  ctx.globalAlpha = 0.16
  ctx.strokeStyle = '#b3a382'
  ctx.lineWidth = w * 0.0015
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.028, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

/** Emissive: magma glowing INSIDE the fissures — deep red edge, hot near-white core. */
function drawFloorEmber(layout, ctx, w) {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, w)
  const cx = w / 2, R = w / 2

  // heat seeping in around the pit's outer edge (lava below the rim)
  const eg = ctx.createRadialGradient(cx, cx, R * 0.86, cx, cx, R)
  eg.addColorStop(0, 'rgba(0,0,0,0)')
  eg.addColorStop(1, 'rgba(140, 36, 8, 0.14)')
  ctx.fillStyle = eg
  ctx.fillRect(0, 0, w, w)

  // magma veins: layered blackbody gradient, hottest at the thin core
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const pts of layout.fissures) {
    ctx.save()
    ctx.strokeStyle = '#4a0e04'
    ctx.shadowColor = '#701c06'
    ctx.shadowBlur = w * 0.0038
    ctx.lineWidth = w * 0.0042
    ctx.globalAlpha = 0.8
    traceLine(ctx, pts, w)
    ctx.strokeStyle = '#a33008'
    ctx.shadowBlur = w * 0.002
    ctx.lineWidth = w * 0.0021
    ctx.globalAlpha = 0.9
    traceLine(ctx, pts, w)
    ctx.strokeStyle = '#ef6d14'
    ctx.shadowBlur = w * 0.001
    ctx.lineWidth = w * 0.0009
    ctx.globalAlpha = 0.95
    traceLine(ctx, pts, w)
    // white-hot pinches at a few joints
    ctx.shadowBlur = w * 0.002
    ctx.fillStyle = '#ffd9a0'
    for (let i = 1; i < pts.length - 1; i++) {
      if (Math.random() < 0.4) continue
      ctx.globalAlpha = rand(0.5, 0.85)
      ctx.beginPath()
      ctx.arc(pts[i][0] * w, pts[i][1] * w, rand(0.0008, 0.0016) * w, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }

  // stray cooling coals
  for (const [x, y, r] of layout.coals) {
    ctx.save()
    ctx.fillStyle = Math.random() < 0.62 ? '#a33208' : '#d96a14'
    ctx.shadowColor = '#8c2408'
    ctx.shadowBlur = w * 0.003
    ctx.globalAlpha = rand(0.25, 0.55)
    ctx.beginPath()
    ctx.arc(x * w, y * w, r * w * 1.6, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}

// ============================================================================
// Banner cloth — weathered crimson, worn sigil, torn hem (dirtied afterwards).
// ============================================================================

function drawBanner(ctx, w, h) {
  ctx.clearRect(0, 0, w, h)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#5e1b1c')
  g.addColorStop(0.6, '#4a1415')
  g.addColorStop(1, '#2c0c0c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // weave shading
  for (let i = 0; i < 46; i++) {
    ctx.globalAlpha = rand(0.04, 0.1)
    ctx.fillStyle = Math.random() < 0.55 ? '#000000' : '#7a3026'
    ctx.fillRect(rand(0, w), rand(0, h), rand(3, 12), rand(20, 70))
  }
  ctx.globalAlpha = 1
  // dulled bronze trim
  ctx.fillStyle = '#6e5026'
  ctx.fillRect(0, 0, w, 8)
  // worn bone sigil: ring + fang
  ctx.strokeStyle = '#b9a888'
  ctx.lineWidth = 6
  ctx.globalAlpha = 0.6
  ctx.beginPath()
  ctx.arc(w / 2, h * 0.34, w * 0.22, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(w / 2, h * 0.2)
  ctx.lineTo(w / 2, h * 0.62)
  ctx.stroke()
  ctx.globalAlpha = 1
  // torn bottom edge
  ctx.globalCompositeOperation = 'destination-out'
  for (let x = 0; x < w; x += 10) {
    const d = rand(6, 26)
    ctx.beginPath()
    ctx.moveTo(x - 4, h)
    ctx.lineTo(x + 5, h - d)
    ctx.lineTo(x + 14, h)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

// ============================================================================
// Particles
// ============================================================================

let _smokeTex = null
function smokeTexture() {
  _smokeTex ??= canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.55)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.22)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
  return _smokeTex
}

/** Rising ember-updraft particles — dim, warm, sparse. Call points.tick(dt). */
function emberUpdraft({ count = 80, radius = 34, top = 22, color = '#ff7a30', size = 0.42 } = {}) {
  const base = new Float32Array(count * 3)
  const speed = new Float32Array(count)
  const phase = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const a = rand(TAU), r = Math.sqrt(Math.random()) * radius
    base.set([Math.cos(a) * r, rand(-2, top), Math.sin(a) * r], i * 3)
    speed[i] = rand(0.9, 2.6)
    phase[i] = rand(TAU)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3))
  const mat = new THREE.PointsMaterial({
    map: glowTexture(), color, size, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const pts = new THREE.Points(geo, mat)
  let t = 0
  pts.tick = dt => {
    t += dt
    const p = pts.geometry.attributes.position
    for (let i = 0; i < count; i++) {
      let y = p.getY(i) + speed[i] * dt
      if (y > top) y = -2
      p.setXYZ(i,
        base[i * 3] + Math.sin(t * 0.8 + phase[i] + y * 0.35) * 0.9,
        y,
        base[i * 3 + 2] + Math.cos(t * 0.6 + phase[i]) * 0.9,
      )
    }
    p.needsUpdate = true
    mat.opacity = 0.4 + 0.12 * Math.sin(t * 2.1)
  }
  return pts
}

/** Instanced ground clutter: pebbles + bone shards scattered across the slabs. */
function scatterClutter(scene) {
  const tmpM = new THREE.Matrix4()
  const tmpQ = new THREE.Quaternion()
  const tmpE = new THREE.Euler()
  const tmpP = new THREE.Vector3()
  const tmpS = new THREE.Vector3()
  const place = (inst, i, y, sLo, sHi, flat) => {
    const a = rand(TAU), r = 3 + Math.sqrt(Math.random()) * (ARENA_R - 4.4)
    tmpP.set(Math.cos(a) * r, y, Math.sin(a) * r)
    tmpE.set(flat ? Math.PI / 2 + rand(-0.3, 0.3) : rand(TAU), rand(TAU), flat ? rand(-0.3, 0.3) : rand(TAU))
    tmpQ.setFromEuler(tmpE)
    const k = rand(sLo, sHi)
    tmpS.set(k, k * (flat ? 1 : rand(0.5, 0.8)), k)
    tmpM.compose(tmpP, tmpQ, tmpS)
    inst.setMatrixAt(i, tmpM)
  }

  const pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.085, 0), stoneMaterial('#40382f'), 120)
  for (let i = 0; i < 120; i++) place(pebbles, i, 0.035, 0.4, 1.35, false)
  pebbles.receiveShadow = true
  scene.add(pebbles)

  const shards = new THREE.InstancedMesh(new THREE.ConeGeometry(0.045, 0.3, 5), boneMaterial('#8f8168'), 22)
  for (let i = 0; i < 22; i++) place(shards, i, 0.04, 0.6, 1.1, true)
  shards.receiveShadow = true
  scene.add(shards)
}

// ============================================================================
// buildArena — THE PIT: a torchlit fighting pit sunk in a volcanic cavern.
// Returns { tickables, gates, rimMat, rimBase, brazierPositions, fissureSurge }
// (contract with arenaScene; fissureSurge.k superheats the magma veins).
// ============================================================================

export function buildArena(scene) {
  const tickables = []

  // ---------- shared PBR materials (one instance each, reused everywhere) ----------
  const iron = ironMaterial('#585c64')
  const ironDark = ironMaterial('#3a3d44')
  const bone = boneMaterial('#7e7059')
  bone.envMapIntensity = 0.25
  bone.roughness = 0.78
  const rockMat = tint => {
    const m = stoneMaterial(tint)
    m.vertexColors = true // base-AO baked into rockGeo vertex colors
    m.flatShading = true // chiseled basalt facets catch the torchlight
    m.envMapIntensity = 0.12 // cavern rock — barely any sky bounce
    return m
  }
  const strata = [rockMat('#38322b'), rockMat('#443b31'), rockMat('#4c4438'), rockMat('#2a2521')]

  // ---------- cavern dark + distant lava glow (atmospheric scattering) ----------
  scene.fog = new THREE.Fog('#170f12', 42, 185)
  scene.add(sky({
    top: '#090609', mid: '#170d10', bottom: '#220e08',
    haze: '#40180c', hazeAmt: 0.3,
    sunDir: new THREE.Vector3(0.55, -0.04, -0.8), sunColor: '#7c2810', sunSize: 10, sunBoost: 1.4,
    stars: 0.22,
    clouds: { color: '#2c140c', shade: '#120a08', amount: 0.5, scale: 0.9, speed: 0.6 },
  }))
  // far volcanic needles rising beyond the pit's own strata spires, ember
  // vents glowing on the nearer range
  const farSpires = horizonLayers({
    kind: 'spires', count: 2, radius: [95, 150], height: [55, 80],
    colors: ['#1f1214', '#2a161a'], seeds: [7, 43],
    firesOn: 0, fireColor: '#ff5a26', y: -12,
  })
  scene.add(farSpires)
  tickables.push(farSpires)
  // a drake circling the thermals between the volcanic needles
  const drake = dragonFlight(dragon({ scale: 2.0, seed: 5 }), {
    radius: 85, height: 48, speed: 0.06, bob: 7, seed: 0.9,
  })
  scene.add(drake.group)
  tickables.push(drake)

  // lava-lit smoke banks drifting below the pit rim
  const smokeLow = cloudLayer({ count: 13, radius: 230, height: [-130, -30], color: '#3c1c0e', opacity: 0.34, scale: [80, 150] })
  const smokeNear = cloudLayer({ count: 8, radius: 160, height: [-55, -14], color: '#4c220f', opacity: 0.26, scale: [40, 80] })
  scene.add(smokeLow, smokeNear)
  tickables.push(smokeLow, smokeNear)

  // volcanic strata spires rising out of the lava field (fog desaturates them)
  const orbit = new THREE.Group()
  for (let i = 0; i < 16; i++) {
    const r = pitRock(strata[i % 4], rand(2.2, 5))
    r.scale.y *= rand(2.4, 4.2)
    const a = rand(TAU), rr = rand(34, 58)
    r.position.set(Math.cos(a) * rr, rand(-15, -7), Math.sin(a) * rr)
    orbit.add(r)
    if (i % 3 === 0) {
      // stacked strata cap in a lighter band
      const cap = pitRock(strata[(i + 2) % 4], rand(1.4, 2.4))
      cap.position.copy(r.position)
      cap.position.y += rand(4, 8)
      orbit.add(cap)
    }
  }
  orbit.tick = dt => { orbit.rotation.y += dt * 0.006 }
  scene.add(orbit)
  tickables.push(orbit)

  // ---------- the pit floor: cracked sandstone + magma fissures ----------
  const layout = buildFloorLayout()
  const heightCanvas = document.createElement('canvas')
  heightCanvas.width = heightCanvas.height = 1024
  drawFloorHeight(layout, heightCanvas.getContext('2d'), 1024)
  const floorTex = canvasTexture(2048, 2048, (ctx, w) => drawFloorAlbedo(layout, ctx, w))
  const emberTex = canvasTexture(1024, 1024, (ctx, w) => drawFloorEmber(layout, ctx, w))
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    normalMap: normalMapFromHeight(heightCanvas, { strength: 2.6 }),
    roughnessMap: roughnessTexture({ size: 256, base: 0.94, variation: 0.05, scale: 9 }),
    roughness: 1.0, metalness: 0.0,
    emissiveMap: emberTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.0,
  })
  floorMat.normalScale.set(1.6, 1.6)
  floorMat.envMapIntensity = 0.14
  const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R, 96), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  // magma breathing: slow pulse, hot-to-dark, never strobing.
  // fissureSurge.k (0..1, scene-driven) superheats the veins for boss drama.
  const fissureSurge = { k: 0 }
  let pulseT = rand(10)
  tickables.push({
    tick: dt => {
      pulseT += dt
      floorMat.emissiveIntensity =
        (1.0 + 0.16 * Math.sin(pulseT * 0.7) + 0.05 * Math.sin(pulseT * 2.3 + 1.3)) * (1 + 1.5 * fissureSurge.k)
    },
  })

  scatterClutter(scene)

  // ember chips poking out of fissure mouths (tiny, catch bloom faintly)
  const chipGeo = new THREE.TetrahedronGeometry(0.09)
  const chipMat = emberGlowMaterial(1.3, '#e8641e')
  for (let i = 0; i < Math.min(10, layout.fissures.length); i++) {
    const pts = layout.fissures[i]
    const [u, v] = pts[Math.floor(pts.length / 2)]
    const chip = new THREE.Mesh(chipGeo, chipMat)
    // canvas (u,v) -> world (canvas flipY + circle rotated flat): x = (u-.5)*2R, z = (v-.5)*2R
    chip.position.set((u - 0.5) * 2 * ARENA_R, 0.03, (v - 0.5) * 2 * ARENA_R)
    chip.scale.setScalar(rand(0.6, 1.3))
    chip.rotation.set(rand(TAU), rand(TAU), rand(TAU))
    scene.add(chip)
  }

  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_R, ARENA_R - 1.4, 3.4, 96, 1, true),
    pbrMaterial({ color: '#17110c', roughness: 1, envMapIntensity: 0.1 }),
  )
  skirt.position.y = -1.7
  scene.add(skirt)

  // heat-crack at the wall base (pulsed on wall hits) + lava seam under the pit lip
  const rimMat = emberGlowMaterial(0.42, '#8f2c0c')
  const rimHot = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R + 0.1, 0.045, 8, 128), rimMat)
  rimHot.rotation.x = Math.PI / 2
  rimHot.position.y = 0.1
  const rimUnder = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R - 0.4, 0.14, 8, 96), emberGlowMaterial(0.9, '#9c300c'))
  rimUnder.rotation.x = Math.PI / 2
  rimUnder.position.y = -3.35
  scene.add(rimHot, rimUnder)

  // lava haze under the pit — dim atmospheric lift, not a lamp
  const under = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: '#c24312', transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  under.scale.set(80, 40, 1)
  under.position.y = -12
  scene.add(under)

  // ---------- jagged rock rim in layered strata ----------
  for (let i = 0; i < 34; i++) {
    const a = (i * TAU) / 34 + rand(-0.05, 0.05)
    // leave openings where the bone gates stand
    const gateA = ((Math.round((a / TAU) * 6 - 0.5) + 0.5) * TAU) / 6
    let dA = Math.abs(a - gateA)
    if (dA > Math.PI) dA = TAU - dA
    if (dA < 0.16) continue
    const r = pitRock(strata[i % 4], rand(1.5, 3.2), { detail: 1 })
    if (i % 2) r.scale.y *= rand(1.3, 1.9) // jagged teeth among the boulders
    r.position.set(Math.cos(a) * (ARENA_R + rand(1.2, 2.6)), rand(-0.5, 0.4), Math.sin(a) * (ARENA_R + rand(1.2, 2.6)))
    r.castShadow = true
    r.receiveShadow = true
    scene.add(r)
    // strata band: smaller lighter cap stone on some teeth
    if (i % 3 === 0) {
      const cap = pitRock(strata[(i + 2) % 4], rand(0.7, 1.3))
      cap.position.set(r.position.x + rand(-0.5, 0.5), r.position.y + rand(1.6, 3), r.position.z + rand(-0.5, 0.5))
      cap.castShadow = true
      scene.add(cap)
    }
  }

  // ---------- iron braziers with real fire + smoke (same 6 stations) ----------
  const pedGeo = new THREE.CylinderGeometry(0.42, 0.85, 1.5, 10)
  const bowlGeo = new THREE.CylinderGeometry(0.95, 0.45, 0.62, 12)
  const bandGeo = new THREE.TorusGeometry(0.92, 0.07, 8, 20)
  const coalGeo = new THREE.SphereGeometry(0.62, 12, 8)
  const coalMat = emberGlowMaterial(1.5, '#e05512')
  const flameOutGeo = new THREE.ConeGeometry(0.52, 1.6, 12, 1, true)
  const flameInGeo = new THREE.ConeGeometry(0.3, 1.1, 10, 1, true)
  // a few fire material variants so the six braziers don't flicker in sync
  const fireOut = [
    fireMaterial({ intensity: 2.1, speed: 1.35 }),
    fireMaterial({ intensity: 2.1, speed: 1.6 }),
    fireMaterial({ intensity: 2.1, speed: 1.85 }),
  ]
  const fireIn = [
    fireMaterial({ intensity: 2.8, speed: 2.1, midColor: '#ffa040', coreColor: '#fff6dd' }),
    fireMaterial({ intensity: 2.8, speed: 2.5, midColor: '#ffa040', coreColor: '#fff6dd' }),
  ]
  const smokeMatProto = new THREE.SpriteMaterial({
    map: smokeTexture(), color: '#241d18', transparent: true, opacity: 0.16, depthWrite: false,
  })
  const brazierPositions = []
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6
    const x = Math.cos(a) * 24.2, z = Math.sin(a) * 24.2
    brazierPositions.push(new THREE.Vector3(x, 2.9, z))
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    const ped = new THREE.Mesh(pedGeo, ironDark)
    ped.position.y = 0.75
    ped.castShadow = true
    const bowl = new THREE.Mesh(bowlGeo, iron)
    bowl.position.y = 1.75
    bowl.castShadow = true
    const band = new THREE.Mesh(bandGeo, ironDark)
    band.rotation.x = Math.PI / 2
    band.position.y = 1.95
    const coals = new THREE.Mesh(coalGeo, coalMat)
    coals.scale.set(1, 0.42, 1)
    coals.position.y = 2.06
    const flame = new THREE.Mesh(flameOutGeo, fireOut[i % 3])
    flame.position.y = 2.86
    const flameCore = new THREE.Mesh(flameInGeo, fireIn[i % 2])
    flameCore.position.y = 2.66
    // dim warm halo so torchlight visibly pools in the air
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: '#e06a24', transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    halo.scale.setScalar(3.6)
    halo.position.y = 2.8
    g.add(ped, bowl, band, coals, flame, flameCore, halo)
    // smoke wisps rising off the flame tip
    const wisps = []
    for (let s = 0; s < 3; s++) {
      const sp = new THREE.Sprite(smokeMatProto.clone())
      sp.position.set(rand(-0.2, 0.2), 3.4, rand(-0.2, 0.2))
      g.add(sp)
      wisps.push({ sp, p: s / 3, drift: rand(TAU), speed: rand(0.16, 0.24) })
    }
    scene.add(g)
    const light = new THREE.PointLight('#ff8c3b', 15, 14, 2)
    light.position.set(x, 3.2, z)
    scene.add(light)
    // torch flicker: flame breathing + light intensity + smoke loop
    let t = rand(10)
    tickables.push({
      tick: dt => {
        t += dt
        const n = Math.sin(t * 9.2) * 0.5 + Math.sin(t * 23.7 + 1.7) * 0.3 + Math.sin(t * 4.1) * 0.2
        flame.scale.set(1 + 0.08 * n, 1 + 0.18 * n, 1 + 0.08 * n)
        flameCore.scale.set(1 + 0.1 * n, 1 + 0.24 * n, 1 + 0.1 * n)
        light.intensity = 15 + 3.5 * n
        halo.material.opacity = 0.15 + 0.05 * n
        for (const wp of wisps) {
          wp.p += dt * wp.speed
          if (wp.p >= 1) { wp.p -= 1; wp.drift = rand(TAU) }
          const k = wp.p
          wp.sp.position.set(
            Math.sin(wp.drift + k * 2.4) * (0.15 + k * 0.55),
            3.3 + k * 2.6,
            Math.cos(wp.drift + k * 1.8) * (0.15 + k * 0.55),
          )
          const sc = 0.7 + k * 1.7
          wp.sp.scale.set(sc, sc, 1)
          wp.sp.material.opacity = 0.2 * (k < 0.18 ? k / 0.18 : 1 - (k - 0.18) / 0.82)
        }
      },
    })
  }

  // ---------- bone-and-iron spawn gates ----------
  const gates = []
  const pillarGeo = new THREE.CylinderGeometry(0.26, 0.36, 3.6, 9)
  const gateBandGeo = new THREE.TorusGeometry(0.34, 0.06, 6, 14)
  const tuskGeo = new THREE.ConeGeometry(0.16, 1.5, 7)
  const spikeGeo = new THREE.ConeGeometry(0.09, 0.5, 6)
  const archGeo = new THREE.TorusGeometry(1.75, 0.09, 10, 26, Math.PI)
  const portalGeo = new THREE.CircleGeometry(1.15, 26)
  const barGeo = new THREE.BoxGeometry(0.07, 3.3, 0.07)
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) * TAU) / 6
    const g = new THREE.Group()
    g.position.set(Math.cos(a) * 25.3, 0, Math.sin(a) * 25.3)
    g.lookAt(0, 0, 0)
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(pillarGeo, bone)
      p.position.set(1.75 * s, 1.8, 0)
      p.castShadow = true
      g.add(p)
      for (const y of [0.9, 2.4]) {
        const band = new THREE.Mesh(gateBandGeo, ironDark)
        band.position.set(1.75 * s, y, 0)
        g.add(band)
      }
      // curved bone tusk leaning over the gate mouth
      const tusk = new THREE.Mesh(tuskGeo, bone)
      tusk.position.set(1.55 * s, 3.75, 0)
      tusk.rotation.z = 0.55 * s
      tusk.castShadow = true
      g.add(tusk)
      const spike = new THREE.Mesh(spikeGeo, ironDark)
      spike.position.set(1.75 * s, 3.85, 0)
      g.add(spike)
    }
    // ember arc: smolders faintly, flares only when a warband pours through
    const archMat = emberGlowMaterial(0.5, '#a03c14')
    const arch = new THREE.Mesh(archGeo, archMat)
    arch.position.y = 3.45
    g.add(arch)
    // heat-shimmer veil in the gate mouth — near-black with dying coals
    const portalMat = energyMaterial({ color1: '#120605', color2: '#94300f', speed: 0.85, intensity: 0.7 })
    portalMat.side = THREE.DoubleSide
    const portal = new THREE.Mesh(portalGeo, portalMat)
    portal.position.y = 1.8
    g.add(portal)
    // iron portcullis bars across the gate mouth
    for (const bx of [-1.05, -0.35, 0.35, 1.05]) {
      const bar = new THREE.Mesh(barGeo, ironDark)
      bar.position.set(bx, 1.75, 0.2)
      g.add(bar)
    }
    scene.add(g)
    gates.push({
      group: g,
      x: Math.cos(a) * 23.4,
      z: Math.sin(a) * 23.4,
      flash: 0,
      archMat,
      baseColor: archMat.color.clone(),
      portalMat,
      portal, // mesh — boss entrance cracks it wide
    })
  }

  // ---------- war banners on iron poles between the gates ----------
  const bannerTex = dirtOverlay(canvasTexture(128, 256, drawBanner), { amount: 0.5, edge: 0.4, speckle: 0.5, seed: 17 })
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.4, 8)
  const crossGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6)
  const clothGeo = new THREE.PlaneGeometry(1.3, 2.5)
  const clothMat = pbrMaterial({
    color: '#ffffff', roughness: 1, metalness: 0,
    maps: { map: bannerTex }, envMapIntensity: 0.2,
    transparent: true, side: THREE.DoubleSide,
  })
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3 + TAU / 12
    const g = new THREE.Group()
    g.position.set(Math.cos(a) * 27.6, 0, Math.sin(a) * 27.6)
    g.lookAt(0, 0, 0)
    const pole = new THREE.Mesh(poleGeo, ironDark)
    pole.position.y = 2.7
    pole.castShadow = true
    const cross = new THREE.Mesh(crossGeo, ironDark)
    cross.rotation.z = Math.PI / 2
    cross.position.y = 5.2
    const tip = new THREE.Mesh(spikeGeo, iron)
    tip.position.y = 5.6
    const cloth = new THREE.Mesh(clothGeo, clothMat)
    cloth.position.set(0, 3.9, 0.06)
    g.add(pole, cross, tip, cloth)
    scene.add(g)
    let t = rand(10)
    tickables.push({
      tick: dt => {
        t += dt
        cloth.rotation.x = 0.1 + Math.sin(t * 1.6) * 0.08
        cloth.rotation.y = Math.sin(t * 1.1) * 0.06
      },
    })
  }

  // ---------- ember updraft + drifting sparks over the battlefield ----------
  const updraft = emberUpdraft({ count: 80, radius: 34, top: 22 })
  scene.add(updraft)
  tickables.push(updraft)
  const sparks = fireflies({ count: 14, area: [46, 46], height: [0.6, 5], color: '#ffae5c', size: 0.3 })
  scene.add(sparks)
  tickables.push(sparks)

  // ---------- lighting: cool key vs warm torch pools, black blacks ----------
  // dim red hemisphere = distant lava scattered through the cavern haze
  scene.add(new THREE.HemisphereLight('#221a24', '#40160a', 0.3))
  // ember glow welling up through the center fissures
  const heart = new THREE.PointLight('#ff6a26', 5, 26, 2)
  heart.position.set(0, 4, 0)
  scene.add(heart)
  // single cool key (moonlight through the cavern mouth) — carries the shadows
  const dir = new THREE.DirectionalLight('#8b9cc2', 0.3)
  dir.position.set(18, 34, 8)
  dir.castShadow = true
  dir.shadow.mapSize.set(2048, 2048)
  dir.shadow.camera.left = -30
  dir.shadow.camera.right = 30
  dir.shadow.camera.top = 30
  dir.shadow.camera.bottom = -30
  dir.shadow.camera.near = 6
  dir.shadow.camera.far = 80
  dir.shadow.bias = -0.0005
  dir.shadow.normalBias = 0.03
  scene.add(dir)

  return { tickables, gates, rimMat, rimBase: rimMat.color.clone(), brazierPositions, fissureSurge }
}
