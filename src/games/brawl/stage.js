import * as THREE from 'three'
import { canvasTexture, cloudTexture, groundTexture } from '../../core/assets.js'
import { toonMaterial, glowMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { skyDome, starField, cloudLayer, crystal, tree, lightShaft, fireflies } from '../../art/environment.js'
import { rand, TAU } from '../../core/utils.js'

/** Collision data — index 0 is the solid main island, the rest are pass-through. */
export const MAIN = { x: 0, y: 0, halfW: 13, solid: true }
export const PLATFORMS = [
  MAIN,
  { x: -7.5, y: 3.6, halfW: 3.4, solid: false },
  { x: 7.2, y: 6.2, halfW: 3.1, solid: false },
]
export const BLAST = { x: 26, bottom: -14, top: 22 }

const GLOW_CYAN = '#7df9ff'

/** Jittered cone with baked flat normals (material flatShading fights the toon rim shader). */
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

/** Low-poly rock with baked flat normals (shared rock() uses flatShading → shader error). */
function stageRock({ color = '#8b93a7', scale = 1 } = {}) {
  let geo = new THREE.IcosahedronGeometry(0.55, 0)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * rand(0.8, 1.25), p.getY(i) * rand(0.6, 1.1), p.getZ(i) * rand(0.8, 1.25))
  }
  geo = geo.toNonIndexed()
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, toonMaterial({ color, rimStrength: 0.2, rim: '#ffd9a0' }))
  m.scale.setScalar(scale)
  m.position.y = 0.3 * scale
  m.rotation.y = rand(TAU)
  m.castShadow = true
  return m
}

function runeTexture() {
  return canvasTexture(1024, 96, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#aef6ff'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    for (let i = 0; i < 18; i++) {
      const cx = 30 + i * 54, cy = h / 2
      ctx.beginPath()
      for (let s = 0; s < 4; s++) {
        ctx.moveTo(cx + rand(-16, 16), cy + rand(-26, 26))
        ctx.lineTo(cx + rand(-16, 16), cy + rand(-26, 26))
      }
      ctx.stroke()
    }
  })
}

function mainIsland(tickables) {
  const g = new THREE.Group()
  const grassTex = groundTexture({
    base: '#1f7d36', blotches: ['#35984a', '#175e29', '#4cb35e', '#28903e'], count: 480, alpha: 0.26,
  })
  grassTex.repeat.set(3.4, 1)
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.92, metalness: 0, envMapIntensity: 0.2 })
  const sideMat = toonMaterial({ color: '#6d5a48', rim: '#ffd9a0', rimStrength: 0.3 })
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(26, 1.1, 6.6),
    [sideMat, sideMat, grassMat, sideMat, sideMat, sideMat],
  )
  slab.position.y = -0.55
  slab.castShadow = true
  slab.receiveShadow = true
  g.add(slab)

  // rocky underside tapering to a point
  const under = new THREE.Mesh(
    jitterCone(8.6, 8.6, 11),
    toonMaterial({ color: '#584a3d', rim: '#ff9a6a', rimStrength: 0.55 }),
  )
  under.rotation.x = Math.PI
  under.position.y = -5.15
  under.castShadow = true
  g.add(under)

  // glowing rune trim along the front face
  const runeMat = new THREE.MeshBasicMaterial({
    map: runeTexture(), color: new THREE.Color(GLOW_CYAN).multiplyScalar(1.65),
    transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const runes = new THREE.Mesh(new THREE.PlaneGeometry(25.2, 0.62), runeMat)
  runes.position.set(0, -0.42, 3.32)
  g.add(runes)
  const trim = new THREE.Mesh(new THREE.BoxGeometry(26.1, 0.06, 0.06), glowMaterial(GLOW_CYAN, 1.7))
  trim.position.set(0, -0.02, 3.32)
  g.add(trim)
  let runeT = 0
  tickables.push({ tick: dt => { runeT += dt; runeMat.opacity = 0.62 + 0.3 * Math.sin(runeT * 2.2) } })

  // soft under-glow halo
  const halo = new THREE.Sprite(glowSpriteMaterial(GLOW_CYAN, 0.16))
  halo.scale.set(24, 12, 1)
  halo.position.y = -3.4
  g.add(halo)

  // top decoration (kept behind the fight plane)
  const t1 = tree({ leaves: '#2f9e58', scale: 1.2 })
  t1.position.set(-11.2, 0, -2)
  const t2 = tree({ leaves: '#43b262', scale: 0.9 })
  t2.position.set(11, 0, -2.3)
  g.add(t1, t2)
  const r1 = stageRock({ color: '#7f8ba1', scale: 0.9 })
  r1.position.set(-9.4, 0, -2.4)
  const r2 = stageRock({ color: '#93876f', scale: 0.6 })
  r2.position.set(9, 0, -2.6)
  g.add(r1, r2)
  for (const [x, c1, c2] of [[-12.2, '#33175c', '#c58fff'], [12.3, '#0b3f66', '#54e0ff']]) {
    const c = crystal({ color1: c1, color2: c2, height: 1.7 })
    c.position.set(x, 0, -2.2)
    g.add(c)
    tickables.push(c)
  }
  // hanging crystals under the island
  for (const [x, y] of [[-4.6, -3.1], [3.8, -4]]) {
    const c = crystal({ color1: '#3a1f66', color2: '#c58fff', height: 1.2 })
    c.rotation.x = Math.PI
    c.position.set(x, y, 0.6)
    g.add(c)
    tickables.push(c)
  }
  return g
}

function floatPlatform(p, tickables) {
  const g = new THREE.Group()
  g.position.set(p.x, p.y, 0)
  const grassTex = groundTexture({ base: '#26893e', blotches: ['#3da653', '#1c6630'], size: 256, count: 90, alpha: 0.22 })
  const topMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.92, envMapIntensity: 0.2 })
  const sideMat = toonMaterial({ color: '#66584a', rim: '#cfe9ff', rimStrength: 0.3 })
  const slab = new THREE.Mesh(new THREE.BoxGeometry(p.halfW * 2, 0.42, 2.8), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat])
  slab.position.y = -0.21
  slab.castShadow = true
  slab.receiveShadow = true
  g.add(slab)
  const under = new THREE.Mesh(
    jitterCone(p.halfW * 0.62, 1.7, 8),
    toonMaterial({ color: '#544738', rim: '#ff9a6a', rimStrength: 0.5 }),
  )
  under.rotation.x = Math.PI
  under.position.y = -1.15
  under.castShadow = true
  g.add(under)
  const trimMat = glowMaterial(GLOW_CYAN, 1.6)
  const trim = new THREE.Mesh(new THREE.BoxGeometry(p.halfW * 2 + 0.1, 0.07, 0.07), trimMat)
  trim.position.set(0, -0.44, 1.42)
  g.add(trim)
  const halo = new THREE.Sprite(glowSpriteMaterial(GLOW_CYAN, 0.14))
  halo.scale.set(p.halfW * 2.4, 3.4, 1)
  halo.position.y = -0.8
  g.add(halo)
  let tt = rand(10)
  tickables.push({ tick: dt => { tt += dt; halo.material.opacity = 0.1 + 0.06 * Math.sin(tt * 1.8) } })
  return g
}

function bgIsland({ x, y, z, s, deco }, mats, tickables) {
  const g = new THREE.Group()
  const under = new THREE.Mesh(jitterCone(3, 4.4, 8), mats.rock)
  under.rotation.x = Math.PI
  under.position.y = -2.4
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.25, 0.5, 12), mats.grass)
  top.position.y = -0.1
  g.add(under, top)
  if (deco === 'tree') {
    const t = tree({ leaves: '#256b3e', scale: 1.5 })
    t.position.y = 0.1
    g.add(t)
  } else {
    const c = crystal({ color1: '#123a66', color2: '#54e0ff', height: 2.2 })
    g.add(c)
    tickables.push(c)
  }
  g.position.set(x, y, z)
  g.scale.setScalar(s)
  const phase = rand(TAU)
  let tt = 0
  tickables.push({ tick: dt => { tt += dt; g.position.y = y + Math.sin(tt * 0.24 + phase) * 1.4 } })
  return g
}

/** Build the whole floating sky-island stage. Returns { tickables }. */
export function buildStage(scene) {
  const tickables = []
  scene.fog = new THREE.Fog('#7e57c2', 130, 460)

  scene.add(skyDome({
    top: '#131a4e', mid: '#5f45c9', bottom: '#f26b3a',
    sunDir: new THREE.Vector3(-0.45, 0.35, -0.62), sunColor: '#ffd9a0', sunSize: 190,
  }))
  scene.add(starField({ count: 620, radius: 420, size: 2.1, color: '#e9f2ff' }))

  const cloudsBelow = cloudLayer({ count: 16, radius: 150, height: [-36, -12], opacity: 0.62, scale: [42, 95] })
  const cloudsFar = cloudLayer({ count: 10, radius: 300, height: [18, 70], opacity: 0.3, scale: [75, 140], color: '#ffd9c9' })
  scene.add(cloudsBelow, cloudsFar)
  tickables.push(cloudsBelow, cloudsFar)

  // hand-placed puffs drifting just under the island, visible in frame
  const puffTex = cloudTexture()
  const puffs = new THREE.Group()
  const puffData = []
  for (const [x, y, z, s] of [[-20, -10, -14, 38], [12, -14, -10, 48], [30, -9, -20, 34], [-34, -16, -8, 44], [2, -18, -16, 56], [-9, -7.5, 5, 26], [16, -11, 6, 30]]) {
    const mat = new THREE.SpriteMaterial({ map: puffTex, color: '#fff1e6', transparent: true, opacity: rand(0.65, 0.85), depthWrite: false })
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

  // lights
  scene.add(new THREE.HemisphereLight('#a8bcff', '#6b4570', 0.42))
  const sun = new THREE.DirectionalLight('#ffd9a8', 1.6)
  sun.position.set(-14, 24, -15)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 24, bottom: -14, near: 4, far: 80 })
  sun.shadow.camera.updateProjectionMatrix()
  sun.shadow.bias = -0.0004
  scene.add(sun, sun.target)

  // god rays from the sun side
  for (const [x, y, z, rz, sc, op] of [[-24, 6, -30, -0.5, 1.4, 0.05], [-10, 10, -44, -0.35, 1.9, 0.035]]) {
    const shaft = lightShaft({ color: '#ffe0b5', height: 34, radius: 7, opacity: op })
    shaft.position.set(x, y, z)
    shaft.rotation.z = rz
    shaft.scale.setScalar(sc)
    scene.add(shaft)
  }

  // stage
  scene.add(mainIsland(tickables))
  for (let i = 1; i < PLATFORMS.length; i++) scene.add(floatPlatform(PLATFORMS[i], tickables))

  // distant parallax islands — kept dark + far so they read as backdrop
  const mats = {
    rock: toonMaterial({ color: '#332a4d', rim: '#b98cf0', rimStrength: 0.45 }),
    grass: toonMaterial({ color: '#2c7a46', rim: '#ffcf9a', rimStrength: 0.35 }),
  }
  const islands = [
    { x: -72, y: -9, z: -95, s: 2.8, deco: 'tree' },
    { x: 58, y: 8, z: -120, s: 3.4, deco: 'crystal' },
    { x: -30, y: 19, z: -150, s: 4.2, deco: 'tree' },
    { x: 92, y: -14, z: -90, s: 2.4, deco: 'crystal' },
    { x: 16, y: 30, z: -180, s: 5, deco: 'tree' },
    { x: -120, y: 4, z: -120, s: 3.6, deco: 'crystal' },
  ]
  for (const isl of islands) scene.add(bgIsland(isl, mats, tickables))

  // fireflies near the stage + drifting wind motes
  const flies = fireflies({ count: 32, area: [34, 10], height: [0.5, 9], color: '#ffe27a', size: 0.65 })
  const wind = fireflies({ count: 60, area: [80, 34], height: [-8, 16], color: '#cfe4ff', size: 0.26 })
  scene.add(flies, wind)
  tickables.push(flies, wind)

  return { tickables }
}
