import * as THREE from 'three'
import { skyDome, starField, cloudLayer, fireflies } from '../../art/environment.js'
import { canvasTexture, glowTexture, cloudTexture } from '../../core/assets.js'
import { glowMaterial, glowSpriteMaterial, energyMaterial, toonMaterial } from '../../art/materials.js'
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

function strokeLane(ctx, w, lane, style, lw, alpha, blur = 0, blurColor = null) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = style
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (blur) { ctx.shadowBlur = blur; ctx.shadowColor = blurColor || style }
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

/** War-trodden earth + dirt roads + flagstone plaza + burning wreck pits. */
function drawGround(ctx, w, h) {
  ctx.fillStyle = '#100b07'
  ctx.fillRect(0, 0, w, h)

  // churned-mud mottling — cold charcoal with warm umber patches
  for (let i = 0; i < 560; i++) {
    const x = rand(w), y = rand(h), s = rand(14, 90)
    ctx.globalAlpha = rand(0.05, 0.13)
    ctx.fillStyle = Math.random() < 0.5 ? '#241709' : '#090604'
    ctx.fillRect(x, y, s, s * rand(0.4, 1))
  }
  for (let i = 0; i < 130; i++) {
    const x = rand(w), y = rand(h), r = rand(20, 80)
    const wg = ctx.createRadialGradient(x, y, 0, x, y, r)
    wg.addColorStop(0, 'rgba(74,53,34,0.15)')
    wg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = 1
    ctx.fillStyle = wg
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
  }
  ctx.globalAlpha = 1

  // dirt roads: packed earth with a faint torch under-glow along the verges
  for (const lane of [LANES.west, LANES.east]) {
    strokeLane(ctx, w, lane, '#ff8c3b', 66, 0.04, 22)
    strokeLane(ctx, w, lane, '#1d140c', 56, 0.9)
    strokeLane(ctx, w, lane, '#2b1f12', 40, 0.85)
    strokeLane(ctx, w, lane, '#382917', 22, 0.65)
    strokeLane(ctx, w, lane, '#463420', 8, 0.38)
  }
  strokeLane(ctx, w, LANES.center, '#1a110b', 40, 0.55)

  // bastion plaza: worn flagstones ringed by a cold warding inscription
  const cx = W2C(CITADEL_POS.x, w), cz = W2C(CITADEL_POS.z, w)
  let g = ctx.createRadialGradient(cx, cz, 0, cx, cz, w * 0.1)
  g.addColorStop(0, 'rgba(46,42,35,0.85)')
  g.addColorStop(0.72, 'rgba(32,28,24,0.6)')
  g.addColorStop(1, 'rgba(16,11,8,0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(cx, cz, w * 0.1, 0, TAU); ctx.fill()
  // flagstone joints
  ctx.save()
  ctx.strokeStyle = '#14100c'; ctx.globalAlpha = 0.5; ctx.lineWidth = 3
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * w * 0.02, cz + Math.sin(a) * w * 0.02)
    ctx.lineTo(cx + Math.cos(a) * w * 0.095, cz + Math.sin(a) * w * 0.095)
    ctx.stroke()
  }
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = '#cfe4ff'; ctx.globalAlpha = 0.2; ctx.lineWidth = 4
  ctx.shadowColor = '#cfe4ff'; ctx.shadowBlur = 10
  ctx.beginPath(); ctx.arc(cx, cz, w * 0.088, 0, TAU); ctx.stroke()
  ctx.setLineDash([26, 18]); ctx.globalAlpha = 0.12
  ctx.beginPath(); ctx.arc(cx, cz, w * 0.07, 0, TAU); ctx.stroke()
  ctx.restore()

  // war-camp gates: trampled mustering grounds lit by the camp fires
  for (const p of PORTAL_POS) {
    const px = W2C(p.x, w), pz = W2C(p.z, w)
    const sg = ctx.createRadialGradient(px, pz, 0, px, pz, w * 0.05)
    sg.addColorStop(0, 'rgba(255,110,50,0.45)')
    sg.addColorStop(0.6, 'rgba(64,26,12,0.55)')
    sg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = sg
    ctx.beginPath(); ctx.arc(px, pz, w * 0.05, 0, TAU); ctx.fill()
  }

  // burning wreck pits: bonfire cores
  for (const [x, z, r] of FIRE_PITS) {
    const px = W2C(x, w), pz = W2C(z, w), pr = (r / GROUND_R) * 0.5 * w
    const pg = ctx.createRadialGradient(px, pz, 0, px, pz, pr * 1.7)
    pg.addColorStop(0, '#f0a050')
    pg.addColorStop(0.32, '#b2440e')
    pg.addColorStop(0.62, '#521804')
    pg.addColorStop(1, 'rgba(20,6,2,0)')
    ctx.fillStyle = pg
    ctx.beginPath(); ctx.arc(px, pz, pr * 1.7, 0, TAU); ctx.fill()
  }

  // dry fissures + scattered dying embers (dark cracks, sparse warm specks)
  for (let i = 0; i < 46; i++) {
    let x = rand(-GROUND_R * 0.97, GROUND_R * 0.97)
    let z = rand(-GROUND_R * 0.97, GROUND_R * 0.97)
    if (Math.hypot(x - CITADEL_POS.x, z - CITADEL_POS.z) < 11) continue
    if (laneDistance(x, z) < 2.0) continue
    let a = rand(TAU)
    ctx.save()
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0a0705'
    ctx.lineWidth = 3.4
    ctx.globalAlpha = 0.7
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
  ctx.save()
  ctx.shadowColor = '#ff8c3b'
  ctx.shadowBlur = 8
  for (const [x, z, r] of FIRE_PITS) {
    for (let i = 0; i < 14; i++) {
      const a = rand(TAU), d = rand(r * 0.8, r * 3.2)
      const px = W2C(x + Math.cos(a) * d, w), pz = W2C(z + Math.sin(a) * d, w)
      ctx.globalAlpha = rand(0.25, 0.6)
      ctx.fillStyle = Math.random() < 0.5 ? '#ff8c3b' : '#b2440e'
      ctx.beginPath(); ctx.arc(px, pz, rand(1.5, 3.5), 0, TAU); ctx.fill()
    }
  }
  ctx.restore()
}

/** Bare battlefield snag: leaning charred trunk + jagged branch spikes. */
function deadTree(scale = 1) {
  const g = new THREE.Group()
  const mat = toonMaterial({ color: '#241712', rim: '#c98a4a', rimStrength: 0.3 })
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
  g.rotation.z = rand(-0.16, 0.16)
  g.rotation.y = rand(TAU)
  g.scale.setScalar(scale)
  return g
}

/** Faceted granite crag (flat normals baked, toon rim safe). */
function cragRock(scale, tall = false) {
  const geo = new THREE.IcosahedronGeometry(0.55, 0)
  const p = geo.attributes.position
  const seed = rand(100)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const k = 0.7 + 0.55 * Math.abs(Math.sin((x * 12.9 + y * 7.1 + z * 3.7) + seed))
    p.setXYZ(i, x * k, y * k * (tall ? 1.9 : 0.85), z * k)
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, toonMaterial({ color: '#2a241d', rim: '#c9924f', rimStrength: 0.45 }))
  m.scale.setScalar(scale)
  m.rotation.y = rand(TAU)
  m.castShadow = true
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
      map: tex, color: warm ? '#4a2410' : '#171017', transparent: true,
      opacity: rand(0.09, 0.17), depthWrite: false, rotation: rand(TAU),
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

/** Distant burning siege camp: dark ridge, war tents, a great bonfire glow. */
function warCamp(x, z, s) {
  const g = new THREE.Group()
  const ridgeMat = toonMaterial({ color: '#150d10', rim: '#4a1f14', rimStrength: 0.3 })
  const ridge = new THREE.Mesh(new THREE.ConeGeometry(26, 16, 8), ridgeMat)
  ridge.position.y = 5
  g.add(ridge)
  const tentMat = toonMaterial({ color: '#20130c', rim: '#ff7a3a', rimStrength: 0.45 })
  for (const [tx, tz, th] of [[-9, 6, 6.5], [0, 10, 8], [9, 5, 5.5], [-3, 14, 5]]) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(th * 0.62, th, 5), tentMat)
    tent.position.set(tx, th * 0.4, tz)
    g.add(tent)
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: '#ff5a26', transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  glow.scale.set(30, 16, 1)
  glow.position.y = 10
  g.add(glow)
  const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
    map: cloudTexture(), color: '#2a1410', transparent: true, opacity: 0.55, depthWrite: false,
  }))
  smoke.scale.set(36, 26, 1)
  smoke.position.y = 26
  g.add(smoke)
  g.position.set(x, 0, z)
  g.scale.setScalar(s)
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
  g.rotation.y = rand(TAU)
  return g
}

/**
 * Builds the torchlit night battlefield before the bastion. Returns
 * { tickables, portals: [{x,z,flash,archMat,baseColor,portalMat,group}] }.
 */
export function buildSiegeWorld(scene) {
  const tickables = []

  // ---------- sky: deep umber night over burning camps ----------
  scene.fog = new THREE.Fog('#241418', 52, 210)
  scene.add(skyDome({
    top: '#120b1c', mid: '#2a1622', bottom: '#3a2030',
    sunDir: new THREE.Vector3(-0.3, 0.14, -0.9), sunColor: '#ff5a26', sunSize: 26,
  }))
  scene.add(starField({ count: 420, size: 2.4, color: '#ffc9a0' }))
  scene.add(starField({ count: 260, size: 1.8, color: '#d9e4ff' }))

  const smokeLow = cloudLayer({ count: 12, radius: 210, height: [24, 66], color: '#5c2214', opacity: 0.52, scale: [70, 140] })
  const smokeHigh = cloudLayer({ count: 9, radius: 190, height: [70, 120], color: '#241318', opacity: 0.6, scale: [90, 170] })
  scene.add(smokeLow, smokeHigh)
  tickables.push(smokeLow, smokeHigh)

  // burning siege camps on the horizon
  scene.add(warCamp(-70, -128, 1.5), warCamp(38, -140, 2.1), warCamp(110, -100, 1.2), warCamp(-120, -60, 1))

  // ---------- ground ----------
  const groundTex = canvasTexture(2048, 2048, drawGround)
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(GROUND_R, 72),
    new THREE.MeshStandardMaterial({
      map: groundTex, emissiveMap: groundTex, emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.6, roughness: 0.92, metalness: 0.05,
    }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // shared timber/iron materials for props
  const woodMat = toonMaterial({ color: '#4a352a', rim: '#c9a578', rimStrength: 0.3 })
  const woodDark = toonMaterial({ color: '#2e211a', rim: '#8a6a45', rimStrength: 0.25 })
  const ironMat = toonMaterial({ color: '#494d55', rim: '#b9b2a2', rimStrength: 0.3 })

  // burning wreck pits: charred beams + fire glow
  for (const [x, z, r] of FIRE_PITS) {
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, r * 1.1, 5), woodDark)
      const a = rand(TAU)
      log.position.set(x + Math.cos(a) * r * 0.3, 0.35, z + Math.sin(a) * r * 0.3)
      log.rotation.set(rand(0.9, 1.4), rand(TAU), 0)
      log.castShadow = true
      scene.add(log)
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: '#ff6a26', transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    s.scale.set(r * 2.4, r * 1.3, 1)
    s.position.set(x, 0.55, z)
    scene.add(s)
    let t = rand(10)
    s.tick = dt => { t += dt; s.material.opacity = 0.16 + 0.08 * Math.sin(t * 2.4) }
    tickables.push(s)
    const l = new THREE.PointLight('#ff6a26', 13, 13, 2)
    l.position.set(x, 1.6, z)
    scene.add(l)
  }

  // ---------- torch-lined lanes ----------
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.08, 2.0, 6)
  const collarGeo = new THREE.TorusGeometry(0.075, 0.02, 5, 10)
  const flameGeo = new THREE.ConeGeometry(0.11, 0.34, 6)
  const flameMat = glowMaterial('#ffb84d', 2.2)
  const torchFlames = []
  const torches = new THREE.Group()
  for (const lane of [LANES.west, LANES.east]) {
    for (const { x, z } of laneTorchPoints(lane)) {
      if (PAD_POSITIONS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 2.8)) continue
      if (Math.hypot(x - CITADEL_POS.x, z - CITADEL_POS.z) < 10) continue
      const g = new THREE.Group()
      const pole = new THREE.Mesh(poleGeo, woodMat)
      pole.position.y = 1.0
      pole.castShadow = true
      const collar = new THREE.Mesh(collarGeo, ironMat)
      collar.rotation.x = Math.PI / 2
      collar.position.y = 1.95
      const flame = new THREE.Mesh(flameGeo, flameMat)
      flame.position.y = 2.2
      const halo = new THREE.Sprite(glowSpriteMaterial('#ff9a3c', 0.5))
      halo.scale.setScalar(1.7)
      halo.position.y = 2.25
      g.add(pole, collar, flame, halo)
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
      tf.halo.material.opacity = 0.32 + 0.22 * k
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
    const prop = roll < 0.55 ? cragRock(rand(0.7, 1.7), Math.random() < 0.3)
      : roll < 0.82 ? deadTree(rand(0.8, 1.3))
      : barricade(woodDark)
    prop.position.set(x, prop.type === 'Mesh' ? 0.2 : 0, z)
    scene.add(prop)
  }
  // jagged rim ridge framing the field
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * TAU + rand(0.12)
    const r = rand(FIELD_R + 3, GROUND_R - 3)
    const rock = cragRock(rand(2.2, 4.6), i % 3 === 0)
    rock.position.set(Math.cos(a) * r, rand(0.2, 0.7), Math.sin(a) * r)
    scene.add(rock)
  }

  // drifting battle haze
  const haze = groundHaze()
  scene.add(haze)
  tickables.push(haze)

  // drifting embers
  const embers = fireflies({ count: 70, area: [66, 66], height: [0.4, 7], color: '#ff9a3c', size: 0.5 })
  const sparks = fireflies({ count: 26, area: [18, 18], height: [1, 9], color: '#ffd27a', size: 0.7 })
  sparks.position.set(-24, 0, -4)
  scene.add(embers, sparks)
  tickables.push(embers, sparks)

  // ---------- rim war-gates: timber arches breached with fire ----------
  const portals = []
  const postGeo = new THREE.BoxGeometry(0.7, 4.4, 0.7)
  const postMat = toonMaterial({ color: '#2e1d14', rim: '#ff7a4a', rimStrength: 0.5 })
  const beamGeo = new THREE.BoxGeometry(5.4, 0.55, 0.8)
  const stakeGeo = new THREE.CylinderGeometry(0.06, 0.14, 2.6, 5)
  const bannerGeo = new THREE.PlaneGeometry(1.15, 1.7)
  const bannerMat = toonMaterial({
    color: '#6e1a1e', rim: '#ff8c5c', rimStrength: 0.4, side: THREE.DoubleSide,
    emissive: '#4a1012', emissiveIntensity: 0.8,
  })
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
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 5), postMat)
      spike.position.set(2.1 * s, 4.9, 0)
      g.add(spike)
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
    // ember-rune trim on the crossbeam — flashes when a raider comes through
    const archMat = glowMaterial('#ff5a1e', 1.6)
    const trim = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.12, 0.14), archMat)
    trim.position.set(0, 4.1, 0.42)
    g.add(trim)
    for (const s of [-1, 1]) {
      const skull = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), archMat)
      skull.position.set(2.1 * s, 4.72, 0.3)
      g.add(skull)
    }
    // ragged war banner hung from the beam
    const banner = new THREE.Mesh(bannerGeo, bannerMat)
    banner.position.set(0, 3.15, -0.18)
    g.add(banner)
    // the breach itself: a standing wall of fire the horde marches out of
    const portalMat = energyMaterial({ color1: '#3a0d08', color2: '#ff6a2e', speed: 1.7, intensity: 1.15 })
    portalMat.side = THREE.DoubleSide
    const disc = new THREE.Mesh(portalGeo, portalMat)
    disc.position.y = 2.2
    g.add(disc)
    scene.add(g)
    const light = new THREE.PointLight('#ff5a1e', 26, 18, 2)
    light.position.set(x * 0.92, 3, z * 0.92)
    scene.add(light)
    portals.push({ group: g, x: x * 0.94, z: z * 0.9, flash: 0, archMat, baseColor: archMat.color.clone(), portalMat })
  }

  // ---------- lighting ----------
  scene.add(new THREE.HemisphereLight('#4a2a36', '#120a0e', 0.8))
  const moon = new THREE.DirectionalLight('#93aaff', 1.05)
  moon.position.set(16, 30, -14)
  moon.castShadow = true
  moon.shadow.mapSize.set(2048, 2048)
  moon.shadow.camera.left = -36
  moon.shadow.camera.right = 36
  moon.shadow.camera.top = 36
  moon.shadow.camera.bottom = -36
  moon.shadow.camera.near = 6
  moon.shadow.camera.far = 80
  moon.shadow.bias = -0.0004
  scene.add(moon)

  return { tickables, portals }
}
