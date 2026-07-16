import * as THREE from 'three'
import { skyDome, starField, cloudLayer, fireflies } from '../../art/environment.js'
import { canvasTexture, glowTexture } from '../../core/assets.js'
import { glowMaterial, energyMaterial, toonMaterial } from '../../art/materials.js'
import { rand, TAU } from '../../core/utils.js'

/** SIEGE PROTOCOL battlefield: night volcanic assault. */
export const FIELD_R = 32
export const GROUND_R = 46
export const CITADEL_POS = { x: 0, z: 21 }

/** Lane waypoints [x,z] from the rim portals down to the citadel gate. */
export const LANES = {
  west: [[-20, -26], [-16.5, -14], [-11, -3], [-5.5, 7], [-1.4, 12.4]],
  east: [[20, -26], [16.5, -14], [11, -3], [5.5, 7], [1.4, 12.4]],
  center: [[0, -26], [0, -14], [0, -2], [0, 12.6]],
}
export const PAD_POSITIONS = [[-14, -13], [14, -13], [-8, -1], [8, -1], [-4.6, 8.6], [4.6, 8.6]]
export const PORTAL_POS = [{ x: -20, z: -26 }, { x: 20, z: -26 }]
const LAVA_POOLS = [[-25, -5, 2.3], [24, -9, 2.0], [13, -23, 1.8], [-26, 13, 1.9]]

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

/** Dark basalt + emissive lava cracks + trampled lane paths. */
function drawGround(ctx, w, h) {
  ctx.fillStyle = '#0c0709'
  ctx.fillRect(0, 0, w, h)

  // basalt slab mottling — cool blacks with warm ash patches
  for (let i = 0; i < 560; i++) {
    const x = rand(w), y = rand(h), s = rand(14, 90)
    ctx.globalAlpha = rand(0.05, 0.13)
    ctx.fillStyle = Math.random() < 0.5 ? '#170d11' : '#040203'
    ctx.fillRect(x, y, s, s * rand(0.4, 1))
  }
  for (let i = 0; i < 130; i++) {
    const x = rand(w), y = rand(h), r = rand(20, 80)
    const wg = ctx.createRadialGradient(x, y, 0, x, y, r)
    wg.addColorStop(0, 'rgba(64,26,14,0.16)')
    wg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = 1
    ctx.fillStyle = wg
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
  }
  ctx.globalAlpha = 1

  // trampled lane paths: scorched earth with a faint molten under-glow rim
  for (const lane of [LANES.west, LANES.east]) {
    strokeLane(ctx, w, lane, '#ff5a1e', 66, 0.08, 30)
    strokeLane(ctx, w, lane, '#26120c', 56, 0.9)
    strokeLane(ctx, w, lane, '#341c12', 38, 0.8)
    strokeLane(ctx, w, lane, '#452817', 14, 0.5)
  }
  strokeLane(ctx, w, LANES.center, '#1d0e0e', 40, 0.55)

  // citadel plaza
  const cx = W2C(CITADEL_POS.x, w), cz = W2C(CITADEL_POS.z, w)
  let g = ctx.createRadialGradient(cx, cz, 0, cx, cz, w * 0.1)
  g.addColorStop(0, 'rgba(42,42,58,0.8)')
  g.addColorStop(0.72, 'rgba(28,28,40,0.6)')
  g.addColorStop(1, 'rgba(16,10,16,0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(cx, cz, w * 0.1, 0, TAU); ctx.fill()
  ctx.save()
  ctx.strokeStyle = '#54e0ff'; ctx.globalAlpha = 0.26; ctx.lineWidth = 4
  ctx.shadowColor = '#54e0ff'; ctx.shadowBlur = 12
  ctx.beginPath(); ctx.arc(cx, cz, w * 0.088, 0, TAU); ctx.stroke()
  ctx.setLineDash([26, 18]); ctx.globalAlpha = 0.15
  ctx.beginPath(); ctx.arc(cx, cz, w * 0.07, 0, TAU); ctx.stroke()
  ctx.restore()

  // portal scorch rings
  for (const p of PORTAL_POS) {
    const px = W2C(p.x, w), pz = W2C(p.z, w)
    const sg = ctx.createRadialGradient(px, pz, 0, px, pz, w * 0.05)
    sg.addColorStop(0, 'rgba(255,90,30,0.5)')
    sg.addColorStop(0.6, 'rgba(60,16,8,0.55)')
    sg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = sg
    ctx.beginPath(); ctx.arc(px, pz, w * 0.05, 0, TAU); ctx.fill()
  }

  // lava pools: molten cores
  for (const [x, z, r] of LAVA_POOLS) {
    const px = W2C(x, w), pz = W2C(z, w), pr = (r / GROUND_R) * 0.5 * w
    const pg = ctx.createRadialGradient(px, pz, 0, px, pz, pr * 1.7)
    pg.addColorStop(0, '#f09040')
    pg.addColorStop(0.32, '#b23c0a')
    pg.addColorStop(0.62, '#5c1002')
    pg.addColorStop(1, 'rgba(24,5,2,0)')
    ctx.fillStyle = pg
    ctx.beginPath(); ctx.arc(px, pz, pr * 1.7, 0, TAU); ctx.fill()
  }

  // emissive lava crack network (kept off lanes near the citadel)
  for (let i = 0; i < 60; i++) {
    let x = rand(-GROUND_R * 0.97, GROUND_R * 0.97)
    let z = rand(-GROUND_R * 0.97, GROUND_R * 0.97)
    if (Math.hypot(x - CITADEL_POS.x, z - CITADEL_POS.z) < 11) continue
    if (laneDistance(x, z) < 2.0) continue
    let a = rand(TAU)
    ctx.save()
    ctx.lineCap = 'round'
    ctx.shadowColor = '#ff5a1e'
    ctx.shadowBlur = 12
    for (const [style, lw, alpha] of [['#d83408', 4.2, 0.8], ['#ffb765', 1.4, 0.9]]) {
      let px = x, pz = z, pa = a
      ctx.strokeStyle = style
      ctx.lineWidth = lw
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.moveTo(W2C(px, w), W2C(pz, w))
      for (let s = 0, n = 3 + Math.floor(rand(5)); s < n; s++) {
        pa += rand(-0.9, 0.9)
        px += Math.cos(pa) * rand(1.2, 3.2)
        pz += Math.sin(pa) * rand(1.2, 3.2)
        ctx.lineTo(W2C(px, w), W2C(pz, w))
      }
      ctx.stroke()
    }
    ctx.restore()
  }
}

/** Bare volcanic snag: leaning trunk + jagged branch spikes. */
function deadTree(scale = 1) {
  const g = new THREE.Group()
  const mat = toonMaterial({ color: '#241318', rim: '#ff7a4a', rimStrength: 0.35 })
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

/** Faceted obsidian shard rock (flat normals baked, toon rim safe). */
function obsidianRock(scale, tall = false) {
  const geo = new THREE.IcosahedronGeometry(0.55, 0)
  const p = geo.attributes.position
  const seed = rand(100)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const k = 0.7 + 0.55 * Math.abs(Math.sin((x * 12.9 + y * 7.1 + z * 3.7) + seed))
    p.setXYZ(i, x * k, y * k * (tall ? 1.9 : 0.85), z * k)
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, toonMaterial({ color: '#1d1122', rim: '#ff6a3c', rimStrength: 0.5 }))
  m.scale.setScalar(scale)
  m.rotation.y = rand(TAU)
  m.castShadow = true
  return m
}

function volcano(x, z, s) {
  const g = new THREE.Group()
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(26, 34, 9),
    toonMaterial({ color: '#170c12', rim: '#4a1a1a', rimStrength: 0.3, flatShading: true }),
  )
  cone.position.y = 15
  g.add(cone)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: '#ff4a14', transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  glow.scale.set(26, 15, 1)
  glow.position.y = 33
  g.add(glow)
  g.position.set(x, 0, z)
  g.scale.setScalar(s)
  return g
}

/**
 * Builds the volcanic night battlefield. Returns
 * { tickables, portals: [{x,z,flash,archMat,baseColor,portalMat,group}] }.
 */
export function buildSiegeWorld(scene) {
  const tickables = []

  // ---------- sky: near-black ember night ----------
  scene.fog = new THREE.Fog('#241014', 52, 210)
  scene.add(skyDome({
    top: '#050308', mid: '#251016', bottom: '#4a150c',
    sunDir: new THREE.Vector3(-0.3, 0.14, -0.9), sunColor: '#ff5a2e', sunSize: 26,
  }))
  scene.add(starField({ count: 420, size: 2.4, color: '#ffc9a0' }))
  scene.add(starField({ count: 260, size: 1.8, color: '#d9e4ff' }))

  const smokeLow = cloudLayer({ count: 12, radius: 210, height: [24, 66], color: '#6a1d14', opacity: 0.52, scale: [70, 140] })
  const smokeHigh = cloudLayer({ count: 9, radius: 190, height: [70, 120], color: '#2a1216', opacity: 0.6, scale: [90, 170] })
  scene.add(smokeLow, smokeHigh)
  tickables.push(smokeLow, smokeHigh)

  // distant erupting peaks
  scene.add(volcano(-70, -128, 1.5), volcano(38, -140, 2.1), volcano(110, -100, 1.2), volcano(-120, -60, 1))

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

  // heat shimmer sprites over the lava pools
  for (const [x, z, r] of LAVA_POOLS) {
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

  // ---------- scattered props (off-lane) ----------
  for (let i = 0; i < 26; i++) {
    const a = rand(TAU), r = rand(8, FIELD_R - 1)
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    if (laneDistance(x, z) < 3.4) continue
    if (Math.hypot(x - CITADEL_POS.x, z - CITADEL_POS.z) < 10.5) continue
    if (PAD_POSITIONS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 3)) continue
    const prop = Math.random() < 0.62
      ? obsidianRock(rand(0.7, 1.7), Math.random() < 0.3)
      : deadTree(rand(0.8, 1.3))
    prop.position.set(x, prop.type === 'Mesh' ? 0.2 : 0, z)
    scene.add(prop)
  }
  // jagged rim ridge framing the field
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * TAU + rand(0.12)
    const r = rand(FIELD_R + 3, GROUND_R - 3)
    const rock = obsidianRock(rand(2.2, 4.6), i % 3 === 0)
    rock.position.set(Math.cos(a) * r, rand(0.2, 0.7), Math.sin(a) * r)
    scene.add(rock)
  }

  // ember fireflies
  const embers = fireflies({ count: 70, area: [66, 66], height: [0.4, 7], color: '#ff9a3c', size: 0.5 })
  const sparks = fireflies({ count: 26, area: [18, 18], height: [1, 9], color: '#ffd27a', size: 0.7 })
  sparks.position.set(-24, 0, -4)
  scene.add(embers, sparks)
  tickables.push(embers, sparks)

  // ---------- rim portals ----------
  const portals = []
  const pillarGeo = new THREE.BoxGeometry(0.7, 4.4, 0.7)
  const pillarMat = toonMaterial({ color: '#1c0f22', rim: '#ff7a4a', rimStrength: 0.55 })
  const archGeo = new THREE.TorusGeometry(2.1, 0.2, 10, 26, Math.PI)
  const portalGeo = new THREE.CircleGeometry(1.8, 26)
  for (const { x, z } of PORTAL_POS) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.lookAt(x * 0.4, 0, 0)
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(pillarGeo, pillarMat)
      p.position.set(2.1 * s, 2.2, 0)
      p.castShadow = true
      g.add(p)
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 5), pillarMat)
      spike.position.set(2.1 * s, 4.9, 0)
      g.add(spike)
    }
    const archMat = glowMaterial('#ff5a1e', 1.6)
    const arch = new THREE.Mesh(archGeo, archMat)
    arch.position.y = 4.2
    g.add(arch)
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
