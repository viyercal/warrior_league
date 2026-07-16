import * as THREE from 'three'
import { skyDome, starField, cloudLayer, crystal, tree, lightShaft, fireflies } from '../art/environment.js'
import { toonMaterial, glowMaterial } from '../art/materials.js'
import { groundTexture, glowTexture } from '../core/assets.js'
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
  const m = new THREE.Mesh(geo, toonMaterial({ color, rimStrength: 0.18 }))
  m.scale.setScalar(scale)
  m.position.y = 0.3 * scale
  m.rotation.y = rand(TAU)
  m.castShadow = true
  return m
}

/** Dusk-to-night sky, stars, drifting clouds, fog. Returns tick(dt,t). */
export function buildSky(scene) {
  scene.fog = new THREE.Fog('#33285e', 30, 140)
  scene.add(skyDome({
    top: '#090e30', mid: '#43398c', bottom: '#8a3644',
    sunDir: new THREE.Vector3(0.25, 0.03, -0.97), sunColor: '#ff9a55', sunSize: 140,
  }))
  const stars = starField({ count: 900, size: 2.2 })
  scene.add(stars)
  const cloudsLow = cloudLayer({ count: 9, radius: 230, height: [38, 85], color: '#c98ac2', opacity: 0.42 })
  const cloudsHigh = cloudLayer({ count: 7, radius: 300, height: [95, 160], color: '#5560b8', opacity: 0.3, scale: [80, 150] })
  scene.add(cloudsLow, cloudsHigh)
  return dt => {
    stars.rotation.y += dt * 0.004
    cloudsLow.tick(dt)
    cloudsHigh.tick(dt * 1.7)
  }
}

/** One shadow sun, hemisphere fill, colored rim points. */
export function buildLights(scene) {
  scene.add(new THREE.HemisphereLight('#7d86ff', '#31234a', 0.75))
  const sun = new THREE.DirectionalLight('#ffcf9e', 2.3)
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

  const rimL = new THREE.PointLight('#ff4fd8', 70, 36, 2)
  rimL.position.set(-9.5, 4.5, 2)
  const rimR = new THREE.PointLight('#38e0c8', 60, 36, 2)
  rimR.position.set(9.5, 4.5, 2)
  const back = new THREE.PointLight('#6a5bff', 90, 42, 2)
  back.position.set(0, 7, -9)
  scene.add(rimL, rimR, back)
}

/**
 * Floating hex hero platform with glowing trim. Returns { group, tick }.
 * Place hero as a child so it rides the bob.
 */
export function buildPlatform(scene, glowColor = '#7df9ff') {
  const group = new THREE.Group()
  const baseY = 0

  const sideMat = toonMaterial({ color: '#2a3163', rim: '#8fa3ff', rimStrength: 0.35 })
  const topTex = groundTexture({ base: '#3d4784', blotches: ['#4a58a5', '#2c356b', '#5563b8', '#443a8a'], size: 512, count: 260 })
  const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.88, metalness: 0.08, envMapIntensity: 0.45 })
  const deck = new THREE.Mesh(faceted(new THREE.CylinderGeometry(2.8, 2.5, 0.52, 6, 1)), [sideMat, topMat, sideMat])
  deck.rotation.y = Math.PI / 6
  deck.position.y = -0.26
  deck.receiveShadow = true
  deck.castShadow = true
  group.add(deck)

  // glowing trim: hex band around edge + inlay ring on deck
  const trimMat = glowMaterial(glowColor, 1.3)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.82, 2.82, 0.09, 6, 1, true), trimMat)
  band.rotation.y = Math.PI / 6
  band.position.y = -0.02
  group.add(band)
  const inlay = new THREE.Mesh(new THREE.RingGeometry(2.42, 2.56, 6), new THREE.MeshBasicMaterial({
    color: new THREE.Color(glowColor).multiplyScalar(1.2), transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }))
  inlay.rotation.x = -Math.PI / 2
  inlay.rotation.z = Math.PI / 6
  inlay.position.y = 0.012
  group.add(inlay)

  // rocky underside cone + hanging crystals
  const under = new THREE.Mesh(faceted(new THREE.CylinderGeometry(2.48, 0.35, 2.4, 6, 2)), toonMaterial({ color: '#232a52', rim: '#5a6bff', rimStrength: 0.3 }))
  under.rotation.y = Math.PI / 6
  under.position.y = -1.72
  group.add(under)
  for (const [x, z, s] of [[0.6, 0.3, 0.16], [-0.5, -0.4, 0.12], [0.1, -0.6, 0.1]]) {
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), glowMaterial(glowColor, 1.6))
    shard.scale.y = 1.8
    shard.position.set(x, -2.6 - s, z)
    group.add(shard)
  }

  // soft under-halo
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: glowColor, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  halo.scale.setScalar(9)
  halo.position.y = -1.8
  group.add(halo)

  // orbiting rock chips
  const chips = []
  for (let i = 0; i < 3; i++) {
    const chip = makeRock('#39406f', rand(0.28, 0.45))
    group.add(chip)
    chips.push({ mesh: chip, a: (i / 3) * TAU, r: rand(3.4, 3.9), h: rand(-1.1, -0.3), sp: rand(0.12, 0.22), ph: rand(TAU) })
  }

  scene.add(group)
  let t0 = rand(10)
  const tick = dt => {
    t0 += dt
    group.position.y = baseY + Math.sin(t0 * 0.55) * 0.07
    band.material.color.set(glowColor).multiplyScalar(0.85 + Math.sin(t0 * 2.2) * 0.18)
    inlay.material.opacity = 0.38 + Math.sin(t0 * 2.2 + 1) * 0.12
    for (const c of chips) {
      c.a += dt * c.sp
      c.mesh.position.set(Math.cos(c.a) * c.r, c.h + Math.sin(t0 * 0.8 + c.ph) * 0.25, Math.sin(c.a) * c.r)
      c.mesh.rotation.y += dt * 0.4
    }
  }
  return { group, tick }
}

/** Parallax background: floating rock islands drifting at depths. Returns tick. */
export function buildIslands(scene) {
  const defs = [
    { pos: [-13, 2.0, -13], s: 1.15, tree: true, cry: '#54e0ff', grass: '#2f8f4f' },
    { pos: [14.5, 4.0, -18], s: 1.45, tree: true, cry: '#ff9de2', grass: '#3f8f6b' },
    { pos: [-19, 6.5, -27], s: 1.85, tree: false, cry: '#b47dff', grass: '#356b8f' },
    { pos: [21, 8.5, -33], s: 2.2, tree: true, cry: null, grass: '#2f8f4f' },
    { pos: [-7.5, -3.2, 0.5], s: 0.75, tree: false, cry: '#7dffa8', grass: '#3f9158' },
    { pos: [9.5, -3.8, -2.5], s: 0.85, tree: true, cry: null, grass: '#3f8f6b' },
  ]
  const items = []
  for (const d of defs) {
    const g = new THREE.Group()
    const s = d.s
    const sideMat = toonMaterial({ color: '#4a3b58', rim: '#a88ad4', rimStrength: 0.3 })
    const topMat = toonMaterial({ color: d.grass, rim: '#d8ffd0', rimStrength: 0.3 })
    const cap = new THREE.Mesh(faceted(new THREE.CylinderGeometry(1.5 * s, 1.05 * s, 0.5 * s, 7, 1)), [sideMat, topMat, sideMat])
    g.add(cap)
    const cone = new THREE.Mesh(faceted(new THREE.CylinderGeometry(1.02 * s, 0.06 * s, 1.7 * s, 7, 2)), sideMat)
    cone.position.y = -1.1 * s
    g.add(cone)
    const r1 = makeRock('#5b4a6b', 0.5 * s)
    r1.position.set(0.6 * s, 0.25 * s, 0.3 * s)
    g.add(r1)
    if (d.tree) {
      const tr = tree({ leaves: d.grass === '#356b8f' ? '#4a9db8' : '#3aa060', scale: 0.8 * s })
      tr.position.set(-0.45 * s, 0.25 * s, -0.1 * s)
      g.add(tr)
    }
    let cry = null
    if (d.cry) {
      cry = crystal({ color1: '#1a1040', color2: d.cry, height: 1.3 * s })
      cry.position.set(0.35 * s, 0.25 * s, -0.45 * s)
      g.add(cry)
    }
    g.position.set(...d.pos)
    g.rotation.y = rand(TAU)
    scene.add(g)
    items.push({ g, cry, baseY: d.pos[1], sp: rand(0.18, 0.34), amp: rand(0.35, 0.7), ph: rand(TAU), rot: rand(-0.02, 0.02) })
  }
  let t = rand(10)
  return dt => {
    t += dt
    for (const it of items) {
      it.g.position.y = it.baseY + Math.sin(t * it.sp + it.ph) * it.amp
      it.g.rotation.y += dt * it.rot
      it.cry?.tick(dt)
    }
  }
}

/** God rays + fireflies. Returns tick. */
export function buildAtmosphere(scene) {
  for (const [x, z, r, h] of [[-14, -30, 9, 42], [16, -34, 11, 46], [2, -40, 13, 50]]) {
    const shaft = lightShaft({ color: '#ff9a5a', radius: r, height: h, opacity: 0.014 })
    shaft.position.set(x, -8, z)
    scene.add(shaft)
  }
  const fliesWarm = fireflies({ count: 26, area: [24, 12], height: [0.5, 6], color: '#ffd98a', size: 0.34 })
  fliesWarm.position.z = -1
  const fliesCool = fireflies({ count: 30, area: [44, 28], height: [2, 12], color: '#8ad8ff', size: 0.3 })
  fliesCool.position.z = -12
  scene.add(fliesWarm, fliesCool)
  return dt => {
    fliesWarm.tick(dt)
    fliesCool.tick(dt * 0.8)
  }
}
