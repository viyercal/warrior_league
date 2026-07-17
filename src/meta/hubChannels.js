import * as THREE from 'three'
import { toonMaterial, glowMaterial, energyMaterial } from '../art/materials.js'
import { canvasTexture, gradientTexture, groundTexture, glowTexture } from '../core/assets.js'
import { createMinion } from '../art/characterFactory.js'
import { crystal } from '../art/environment.js'
import { rand, damp, clamp, TAU, angleLerp } from '../core/utils.js'

export const CHANNEL_DEFS = [
  { title: 'WAR RIFT', sub: '1V1 LANE WARFARE', game: 'moba', accent: '#8fae4a' },
  { title: 'BLOOD COURT', sub: 'GLADIATOR B-BALL', game: 'hoops', accent: '#c23b2e' },
  { title: 'THE PIT', sub: 'HORDE SURVIVAL', game: 'arena', accent: '#ff5a26' },
  { title: 'LAST BASTION', sub: 'HOLD THE GATE', game: 'siege', accent: '#9fb8c8' },
  { title: 'WAR CHARIOTS', sub: '3-LAP DEATH RACE', game: 'kart', accent: '#ffb84d' },
  { title: 'MORTAL ARENA', sub: 'LAST WARRIOR STANDING', game: 'brawl', accent: '#e8dcc4' },
  { title: 'THE CRUCIBLE', sub: '1V1 TOURNAMENT — BEST OF 3', game: 'duel', accent: '#ff8c3b', trim: '#c23b2e', flagship: true },
]

const W = 3.3, H = 2.1, R = 0.26, B = 0.15

/**
 * Wall composition: THE CRUCIBLE flagship dead-center, ~35% larger and pulled
 * forward off the wall plane; the six original arenas ring it — a pair
 * crowning it above, two wings at the shoulders, two at the lower flanks.
 * Index-aligned with CHANNEL_DEFS. plate: where the DOM title plate anchors.
 */
const LAYOUT = [
  { x: -5.5, y: 4.55, z: -2.5, yaw: 0.3, pitch: 0.1, plate: 'above' },   // moba — left shoulder
  { x: -2.55, y: 6.05, z: -3.2, yaw: 0.1, pitch: 0.13, plate: 'above' },  // hoops — crown left
  { x: 2.55, y: 6.05, z: -3.2, yaw: -0.1, pitch: 0.13, plate: 'above' },  // arena — crown right
  { x: 5.5, y: 4.55, z: -2.5, yaw: -0.3, pitch: 0.1, plate: 'above' },   // siege — right shoulder
  { x: -5.55, y: 1.95, z: -2.1, yaw: 0.32, pitch: -0.02, plate: 'below' }, // kart — left flank
  { x: 5.55, y: 1.95, z: -2.1, yaw: -0.32, pitch: -0.02, plate: 'below' }, // brawl — right flank
  { x: 0, y: 3.2, z: -1.7, yaw: 0, pitch: -0.02, scale: 1.35, plate: 'brand' }, // duel — FLAGSHIP
]

function roundedRect(w, h, r) {
  const s = new THREE.Shape()
  const x = -w / 2, y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

function buildGeos() {
  const iw = W - 2 * B, ih = H - 2 * B, ir = R * 0.65
  const border = roundedRect(W, H, R)
  border.holes.push(roundedRect(iw, ih, ir))
  const rim = roundedRect(iw + 0.12, ih + 0.12, ir + 0.04)
  rim.holes.push(roundedRect(iw - 0.02, ih - 0.02, ir))
  const banner = new THREE.PlaneGeometry(0.4, 0.72, 1, 4)
  banner.translate(0, -0.36, 0) // pivot at the hanging rod
  return {
    border: new THREE.ExtrudeGeometry(border, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 2, curveSegments: 5 }),
    rim: new THREE.ExtrudeGeometry(rim, { depth: 0.03, bevelEnabled: false, curveSegments: 5 }),
    back: new THREE.ShapeGeometry(roundedRect(iw, ih, ir), 5),
    hit: new THREE.PlaneGeometry(W + 0.25, H + 0.25),
    banner,
  }
}

/** Additive glow sprite helper (shared by the dioramas). */
function spark(color, opacity = 0.4, scale = 0.5) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  s.scale.setScalar(scale)
  return s
}

/** Ragged war-banner cloth in a channel's accent color. */
function bannerTexture(accent) {
  const body = mix(accent, '#241812', 0.42)
  const edge = mix(accent, '#120c08', 0.68)
  return canvasTexture(64, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    // ragged pointed cloth
    ctx.beginPath()
    ctx.moveTo(4, 2)
    ctx.lineTo(w - 4, 2)
    ctx.lineTo(w - 6, h * 0.72)
    ctx.lineTo(w * 0.5, h - 4)
    ctx.lineTo(6, h * 0.72)
    ctx.closePath()
    ctx.fillStyle = body
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = edge
    ctx.stroke()
    // top rod + stitch line
    ctx.fillStyle = '#6b4a26'
    ctx.fillRect(0, 0, w, 7)
    ctx.strokeStyle = 'rgba(232,220,196,0.35)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 5])
    ctx.beginPath(); ctx.moveTo(8, 14); ctx.lineTo(w - 8, 14); ctx.stroke()
    ctx.setLineDash([])
    // bone emblem
    ctx.strokeStyle = '#e8dcc4'
    ctx.lineWidth = 4
    const cx = w / 2, cy = h * 0.42
    ctx.beginPath()
    ctx.moveTo(cx, cy - 14); ctx.lineTo(cx + 11, cy); ctx.lineTo(cx, cy + 14); ctx.lineTo(cx - 11, cy)
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx, cy - 22); ctx.lineTo(cx, cy + 22); ctx.stroke()
  })
}

// ---------- diorama stages ----------

// WAR RIFT: scorched lane sliver — ember obelisk, bone vs crimson minions
function mobaStage() {
  const stage = new THREE.Group()
  const tex = groundTexture({ base: '#3f3428', blotches: ['#4a3e2e', '#332a20', '#524434'], size: 256, count: 130 })
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.98, 26), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, envMapIntensity: 0.3 }))
  floor.rotation.x = -Math.PI / 2
  floor.scale.set(1.42, 1, 1)
  stage.add(floor)
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.4), new THREE.MeshStandardMaterial({ color: '#5c4a34', roughness: 1, envMapIntensity: 0.3 }))
  lane.rotation.x = -Math.PI / 2
  lane.position.y = 0.006
  stage.add(lane)

  const nexus = crystal({ color1: '#3a140e', color2: '#ff8c3b', height: 1.15 })
  nexus.scale.setScalar(0.6)
  nexus.position.set(-1.12, 0, -0.12)
  stage.add(nexus)

  const mobs = [
    { m: createMinion({ color: '#d8cbb0', scale: 0.55 }), x: -0.7, z: 0.14, dir: 1, sp: 0.5 },
    { m: createMinion({ color: '#c23b2e', evil: true, scale: 0.55 }), x: 0.6, z: -0.16, dir: -1, sp: 0.42 },
  ]
  for (const o of mobs) {
    o.m.setMoving(true)
    o.m.group.rotation.x = -0.16
    stage.add(o.m.group)
  }
  return {
    group: stage,
    update(dt) {
      nexus.tick(dt)
      for (const o of mobs) {
        o.x += dt * o.sp * o.dir
        if (o.x > 0.95) o.dir = -1
        if (o.x < -0.8) o.dir = 1
        o.m.group.position.set(o.x, 0, o.z)
        o.m.group.rotation.y = angleLerp(o.m.group.rotation.y, o.dir * Math.PI / 2, 1 - Math.exp(-8 * dt))
        o.m.update(dt)
      }
    },
  }
}

// BLOOD COURT: sand gladiator court with bone lines and a crimson key
function courtTexture() {
  return canvasTexture(256, 140, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#a8825a')
    g.addColorStop(1, '#7a5c38')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(60,40,20,0.28)'
    ctx.lineWidth = 2
    for (let x = 0; x < w; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    // crimson painted key
    ctx.fillStyle = 'rgba(161,37,44,0.4)'
    ctx.fillRect(w - 66, h / 2 - 34, 60, 68)
    ctx.strokeStyle = 'rgba(232,220,196,0.65)'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(w * 0.35, h / 2, 26, 0, TAU); ctx.stroke()
    ctx.strokeRect(w - 66, h / 2 - 34, 60, 68)
    ctx.beginPath(); ctx.moveTo(w * 0.35, 0); ctx.lineTo(w * 0.35, h); ctx.stroke()
  })
}

function hoopsStage() {
  const stage = new THREE.Group()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 1.3), new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.8, envMapIntensity: 0.35 }))
  floor.rotation.x = -Math.PI / 2
  stage.add(floor)

  // hoop assembly: iron pillar, bone backboard, ember rim
  const hoop = new THREE.Group()
  hoop.position.set(1.02, 0, 0)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.95, 8), toonMaterial({ color: '#4a423a', rim: '#c9a06a', rimStrength: 0.35 }))
  pole.position.y = 0.47
  hoop.add(pole)
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.44), toonMaterial({ color: '#d8ccb4', rim: '#fff2d8', rimStrength: 0.4 }))
  board.position.set(-0.04, 0.88, 0)
  hoop.add(board)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 8, 20), glowMaterial('#ff8c3b', 1.7))
  rim.rotation.x = Math.PI / 2
  rim.position.set(-0.17, 0.78, 0)
  hoop.add(rim)
  const net = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.06, 0.14, 8, 2, true),
    new THREE.MeshBasicMaterial({ color: '#e8dcc4', wireframe: true, transparent: true, opacity: 0.4 }),
  )
  net.position.set(-0.17, 0.7, 0)
  hoop.add(net)
  stage.add(hoop)

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 12), toonMaterial({ color: '#a8552a', rim: '#ffd9a0', rimStrength: 0.55 }))
  ball.castShadow = false
  stage.add(ball)
  const ballGlow = spark('#ff8c3b', 0.22, 0.45)
  stage.add(ballGlow)

  let t = rand(10)
  return {
    group: stage,
    update(dt) {
      t += dt
      const bounce = Math.abs(Math.sin(t * 3.4))
      const y = 0.095 + Math.pow(bounce, 0.72) * 0.6
      ball.position.set(-0.55 + Math.sin(t * 0.55) * 0.42, y, Math.cos(t * 0.4) * 0.18)
      const squash = 1 - 0.35 * clamp((0.18 - y + 0.095) / 0.18, 0, 1)
      ball.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash))
      ball.rotation.z -= dt * 4
      ballGlow.position.copy(ball.position)
      rim.material.color.set('#ff8c3b').multiplyScalar(1.5 + Math.sin(t * 2) * 0.3)
    },
  }
}

// THE PIT: lava-lit fighting pit — fire orb, circling raiders
function arenaStage() {
  const stage = new THREE.Group()
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.02, 0.09, 30),
    energyMaterial({ color1: '#26100a', color2: '#ff5a26', speed: 0.6, intensity: 0.62 }),
  )
  disc.position.y = -0.045
  stage.add(disc)
  const edge = new THREE.Mesh(new THREE.TorusGeometry(0.99, 0.02, 8, 40), glowMaterial('#ff8c3b', 1.25))
  edge.rotation.x = Math.PI / 2
  stage.add(edge)

  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), glowMaterial('#ffb84d', 2.4))
  const orbHalo = spark('#ff5a26', 0.4, 0.7)
  stage.add(orb, orbHalo)

  const mobs = [
    { m: createMinion({ color: '#c23b2e', evil: true, scale: 0.52 }), a: 0, sp: 1.15 },
    { m: createMinion({ color: '#ff8c3b', evil: true, scale: 0.52 }), a: Math.PI, sp: 1.15 },
  ]
  for (const o of mobs) {
    o.m.setMoving(true)
    o.m.group.rotation.x = -0.16
    stage.add(o.m.group)
  }
  let t = rand(10)
  return {
    group: stage,
    update(dt) {
      t += dt
      orb.position.y = 0.55 + Math.sin(t * 1.8) * 0.07
      orb.rotation.y += dt * 2
      orbHalo.position.copy(orb.position)
      for (const o of mobs) {
        o.a += dt * o.sp
        o.m.group.position.set(Math.cos(o.a) * 0.58, 0, Math.sin(o.a) * 0.58)
        o.m.group.rotation.y = -o.a
        o.m.update(dt)
      }
    },
  }
}

// ---------- WAR CHARIOTS: scorched death-race loop + 2 chariots trading the lead ----------

function trackTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, rx = 182, ry = 128
    // scorched infield + verge
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#4a3826')
    g.addColorStop(1, '#33261a')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = ['#54422c', '#2e2318', '#463824'][i % 3]
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      ctx.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 18, 5 + Math.random() * 10, 0, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    // packed-dirt raceway
    ctx.strokeStyle = '#4c4038'
    ctx.lineWidth = 58
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,235,200,0.05)'
    ctx.lineWidth = 44
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.stroke()
    // crimson-and-bone kerb stones (kept below bloom threshold)
    ctx.lineWidth = 5
    ctx.setLineDash([16, 16])
    for (const [rr, off] of [[31, 0], [-31, 16]]) {
      ctx.strokeStyle = '#8a2a24'
      ctx.lineDashOffset = off
      ctx.beginPath(); ctx.ellipse(cx, cy, rx + rr, ry + rr, 0, 0, TAU); ctx.stroke()
      ctx.strokeStyle = '#b5a98c'
      ctx.lineDashOffset = off + 16
      ctx.beginPath(); ctx.ellipse(cx, cy, rx + rr, ry + rr, 0, 0, TAU); ctx.stroke()
    }
    // dashed gold centerline
    ctx.strokeStyle = 'rgba(230,185,60,0.7)'
    ctx.lineWidth = 3
    ctx.setLineDash([14, 13])
    ctx.lineDashOffset = 0
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.stroke()
    ctx.setLineDash([])
    // bone-checkered start line (track runs vertically at the right apex)
    const sx = cx + rx
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#1c150e' : '#c8bfa8'
        ctx.fillRect(sx - 28 + i * 7, cy - 7 + j * 5, 7, 5)
      }
    }
  })
}

function checkerTexture() {
  return canvasTexture(160, 32, (ctx, w, h) => {
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#1c150e' : '#c8bfa8'
        ctx.fillRect(i * 16, j * 16, 16, 16)
      }
    }
  })
}

function miniChariot(bodyColor, glowColor) {
  const g = new THREE.Group()
  const bodyMat = toonMaterial({ color: bodyColor, rim: '#ffd9a0', rimStrength: 0.5 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.24), bodyMat)
  body.position.y = 0.055
  g.add(body)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.09), bodyMat)
  nose.position.set(0, 0.05, 0.15)
  g.add(nose)
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.016, 0.04), bodyMat)
  spoiler.position.set(0, 0.105, -0.115)
  g.add(spoiler)
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), toonMaterial({ color: '#b0793a', rim: '#ffe2ad', rimStrength: 0.6 }))
  helm.position.set(0, 0.115, -0.02)
  g.add(helm)
  const wheelMat = toonMaterial({ color: '#2a241e', rim: '#8a6a48', rimStrength: 0.22 })
  const wheelGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.028, 10)
  for (const [x, z] of [[-0.092, 0.085], [0.092, 0.085], [-0.092, -0.085], [0.092, -0.085]]) {
    const wl = new THREE.Mesh(wheelGeo, wheelMat)
    wl.rotation.z = Math.PI / 2
    wl.position.set(x, 0.036, z)
    g.add(wl)
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.016, 0.012), glowMaterial(glowColor, 2.2))
  tail.position.set(0, 0.06, -0.128)
  g.add(tail)
  const exhaust = spark(glowColor, 0.5, 0.14)
  exhaust.position.set(0, 0.06, -0.18)
  g.add(exhaust)
  return { group: g, exhaust }
}

function kartStage() {
  const stage = new THREE.Group()
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.98, 26),
    new THREE.MeshStandardMaterial({ map: trackTexture(), roughness: 0.9, envMapIntensity: 0.3 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.scale.set(1.42, 1, 1)
  stage.add(floor)

  // world-space track ellipse matching the texture (canvas rx=182/256, ry=128/256)
  const KRX = (182 / 256) * 0.98 * 1.42
  const KRZ = (128 / 256) * 0.98

  // start gantry over the right apex: rough timber posts + war checker
  const postMat = toonMaterial({ color: '#4a352a', rim: '#c9a06a', rimStrength: 0.4 })
  for (const dx of [-0.22, 0.22]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.36, 8), postMat)
    post.position.set(KRX + dx, 0.18, 0)
    stage.add(post)
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.09, 0.02),
    new THREE.MeshBasicMaterial({ map: checkerTexture() }),
  )
  banner.position.set(KRX, 0.385, 0)
  stage.add(banner)

  // infield dressing: bronze spikes + a glowing ember rune-pad on the back straight
  for (const [x, z] of [[0.34, 0.14], [-0.42, -0.12], [0.05, -0.3]]) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.085, 8), toonMaterial({ color: '#b0793a', rim: '#ffd9a0', rimStrength: 0.5 }))
    spike.position.set(x, 0.042, z)
    stage.add(spike)
  }
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.13),
    new THREE.MeshBasicMaterial({ color: '#ff8c3b', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  pad.rotation.x = -Math.PI / 2
  const padA = Math.PI * 1.18
  pad.position.set(Math.cos(padA) * KRX, 0.008, Math.sin(padA) * KRZ)
  pad.rotation.z = -Math.atan2(-KRX * Math.sin(padA), KRZ * Math.cos(padA))
  stage.add(pad)

  const karts = [
    { k: miniChariot('#a1252c', '#ffb84d'), a: rand(TAU), sp: 1.42, lane: 0.93, bob: rand(TAU) },
    { k: miniChariot('#6b6f78', '#ff8a5c'), a: rand(TAU), sp: 1.3, lane: 1.07, bob: rand(TAU) },
  ]
  for (const o of karts) stage.add(o.k.group)

  let t = rand(10)
  return {
    group: stage,
    update(dt) {
      t += dt
      for (const o of karts) {
        o.a += dt * o.sp
        const g = o.k.group
        g.position.set(Math.cos(o.a) * KRX * o.lane, 0.004 + Math.abs(Math.sin(t * 14 + o.bob)) * 0.006, Math.sin(o.a) * KRZ * o.lane)
        g.rotation.y = Math.atan2(-KRX * Math.sin(o.a), KRZ * Math.cos(o.a))
        o.k.exhaust.material.opacity = 0.35 + Math.abs(Math.sin(t * 9 + o.bob)) * 0.3
      }
      pad.material.opacity = 0.32 + Math.sin(t * 4) * 0.2
      banner.position.y = 0.385 + Math.sin(t * 1.4) * 0.008
    },
  }
}

// ---------- MORTAL ARENA: floating duel stone, torch pillars, two warriors trading blows ----------

function brawlStage() {
  const stage = new THREE.Group()

  // drifting battle-smoke behind the arena
  const puffs = [spark('#9a8a7e', 0.08, 0.9), spark('#6b5a50', 0.07, 0.7)]
  puffs[0].position.set(-0.85, 1.05, -0.55)
  puffs[1].position.set(0.9, 0.75, -0.6)
  stage.add(...puffs)

  // main floating duel stone
  const isl = new THREE.Group()
  const sideMat = toonMaterial({ color: '#4a4038', rim: '#b09878', rimStrength: 0.3 })
  const topMat = toonMaterial({ color: '#6b5844', rim: '#e8d8c0', rimStrength: 0.35 })
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.62, 0.16, 9), [sideMat, topMat, sideMat])
  cap.position.y = 0.22
  isl.add(cap)
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.05, 0.52, 9), sideMat)
  cone.position.y = -0.13
  isl.add(cone)
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.71, 0.014, 8, 32), glowMaterial('#ffb84d', 1.4))
  trim.rotation.x = Math.PI / 2
  trim.position.y = 0.3
  isl.add(trim)
  const halo = spark('#ff8c3b', 0.22, 1.7)
  halo.position.y = -0.42
  isl.add(halo)

  // duel pillars with torch tips (ride the stone's bob)
  const torches = []
  for (const dx of [-0.52, 0.52]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.5, 6), sideMat)
    pillar.position.set(dx, 0.55, -0.38)
    isl.add(pillar)
    const capstone = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.13), topMat)
    capstone.position.set(dx, 0.82, -0.38)
    isl.add(capstone)
    const fl = spark('#ffb84d', 0.75, 0.26)
    fl.position.set(dx, 0.92, -0.38)
    isl.add(fl)
    torches.push({ fl, ph: rand(TAU) })
  }
  stage.add(isl)

  // two side ledges
  const ledges = []
  for (const dx of [-0.92, 0.92]) {
    const ledge = new THREE.Group()
    const lc = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.16, 0.09, 8), [sideMat, topMat, sideMat])
    ledge.add(lc)
    const lg = spark('#ffb84d', 0.18, 0.55)
    lg.position.y = -0.14
    ledge.add(lg)
    ledge.position.set(dx, 0.64, -0.12)
    stage.add(ledge)
    ledges.push(ledge)
  }

  // duelists: bone-pale champion vs crimson challenger
  const F = [
    { m: createMinion({ color: '#d8cbb0', scale: 0.5 }), x: -0.3, ph: 0, dir: 1 },
    { m: createMinion({ color: '#c23b2e', scale: 0.5 }), x: 0.3, ph: 1.4, dir: -1 },
  ]
  const TOP = 0.3
  for (const f of F) {
    f.m.setMoving(true)
    f.m.group.rotation.x = -0.16
    f.m.group.rotation.y = f.dir * Math.PI / 2
    stage.add(f.m.group)
  }

  const hitSpark = spark('#ffe27d', 0, 0.2)
  hitSpark.position.set(0, TOP + 0.34, 0.05)
  stage.add(hitSpark)

  const CYCLE = 2.6
  let t = rand(10)
  return {
    group: stage,
    update(dt) {
      t += dt
      const bobY = Math.sin(t * 0.9) * 0.045
      isl.position.y = bobY
      for (let i = 0; i < 2; i++) ledges[i].position.y = 0.64 + Math.sin(t * 1.1 + i * 2.4) * 0.05
      puffs[0].position.x = -0.85 + Math.sin(t * 0.22) * 0.12
      puffs[1].position.x = 0.9 + Math.sin(t * 0.18 + 2) * 0.1
      for (const tc of torches) {
        const f = 0.8 + 0.2 * Math.sin(t * 9 + tc.ph)
        tc.fl.scale.setScalar(0.26 * f)
        tc.fl.material.opacity = 0.55 + 0.3 * f
      }

      // fight timeline: alternate attacker lunges, spark pops at contact
      const k = (t / CYCLE) % 1
      const atk = Math.floor(t / CYCLE) % 2
      const lunge = k > 0.35 && k < 0.6 ? Math.sin(Math.PI * (k - 0.35) / 0.25) : 0
      const knock = k > 0.47 && k < 0.68 ? Math.sin(Math.PI * (k - 0.47) / 0.21) : 0
      const sparkEnv = k > 0.45 && k < 0.6 ? Math.sin(Math.PI * (k - 0.45) / 0.15) : 0
      for (let i = 0; i < 2; i++) {
        const f = F[i]
        const hop = Math.pow(Math.abs(Math.sin(t * 2.3 + f.ph)), 0.7) * 0.2
        let x = f.x
        if (i === atk) x += f.dir * 0.17 * lunge
        else x += f.dir * -0.09 * knock
        f.m.group.position.set(x, TOP + bobY + hop, 0.05)
        f.m.update(dt)
      }
      hitSpark.position.y = TOP + bobY + 0.34
      hitSpark.material.opacity = sparkEnv * 0.9
      hitSpark.scale.setScalar(0.12 + sparkEnv * 0.42)
    },
  }
}

// ---------- LAST BASTION: stone gate + golden ward vs streaming crimson raiders ----------

/** Miniature bastion gate: twin towers, wall, torch tips. Has .tick like crystal(). */
function bastionGate() {
  const g = new THREE.Group()
  const stone = toonMaterial({ color: '#5c5246', rim: '#d9b088', rimStrength: 0.42 })
  const dark = toonMaterial({ color: '#453c32', rim: '#a8875c', rimStrength: 0.32 })
  for (const dx of [-0.2, 0.2]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.52, 7), stone)
    tower.position.set(dx, 0.26, 0)
    g.add(tower)
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.1, 0.07, 7), dark)
    crown.position.set(dx, 0.55, 0)
    g.add(crown)
  }
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.09), stone)
  wall.position.y = 0.15
  g.add(wall)
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.11), dark)
  parapet.position.y = 0.32
  g.add(parapet)
  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.1), toonMaterial({ color: '#4a352a', rim: '#b0793a', rimStrength: 0.4 }))
  gate.position.y = 0.09
  g.add(gate)
  const torches = []
  for (const dx of [-0.2, 0.2]) {
    const fl = spark('#ffb84d', 0.85, 0.26)
    fl.position.set(dx, 0.64, 0)
    g.add(fl)
    torches.push({ fl, ph: rand(TAU) })
  }
  let t = rand(10)
  g.tick = dt => {
    t += dt
    for (const tc of torches) {
      const f = 0.8 + 0.2 * Math.sin(t * 8 + tc.ph)
      tc.fl.scale.setScalar(0.26 * f)
      tc.fl.material.opacity = 0.6 + 0.3 * f
    }
  }
  return g
}

function siegeStage() {
  const stage = new THREE.Group()
  const tex = groundTexture({ base: '#2e2620', blotches: ['#3a3028', '#241e18', '#443830'], size: 256, count: 140 })
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.98, 26), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, envMapIntensity: 0.35 }))
  floor.rotation.x = -Math.PI / 2
  floor.scale.set(1.42, 1, 1)
  stage.add(floor)

  const CIT = new THREE.Vector3(-0.62, 0, -0.06)
  const citadel = bastionGate()
  citadel.scale.setScalar(1.55)
  citadel.position.copy(CIT)
  citadel.rotation.y = Math.PI / 2.3
  stage.add(citadel)

  // golden ward dome + ground rune ring
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 18, 12),
    new THREE.MeshBasicMaterial({ color: '#ffb84d', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  dome.position.set(CIT.x, 0.22, CIT.z)
  stage.add(dome)
  const ward = new THREE.Mesh(
    new THREE.RingGeometry(0.44, 0.49, 40),
    new THREE.MeshBasicMaterial({ color: '#ffb84d', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  )
  ward.rotation.x = -Math.PI / 2
  ward.position.set(CIT.x, 0.01, CIT.z)
  stage.add(ward)

  // watch-ballista: stone base + burning sight-orb with a bolt-thrower that tracks its prey
  const turret = new THREE.Group()
  turret.position.set(0.02, 0, 0.3)
  const tBase = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 0.24, 10), toonMaterial({ color: '#4a423a', rim: '#d9b088', rimStrength: 0.45 }))
  tBase.position.y = 0.12
  turret.add(tBase)
  const tHead = new THREE.Group()
  tHead.position.y = 0.27
  const tOrb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), glowMaterial('#ffb84d', 2.0))
  tHead.add(tOrb)
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.12), toonMaterial({ color: '#4a352a', rim: '#c9a06a', rimStrength: 0.5 }))
  barrel.position.z = 0.075
  tHead.add(barrel)
  turret.add(tHead)
  stage.add(turret)

  // raider swarm streaming in from the east rim: burning dots + halo sprites
  const raiderGeo = new THREE.SphereGeometry(0.032, 10, 8)
  const raiderMat = glowMaterial('#ff4a2e', 2.1)
  const raiders = []
  const respawn = r => {
    r.mesh.position.set(rand(1.05, 1.32), 0.05, rand(-0.5, 0.5))
    r.sp = rand(0.16, 0.26)
    r.wob = rand(TAU)
  }
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(raiderGeo, raiderMat)
    mesh.add(spark('#ff5c3c', 0.4, 0.16))
    const r = { mesh, sp: 0, wob: 0 }
    respawn(r)
    mesh.position.x = rand(0.2, 1.32) // stagger the initial column
    stage.add(mesh)
    raiders.push(r)
  }

  // ballista bolt-flash + kill flash (reused)
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1, 6, 1, true), glowMaterial('#ffd98a', 2.4))
  beam.visible = false
  stage.add(beam)
  const killFlash = spark('#ff8a5c', 0, 0.3)
  stage.add(killFlash)

  const UP = new THREE.Vector3(0, 1, 0)
  const _dir = new THREE.Vector3()
  const _tip = new THREE.Vector3()
  let t = rand(10)
  let zapT = rand(0.4, 1.0)
  let beamT = 0
  let flashT = 0
  let shieldPulse = 0

  return {
    group: stage,
    update(dt) {
      t += dt
      citadel.tick(dt)

      // raiders press toward the gate; the ward repels them in a pulse
      for (const r of raiders) {
        const p = r.mesh.position
        _dir.set(CIT.x - p.x, 0, CIT.z - p.z)
        const d = _dir.length()
        if (d < 0.46) { shieldPulse = 1; respawn(r); continue }
        p.addScaledVector(_dir.multiplyScalar(1 / d), dt * r.sp)
        p.z += Math.sin(t * 5 + r.wob) * 0.018 * dt * 60
        p.y = 0.05 + Math.abs(Math.sin(t * 7 + r.wob)) * 0.02
      }

      // ballista shot: nearest raider to the gate gets deleted
      zapT -= dt
      if (zapT <= 0) {
        zapT = rand(0.9, 1.3)
        let best = null, bestD = 1e9
        for (const r of raiders) {
          const d = r.mesh.position.distanceTo(CIT)
          if (d < bestD) { bestD = d; best = r }
        }
        if (best) {
          _tip.set(turret.position.x, 0.235, turret.position.z)
          tHead.lookAt(best.mesh.position)
          _dir.copy(best.mesh.position).sub(_tip)
          const len = _dir.length()
          beam.position.copy(_tip).addScaledVector(_dir, 0.5)
          beam.scale.set(1, len, 1)
          beam.quaternion.setFromUnitVectors(UP, _dir.multiplyScalar(1 / len))
          beam.visible = true
          beamT = 0.13
          killFlash.position.copy(best.mesh.position)
          flashT = 0.28
          respawn(best)
        }
      }
      if (beamT > 0) { beamT -= dt; if (beamT <= 0) beam.visible = false }
      if (flashT > 0) {
        flashT = Math.max(0, flashT - dt)
        const k = flashT / 0.28
        killFlash.material.opacity = k * 0.9
        killFlash.scale.setScalar(0.15 + (1 - k) * 0.5)
      } else killFlash.material.opacity = 0

      shieldPulse = Math.max(0, shieldPulse - dt * 2.5)
      dome.material.opacity = 0.06 + shieldPulse * 0.22 + Math.sin(t * 2.2) * 0.015
      ward.material.opacity = 0.24 + Math.sin(t * 2.6) * 0.1 + shieldPulse * 0.3
      tOrb.material.color.set('#ffb84d').multiplyScalar(1.7 + (beamT > 0 ? 1.6 : 0) + Math.sin(t * 3) * 0.25)
    },
  }
}

// ---------- THE CRUCIBLE: torchlit tournament pit — two champions trade blows
// under draining health bars, ringed by braziers and a crowd in the dark ----------

function crucibleFloorTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2
    const g = ctx.createRadialGradient(cx, cy, 18, cx, cy, 132)
    g.addColorStop(0, '#4c3826')
    g.addColorStop(0.6, '#31231a')
    g.addColorStop(1, '#191110')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    // packed sand + old scorch mottling
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = ['#57422c', '#281c12', '#463420'][i % 3]
      ctx.globalAlpha = 0.28
      ctx.beginPath()
      ctx.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 12, 3 + Math.random() * 8, 0, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    // crimson duel ring + inner ember circle
    ctx.strokeStyle = 'rgba(161, 37, 44, 0.8)'
    ctx.lineWidth = 7
    ctx.beginPath(); ctx.arc(cx, cy, 86, 0, TAU); ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 140, 59, 0.45)'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(cx, cy, 66, 0, TAU); ctx.stroke()
    // bone tally marks radiating from the ring
    ctx.strokeStyle = 'rgba(232, 220, 196, 0.5)'
    ctx.lineWidth = 3
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.13
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * 92, cy + Math.sin(a) * 92)
      ctx.lineTo(cx + Math.cos(a) * 104, cy + Math.sin(a) * 104)
      ctx.stroke()
    }
    // center clash sigil
    ctx.strokeStyle = 'rgba(255, 140, 59, 0.55)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(cx, cy - 16); ctx.lineTo(cx + 13, cy); ctx.lineTo(cx, cy + 16); ctx.lineTo(cx - 13, cy)
    ctx.closePath()
    ctx.stroke()
  })
}

/** Tournament health bar: dark iron backing + glowing fill that drains toward
 * its anchored outer edge (MK-style). anchor = -1 left player, +1 right. */
function miniHealthBar(color, anchor) {
  const BW = 0.42, BH = 0.05
  const g = new THREE.Group()
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(BW + 0.035, BH + 0.03),
    new THREE.MeshBasicMaterial({ color: '#150c07' }),
  )
  g.add(back)
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), glowMaterial(color, 1.5))
  fill.position.z = 0.005
  g.add(fill)
  const trim = new THREE.Mesh(
    new THREE.PlaneGeometry(BW + 0.035, 0.012),
    new THREE.MeshBasicMaterial({ color: '#a1252c' }),
  )
  trim.position.set(0, -(BH + 0.03) / 2 - 0.008, 0.002)
  g.add(trim)
  let shown = 1
  return {
    group: g,
    set(hp, dt) {
      shown = damp(shown, hp, 9, dt)
      const s = Math.max(shown, 0.02)
      fill.scale.x = s
      fill.position.x = anchor * (1 - s) * BW / 2
    },
    snap() { shown = 1 },
  }
}

/** Mini iron brazier with a flickering flame tip (for the pit ring). */
function miniBrazier() {
  const g = new THREE.Group()
  const iron = toonMaterial({ color: '#3a3d44', rim: '#9aa3b2', rimStrength: 0.3 })
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.032, 0.05, 7), iron)
  bowl.position.y = 0.17
  g.add(bowl)
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.022, 0.15, 6), iron)
  stem.position.y = 0.075
  g.add(stem)
  const coal = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6, 0, TAU, 0, Math.PI / 2), glowMaterial('#ff5a26', 1.6))
  coal.scale.y = 0.55
  coal.position.y = 0.19
  g.add(coal)
  const fl = spark('#ffb84d', 0.8, 0.2)
  fl.position.y = 0.25
  g.add(fl)
  return { group: g, fl, ph: rand(TAU) }
}

function duelStage() {
  const stage = new THREE.Group()

  // pit floor + crimson ring markings
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.98, 26),
    new THREE.MeshStandardMaterial({ map: crucibleFloorTexture(), roughness: 0.92, envMapIntensity: 0.32 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.scale.set(1.42, 1, 1)
  stage.add(floor)

  // ember trim ring around the fighting circle
  const ringGlow = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.66, 40),
    new THREE.MeshBasicMaterial({
      color: '#ff8c3b', transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  )
  ringGlow.rotation.x = -Math.PI / 2
  ringGlow.position.y = 0.008
  stage.add(ringGlow)

  // balcony crowd in the dark: a rail silhouette + two banked rows of dim
  // torch-lit faces high behind the pit (kept forward of the frame backplane)
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(2.35, 0.045, 0.05),
    toonMaterial({ color: '#241c16', rim: '#8a6138', rimStrength: 0.35 }),
  )
  rail.position.set(0, 0.5, -0.42)
  stage.add(rail)
  const crowdN = 26
  const crowdPos = new Float32Array(crowdN * 3)
  for (let i = 0; i < crowdN; i++) {
    const row = i < 14 ? 0 : 1
    const n = row ? 12 : 14
    const j = row ? i - 14 : i
    crowdPos[i * 3] = (j / (n - 1) - 0.5) * (2.15 - row * 0.35) + rand(-0.04, 0.04)
    crowdPos[i * 3 + 1] = 0.6 + row * 0.17 + rand(0.05)
    crowdPos[i * 3 + 2] = -0.42 - row * 0.06
  }
  const crowdGeo = new THREE.BufferGeometry()
  crowdGeo.setAttribute('position', new THREE.BufferAttribute(crowdPos, 3))
  const crowd = new THREE.Points(crowdGeo, new THREE.PointsMaterial({
    map: glowTexture(), color: '#d8955a', size: 0.085, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }))
  stage.add(crowd)

  // ring of braziers between crowd and pit
  const braziers = []
  for (const a of [Math.PI * 0.78, Math.PI * 1.22, Math.PI * 0.42, Math.PI * 1.58]) {
    const b = miniBrazier()
    b.group.position.set(Math.cos(a + Math.PI / 2) * 0.95 * 1.3, 0, -Math.sin(a + Math.PI / 2) * 0.88)
    stage.add(b.group)
    braziers.push(b)
  }

  // the two duelists: bronze champion (west) vs blood-crimson challenger (east)
  const BASE = 0.44
  const F = [
    { m: createMinion({ color: '#b0793a', scale: 0.56 }), dir: 1, ph: 0 },
    { m: createMinion({ color: '#a1252c', scale: 0.56 }), dir: -1, ph: 1.3 },
  ]
  for (const f of F) {
    f.m.setMoving(true)
    f.m.group.rotation.x = -0.16
    f.m.group.rotation.y = f.dir * Math.PI / 2
    stage.add(f.m.group)
  }

  // tournament health bars floating above each corner
  const bars = [miniHealthBar('#ffb84d', -1), miniHealthBar('#ff6a3c', 1)]
  bars[0].group.position.set(-0.42, 1.0, 0.1)
  bars[1].group.position.set(0.42, 1.0, 0.1)
  stage.add(bars[0].group, bars[1].group)

  // clash spark + KO flash
  const hitSpark = spark('#ffe27d', 0, 0.24)
  stage.add(hitSpark)

  const CYCLE = 2.3
  const hp = [1, 1]
  let t = rand(10)
  let prevK = (t / CYCLE) % 1
  let ko = -1 // index of the downed fighter during a round reset
  let koT = 0
  let sparkT = 0

  return {
    group: stage,
    update(dt) {
      t += dt

      for (const b of braziers) {
        const f = 0.8 + 0.2 * Math.sin(t * 9 + b.ph)
        b.fl.scale.setScalar(0.26 * f)
        b.fl.material.opacity = 0.6 + 0.3 * f
      }
      crowd.material.opacity = 0.42 + 0.12 * Math.sin(t * 3.1) + 0.05 * Math.sin(t * 7.7)
      ringGlow.material.opacity = 0.28 + 0.12 * Math.sin(t * 2.2)

      const k = (t / CYCLE) % 1
      const atk = Math.floor(t / CYCLE) % 2

      if (ko >= 0) {
        // round over: loser crumples, winner exults, then both reset
        koT -= dt
        const L = F[ko], Wn = F[1 - ko]
        L.m.group.rotation.z = damp(L.m.group.rotation.z, -L.dir * 1.25, 6, dt)
        L.m.group.position.set(-L.dir * (BASE + 0.16), 0.02, 0.05)
        const hop = Math.abs(Math.sin(t * 6)) * 0.12
        Wn.m.group.position.set(-Wn.dir * BASE * 0.7, hop, 0.05)
        L.m.update(dt)
        Wn.m.update(dt)
        if (koT <= 0) {
          ko = -1
          hp[0] = hp[1] = 1
          bars[0].snap()
          bars[1].snap()
          L.m.group.rotation.z = 0
          prevK = k
        }
      } else {
        // fight timeline: attacker lunges, spark pops, defender knocks back
        const lunge = k > 0.32 && k < 0.56 ? Math.sin(Math.PI * (k - 0.32) / 0.24) : 0
        const knock = k > 0.5 && k < 0.72 ? Math.sin(Math.PI * (k - 0.5) / 0.22) : 0
        const clashed = (prevK < 0.5 && k >= 0.5) || (k < prevK && prevK < 0.5)
        prevK = k
        if (clashed) {
          const def = 1 - atk
          hp[def] = Math.max(0, hp[def] - rand(0.18, 0.3))
          sparkT = 0.2
          F[def].m.hitFlash?.()
          if (hp[def] <= 0.03) {
            hp[def] = 0
            ko = def
            koT = 1.3
            sparkT = 0.34
          }
        }
        for (let i = 0; i < 2; i++) {
          const f = F[i]
          const hop = Math.pow(Math.abs(Math.sin(t * 2.5 + f.ph)), 0.7) * 0.16
          let x = -f.dir * BASE // dir points INWARD toward the foe
          if (i === atk) x += f.dir * 0.26 * lunge
          else x -= f.dir * 0.13 * knock
          f.m.group.position.set(x, hop, 0.05)
          f.m.update(dt)
        }
      }

      bars[0].set(hp[0], dt)
      bars[1].set(hp[1], dt)

      sparkT = Math.max(0, sparkT - dt)
      const sk = sparkT / 0.2
      hitSpark.position.set(0, 0.42, 0.12)
      hitSpark.material.opacity = Math.min(1, sk) * 0.95
      hitSpark.scale.setScalar(0.14 + (1 - Math.min(1, sk)) * 0.5 + (ko >= 0 ? 0.2 : 0))
    },
  }
}

// ---------- channel ----------

class Channel {
  constructor(def, idx, geos, mats) {
    this.def = def
    this.idx = idx
    this.focus = false
    this.hover = 0
    this.tiltTarget = { x: 0, y: 0 }
    this.tiltX = 0
    this.tiltY = 0

    const L = LAYOUT[idx]
    this.basePos = new THREE.Vector3(L.x, L.y, L.z)
    this.baseRot = { x: L.pitch, y: L.yaw }
    this.baseScale = L.scale ?? 1
    this.dolly = 3.2 * this.baseScale // camera stand-off that frames this channel

    const g = this.group = new THREE.Group()
    g.position.copy(this.basePos)
    g.rotation.set(this.baseRot.x, this.baseRot.y, 0)
    g.scale.setScalar(this.baseScale)

    const border = new THREE.Mesh(geos.border, mats.border)
    g.add(border)

    this.rimMat = glowMaterial(def.accent, 1.4)
    const rim = new THREE.Mesh(geos.rim, this.rimMat)
    rim.position.z = 0.155
    g.add(rim)

    if (def.flagship) {
      // grander flagship frame: crimson outer trim, ember corner studs, keystone crest
      const trim2 = new THREE.Mesh(geos.rim, glowMaterial(def.trim || '#c23b2e', 1.25))
      trim2.scale.setScalar(1.09)
      trim2.position.z = 0.11
      g.add(trim2)
      const studGeo = new THREE.OctahedronGeometry(0.085, 0)
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const stud = new THREE.Mesh(studGeo, this.rimMat)
        stud.position.set(sx * (W / 2 - 0.02), sy * (H / 2 - 0.02), 0.19)
        g.add(stud)
      }
      const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), glowMaterial('#ffb84d', 1.6))
      crest.scale.y = 1.6
      crest.position.set(0, H / 2 + 0.18, 0.08)
      g.add(crest)
    }

    const backTex = gradientTexture([[0, mix(def.accent, '#171009', 0.78)], [0.55, '#171009'], [1, '#0c0806']])
    const backPlane = new THREE.Mesh(geos.back, new THREE.MeshBasicMaterial({ map: backTex }))
    backPlane.position.z = 0.025
    g.add(backPlane)

    // hanging war banners in the top corners of the stone frame
    const bMat = new THREE.MeshBasicMaterial({
      map: bannerTexture(def.accent), transparent: true, side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.banners = []
    for (const [dx, ph] of [[-1.18, rand(TAU)], [1.18, rand(TAU)]]) {
      const b = new THREE.Mesh(geos.banner, bMat)
      b.position.set(dx, 0.86, 0.14)
      g.add(b)
      this.banners.push({ mesh: b, ph })
    }

    this.stage = { moba: mobaStage, hoops: hoopsStage, arena: arenaStage, kart: kartStage, brawl: brawlStage, siege: siegeStage, duel: duelStage }[def.game]()
    this.stage.group.scale.setScalar(0.78)
    this.stage.group.rotation.x = 0.3
    this.stage.group.position.set(0, -0.52, 0.28)
    g.add(this.stage.group)

    this.hit = new THREE.Mesh(geos.hit, mats.hit)
    this.hit.position.z = 0.55
    this.hit.userData.idx = idx
    g.add(this.hit)

    // static world-space anchors (frames only tilt/scale around origin)
    this.center = this.basePos.clone().add(new THREE.Vector3(0, 0, 0.2 * this.baseScale))
    // plates anchor per-layout: 'above' (clear sky over the crown row),
    // 'below' (under the flanks), 'brand' (flagship nameplate hugging the sill)
    const plateY = {
      above: H / 2 + 0.52,
      below: -H / 2 - 0.28,
      brand: -H / 2 - 0.1,
    }[L.plate] * this.baseScale
    this.plateAnchor = this.basePos.clone().add(new THREE.Vector3(Math.sin(this.baseRot.y) * 0.4, plateY, Math.cos(this.baseRot.y) * 0.4))
    this.normal = new THREE.Vector3(Math.sin(this.baseRot.y), 0, Math.cos(this.baseRot.y))

    this.accentColor = new THREE.Color(def.accent)
    this.t = rand(10)
  }

  update(dt) {
    this.t += dt
    const t = this.t
    this.hover = damp(this.hover, this.focus ? 1 : 0, 10, dt)
    const hv = this.hover

    this.tiltX = damp(this.tiltX, this.focus ? this.tiltTarget.x : 0, 8, dt)
    this.tiltY = damp(this.tiltY, this.focus ? this.tiltTarget.y : 0, 8, dt)

    this.group.scale.setScalar(this.baseScale * (1 + 0.06 * hv))
    this.group.position.y = this.basePos.y + Math.sin(t * 0.6) * 0.05

    const rx = this.baseRot.x + this.tiltX
    const ry = this.baseRot.y + this.tiltY + Math.sin(t * 0.5) * 0.012
    this.group.rotation.set(rx, ry, 0)

    const boost = 1.25 + 1.5 * hv + Math.sin(t * 2.4) * 0.12
    this.rimMat.color.copy(this.accentColor).multiplyScalar(boost)

    // banners sway in the mountain wind
    for (const b of this.banners) {
      b.mesh.rotation.z = Math.sin(t * 1.3 + b.ph) * 0.07
      b.mesh.rotation.x = Math.sin(t * 0.9 + b.ph * 2) * 0.05 - 0.04
    }

    this.stage.update(dt)
  }
}

function mix(a, b, k) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b)
  return '#' + ca.lerp(cb, k).getHexString()
}

/** Build the 7-channel wall (flagship Crucible centered). Returns { channels, hitMeshes }. */
export function buildChannelWall(scene) {
  const geos = buildGeos()
  const mats = {
    border: toonMaterial({ color: '#453c32', rim: '#d9b088', rimStrength: 0.5 }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  }
  const channels = CHANNEL_DEFS.map((def, i) => {
    const ch = new Channel(def, i, geos, mats)
    scene.add(ch.group)
    return ch
  })
  return { channels, hitMeshes: channels.map(c => c.hit) }
}
