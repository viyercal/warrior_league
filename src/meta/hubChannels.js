import * as THREE from 'three'
import { toonMaterial, glowMaterial, energyMaterial } from '../art/materials.js'
import { canvasTexture, gradientTexture, groundTexture, glowTexture } from '../core/assets.js'
import { createMinion } from '../art/characterFactory.js'
import { crystal } from '../art/environment.js'
import { rand, damp, clamp, TAU, angleLerp } from '../core/utils.js'

export const CHANNEL_DEFS = [
  { title: 'RIFT LEGENDS', sub: '5V5 LANE WARFARE', game: 'moba', accent: '#3fe8a8' },
  { title: 'SLAM CITY 2K', sub: 'ARCADE B-BALL', game: 'hoops', accent: '#ff9a3c' },
  { title: 'NOVA ARENA', sub: 'HORDE SURVIVAL', game: 'arena', accent: '#ff4fd8' },
  { title: 'SIEGE PROTOCOL', sub: 'COMING SOON', locked: true, accent: '#8ea2d8' },
  { title: 'TURBO KART GP', sub: 'COMING SOON', locked: true, accent: '#8ea2d8' },
  { title: 'BRAWL STADIUM', sub: 'COMING SOON', locked: true, accent: '#8ea2d8' },
]

const W = 3.3, H = 2.1, R = 0.26, B = 0.15
const COL_X = [-3.95, 0, 3.95]
const COL_Z = [-2.35, -3.1, -2.35]
const COL_YAW = [0.17, 0, -0.17]
const ROW_Y = { play: 2.3, lock: 5.0 }

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
  return {
    border: new THREE.ExtrudeGeometry(border, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 2, curveSegments: 5 }),
    rim: new THREE.ExtrudeGeometry(rim, { depth: 0.03, bevelEnabled: false, curveSegments: 5 }),
    back: new THREE.ShapeGeometry(roundedRect(iw, ih, ir), 5),
    hit: new THREE.PlaneGeometry(W + 0.25, H + 0.25),
  }
}

// ---------- diorama stages ----------

function mobaStage() {
  const stage = new THREE.Group()
  const tex = groundTexture({ base: '#25683a', blotches: ['#2f7a48', '#1d5230', '#398a50'], size: 256, count: 130 })
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.98, 26), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, envMapIntensity: 0.35 }))
  floor.rotation.x = -Math.PI / 2
  floor.scale.set(1.42, 1, 1)
  stage.add(floor)
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.4), new THREE.MeshStandardMaterial({ color: '#8a6b3f', roughness: 1, envMapIntensity: 0.35 }))
  lane.rotation.x = -Math.PI / 2
  lane.position.y = 0.006
  stage.add(lane)

  const nexus = crystal({ color1: '#0b4f3f', color2: '#3fffc0', height: 1.15 })
  nexus.scale.setScalar(0.6)
  nexus.position.set(-1.12, 0, -0.12)
  stage.add(nexus)

  const mobs = [
    { m: createMinion({ color: '#8ff0cc', scale: 0.55 }), x: -0.7, z: 0.14, dir: 1, sp: 0.5 },
    { m: createMinion({ color: '#ff8585', evil: true, scale: 0.55 }), x: 0.6, z: -0.16, dir: -1, sp: 0.42 },
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

function courtTexture() {
  return canvasTexture(256, 140, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#a8794a')
    g.addColorStop(1, '#8a5c30')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(90,50,20,0.25)'
    ctx.lineWidth = 2
    for (let x = 0; x < w; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    ctx.strokeStyle = 'rgba(255,245,230,0.6)'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(w * 0.35, h / 2, 26, 0, TAU); ctx.stroke()
    ctx.strokeRect(w - 66, h / 2 - 34, 60, 68)
    ctx.beginPath(); ctx.moveTo(w * 0.35, 0); ctx.lineTo(w * 0.35, h); ctx.stroke()
  })
}

function hoopsStage() {
  const stage = new THREE.Group()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 1.3), new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.7, envMapIntensity: 0.45 }))
  floor.rotation.x = -Math.PI / 2
  stage.add(floor)

  // hoop assembly on the right, facing court center
  const hoop = new THREE.Group()
  hoop.position.set(1.02, 0, 0)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.95, 8), toonMaterial({ color: '#2c3350', rimStrength: 0.3 }))
  pole.position.y = 0.47
  hoop.add(pole)
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.44), toonMaterial({ color: '#e8ecf5', rim: '#ffffff', rimStrength: 0.4 }))
  board.position.set(-0.04, 0.88, 0)
  hoop.add(board)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 8, 20), glowMaterial('#ff8c3c', 1.7))
  rim.rotation.x = Math.PI / 2
  rim.position.set(-0.17, 0.78, 0)
  hoop.add(rim)
  const net = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.06, 0.14, 8, 2, true),
    new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.4 }),
  )
  net.position.set(-0.17, 0.7, 0)
  hoop.add(net)
  stage.add(hoop)

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 12), toonMaterial({ color: '#ff8c3c', rim: '#ffd9a0', rimStrength: 0.55 }))
  ball.castShadow = false
  stage.add(ball)
  const ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: '#ff9a3c', transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  ballGlow.material.opacity = 0.25
  ballGlow.scale.setScalar(0.45)
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
      rim.material.color.set('#ff8c3c').multiplyScalar(1.5 + Math.sin(t * 2) * 0.3)
    },
  }
}

function arenaStage() {
  const stage = new THREE.Group()
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.02, 0.09, 30),
    energyMaterial({ color1: '#38104f', color2: '#ff4fd8', speed: 0.8, intensity: 0.68 }),
  )
  disc.position.y = -0.045
  stage.add(disc)
  const edge = new THREE.Mesh(new THREE.TorusGeometry(0.99, 0.02, 8, 40), glowMaterial('#ff7ae4', 1.3))
  edge.rotation.x = Math.PI / 2
  stage.add(edge)

  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), glowMaterial('#ff9df0', 2.6))
  const orbHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: '#ff4fd8', transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  orbHalo.material.opacity = 0.4
  orbHalo.scale.setScalar(0.7)
  stage.add(orb, orbHalo)

  const mobs = [
    { m: createMinion({ color: '#a06bff', evil: true, scale: 0.52 }), a: 0, sp: 1.15 },
    { m: createMinion({ color: '#ff6b9a', evil: true, scale: 0.52 }), a: Math.PI, sp: 1.15 },
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

function staticTexture() {
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    const img = ctx.createImageData(w, h)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  })
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

function questionTexture(color) {
  return canvasTexture(256, 320, (ctx, w, h) => {
    ctx.font = '900 235px Avenir Next, Arial Black, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = color
    ctx.shadowBlur = 22
    ctx.fillStyle = color
    ctx.fillText('?', w / 2, h / 2 + 12)
    ctx.shadowBlur = 0
    ctx.globalAlpha = 0.55
    ctx.fillStyle = '#e8efff'
    ctx.fillText('?', w / 2, h / 2 + 12)
  })
}

function lockedStage(accent) {
  const stage = new THREE.Group()
  const st = staticTexture()
  st.repeat.set(2, 1.4)
  const staticPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 2 * B - 0.06, H - 2 * B - 0.06),
    new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: 0.1, color: '#7d8fd0', blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  staticPlane.position.z = 0.02
  stage.add(staticPlane)

  const qMat = new THREE.MeshBasicMaterial({ map: questionTexture(accent), transparent: true, depthWrite: false })
  const q = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.06), qMat)
  q.position.z = 0.1
  stage.add(q)

  // sweeping sheen bar
  const sheen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 2.6),
    new THREE.MeshBasicMaterial({
      map: gradientTexture([[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(255,255,255,1)'], [1, 'rgba(0,0,0,0)']], { vertical: false }),
      transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, color: '#bcd0ff',
    }),
  )
  sheen.rotation.z = 0.42
  sheen.position.z = 0.16
  stage.add(sheen)

  let t = rand(10)
  let glitchT = 0, nextGlitch = rand(1.6, 3.6)
  return {
    group: stage,
    update(dt) {
      t += dt
      nextGlitch -= dt
      if (nextGlitch <= 0) { glitchT = 0.14; nextGlitch = rand(1.8, 4) }
      glitchT = Math.max(0, glitchT - dt)
      const glitch = glitchT > 0
      st.offset.set(Math.random(), Math.random())
      staticPlane.material.opacity = glitch ? 0.3 : 0.07 + Math.sin(t * 1.3) * 0.03
      q.position.x = glitch ? rand(-0.05, 0.05) : 0
      q.position.y = Math.sin(t * 1.6) * 0.05
      const pulse = 0.58 + Math.sin(t * 2.1) * 0.2
      qMat.opacity = glitch ? rand(0.25, 1) : pulse
      q.scale.setScalar(1 + Math.sin(t * 2.1) * 0.045)
      sheen.position.x = -1.9 + ((t * 0.9) % 3.6)
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
    this.shakeT = 0
    this.tiltTarget = { x: 0, y: 0 }
    this.tiltX = 0
    this.tiltY = 0

    const col = idx % 3
    const y = def.locked ? ROW_Y.lock : ROW_Y.play
    this.basePos = new THREE.Vector3(COL_X[col], y, COL_Z[col])
    this.baseRot = { x: def.locked ? 0.12 : -0.02, y: COL_YAW[col] }

    const g = this.group = new THREE.Group()
    g.position.copy(this.basePos)
    g.rotation.set(this.baseRot.x, this.baseRot.y, 0)

    const border = new THREE.Mesh(geos.border, def.locked ? mats.borderLock : mats.borderPlay)
    g.add(border)

    this.rimMat = glowMaterial(def.accent, def.locked ? 0.55 : 1.4)
    const rim = new THREE.Mesh(geos.rim, this.rimMat)
    rim.position.z = 0.155
    g.add(rim)

    const backTex = def.locked
      ? gradientTexture([[0, '#10142a'], [0.6, '#0a0d1e'], [1, '#05070f']])
      : gradientTexture([[0, mix(def.accent, '#0a0e22', 0.72)], [0.55, '#0a0e22'], [1, '#060810']])
    const back = new THREE.Mesh(geos.back, new THREE.MeshBasicMaterial({ map: backTex }))
    back.position.z = 0.025
    g.add(back)

    this.stage = def.locked ? lockedStage(def.accent) : { moba: mobaStage, hoops: hoopsStage, arena: arenaStage }[def.game]()
    if (!def.locked) {
      this.stage.group.scale.setScalar(0.78)
      this.stage.group.rotation.x = 0.3
      this.stage.group.position.set(0, -0.52, 0.28)
    }
    g.add(this.stage.group)

    this.hit = new THREE.Mesh(geos.hit, mats.hit)
    this.hit.position.z = 0.55
    this.hit.userData.idx = idx
    g.add(this.hit)

    // static world-space anchors (frames only tilt/scale around origin)
    this.center = this.basePos.clone().add(new THREE.Vector3(0, 0, 0.2))
    // locked plates go ABOVE their frame (clear sky) so they never overlap the playable row below
    const plateY = def.locked ? H / 2 + 0.42 : -H / 2 - 0.28
    this.plateAnchor = this.basePos.clone().add(new THREE.Vector3(Math.sin(this.baseRot.y) * 0.4, plateY, Math.cos(this.baseRot.y) * 0.4))
    this.normal = new THREE.Vector3(Math.sin(this.baseRot.y), 0, Math.cos(this.baseRot.y))

    this.accentColor = new THREE.Color(def.accent)
    this.t = rand(10)
  }

  shake() { this.shakeT = 0.45 }

  update(dt) {
    this.t += dt
    const t = this.t
    this.hover = damp(this.hover, this.focus ? 1 : 0, 10, dt)
    const hv = this.hover

    this.tiltX = damp(this.tiltX, this.focus ? this.tiltTarget.x : 0, 8, dt)
    this.tiltY = damp(this.tiltY, this.focus ? this.tiltTarget.y : 0, 8, dt)

    this.group.scale.setScalar(1 + 0.06 * hv)
    this.group.position.y = this.basePos.y + Math.sin(t * 0.6) * 0.05

    let rx = this.baseRot.x + this.tiltX
    let ry = this.baseRot.y + this.tiltY + Math.sin(t * 0.5) * 0.012
    let rz = 0
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt)
      const k = this.shakeT
      rz += Math.sin(t * 70) * 0.09 * k
      ry += Math.sin(t * 47) * 0.07 * k
    }
    this.group.rotation.set(rx, ry, rz)

    const boost = this.def.locked ? 0.5 + 0.55 * hv : 1.25 + 1.5 * hv + Math.sin(t * 2.4) * 0.12
    this.rimMat.color.copy(this.accentColor).multiplyScalar(boost)

    this.stage.update(dt)
  }
}

function mix(a, b, k) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b)
  return '#' + ca.lerp(cb, k).getHexString()
}

/** Build the 6-channel wall. Returns { channels, hitMeshes }. */
export function buildChannelWall(scene) {
  const geos = buildGeos()
  const mats = {
    borderPlay: toonMaterial({ color: '#39426e', rim: '#aac0ff', rimStrength: 0.65 }),
    borderLock: toonMaterial({ color: '#1a1f36', rim: '#55618c', rimStrength: 0.45 }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  }
  const channels = CHANNEL_DEFS.map((def, i) => {
    const ch = new Channel(def, i, geos, mats)
    scene.add(ch.group)
    return ch
  })
  return { channels, hitMeshes: channels.map(c => c.hit) }
}
