import * as THREE from 'three'
import { lightShaft, fireflies } from '../art/environment.js'
import { sky } from '../art/sky.js'
import { horizonLayers } from '../art/backdrop.js'
import { toonMaterial, glowMaterial } from '../art/materials.js'
import { groundTexture, glowTexture, canvasTexture } from '../core/assets.js'
import { rand, TAU } from '../core/utils.js'

/** Non-indexed geometry + recomputed normals = faceted look without FLAT_SHADED
 * (the shared toon rim shader requires smooth-shading varyings). */
function faceted(geo) {
  const g = geo.toNonIndexed()
  g.computeVertexNormals()
  geo.dispose()
  return g
}

/** Low-poly jittered rock (local copy — avoids flatShading toon variant). */
function makeRock(color, scale) {
  const geo = new THREE.IcosahedronGeometry(0.55, 0)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * rand(0.8, 1.25), p.getY(i) * rand(0.6, 1.1), p.getZ(i) * rand(0.8, 1.25))
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, toonMaterial({ color, rim: '#b09878', rimStrength: 0.18 }))
  m.scale.setScalar(scale)
  m.position.y = 0.3 * scale
  m.rotation.y = rand(TAU)
  m.castShadow = true
  return m
}

/** Additive glow sprite (fire cores, torch glints). */
function glowSprite(color, opacity, scale) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  s.scale.setScalar(scale)
  return s
}

/**
 * Layered-sprite torch flame: gold core, ember mid, forge-fire halo.
 * Returns { group, tick } — tick flickers scale/opacity.
 */
function makeFlame(scale = 1) {
  const group = new THREE.Group()
  const layers = [
    { s: glowSprite('#ffe8b0', 0.95, 0.34 * scale), base: 0.34 * scale, op: 0.95, y: 0.05 * scale, sp: 11 },
    { s: glowSprite('#ffb84d', 0.7, 0.62 * scale), base: 0.62 * scale, op: 0.7, y: 0.1 * scale, sp: 8 },
    { s: glowSprite('#ff5a26', 0.42, 1.05 * scale), base: 1.05 * scale, op: 0.42, y: 0.16 * scale, sp: 6 },
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
      l.s.position.y = l.y + Math.sin(t * l.sp * 0.7 + l.ph) * 0.02 * scale
    }
  }
  return { group, tick }
}

/** Rising ember particle column. Returns { points, tick }. */
function makeEmbers({ count = 14, radius = 0.16, height = 1.6, color = '#ff9a4d', size = 0.09 } = {}) {
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count * 3) // x-offset, speed, phase
  for (let i = 0; i < count; i++) {
    seed[i * 3] = rand(TAU)
    seed[i * 3 + 1] = rand(0.35, 0.85)
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
        Math.cos(seed[i * 3] + t * 1.4) * radius * (0.4 + k),
        y,
        Math.sin(seed[i * 3] + t * 1.1) * radius * (0.4 + k),
      )
    }
    p.needsUpdate = true
  }
  return { points, tick }
}

/** Iron brazier: legs + bowl + coal glow + flame + embers. Returns { group, tick }. */
function makeBrazier(scale = 1) {
  const group = new THREE.Group()
  const iron = toonMaterial({ color: '#41444c', rim: '#9aa3b2', rimStrength: 0.3 })
  const bowl = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.32 * scale, 0.18 * scale, 0.22 * scale, 8, 1)), iron)
  bowl.position.y = 0.62 * scale
  bowl.castShadow = true
  group.add(bowl)
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * scale, 0.07 * scale, 0.52 * scale, 6), iron)
  stem.position.y = 0.26 * scale
  group.add(stem)
  const foot = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.16 * scale, 0.2 * scale, 0.07 * scale, 6, 1)), iron)
  foot.position.y = 0.035 * scale
  group.add(foot)
  const coals = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 10, 6, 0, TAU, 0, Math.PI / 2), glowMaterial('#ff5a26', 1.5))
  coals.scale.y = 0.4
  coals.position.y = 0.7 * scale
  group.add(coals)
  const flame = makeFlame(0.9 * scale)
  flame.group.position.y = 0.85 * scale
  group.add(flame.group)
  const embers = makeEmbers({ count: 10, radius: 0.12 * scale, height: 1.5 * scale })
  embers.points.position.y = 0.75 * scale
  group.add(embers.points)
  const ph = rand(TAU)
  const tick = (dt, t) => {
    flame.tick(dt, t)
    embers.tick(dt, t)
    coals.material.color.set('#ff5a26').multiplyScalar(1.3 + Math.sin(t * 7 + ph) * 0.3)
  }
  return { group, tick }
}

/** Stylized pine: dark trunk + stacked needle cones. */
function makePine(scale = 1) {
  const g = new THREE.Group()
  const trunkMat = toonMaterial({ color: '#3a2c20', rimStrength: 0.12 })
  const needleMat = toonMaterial({ color: '#2c4534', rim: '#6a8a5a', rimStrength: 0.22 })
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.5, 6), trunkMat)
  trunk.position.y = 0.25
  trunk.castShadow = true
  g.add(trunk)
  for (const [y, r, h] of [[0.62, 0.5, 0.7], [1.05, 0.38, 0.6], [1.42, 0.26, 0.5]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), needleMat)
    cone.position.y = y
    cone.castShadow = true
    g.add(cone)
  }
  g.scale.setScalar(scale * rand(0.85, 1.2))
  g.rotation.y = rand(TAU)
  return g
}

/** Ring of carved ember-runes (canvas texture on an additive ring band). */
function runeRingTexture(color) {
  return canvasTexture(512, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = color
    ctx.lineWidth = 4
    ctx.lineCap = 'square'
    let x = 10
    while (x < w - 24) {
      const runeW = rand(10, 20)
      const n = 2 + Math.floor(rand(3))
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const x1 = x + rand(runeW), y1 = rand(10, h - 10)
        const x2 = x + rand(runeW), y2 = rand(10, h - 10)
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
      }
      ctx.stroke()
      x += runeW + rand(10, 20)
    }
  })
}

/** Dusk battlefield sky: umber/indigo dome, embers of a dying sun, smoke clouds. */
export function buildSky(scene) {
  scene.fog = new THREE.Fog('#221420', 30, 140)
  scene.add(sky({
    top: '#120c1e', mid: '#2a1730', bottom: '#46232c',
    haze: '#6b3430', hazeAmt: 0.3,
    sunDir: new THREE.Vector3(0.25, 0.04, -0.97), sunColor: '#ff8c3b', sunSize: 55, sunBoost: 1.7,
    moonDir: new THREE.Vector3(-0.58, 0.4, 0.62), moonColor: '#b8c4de',
    stars: 0.85,
    clouds: { color: '#3a2430', shade: '#18101c', amount: 0.5, scale: 1.15, speed: 1 },
  }))
  // the world below: far mountain ranges ring the floating isles, war-camp
  // watch-fires burning on the nearer crest
  const ranges = horizonLayers({
    kind: 'peaks', count: 2,
    radius: [250, 370], height: [36, 54],
    colors: ['#251623', '#341d2d'],
    seeds: [23, 71], firesOn: 0, fireColor: '#ff9a4d', y: -16,
  })
  scene.add(ranges)
  return dt => ranges.tick(dt)
}

/** Warm firelight key + cool moonlight fill + ember/crimson rim points. */
export function buildLights(scene) {
  scene.add(new THREE.HemisphereLight('#56608c', '#3a2414', 0.7))
  const sun = new THREE.DirectionalLight('#ffb37a', 2.3)
  sun.position.set(-7, 11, 13)
  sun.target.position.set(0, 0, 2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const c = sun.shadow.camera
  c.left = c.bottom = -7
  c.right = c.top = 7
  c.near = 2
  c.far = 40
  sun.shadow.bias = -0.0004
  scene.add(sun, sun.target)

  const rimL = new THREE.PointLight('#ff8c3b', 70, 36, 2)
  rimL.position.set(-9.5, 4.5, 2)
  const rimR = new THREE.PointLight('#c23b2e', 60, 36, 2)
  rimR.position.set(9.5, 4.5, 2)
  const back = new THREE.PointLight('#5a6ac8', 90, 42, 2)
  back.position.set(0, 7, -9)
  scene.add(rimL, rimR, back)
}

/**
 * Floating stone hex courtyard: carved rune inlay, bronze band, iron braziers.
 * Returns { group, tick }. Place hero as a child so it rides the bob.
 */
export function buildPlatform(scene, glowColor = '#ff8c3b') {
  const group = new THREE.Group()
  const baseY = 0

  const sideMat = toonMaterial({ color: '#3a332b', rim: '#c9a06a', rimStrength: 0.28 })
  const topTex = groundTexture({ base: '#3e362e', blotches: ['#4a4238', '#332c24', '#504638', '#3a332b'], size: 512, count: 280, alpha: 0.2 })
  const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.92, metalness: 0.04, envMapIntensity: 0.3 })
  const deck = new THREE.Mesh(faceted(new THREE.CylinderGeometry(2.8, 2.5, 0.52, 6, 1)), [sideMat, topMat, sideMat])
  deck.rotation.y = Math.PI / 6
  deck.position.y = -0.26
  deck.receiveShadow = true
  deck.castShadow = true
  group.add(deck)

  // aged-bronze band around the rim + ember rune strip
  const bronzeMat = toonMaterial({ color: '#8a5a26', rim: '#ffd9a0', rimStrength: 0.45 })
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.84, 2.84, 0.11, 6, 1, true), bronzeMat)
  band.rotation.y = Math.PI / 6
  band.position.y = -0.03
  band.material.side = THREE.DoubleSide
  group.add(band)
  const runeTex = runeRingTexture('#ffd9a0')
  runeTex.wrapS = THREE.RepeatWrapping
  runeTex.repeat.set(3, 1)
  const runeBand = new THREE.Mesh(
    new THREE.CylinderGeometry(2.86, 2.86, 0.1, 48, 1, true),
    new THREE.MeshBasicMaterial({
      map: runeTex, color: new THREE.Color(glowColor).multiplyScalar(1.4),
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  )
  runeBand.position.y = -0.03
  group.add(runeBand)

  // carved rune inlay ring on the deck, glowing like banked embers
  const inlay = new THREE.Mesh(new THREE.RingGeometry(2.42, 2.56, 6), new THREE.MeshBasicMaterial({
    color: new THREE.Color(glowColor).multiplyScalar(1.15), transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }))
  inlay.rotation.x = -Math.PI / 2
  inlay.rotation.z = Math.PI / 6
  inlay.position.y = 0.012
  group.add(inlay)

  // craggy underside + hanging ember shards (rune-lit stone teeth)
  const under = new THREE.Mesh(faceted(new THREE.CylinderGeometry(2.48, 0.35, 2.4, 6, 2)), toonMaterial({ color: '#2a241e', rim: '#8a6a48', rimStrength: 0.25 }))
  under.rotation.y = Math.PI / 6
  under.position.y = -1.72
  group.add(under)
  for (const [x, z, s] of [[0.6, 0.3, 0.16], [-0.5, -0.4, 0.12], [0.1, -0.6, 0.1]]) {
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), glowMaterial(glowColor, 1.5))
    shard.scale.y = 1.8
    shard.position.set(x, -2.6 - s, z)
    group.add(shard)
  }

  // soft firelight under-halo
  const halo = glowSprite(glowColor, 0.26, 9)
  halo.position.y = -1.8
  group.add(halo)

  // iron braziers on three alternating hex points
  const braziers = []
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 6 + (i / 3) * TAU + Math.PI / 3
    const b = makeBrazier(0.9)
    b.group.position.set(Math.cos(a) * 2.25, 0, Math.sin(a) * 2.25)
    group.add(b.group)
    braziers.push(b)
  }

  // orbiting rubble
  const chips = []
  for (let i = 0; i < 3; i++) {
    const chip = makeRock('#463e34', rand(0.28, 0.45))
    group.add(chip)
    chips.push({ mesh: chip, a: (i / 3) * TAU, r: rand(3.4, 3.9), h: rand(-1.1, -0.3), sp: rand(0.12, 0.22), ph: rand(TAU) })
  }

  scene.add(group)
  let t0 = rand(10)
  const tick = dt => {
    t0 += dt
    group.position.y = baseY + Math.sin(t0 * 0.55) * 0.07
    runeBand.material.opacity = 0.7 + Math.sin(t0 * 2.2) * 0.2
    inlay.material.opacity = 0.36 + Math.sin(t0 * 2.2 + 1) * 0.12
    for (const b of braziers) b.tick(dt, t0)
    for (const c of chips) {
      c.a += dt * c.sp
      c.mesh.position.set(Math.cos(c.a) * c.r, c.h + Math.sin(t0 * 0.8 + c.ph) * 0.25, Math.sin(c.a) * c.r)
      c.mesh.rotation.y += dt * 0.4
    }
  }
  return { group, tick }
}

/** Parallax background: craggy mountain spires with pines + torch glints. Returns tick. */
export function buildIslands(scene) {
  const defs = [
    { pos: [-13, 2.0, -13], s: 1.15, pines: 2, torches: 2 },
    { pos: [14.5, 4.0, -18], s: 1.45, pines: 3, torches: 1 },
    { pos: [-19, 6.5, -27], s: 1.85, pines: 0, torches: 2 },
    { pos: [21, 8.5, -33], s: 2.2, pines: 3, torches: 0 },
    { pos: [-7.5, -3.2, 0.5], s: 0.75, pines: 1, torches: 1 },
    { pos: [9.5, -3.8, -2.5], s: 0.85, pines: 2, torches: 0 },
  ]
  const rockMat = toonMaterial({ color: '#46404c', rim: '#9a8ca0', rimStrength: 0.32 })
  const capMat = toonMaterial({ color: '#544840', rim: '#b09878', rimStrength: 0.3 })
  const snowMat = toonMaterial({ color: '#cfc4b0', rim: '#fff2d8', rimStrength: 0.4 })
  const items = []
  for (const d of defs) {
    const g = new THREE.Group()
    const s = d.s
    // craggy spire: broad mesa shoulder + jagged peak + short root below
    const shoulder = new THREE.Mesh(faceted(new THREE.CylinderGeometry(1.75 * s, 2.05 * s, 0.8 * s, 7, 1)), [rockMat, capMat, rockMat])
    shoulder.position.y = 0.1 * s
    g.add(shoulder)
    const peak = new THREE.Mesh(faceted(new THREE.ConeGeometry(1.0 * s, 1.9 * s, 6, 2)), rockMat)
    peak.position.set(rand(-0.3, 0.3) * s, 1.35 * s, rand(-0.3, 0.3) * s)
    peak.rotation.y = rand(TAU)
    g.add(peak)
    if (s >= 1.4) { // snow-dusted caps on the tall far crags
      const snow = new THREE.Mesh(faceted(new THREE.ConeGeometry(0.36 * s, 0.72 * s, 6, 1)), snowMat)
      snow.position.copy(peak.position)
      snow.position.y += 0.62 * s
      g.add(snow)
    }
    const fang = new THREE.Mesh(faceted(new THREE.ConeGeometry(0.55 * s, 1.15 * s, 5, 1)), rockMat)
    fang.position.set(rand(0.7, 1.1) * s * (Math.random() < 0.5 ? -1 : 1), 0.95 * s, rand(-0.5, 0.5) * s)
    fang.rotation.z = rand(-0.15, 0.15)
    g.add(fang)
    const root = new THREE.Mesh(faceted(new THREE.CylinderGeometry(2.0 * s, 0.12 * s, 1.55 * s, 7, 2)), toonMaterial({ color: '#2e2822', rim: '#6a5a48', rimStrength: 0.2 }))
    root.position.y = -0.95 * s
    g.add(root)
    const r1 = makeRock('#4a4440', 0.5 * s)
    r1.position.set(1.1 * s, 0.55 * s, 0.35 * s)
    g.add(r1)
    for (let i = 0; i < d.pines; i++) {
      const tr = makePine(0.9 * s)
      const a = rand(TAU)
      tr.position.set(Math.cos(a) * rand(0.7, 1.4) * s, 0.5 * s, Math.sin(a) * rand(0.7, 1.4) * s)
      g.add(tr)
    }
    // torch glints — far watchfires on the crags
    const torches = []
    for (let i = 0; i < d.torches; i++) {
      const spr = glowSprite('#ffb84d', 0.85, 0.7 * s)
      const a = rand(TAU)
      spr.position.set(Math.cos(a) * rand(0.6, 1.4) * s, rand(0.7, 1.5) * s, Math.sin(a) * rand(0.6, 1.4) * s)
      torches.push({ spr, ph: rand(TAU), base: 0.7 * s })
      g.add(spr)
    }
    g.position.set(...d.pos)
    g.rotation.y = rand(TAU)
    scene.add(g)
    items.push({ g, torches, baseY: d.pos[1], sp: rand(0.18, 0.34), amp: rand(0.35, 0.7), ph: rand(TAU), rot: rand(-0.02, 0.02) })
  }
  let t = rand(10)
  return dt => {
    t += dt
    for (const it of items) {
      it.g.position.y = it.baseY + Math.sin(t * it.sp + it.ph) * it.amp
      it.g.rotation.y += dt * it.rot
      for (const tc of it.torches) {
        const f = 0.75 + 0.25 * Math.sin(t * 9 + tc.ph) + 0.1 * Math.sin(t * 23 + tc.ph * 3)
        tc.spr.scale.setScalar(tc.base * f)
        tc.spr.material.opacity = 0.55 + 0.3 * f
      }
    }
  }
}

/** Ember-lit haze shafts + drifting embers and cool moon motes. Returns tick. */
export function buildAtmosphere(scene) {
  for (const [x, z, r, h] of [[-14, -30, 9, 42], [16, -34, 11, 46], [2, -40, 13, 50]]) {
    const shaft = lightShaft({ color: '#ff8c3b', radius: r, height: h, opacity: 0.012 })
    shaft.position.set(x, -8, z)
    scene.add(shaft)
  }
  const fliesWarm = fireflies({ count: 30, area: [24, 12], height: [0.5, 6], color: '#ffb066', size: 0.34 })
  fliesWarm.position.z = -1
  const fliesCool = fireflies({ count: 24, area: [44, 28], height: [2, 12], color: '#8a9ac8', size: 0.26 })
  fliesCool.position.z = -12
  scene.add(fliesWarm, fliesCool)
  return dt => {
    fliesWarm.tick(dt)
    fliesCool.tick(dt * 0.8)
  }
}
