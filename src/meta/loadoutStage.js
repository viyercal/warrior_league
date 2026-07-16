import * as THREE from 'three'
import { skyDome, starField, lightShaft, fireflies } from '../art/environment.js'
import { groundTexture, glowTexture } from '../core/assets.js'
import { toonMaterial, glowMaterial } from '../art/materials.js'
import { rand, TAU } from '../core/utils.js'

const DAIS_TOP = 0.64

/** One shared armory material set per stage build (disposed with the scene). */
function makeMats() {
  return {
    stone: toonMaterial({ color: '#3a332a', rim: '#c9a06a', rimStrength: 0.32 }),
    stoneDark: toonMaterial({ color: '#332c25', rim: '#8a6a48', rimStrength: 0.28 }),
    iron: toonMaterial({ color: '#565a63', rim: '#b8c0cc', rimStrength: 0.4 }),
    steel: toonMaterial({ color: '#9aa3ae', rim: '#e8f0f8', rimStrength: 0.55 }),
    bronze: toonMaterial({ color: '#8a5a26', rim: '#ffd9a0', rimStrength: 0.5 }),
    wood: toonMaterial({ color: '#4a352a', rim: '#b0793a', rimStrength: 0.3 }),
    leather: toonMaterial({ color: '#5c3d28', rim: '#c9885a', rimStrength: 0.3 }),
    crimson: toonMaterial({ color: '#8a2a24', rim: '#e07a5a', rimStrength: 0.4 }),
  }
}

function glowSprite(color, opacity, scale) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  s.scale.setScalar(scale)
  return s
}

/** Layered forge-flame sprite stack. Returns { group, tick }. */
function makeFlame(scale = 1) {
  const group = new THREE.Group()
  const layers = [
    { s: glowSprite('#ffe8b0', 0.95, 0.4 * scale), base: 0.4 * scale, op: 0.95, y: 0.04 * scale, sp: 11 },
    { s: glowSprite('#ffb84d', 0.7, 0.75 * scale), base: 0.75 * scale, op: 0.7, y: 0.1 * scale, sp: 8 },
    { s: glowSprite('#ff5a26', 0.42, 1.25 * scale), base: 1.25 * scale, op: 0.42, y: 0.18 * scale, sp: 6 },
  ]
  for (const l of layers) {
    l.s.position.y = l.y
    l.ph = rand(TAU)
    group.add(l.s)
  }
  const tick = (dt, t) => {
    for (const l of layers) {
      const f = 0.82 + 0.18 * Math.sin(t * l.sp + l.ph) + 0.08 * Math.sin(t * l.sp * 2.7 + l.ph * 2)
      l.s.scale.set(l.base * f, l.base * (f + 0.14), 1)
      l.s.material.opacity = l.op * (0.75 + 0.25 * f)
    }
  }
  return { group, tick }
}

/** Rising ember motes above the hearth. Returns { points, tick }. */
function makeEmbers({ count = 20, radius = 0.5, height = 3.4, color = '#ff9a4d', size = 0.14 } = {}) {
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    seed[i * 3] = rand(TAU)
    seed[i * 3 + 1] = rand(0.4, 1.0)
    seed[i * 3 + 2] = rand(height)
    pos[i * 3] = Math.cos(seed[i * 3]) * rand(radius)
    pos[i * 3 + 1] = seed[i * 3 + 2]
    pos[i * 3 + 2] = Math.sin(seed[i * 3]) * rand(radius)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    map: glowTexture(), color, size, transparent: true, opacity: 0.85,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }))
  const tick = (dt, t) => {
    const p = points.geometry.attributes.position
    for (let i = 0; i < count; i++) {
      let y = p.getY(i) + seed[i * 3 + 1] * dt
      if (y > height) y -= height
      const k = y / height
      p.setXYZ(i,
        Math.cos(seed[i * 3] + t * 1.2) * radius * (0.3 + k * 0.9),
        y,
        Math.sin(seed[i * 3] + t * 0.9) * radius * (0.3 + k * 0.9),
      )
    }
    p.needsUpdate = true
  }
  return { points, tick }
}

function floorRing(inner, outer, color, opacity) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 96),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.25),
      transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  )
  mesh.rotation.x = -Math.PI / 2
  return mesh
}

/** Stone dais with bronze inlay rings + ember face. */
function buildDais(m) {
  const g = new THREE.Group()
  const tiers = [
    [1.9, 2.15, 0.18, 0.09, m.stoneDark],
    [1.34, 1.6, 0.26, 0.31, m.stone],
    [1.12, 1.22, 0.2, 0.54, m.stone],
  ]
  for (const [rt, rb, h, y, mm] of tiers) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 48), mm)
    t.position.y = y
    t.castShadow = t.receiveShadow = true
    g.add(t)
  }
  // bronze inlay rings, glowing like banked forge-light
  for (const [r, tube, col, y] of [[1.62, 0.026, '#ffb84d', 0.2], [1.13, 0.02, '#ff8c3b', DAIS_TOP]]) {
    const trim = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 64), glowMaterial(col, 1.15))
    trim.rotation.x = Math.PI / 2
    trim.position.y = y
    g.add(trim)
  }
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ff8c3b').multiplyScalar(0.55), transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  )
  face.rotation.x = -Math.PI / 2
  face.position.y = DAIS_TOP + 0.004
  g.add(face)
  return { group: g, face }
}

/** Orbiting ember-rune shards (was rune crystals — now sparks of the forge). */
function runeShards() {
  const g = new THREE.Group()
  const items = []
  const colors = ['#ffb84d', '#ff8c3b', '#c23b2e']
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(i % 2 ? 0.045 : 0.07, 0),
      glowMaterial(colors[i % 3], 1.4),
    )
    g.add(m)
    items.push({ m, a: rand(TAU), r: rand(3.6, 5.2), y: rand(0.8, 3.2), sp: rand(0.12, 0.3) * (i % 2 ? 1 : -1), bob: rand(TAU) })
  }
  g.tick = (dt, t) => {
    for (const it of items) {
      it.a += it.sp * dt
      it.m.position.set(Math.cos(it.a) * it.r, it.y + Math.sin(t * 1.3 + it.bob) * 0.25, Math.sin(it.a) * it.r)
      it.m.rotation.y += dt * 1.2
      it.m.rotation.x += dt * 0.7
    }
  }
  return g
}

/** The forge hearth: stone furnace, fire mouth, chimney, flame + embers. */
function buildHearth(m) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.35, 1.3), m.stoneDark)
  body.position.y = 0.675
  body.castShadow = body.receiveShadow = true
  g.add(body)
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 1.5), m.stone)
  cap.position.y = 1.42
  cap.castShadow = true
  g.add(cap)
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.5, 7), m.stoneDark)
  chimney.position.set(-0.3, 2.2, -0.15)
  g.add(chimney)
  // burning mouth
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.6), glowMaterial('#ff5a26', 1.6))
  mouth.position.set(0, 0.62, 0.655)
  g.add(mouth)
  const mouthFrame = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 20, Math.PI), m.bronze)
  mouthFrame.position.set(0, 0.42, 0.66)
  g.add(mouthFrame)
  const flame = makeFlame(1.5)
  flame.group.position.set(0, 0.8, 0.7)
  g.add(flame.group)
  const emb = makeEmbers({ count: 22, radius: 0.5, height: 3.6 })
  emb.points.position.set(0, 1.0, 0.4)
  g.add(emb.points)
  // coal pile spilling out
  const coals = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, TAU, 0, Math.PI / 2), glowMaterial('#ff7a30', 1.25))
  coals.scale.set(1.4, 0.35, 1)
  coals.position.set(0, 0.02, 0.85)
  g.add(coals)
  const tick = (dt, t) => {
    flame.tick(dt, t)
    emb.tick(dt, t)
    mouth.material.color.set('#ff5a26').multiplyScalar(1.35 + Math.sin(t * 6.3) * 0.3)
  }
  return { group: g, tick }
}

/** Anvil on an oak stump. */
function buildAnvil(m) {
  const g = new THREE.Group()
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 9), m.wood)
  stump.position.y = 0.25
  stump.castShadow = stump.receiveShadow = true
  g.add(stump)
  const waist = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.24), m.iron)
  waist.position.y = 0.61
  g.add(waist)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.3), m.iron)
  body.position.y = 0.8
  body.castShadow = true
  g.add(body)
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.4, 8), m.iron)
  horn.rotation.z = Math.PI / 2
  horn.position.set(0.52, 0.8, 0)
  g.add(horn)
  // resting warhammer
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 6), m.wood)
  haft.rotation.z = 0.9
  haft.position.set(-0.32, 1.05, 0.05)
  g.add(haft)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.13), m.steel)
  head.position.set(-0.06, 1.28, 0.05)
  head.rotation.z = 0.9
  g.add(head)
  return g
}

/** Weapon rack: timber frame + leaning blades and spears. */
function buildRack(m) {
  const g = new THREE.Group()
  for (const dx of [-0.8, 0.8]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6), m.wood)
    post.position.set(dx, 0.75, 0)
    post.castShadow = true
    g.add(post)
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.75, 6), m.wood)
  bar.rotation.z = Math.PI / 2
  bar.position.y = 1.32
  g.add(bar)
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.4), m.stoneDark)
  base.position.y = 0.05
  base.receiveShadow = true
  g.add(base)
  // swords
  const bladeGeo = new THREE.BoxGeometry(0.055, 0.85, 0.016)
  const guardGeo = new THREE.BoxGeometry(0.16, 0.035, 0.04)
  const gripGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6)
  for (const [x, lean] of [[-0.52, 0.12], [-0.18, -0.08], [0.18, 0.06]]) {
    const sw = new THREE.Group()
    const blade = new THREE.Mesh(bladeGeo, m.steel)
    blade.position.y = 0.62
    blade.castShadow = true
    sw.add(blade)
    const guard = new THREE.Mesh(guardGeo, m.bronze)
    guard.position.y = 0.2
    sw.add(guard)
    const grip = new THREE.Mesh(gripGeo, m.leather)
    grip.position.y = 0.11
    sw.add(grip)
    sw.position.set(x, 0.28, 0.1)
    sw.rotation.z = lean
    sw.rotation.x = -0.12
    g.add(sw)
  }
  // spear
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.7, 6), m.wood)
  shaft.position.set(0.58, 0.86, 0.08)
  shaft.rotation.z = -0.1
  g.add(shaft)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), m.steel)
  tip.position.set(0.665, 1.78, 0.08)
  tip.rotation.z = -0.1
  g.add(tip)
  return g
}

/** Shield wall: rough stone slab bearing three round war-shields. */
function buildShieldWall(m) {
  const g = new THREE.Group()
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.3, 0.35), m.stone)
  wall.position.y = 1.15
  wall.castShadow = wall.receiveShadow = true
  g.add(wall)
  const cap = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 0.5), m.stone)
  cap.position.y = 2.38
  g.add(cap)
  const faceGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.07, 18)
  const rimGeo = new THREE.TorusGeometry(0.42, 0.035, 8, 24)
  const bossGeo = new THREE.SphereGeometry(0.09, 10, 8)
  for (const [x, y, mm] of [[-1.05, 1.25, m.crimson], [0, 1.05, m.leather], [1.05, 1.3, m.crimson]]) {
    const shield = new THREE.Group()
    const face = new THREE.Mesh(faceGeo, mm)
    face.rotation.x = Math.PI / 2
    shield.add(face)
    const rim = new THREE.Mesh(rimGeo, m.bronze)
    shield.add(rim)
    const boss = new THREE.Mesh(bossGeo, m.bronze)
    boss.position.z = 0.07
    shield.add(boss)
    shield.position.set(x, y, 0.24)
    shield.rotation.z = rand(-0.15, 0.15)
    g.add(shield)
  }
  return g
}

/** Standing torch post with flame. Returns { group, tick }. */
function buildTorch(m) {
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 2.0, 7), m.wood)
  pole.position.y = 1.0
  pole.castShadow = true
  g.add(pole)
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.18, 6, 1, true), m.iron)
  cage.material.side = THREE.DoubleSide
  cage.position.y = 2.05
  g.add(cage)
  const flame = makeFlame(0.85)
  flame.group.position.y = 2.25
  g.add(flame.group)
  return { group: g, tick: flame.tick }
}

/**
 * Builds the armory forge: smoke-dark sky, stone floor with bronze inlay
 * rings, rotating stone dais, hearth + anvil + racks + shield wall, ember
 * motes and firelight. Returns { turntable, heroMount, topY, tick(dt, t) }.
 */
export function buildForgeStage(scene) {
  scene.fog = new THREE.Fog('#140d0a', 14, 70)
  scene.add(skyDome({ top: '#0c0709', mid: '#221114', bottom: '#3a1c12', radius: 250 }))
  const stars = starField({ count: 380, radius: 225, size: 2.0, color: '#ffd9a8' })
  scene.add(stars)

  const floorTex = groundTexture({ base: '#2c2620', blotches: ['#3a332a', '#211c16', '#453c30', '#332c24'], count: 500, alpha: 0.24 })
  floorTex.repeat.set(4, 4)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(46, 64),
    new THREE.MeshStandardMaterial({ map: floorTex, color: '#a89a88', roughness: 1, metalness: 0, envMapIntensity: 0.3 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // bronze inlay rings radiating from the dais
  const rings = [
    { m: floorRing(2.3, 2.44, '#ffb84d', 0.2), sp: 1.3, ph: 0 },
    { m: floorRing(4.3, 4.4, '#c23b2e', 0.16), sp: 0.9, ph: 2 },
    { m: floorRing(6.9, 6.97, '#ffb84d', 0.11), sp: 0.7, ph: 4 },
    { m: floorRing(10, 10.06, '#ff8c3b', 0.08), sp: 0.5, ph: 1 },
  ]
  for (const r of rings) {
    r.m.position.y = 0.02
    r.base = r.m.material.opacity
    scene.add(r.m)
  }

  const M = makeMats()
  const turntable = new THREE.Group()
  scene.add(turntable)
  const ped = buildDais(M)
  turntable.add(ped.group)
  const heroMount = new THREE.Group()
  heroMount.position.y = DAIS_TOP
  turntable.add(heroMount)

  const shards = runeShards()
  shards.position.z = -3.5 // keep the orbit behind the hero, away from camera
  scene.add(shards)

  // ---- armory props ----
  const hearth = buildHearth(M)
  hearth.group.position.set(-5.6, 0, -5.6)
  hearth.group.rotation.y = 0.75
  scene.add(hearth.group)

  const anvil = buildAnvil(M)
  anvil.position.set(-3.2, 0, -1.6)
  anvil.rotation.y = 0.5
  scene.add(anvil)

  const rack = buildRack(M)
  rack.position.set(-6.4, 0, -1.8)
  rack.rotation.y = 1.05
  scene.add(rack)
  const rack2 = buildRack(M)
  rack2.position.set(6.2, 0, -4.6)
  rack2.rotation.y = -0.7
  scene.add(rack2)

  const shieldWall = buildShieldWall(M)
  shieldWall.position.set(-3.4, 0, -8.6)
  shieldWall.rotation.y = 0.4
  scene.add(shieldWall)

  const torches = []
  for (const [x, z, ry] of [[-2.6, 1.6, 0], [3.4, -2.4, 0], [1.2, -7.4, 0]]) {
    const tc = buildTorch(M)
    tc.group.position.set(x, 0, z)
    tc.group.rotation.y = ry
    scene.add(tc.group)
    torches.push(tc)
  }

  const shafts = []
  for (const [r, o, col] of [[1.6, 0.02, '#ffb37a'], [2.4, 0.011, '#ff8c3b']]) {
    const s = lightShaft({ color: col, height: 20, radius: r, opacity: o })
    scene.add(s)
    shafts.push({ s, base: o })
  }

  const flies = fireflies({ count: 40, area: [26, 26], height: [0.4, 7], color: '#ffb066', size: 0.5 })
  scene.add(flies)

  // --- firelight three-point rig: warm key, cool moon rim, forge fill ---
  scene.add(new THREE.HemisphereLight('#544c66', '#2a1c12', 0.45))
  const key = new THREE.DirectionalLight('#ffd9b0', 1.7)
  key.position.set(3, 10, 5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = key.shadow.camera.bottom = -9
  key.shadow.camera.right = key.shadow.camera.top = 9
  key.shadow.camera.near = 2
  key.shadow.camera.far = 30
  key.shadow.bias = -0.002
  scene.add(key)
  const rim = new THREE.DirectionalLight('#8a9ac8', 1.5)
  rim.position.set(-6, 5, -7)
  scene.add(rim)
  const forgeLight = new THREE.PointLight('#ff6a2e', 30, 18, 2)
  forgeLight.position.set(-5.2, 1.6, -4.8)
  scene.add(forgeLight)
  const under = new THREE.PointLight('#ff8c3b', 6, 7, 2)
  under.position.set(0, 1, 0.6)
  scene.add(under)

  const tick = (dt, t) => {
    stars.rotation.y += dt * 0.004
    for (const r of rings) r.m.material.opacity = r.base * (0.7 + 0.3 * Math.sin(t * r.sp + r.ph))
    ped.face.material.opacity = 0.11 + 0.05 * Math.sin(t * 1.7)
    shards.tick(dt, t)
    hearth.tick(dt, t)
    for (const tc of torches) tc.tick(dt, t)
    for (const sh of shafts) {
      sh.s.material.opacity = sh.base * (0.75 + 0.25 * Math.sin(t * 0.7))
      sh.s.rotation.z = Math.sin(t * 0.23) * 0.04
    }
    flies.tick(dt)
    under.intensity = 5.5 + Math.sin(t * 2.3) * 1.5
    forgeLight.intensity = 27 + Math.sin(t * 6.1) * 4 + Math.sin(t * 13.7) * 2
  }

  return { turntable, heroMount, topY: DAIS_TOP, tick }
}
