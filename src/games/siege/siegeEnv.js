import * as THREE from 'three'
import { starField, cloudLayer, fireflies } from '../../art/environment.js'
import { sky } from '../../art/sky.js'
import { horizonLayers } from '../../art/backdrop.js'
import { wyvernFlock } from '../../art/otherworld.js'
import {
  canvasTexture, glowTexture, cloudTexture,
  noiseField, normalMapFromHeight, roughnessTexture,
} from '../../core/assets.js'
import {
  fireMaterial, emberGlowMaterial, glowSpriteMaterial, pbrMaterial,
  stoneMaterial, woodMaterial, ironMaterial, clothMaterial, boneMaterial, contactShadow,
} from '../../art/materials.js'
import { rand, TAU } from '../../core/utils.js'

/** LAST BASTION battlefield: torchlit night before the keep gate. */
export const FIELD_R = 32
export const GROUND_R = 46
export const CITADEL_POS = { x: 0, z: 21 }

/** Lane waypoints [x,z] from the rim war-gates down to the bastion gate. */
export const LANES = {
  west: [[-20, -26], [-16.5, -14], [-11, -3], [-5.5, 7], [-1.4, 12.4]],
  east: [[20, -26], [16.5, -14], [11, -3], [5.5, 7], [1.4, 12.4]],
  center: [[0, -26], [0, -14], [0, -2], [0, 12.6]],
}
export const PAD_POSITIONS = [[-14, -13], [14, -13], [-8, -1], [8, -1], [-4.6, 8.6], [4.6, 8.6]]
export const PORTAL_POS = [{ x: -20, z: -26 }, { x: 20, z: -26 }]
/** Burning-camp world positions the intro cinematic frames on the horizon. */
export const WAR_CAMPS = [[-70, -128, 1.5], [38, -140, 2.1], [110, -100, 1.2], [-120, -60, 1]]
const FIRE_PITS = [[-25, -5, 2.3], [24, -9, 2.0], [13, -23, 1.8], [-26, 13, 1.9]]

const W2C = (x, w) => ((x / GROUND_R) + 1) * 0.5 * w

/** Min distance from (x,z) to any lane polyline segment. */
export function laneDistance(x, z) {
  let best = Infinity
  for (const lane of [LANES.west, LANES.east, LANES.center]) {
    for (let i = 0; i < lane.length - 1; i++) {
      const [ax, az] = lane[i], [bx, bz] = lane[i + 1]
      const dx = bx - ax, dz = bz - az
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
      const px = ax + dx * t - x, pz = az + dz * t - z
      best = Math.min(best, Math.hypot(px, pz))
    }
  }
  return best
}

function strokeLane(ctx, w, lane, style, lw, alpha, blur = 0, blurColor = null, offset = 0) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = style
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = blurColor || style }
  if (offset) ctx.translate(offset, 0)
  ctx.beginPath()
  ctx.moveTo(W2C(lane[0][0], w), W2C(lane[0][1], w))
  for (let i = 1; i < lane.length - 1; i++) {
    const mx = (lane[i][0] + lane[i + 1][0]) / 2, mz = (lane[i][1] + lane[i + 1][1]) / 2
    ctx.quadraticCurveTo(W2C(lane[i][0], w), W2C(lane[i][1], w), W2C(mx, w), W2C(mz, w))
  }
  const last = lane[lane.length - 1]
  ctx.lineTo(W2C(last[0], w), W2C(last[1], w))
  ctx.stroke()
  ctx.restore()
}

/** ALBEDO: war-trodden mud, packed-earth roads, flagstone plaza, scorch rings. */
function drawGround(ctx, w, h) {
  ctx.fillStyle = '#221b14'
  ctx.fillRect(0, 0, w, h)

  // churned-mud mottling — natural umber patches, damp charcoal dips
  for (let i = 0; i < 640; i++) {
    const x = rand(w), y = rand(h), s = rand(14, 90)
    ctx.globalAlpha = rand(0.05, 0.14)
    ctx.fillStyle = Math.random() < 0.5 ? '#33281c' : '#140f0a'
    ctx.fillRect(x, y, s, s * rand(0.4, 1))
  }
  for (let i = 0; i < 150; i++) {
    const x = rand(w), y = rand(h), r = rand(20, 80)
    const wg = ctx.createRadialGradient(x, y, 0, x, y, r)
    wg.addColorStop(0, Math.random() < 0.5 ? 'rgba(88,70,46,0.16)' : 'rgba(28,22,16,0.2)')
    wg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = 1
    ctx.fillStyle = wg
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
  }
  ctx.globalAlpha = 1

  // dirt roads: trampled dark verge, packed-earth bed, dry crown
  for (const lane of [LANES.west, LANES.east]) {
    strokeLane(ctx, w, lane, '#150f09', 62, 0.85)
    strokeLane(ctx, w, lane, '#2c2115', 44, 0.9)
    strokeLane(ctx, w, lane, '#382a1a', 26, 0.75)
    strokeLane(ctx, w, lane, '#443320', 9, 0.4)
    // wheel ruts: two darker tracks worn into the bed
    for (const off of [-9, 9]) strokeLane(ctx, w, lane, '#191207', 5, 0.55, 0, null, off)
  }
  strokeLane(ctx, w, LANES.center, '#1a140d', 40, 0.5)

  // bastion plaza: worn flagstones, mortar joints, no glow — light does the work
  const cx = W2C(CITADEL_POS.x, w), cz = W2C(CITADEL_POS.z, w)
  let g = ctx.createRadialGradient(cx, cz, 0, cx, cz, w * 0.1)
  g.addColorStop(0, 'rgba(66,61,52,0.9)')
  g.addColorStop(0.72, 'rgba(48,44,37,0.65)')
  g.addColorStop(1, 'rgba(28,22,16,0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(cx, cz, w * 0.1, 0, TAU); ctx.fill()
  ctx.save()
  ctx.strokeStyle = '#241f18'; ctx.globalAlpha = 0.55; ctx.lineWidth = 3
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * w * 0.02, cz + Math.sin(a) * w * 0.02)
    ctx.lineTo(cx + Math.cos(a) * w * 0.095, cz + Math.sin(a) * w * 0.095)
    ctx.stroke()
  }
  for (const rr of [0.045, 0.072, 0.094]) {
    ctx.beginPath(); ctx.arc(cx, cz, w * rr, 0, TAU); ctx.stroke()
  }
  ctx.restore()

  // war-camp gates: mud trampled black by the marching horde
  for (const p of PORTAL_POS) {
    const px = W2C(p.x, w), pz = W2C(p.z, w)
    const sg = ctx.createRadialGradient(px, pz, 0, px, pz, w * 0.05)
    sg.addColorStop(0, 'rgba(30,20,12,0.7)')
    sg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = sg
    ctx.beginPath(); ctx.arc(px, pz, w * 0.05, 0, TAU); ctx.fill()
  }

  // burning wreck pits: scorched earth ring + ash core (heat lives in emissive)
  for (const [x, z, r] of FIRE_PITS) {
    const px = W2C(x, w), pz = W2C(z, w), pr = (r / GROUND_R) * 0.5 * w
    const pg = ctx.createRadialGradient(px, pz, 0, px, pz, pr * 2.1)
    pg.addColorStop(0, '#171008')
    pg.addColorStop(0.4, '#241708')
    pg.addColorStop(0.75, 'rgba(20,12,5,0.5)')
    pg.addColorStop(1, 'rgba(20,12,5,0)')
    ctx.fillStyle = pg
    ctx.beginPath(); ctx.arc(px, pz, pr * 2.1, 0, TAU); ctx.fill()
  }

  // dry fissures
  for (let i = 0; i < 46; i++) {
    let x = rand(-GROUND_R * 0.97, GROUND_R * 0.97)
    let z = rand(-GROUND_R * 0.97, GROUND_R * 0.97)
    if (Math.hypot(x - CITADEL_POS.x, z - CITADEL_POS.z) < 11) continue
    if (laneDistance(x, z) < 2.0) continue
    let a = rand(TAU)
    ctx.save()
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#171208'
    ctx.lineWidth = 3.4
    ctx.globalAlpha = 0.65
    ctx.beginPath()
    ctx.moveTo(W2C(x, w), W2C(z, w))
    for (let s = 0, n = 3 + Math.floor(rand(5)); s < n; s++) {
      a += rand(-0.9, 0.9)
      x += Math.cos(a) * rand(1.2, 3.2)
      z += Math.sin(a) * rand(1.2, 3.2)
      ctx.lineTo(W2C(x, w), W2C(z, w))
    }
    ctx.stroke()
    ctx.restore()
  }
}

/**
 * EMISSIVE: true heat (fire-pit coal beds, dying embers) plus faint painted
 * torchlight pooling on the road verges — reads as firelight falloff without
 * spending 20 point lights.
 */
function drawGroundEmissive(ctx, w, h) {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)
  for (const lane of [LANES.west, LANES.east]) {
    for (const { x, z } of laneTorchPoints(lane)) {
      if (PAD_POSITIONS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 2.8)) continue
      if (Math.hypot(x - CITADEL_POS.x, z - CITADEL_POS.z) < 10) continue
      const px = W2C(x, w), pz = W2C(z, w), pr = (2.4 / GROUND_R) * 0.5 * w
      const tg = ctx.createRadialGradient(px, pz, 0, px, pz, pr)
      tg.addColorStop(0, 'rgba(255,140,60,0.22)')
      tg.addColorStop(0.5, 'rgba(200,80,24,0.1)')
      tg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = tg
      ctx.beginPath(); ctx.arc(px, pz, pr, 0, TAU); ctx.fill()
    }
  }
  for (const [x, z, r] of FIRE_PITS) {
    const px = W2C(x, w), pz = W2C(z, w), pr = (r / GROUND_R) * 0.5 * w
    const pg = ctx.createRadialGradient(px, pz, 0, px, pz, pr)
    pg.addColorStop(0, '#ff9a3c')
    pg.addColorStop(0.35, '#c2440e')
    pg.addColorStop(0.7, '#3a1204')
    pg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = pg
    ctx.beginPath(); ctx.arc(px, pz, pr, 0, TAU); ctx.fill()
    // dying embers kicked out around the pit
    for (let i = 0; i < 16; i++) {
      const a = rand(TAU), d = rand(pr * 0.9, pr * 3.0)
      ctx.globalAlpha = rand(0.2, 0.7)
      ctx.fillStyle = Math.random() < 0.5 ? '#ff7a2c' : '#8a2e08'
      ctx.beginPath(); ctx.arc(px + Math.cos(a) * d, pz + Math.sin(a) * d, rand(1.2, 3), 0, TAU); ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}

/** HEIGHT source for the ground normal map: mud undulation + wheel ruts. */
function groundNormalTexture() {
  const size = 512
  const field = noiseField(size, { octaves: 5, scale: 6, seed: 19 })
  // rasterize ruts/verge recesses, then subtract from the height field
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  for (const lane of [LANES.west, LANES.east]) {
    for (const off of [-2.2, 2.2]) strokeLane(ctx, size, lane, '#ffffff', 3, 0.8, 0, null, off)
    strokeLane(ctx, size, lane, '#666666', 12, 0.5) // packed bed sits slightly low
  }
  strokeLane(ctx, size, LANES.center, '#555555', 9, 0.5)
  const d = ctx.getImageData(0, 0, size, size).data
  for (let i = 0; i < field.length; i++) {
    field[i] = Math.max(0, field[i] * 0.72 + 0.14 - (d[i * 4] / 255) * 0.38)
  }
  return normalMapFromHeight(field, { strength: 2.0 })
}

/** Bare battlefield snag: leaning charred trunk + jagged branch spikes. */
function deadTree(mat, scale = 1) {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.2, 2.1, 6), mat)
  trunk.position.y = 1.05
  trunk.castShadow = true
  g.add(trunk)
  const n = 3 + Math.floor(rand(3))
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.05, rand(0.7, 1.3), 5), mat)
    b.position.set(rand(-0.12, 0.12), rand(0.9, 1.9), rand(-0.12, 0.12))
    b.rotation.set(rand(-1.2, 1.2), rand(TAU), rand(-1.2, 1.2))
    b.castShadow = true
    g.add(b)
  }
  g.add(contactShadow(0.5, 0.34))
  g.rotation.y = rand(TAU)
  g.scale.setScalar(scale)
  g.rotation.z = rand(-0.16, 0.16) / Math.max(0.6, scale)
  return g
}

/** Faceted granite crag — jittered icosahedron, shared PBR stone. */
function cragRock(mat, scale, tall = false) {
  const geo = new THREE.IcosahedronGeometry(0.55, 1)
  const p = geo.attributes.position
  const seed = rand(100)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const k = 0.7 + 0.5 * Math.abs(Math.sin((x * 12.9 + y * 7.1 + z * 3.7) + seed))
    p.setXYZ(i, x * k, y * k * (tall ? 1.9 : 0.85), z * k)
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, mat)
  m.scale.setScalar(scale)
  m.rotation.y = rand(TAU)
  m.castShadow = m.receiveShadow = true
  return m
}

/** Low drifting battle-smoke wisps — keep the mud floor alive in wide shots. */
function groundHaze() {
  const group = new THREE.Group()
  const tex = cloudTexture()
  const wisps = []
  for (let i = 0; i < 9; i++) {
    const warm = Math.random() < 0.4
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: warm ? '#3a2012' : '#14100f', transparent: true,
      opacity: rand(0.07, 0.14), depthWrite: false, rotation: rand(TAU),
    }))
    s.scale.set(rand(14, 26), rand(7, 12), 1)
    s.position.set(rand(-GROUND_R * 0.8, GROUND_R * 0.8), rand(1.3, 2.8), rand(-GROUND_R * 0.8, GROUND_R * 0.8))
    group.add(s)
    wisps.push({ s, vx: rand(0.5, 1.4), vz: rand(-0.35, 0.35), vr: rand(-0.05, 0.05) })
  }
  group.tick = dt => {
    for (const w of wisps) {
      w.s.position.x += w.vx * dt
      w.s.position.z += w.vz * dt
      w.s.material.rotation += w.vr * dt
      if (w.s.position.x > GROUND_R) w.s.position.x = -GROUND_R
      if (w.s.position.z > GROUND_R) w.s.position.z = -GROUND_R
      else if (w.s.position.z < -GROUND_R) w.s.position.z = GROUND_R
    }
  }
  return group
}

/**
 * Distant burning siege camp — reads as an atmospheric glow spot through the
 * haze: black ridge + tent silhouettes, layered firelight, rising smoke.
 */
function warCamp(x, z, s) {
  const g = new THREE.Group()
  // silhouettes only — fog + aerial perspective do the desaturation
  const ridgeMat = new THREE.MeshBasicMaterial({ color: '#0c090c' })
  const tentMat = new THREE.MeshBasicMaterial({ color: '#0f0a09' })
  const ridge = new THREE.Mesh(new THREE.ConeGeometry(26, 16, 8), ridgeMat)
  ridge.position.y = 5
  g.add(ridge)
  for (const [tx, tz, th] of [[-9, 6, 6.5], [0, 10, 8], [9, 5, 5.5], [-3, 14, 5]]) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(th * 0.62, th, 5), tentMat)
    tent.position.set(tx, th * 0.4, tz)
    g.add(tent)
  }
  // layered firelight bloom low against the ridge
  const glowWide = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: '#8a2c0c', transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  glowWide.scale.set(34, 15, 1)
  glowWide.position.y = 8
  const glowHot = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: '#ff6a26', transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  glowHot.scale.set(14, 8, 1)
  glowHot.position.y = 6.5
  g.add(glowWide, glowHot)
  const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
    map: cloudTexture(), color: '#191013', transparent: true, opacity: 0.5, depthWrite: false,
  }))
  smoke.scale.set(36, 26, 1)
  smoke.position.y = 24
  g.add(smoke)
  g.position.set(x, 0, z)
  g.scale.setScalar(s)
  let t = rand(10)
  g.tick = dt => {
    t += dt
    const k = 0.75 + 0.25 * Math.sin(t * 1.7) * Math.sin(t * 4.3)
    glowHot.material.opacity = 0.4 + 0.25 * k
    glowWide.material.opacity = 0.42 + 0.12 * k
  }
  return g
}

/** Torch positions marching along a lane polyline, alternating verges. */
function laneTorchPoints(lane, spacing = 6, offset = 2.1) {
  const pts = []
  let acc = spacing * 0.5, side = 1
  for (let i = 0; i < lane.length - 1; i++) {
    const [ax, az] = lane[i], [bx, bz] = lane[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const nx = -(bz - az) / len, nz = (bx - ax) / len
    let d = acc
    while (d < len) {
      const t = d / len
      pts.push({ x: ax + (bx - ax) * t + nx * offset * side, z: az + (bz - az) * t + nz * offset * side })
      side = -side
      d += spacing
    }
    acc = d - len
  }
  return pts
}

/** Crossed sharpened-stake barricade. */
function barricade(woodMat) {
  const g = new THREE.Group()
  const geo = new THREE.CylinderGeometry(0.05, 0.11, 2.2, 5)
  for (let i = 0; i < 4; i++) {
    const stake = new THREE.Mesh(geo, woodMat)
    stake.position.set(rand(-0.5, 0.5), 0.7, rand(-0.3, 0.3))
    stake.rotation.set(rand(-0.5, 0.5) + (i % 2 ? 0.8 : -0.8), rand(TAU), rand(-0.35, 0.35))
    stake.castShadow = true
    g.add(stake)
  }
  g.add(contactShadow(0.7, 0.32))
  g.rotation.y = rand(TAU)
  return g
}

/** Instanced ground clutter: pebbles, splinters, bone shards. One draw each. */
function scatterClutter(scene) {
  const tmp = new THREE.Object3D()
  const place = (mesh, count, sizeFn, colorFn, yFn) => {
    let n = 0
    for (let tries = 0; tries < count * 4 && n < count; tries++) {
      const a = rand(TAU), r = Math.sqrt(rand(0.02, 1)) * (FIELD_R + 6)
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      if (Math.hypot(x - CITADEL_POS.x, z - CITADEL_POS.z) < 9.5) continue
      if (PAD_POSITIONS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.8)) continue
      const s = sizeFn()
      tmp.position.set(x, yFn(s), z)
      tmp.rotation.set(rand(TAU), rand(TAU), rand(TAU))
      tmp.scale.setScalar(s)
      tmp.updateMatrix()
      mesh.setMatrixAt(n, tmp.matrix)
      if (colorFn) mesh.setColorAt(n, colorFn())
      n++
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.receiveShadow = true
    scene.add(mesh)
  }
  const c = new THREE.Color()
  const pebbles = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.09, 0),
    pbrMaterial({ color: '#6b655a', roughness: 1, metalness: 0, envMapIntensity: 0.15 }),
    170,
  )
  place(pebbles, 170, () => rand(0.4, 1.6), () => c.setHSL(0.09, rand(0.04, 0.14), rand(0.2, 0.38)), s => 0.05 * s)
  const splinters = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.05, 0.03, 0.55),
    pbrMaterial({ color: '#3f3122', roughness: 1, metalness: 0, envMapIntensity: 0.1 }),
    80,
  )
  place(splinters, 80, () => rand(0.5, 1.5), () => c.setHSL(0.08, rand(0.15, 0.3), rand(0.12, 0.24)), () => 0.02)
  const shards = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.09, 0),
    pbrMaterial({ color: '#8f866f', roughness: 0.7, metalness: 0, envMapIntensity: 0.3 }),
    46,
  )
  place(shards, 46, () => rand(0.5, 1.4), () => c.setHSL(0.1, rand(0.08, 0.18), rand(0.34, 0.5)), s => 0.04 * s)
}

/**
 * Builds the torchlit night battlefield before the bastion. Returns
 * { tickables, portals: [{x,z,flash,archMat,baseColor,portalMat,group}] }.
 */
export function buildSiegeWorld(scene) {
  const tickables = []

  // ---------- sky: moonless umber night, burning camps staining the horizon ----------
  scene.fog = new THREE.FogExp2('#150e12', 0.0085)
  // NOTE: dawn rig lerps uTop/uMid/uBottom/uSunColor — sky.js exposes the same
  // uniform names, and stars stay as Points so the rig can fade them by opacity
  const skyMesh = sky({
    top: '#07060e', mid: '#171017', bottom: '#2c1a1c',
    haze: '#38140e', hazeAmt: 0.3,
    sunDir: new THREE.Vector3(-0.3, 0.12, -0.9), sunColor: '#b23c16', sunSize: 14, sunBoost: 1.4,
    stars: 0,
    clouds: { color: '#2a1210', shade: '#100a0c', amount: 0.42, scale: 0.85, speed: 0.7 },
  })
  scene.add(skyMesh)
  // burned ridgelines behind the siege camps
  const ridges = horizonLayers({
    kind: 'peaks', count: 2, radius: [270, 380], height: [42, 60],
    colors: ['#1a1014', '#26141a'], seeds: [3, 61],
    firesOn: 0, fireColor: '#ff6a2b',
  })
  scene.add(ridges)
  tickables.push(ridges)
  // carrion wyverns wheeling over the burning camps
  const wyverns = wyvernFlock({ count: 4, radius: 180, height: 46, speed: 0.07, color: '#140d10', seed: 8 })
  scene.add(wyverns.group)
  tickables.push(wyverns)
  const starsWarm = starField({ count: 150, size: 1.7, color: '#ffd9b8' })
  const starsCool = starField({ count: 110, size: 1.4, color: '#c8d4ee' })
  starsWarm.material.opacity = 0.4
  starsCool.material.opacity = 0.34
  scene.add(starsWarm, starsCool)

  const smokeLow = cloudLayer({ count: 12, radius: 210, height: [24, 66], color: '#331410', opacity: 0.4, scale: [70, 140] })
  const smokeHigh = cloudLayer({ count: 9, radius: 190, height: [70, 120], color: '#120c10', opacity: 0.5, scale: [90, 170] })
  scene.add(smokeLow, smokeHigh)
  tickables.push(smokeLow, smokeHigh)

  // burning siege camps on the horizon — aerial-perspective glow spots
  for (const [cx, cz, cs] of WAR_CAMPS) {
    const camp = warCamp(cx, cz, cs)
    scene.add(camp)
    tickables.push(camp)
  }

  // ---------- ground: PBR mud with rutted roads, emissive only where coals burn ----------
  const groundTex = canvasTexture(2048, 2048, drawGround)
  const groundEmis = canvasTexture(1024, 1024, drawGroundEmissive)
  const groundNrm = groundNormalTexture()
  const groundRgh = roughnessTexture({ size: 256, base: 0.94, variation: 0.06, scale: 14, seed: 27 })
  groundRgh.repeat.set(9, 9)
  const groundMat = pbrMaterial({
    color: '#ffffff', roughness: 1.0, metalness: 0,
    maps: { map: groundTex, normalMap: groundNrm, roughnessMap: groundRgh },
    normalScale: 1.1, envMapIntensity: 0.12,
    emissive: '#ffffff', emissiveIntensity: 1.1,
  })
  groundMat.emissiveMap = groundEmis
  const ground = new THREE.Mesh(new THREE.CircleGeometry(GROUND_R, 72), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // shared PBR materials for the props
  const woodMat = woodMaterial('#8a7866')
  const woodDark = woodMaterial('#544639')
  const charredMat = pbrMaterial({ color: '#231a14', roughness: 0.98, metalness: 0, envMapIntensity: 0.12 })
  const ironMat = ironMaterial('#585c64')
  const stoneMat = stoneMaterial('#635e55')
  stoneMat.flatShading = true

  // shared flame shaders (auto-ticked) — intensities sit just over the bloom
  // threshold so flames glow without ballooning into white orbs from above
  const torchFire = fireMaterial({ intensity: 1.85, speed: 1.7 })
  const pitFire = fireMaterial({ intensity: 1.8, speed: 1.2, midColor: '#ff7a26' })

  // burning wreck pits: charred beams + real flames + warm falloff light
  const pitFlameGeo = new THREE.ConeGeometry(0.5, 1.5, 8)
  pitFlameGeo.translate(0, 0.75, 0)
  for (const [x, z, r] of FIRE_PITS) {
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, r * 1.1, 5), charredMat)
      const a = rand(TAU)
      log.position.set(x + Math.cos(a) * r * 0.3, 0.35, z + Math.sin(a) * r * 0.3)
      log.rotation.set(rand(0.9, 1.4), rand(TAU), 0)
      log.castShadow = true
      scene.add(log)
    }
    const flames = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(pitFlameGeo, pitFire)
      const a = rand(TAU)
      f.position.set(Math.cos(a) * r * 0.25, 0.15, Math.sin(a) * r * 0.25)
      f.scale.set(rand(0.7, 1.1) * r * 0.5, rand(0.8, 1.3) * r * 0.5, rand(0.7, 1.1) * r * 0.5)
      f.rotation.y = rand(TAU)
      flames.add(f)
    }
    flames.position.set(x, 0, z)
    scene.add(flames)
    const l = new THREE.PointLight('#ff7a34', 9, 12, 2)
    l.position.set(x, 1.5, z)
    scene.add(l)
    let t = rand(10)
    flames.tick = dt => {
      t += dt
      l.intensity = 8 + 2.2 * Math.sin(t * 7.3) * Math.sin(t * 3.1)
    }
    tickables.push(flames)
  }

  // ---------- torch-lined lanes ----------
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.08, 2.0, 6)
  const collarGeo = new THREE.TorusGeometry(0.075, 0.02, 5, 10)
  const flameGeo = new THREE.ConeGeometry(0.15, 0.58, 7)
  flameGeo.translate(0, 0.29, 0)
  const torchFlames = []
  const torches = new THREE.Group()
  for (const lane of [LANES.west, LANES.east]) {
    for (const { x, z } of laneTorchPoints(lane)) {
      if (PAD_POSITIONS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 2.8)) continue
      if (Math.hypot(x - CITADEL_POS.x, z - CITADEL_POS.z) < 10) continue
      const g = new THREE.Group()
      const pole = new THREE.Mesh(poleGeo, woodDark)
      pole.position.y = 1.0
      pole.castShadow = true
      const collar = new THREE.Mesh(collarGeo, ironMat)
      collar.rotation.x = Math.PI / 2
      collar.position.y = 1.95
      const flame = new THREE.Mesh(flameGeo, torchFire)
      flame.position.y = 2.0
      const halo = new THREE.Sprite(glowSpriteMaterial('#ff8a34', 0.12))
      halo.scale.setScalar(1.25)
      halo.position.y = 2.3
      g.add(pole, collar, flame, halo, contactShadow(0.3, 0.3))
      g.position.set(x, 0, z)
      g.rotation.y = rand(TAU)
      torches.add(g)
      torchFlames.push({ flame, halo, phase: rand(TAU) })
    }
  }
  let torchT = rand(10)
  torches.tick = dt => {
    torchT += dt
    for (const tf of torchFlames) {
      const k = 0.75 + 0.25 * Math.sin(torchT * 7 + tf.phase) * Math.sin(torchT * 3.1 + tf.phase * 2)
      tf.halo.material.opacity = 0.08 + 0.07 * k
      tf.flame.scale.y = 0.85 + 0.3 * k
    }
  }
  scene.add(torches)
  tickables.push(torches)

  // ---------- scattered props (off-lane) ----------
  for (let i = 0; i < 26; i++) {
    const a = rand(TAU), r = rand(8, FIELD_R - 1)
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    if (laneDistance(x, z) < 3.4) continue
    if (Math.hypot(x - CITADEL_POS.x, z - CITADEL_POS.z) < 10.5) continue
    if (PAD_POSITIONS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 3)) continue
    const roll = Math.random()
    let prop
    if (roll < 0.55) {
      prop = new THREE.Group()
      prop.add(cragRock(stoneMat, rand(0.7, 1.7), Math.random() < 0.3), contactShadow(0.8, 0.32))
      prop.position.y = 0.15
    } else prop = roll < 0.82 ? deadTree(charredMat, rand(0.8, 1.3)) : barricade(woodDark)
    prop.position.x = x
    prop.position.z = z
    scene.add(prop)
  }
  // jagged rim ridge framing the field
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * TAU + rand(0.12)
    const r = rand(FIELD_R + 3, GROUND_R - 3)
    const rock = cragRock(stoneMat, rand(2.2, 4.6), i % 3 === 0)
    rock.position.set(Math.cos(a) * r, rand(0.1, 0.5), Math.sin(a) * r)
    scene.add(rock)
  }

  // instanced pebbles / splinters / bone shards
  scatterClutter(scene)

  // drifting battle haze
  const haze = groundHaze()
  scene.add(haze)
  tickables.push(haze)

  // drifting embers
  const embers = fireflies({ count: 64, area: [66, 66], height: [0.4, 7], color: '#ff8a34', size: 0.4 })
  const sparks = fireflies({ count: 22, area: [18, 18], height: [1, 9], color: '#ffc27a', size: 0.55 })
  sparks.position.set(-24, 0, -4)
  scene.add(embers, sparks)
  tickables.push(embers, sparks)

  // ---------- rim war-gates: charred timber arches breached with fire ----------
  const portals = []
  const postGeo = new THREE.BoxGeometry(0.7, 4.4, 0.7)
  const postMat = woodMaterial('#4a3a2c')
  const spikeMat = charredMat
  const beamGeo = new THREE.BoxGeometry(5.4, 0.55, 0.8)
  const stakeGeo = new THREE.CylinderGeometry(0.06, 0.14, 2.6, 5)
  const bannerGeo = new THREE.PlaneGeometry(1.15, 1.7)
  const bannerMat = clothMaterial('#54211e')
  const skullMat = boneMaterial('#c9bda2')
  const portalGeo = new THREE.CircleGeometry(1.8, 26)
  for (const { x, z } of PORTAL_POS) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.lookAt(x * 0.4, 0, 0)
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, postMat)
      p.position.set(2.1 * s, 2.2, 0)
      p.castShadow = true
      g.add(p)
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 5), spikeMat)
      spike.position.set(2.1 * s, 4.9, 0)
      g.add(spike)
      const cs = contactShadow(0.7, 0.4)
      cs.position.x = 2.1 * s
      g.add(cs)
      // palisade wing of sharpened stakes
      for (let i = 0; i < 3; i++) {
        const st = new THREE.Mesh(stakeGeo, postMat)
        st.position.set((2.9 + i * 0.75) * s, 1.0, rand(-0.3, 0.3))
        st.rotation.set(rand(-0.2, 0.2), 0, -0.5 * s + rand(-0.15, 0.15))
        st.castShadow = true
        g.add(st)
      }
    }
    const beam = new THREE.Mesh(beamGeo, postMat)
    beam.position.y = 4.35
    beam.castShadow = true
    g.add(beam)
    // ember trim on the crossbeam — flares when a raider comes through
    const archMat = emberGlowMaterial(1.3, '#ff5a1e')
    const trim = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.12, 0.14), archMat)
    trim.position.set(0, 4.1, 0.42)
    g.add(trim)
    for (const s of [-1, 1]) {
      const skull = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), skullMat)
      skull.position.set(2.1 * s, 4.72, 0.3)
      g.add(skull)
    }
    // ragged war banner hung from the beam
    const banner = new THREE.Mesh(bannerGeo, bannerMat)
    banner.position.set(0, 3.15, -0.18)
    g.add(banner)
    // the breach itself: a standing wall of fire the horde marches out of
    const portalMat = fireMaterial({ intensity: 2.1, speed: 1.1, midColor: '#ff7a2e' })
    const disc = new THREE.Mesh(portalGeo, portalMat)
    disc.position.y = 2.2
    g.add(disc)
    scene.add(g)
    const light = new THREE.PointLight('#ff5a1e', 18, 16, 2)
    light.position.set(x * 0.92, 3, z * 0.92)
    scene.add(light)
    portals.push({ group: g, x: x * 0.94, z: z * 0.9, flash: 0, archMat, baseColor: archMat.color.clone(), portalMat })
  }

  // ---------- lighting: cool moon key vs warm fire fill, blacks stay black ----------
  const hemi = new THREE.HemisphereLight('#252e45', '#150e0b', 0.22)
  scene.add(hemi)
  const moon = new THREE.DirectionalLight('#7f97d8', 0.4)
  moon.position.set(16, 30, -14)
  moon.castShadow = true
  moon.shadow.mapSize.set(2048, 2048)
  moon.shadow.camera.left = -36
  moon.shadow.camera.right = 36
  moon.shadow.camera.top = 36
  moon.shadow.camera.bottom = -36
  moon.shadow.camera.near = 6
  moon.shadow.camera.far = 80
  moon.shadow.bias = -0.0005
  moon.shadow.normalBias = 0.02
  scene.add(moon)

  const dawn = buildDawnRig(scene, { sky: skyMesh, hemi, moon, stars: [starsWarm, starsCool] })

  return { tickables, portals, dawn }
}

/**
 * Victory-dawn rig — presentation only. `set(k)` lerps the night grade
 * (sky uniforms, fog, hemisphere, key light, stars) toward a warm daybreak
 * and fades a rising-sun glow in over the burned-out camps on the horizon.
 */
function buildDawnRig(scene, { sky, hemi, moon, stars }) {
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: '#ffbe6d', transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  sun.scale.set(180, 105, 1)
  sun.position.set(46, 10, -185)
  sun.visible = false // a near-fullscreen transparent quad — never pay for it at night
  scene.add(sun)
  const C = (a, b) => [new THREE.Color(a), new THREE.Color(b)]
  const ramp = {
    top: C('#07060e', '#2e3557'), mid: C('#171017', '#8a4e38'), bottom: C('#2c1a1c', '#ff9a55'),
    sunCol: C('#b23c16', '#ffcf8a'), fog: C('#150e12', '#553427'),
    hemiSky: C('#252e45', '#8a6851'), hemiGnd: C('#150e0b', '#3a2a1e'), key: C('#7f97d8', '#ffc27f'),
  }
  const starOp = stars.map(s => s.material.opacity)
  const u = sky.material.uniforms
  return {
    set(k) {
      u.uTop.value.lerpColors(...ramp.top, k)
      u.uMid.value.lerpColors(...ramp.mid, k)
      u.uBottom.value.lerpColors(...ramp.bottom, k)
      u.uSunColor.value.lerpColors(...ramp.sunCol, k)
      scene.fog.color.lerpColors(...ramp.fog, k)
      hemi.color.lerpColors(...ramp.hemiSky, k)
      hemi.groundColor.lerpColors(...ramp.hemiGnd, k)
      hemi.intensity = 0.22 + 0.55 * k
      moon.color.lerpColors(...ramp.key, k)
      moon.intensity = 0.4 + 0.85 * k
      stars.forEach((s, i) => { s.material.opacity = starOp[i] * (1 - k) })
      sun.visible = k > 0.01
      sun.material.opacity = 0.85 * k
    },
  }
}
