import * as THREE from 'three'
import { skyDome, starField, crystal, lightShaft, fireflies } from '../art/environment.js'
import { groundTexture } from '../core/assets.js'
import { toonMaterial, glowMaterial } from '../art/materials.js'
import { rand, TAU } from '../core/utils.js'

const PEDESTAL_TOP = 0.64

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

function buildPedestal() {
  const g = new THREE.Group()
  const dark = toonMaterial({ color: '#161b3a', rim: '#7d9bff', rimStrength: 0.35 })
  const mid = toonMaterial({ color: '#1d2549', rim: '#8fb0ff', rimStrength: 0.4 })
  const tiers = [
    [1.9, 2.15, 0.18, 0.09, dark],
    [1.34, 1.6, 0.26, 0.31, mid],
    [1.12, 1.22, 0.2, 0.54, mid],
  ]
  for (const [rt, rb, h, y, m] of tiers) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 48), m)
    t.position.y = y
    t.castShadow = t.receiveShadow = true
    g.add(t)
  }
  for (const [r, tube, col, y] of [[1.62, 0.026, '#7df9ff', 0.2], [1.13, 0.02, '#b47dff', PEDESTAL_TOP]]) {
    const trim = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 64), glowMaterial(col, 1.3))
    trim.rotation.x = Math.PI / 2
    trim.position.y = y
    g.add(trim)
  }
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#3fd6ff').multiplyScalar(0.5), transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  )
  face.rotation.x = -Math.PI / 2
  face.position.y = PEDESTAL_TOP + 0.004
  g.add(face)
  return { group: g, face }
}

function runeShards() {
  const g = new THREE.Group()
  const items = []
  const colors = ['#7df9ff', '#b47dff', '#ff9de2']
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(i % 2 ? 0.06 : 0.1, 0),
      glowMaterial(colors[i % 3], 1.4),
    )
    g.add(m)
    items.push({ m, a: rand(TAU), r: rand(3.2, 5), y: rand(0.8, 3.2), sp: rand(0.12, 0.3) * (i % 2 ? 1 : -1), bob: rand(TAU) })
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

/**
 * Builds the dark "forge chamber": void sky, glowing ring floor, rotating
 * pedestal mount, crystals, shafts, motes and 3-point lighting.
 * Returns { turntable, heroMount, topY, tick(dt, t) }.
 */
export function buildForgeStage(scene) {
  scene.fog = new THREE.Fog('#080a1e', 14, 70)
  scene.add(skyDome({ top: '#020309', mid: '#0b0e2c', bottom: '#1e0c33', radius: 250 }))
  const stars = starField({ count: 520, radius: 225, size: 2.2 })
  scene.add(stars)

  const floorTex = groundTexture({ base: '#12162f', blotches: ['#1b2148', '#0d1024', '#252e63', '#191f47'], count: 500, alpha: 0.24 })
  floorTex.repeat.set(4, 4)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(46, 64),
    new THREE.MeshStandardMaterial({ map: floorTex, color: '#707aa8', roughness: 1, metalness: 0, envMapIntensity: 0.35 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const rings = [
    { m: floorRing(2.3, 2.44, '#7df9ff', 0.22), sp: 1.3, ph: 0 },
    { m: floorRing(4.3, 4.4, '#b47dff', 0.2), sp: 0.9, ph: 2 },
    { m: floorRing(6.9, 6.97, '#7df9ff', 0.13), sp: 0.7, ph: 4 },
    { m: floorRing(10, 10.06, '#b47dff', 0.09), sp: 0.5, ph: 1 },
  ]
  for (const r of rings) {
    r.m.position.y = 0.02
    r.base = r.m.material.opacity
    scene.add(r.m)
  }

  const turntable = new THREE.Group()
  scene.add(turntable)
  const ped = buildPedestal()
  turntable.add(ped.group)
  const heroMount = new THREE.Group()
  heroMount.position.y = PEDESTAL_TOP
  turntable.add(heroMount)

  const shards = runeShards()
  shards.position.z = -3.5 // keep the orbit behind the hero, away from camera
  scene.add(shards)

  const crystals = []
  for (const [x, z, c1, c2, h] of [
    [-8, -14, '#2a1546', '#c58fff', 5],
    [5.5, -12, '#0b3f66', '#54e0ff', 4.2],
    [-12.5, -7, '#43163b', '#ff7ad9', 3.4],
  ]) {
    const c = crystal({ color1: c1, color2: c2, height: h })
    c.position.set(x, 0, z)
    scene.add(c)
    crystals.push(c)
  }

  const shafts = []
  for (const [r, o, col] of [[1.6, 0.024, '#9fd8ff'], [2.4, 0.012, '#c58fff']]) {
    const s = lightShaft({ color: col, height: 20, radius: r, opacity: o })
    scene.add(s)
    shafts.push({ s, base: o })
  }

  const flies = fireflies({ count: 44, area: [26, 26], height: [0.4, 7], color: '#8fd0ff', size: 0.5 })
  scene.add(flies)

  // --- dramatic 3-point lighting ---
  scene.add(new THREE.HemisphereLight('#5f78d6', '#241a3c', 0.3))
  const key = new THREE.DirectionalLight('#cfe0ff', 1.7)
  key.position.set(3, 10, 5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = key.shadow.camera.bottom = -9
  key.shadow.camera.right = key.shadow.camera.top = 9
  key.shadow.camera.near = 2
  key.shadow.camera.far = 30
  key.shadow.bias = -0.002
  scene.add(key)
  const rim = new THREE.DirectionalLight('#ff9160', 2.1)
  rim.position.set(-6, 5, -7)
  scene.add(rim)
  const fill = new THREE.PointLight('#b47dff', 17, 24, 2)
  fill.position.set(-5, 3, 4.5)
  scene.add(fill)
  const under = new THREE.PointLight('#7df9ff', 6, 7, 2)
  under.position.set(0, 1, 0.6)
  scene.add(under)

  const tick = (dt, t) => {
    stars.rotation.y += dt * 0.004
    for (const r of rings) r.m.material.opacity = r.base * (0.7 + 0.3 * Math.sin(t * r.sp + r.ph))
    ped.face.material.opacity = 0.12 + 0.05 * Math.sin(t * 1.7)
    shards.tick(dt, t)
    for (const c of crystals) c.tick(dt)
    for (const sh of shafts) {
      sh.s.material.opacity = sh.base * (0.75 + 0.25 * Math.sin(t * 0.7))
      sh.s.rotation.z = Math.sin(t * 0.23) * 0.04
    }
    flies.tick(dt)
    under.intensity = 5.5 + Math.sin(t * 2.3) * 1.5
  }

  return { turntable, heroMount, topY: PEDESTAL_TOP, tick }
}
