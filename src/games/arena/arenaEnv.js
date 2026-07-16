import * as THREE from 'three'
import { skyDome, starField, cloudLayer, crystal, fireflies } from '../../art/environment.js'
import { canvasTexture, glowTexture } from '../../core/assets.js'
import { glowMaterial, energyMaterial, toonMaterial } from '../../art/materials.js'
import { rand, TAU } from '../../core/utils.js'

export const ARENA_R = 26

/**
 * Local faceted space rock. The shared rock() helper uses material
 * flatShading, which conflicts with the toon rim shader — instead we bake
 * flat normals into non-indexed geometry.
 */
function spaceRock(color, scale) {
  const geo = new THREE.IcosahedronGeometry(0.55, 0)
  const p = geo.attributes.position
  const seed = rand(100)
  const jit = v => 0.72 + 0.5 * Math.abs(Math.sin(v * 437.5453 + seed))
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const k = jit(x * 12.9 + y * 7.13 + z * 3.71)
    p.setXYZ(i, x * k, y * k * 0.85, z * k)
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, toonMaterial({ color, rim: '#b48fff', rimStrength: 0.4 }))
  m.scale.setScalar(scale)
  m.rotation.set(rand(TAU), rand(TAU), rand(TAU))
  return m
}

/** Emissive circuit-disc floor art: concentric neon rings + radial spokes. */
function drawFloor(ctx, w, h) {
  const cx = w / 2, cy = h / 2, R = w / 2
  ctx.fillStyle = '#0a0c1d'
  ctx.fillRect(0, 0, w, h)

  // radial shading: violet core glow fading to dark edge
  let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
  g.addColorStop(0, 'rgba(44,36,92,0.35)')
  g.addColorStop(0.5, 'rgba(20,17,48,0.25)')
  g.addColorStop(1, 'rgba(5,5,16,0.85)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // metal panel noise
  for (let i = 0; i < 300; i++) {
    const a = rand(TAU), r = Math.sqrt(Math.random()) * R
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
    const s = rand(12, 70)
    ctx.globalAlpha = rand(0.02, 0.07)
    ctx.fillStyle = Math.random() < 0.5 ? '#1c2450' : '#05060f'
    ctx.fillRect(x, y, s, s * rand(0.35, 1))
  }
  ctx.globalAlpha = 1

  // radial spokes
  ctx.save()
  ctx.translate(cx, cy)
  for (let i = 0; i < 24; i++) {
    const a = (i * TAU) / 24
    ctx.strokeStyle = i % 2 ? 'rgba(90,225,255,0.07)' : 'rgba(255,90,220,0.055)'
    ctx.lineWidth = i % 6 === 0 ? 5 : 2
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * R * 0.085, Math.sin(a) * R * 0.085)
    ctx.lineTo(Math.cos(a) * R * 0.985, Math.sin(a) * R * 0.985)
    ctx.stroke()
  }
  ctx.restore()

  // concentric circuit rings: [radiusFrac, lineWidth, color, alpha, dash]
  const rings = [
    [0.985, 10, '#ff54dc', 0.6, null],
    [0.945, 3, '#54e0ff', 0.3, [90, 42]],
    [0.86, 6, '#ff54dc', 0.32, [190, 70]],
    [0.78, 2.5, '#a06bff', 0.25, [36, 26]],
    [0.7, 4.5, '#54e0ff', 0.36, null],
    [0.56, 5, '#ff54dc', 0.28, [150, 64]],
    [0.44, 3, '#54e0ff', 0.33, [72, 34]],
    [0.32, 2.5, '#a06bff', 0.25, [30, 22]],
    [0.2, 6, '#54e0ff', 0.42, null],
    [0.115, 3.5, '#ff54dc', 0.45, [26, 16]],
  ]
  for (const [f, lw, col, alpha, dash] of rings) {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = col
    ctx.lineWidth = lw
    ctx.shadowColor = col
    ctx.shadowBlur = 14
    ctx.setLineDash(dash || [])
    ctx.beginPath()
    ctx.arc(cx, cy, R * f, 0, TAU)
    ctx.stroke()
    ctx.restore()
  }

  // circuit nodes: bright pads sitting on rings
  const nodeRings = [0.2, 0.44, 0.7, 0.86]
  for (let i = 0; i < 70; i++) {
    const f = nodeRings[Math.floor(rand(nodeRings.length))]
    const a = rand(TAU)
    const x = cx + Math.cos(a) * R * f, y = cy + Math.sin(a) * R * f
    const col = Math.random() < 0.5 ? '#8af0ff' : '#ff8ae8'
    ctx.save()
    ctx.fillStyle = col
    ctx.shadowColor = col
    ctx.shadowBlur = 10
    ctx.globalAlpha = rand(0.3, 0.6)
    ctx.fillRect(x - 4, y - 4, 8, 8)
    ctx.restore()
  }

  // center core emblem (kept dim — the hero stands here)
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.shadowColor = '#7df9ff'
  ctx.shadowBlur = 18
  ctx.fillStyle = '#6fd8ec'
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.016, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = '#7df9ff'
  ctx.lineWidth = 3
  ctx.globalAlpha = 0.35
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.05, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

/**
 * Builds the whole NOVA ARENA environment into `scene`.
 * Returns { tickables, gates, rimMat, rimBase } — caller ticks tickables,
 * flashes gates on spawn, and pulses rimMat when the hero hits the wall.
 */
export function buildArena(scene) {
  const tickables = []

  // ---------- deep space ----------
  scene.fog = new THREE.Fog('#221040', 60, 240)
  scene.add(skyDome({
    top: '#170b3e', mid: '#5b2094', bottom: '#0a0524',
    sunDir: new THREE.Vector3(0.55, -0.06, -0.8), sunColor: '#ff4fd8', sunSize: 20,
  }))
  const starsUp = starField({ count: 800, size: 2.2 })
  const starsDown = starField({ count: 750, size: 2.0 })
  starsDown.rotation.x = Math.PI
  scene.add(starsUp, starsDown)

  const wispsLow = cloudLayer({ count: 13, radius: 230, height: [-130, -30], color: '#d05cff', opacity: 0.45, scale: [80, 150] })
  const wispsHigh = cloudLayer({ count: 10, radius: 210, height: [16, 85], color: '#4f9dff', opacity: 0.32, scale: [60, 125] })
  scene.add(wispsLow, wispsHigh)
  tickables.push(wispsLow, wispsHigh)

  // orbiting debris field below / around the disc (parallax)
  const orbit = new THREE.Group()
  for (let i = 0; i < 11; i++) {
    const r = spaceRock(i % 3 ? '#494672' : '#5d5490', rand(1.8, 4.8))
    const a = rand(TAU), rr = rand(33, 58)
    r.position.set(Math.cos(a) * rr, rand(-24, -4), Math.sin(a) * rr)
    orbit.add(r)
  }
  for (let i = 0; i < 4; i++) {
    const c = crystal(i % 2
      ? { color1: '#4a0d46', color2: '#ff5ae0', height: rand(3.6, 5.6) }
      : { color1: '#0b2f66', color2: '#54b7ff', height: rand(3.2, 5) })
    const a = rand(TAU), rr = rand(30, 46)
    c.position.set(Math.cos(a) * rr, rand(-15, -4), Math.sin(a) * rr)
    orbit.add(c)
    tickables.push(c)
  }
  orbit.tick = dt => { orbit.rotation.y += dt * 0.017 }
  scene.add(orbit)
  tickables.push(orbit)

  // ---------- the disc ----------
  const floorTex = canvasTexture(2048, 2048, drawFloor)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_R, 96),
    new THREE.MeshStandardMaterial({
      map: floorTex, emissiveMap: floorTex, emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.42, roughness: 0.68, metalness: 0.25,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_R, ARENA_R - 1.4, 3.4, 96, 1, true),
    new THREE.MeshStandardMaterial({ color: '#141833', roughness: 0.4, metalness: 0.8 }),
  )
  skirt.position.y = -1.7
  scene.add(skirt)

  const rimMat = glowMaterial('#ff4fd8', 2.1)
  const rimHot = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R + 0.1, 0.17, 10, 128), rimMat)
  rimHot.rotation.x = Math.PI / 2
  rimHot.position.y = 0.14
  const rimCool = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R - 1.05, 0.07, 8, 128), glowMaterial('#54e0ff', 1.8))
  rimCool.rotation.x = Math.PI / 2
  rimCool.position.y = 0.1
  const rimUnder = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R - 0.4, 0.14, 8, 96), glowMaterial('#7a2bff', 1.5))
  rimUnder.rotation.x = Math.PI / 2
  rimUnder.position.y = -3.35
  scene.add(rimHot, rimCool, rimUnder)

  const under = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: '#b23fd8', transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  under.scale.set(100, 55, 1)
  under.position.y = -10
  scene.add(under)

  // ---------- pylons ----------
  const pedGeo = new THREE.CylinderGeometry(0.9, 1.25, 0.7, 8)
  const pedMat = toonMaterial({ color: '#1b2144', rim: '#7d9bff', rimStrength: 0.4 })
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6
    const x = Math.cos(a) * 24.2, z = Math.sin(a) * 24.2
    const ped = new THREE.Mesh(pedGeo, pedMat)
    ped.position.set(x, 0.35, z)
    ped.castShadow = true
    scene.add(ped)
    const cr = crystal(i % 2
      ? { color1: '#55104f', color2: '#ff5ae0', height: 2.9 }
      : { color1: '#0b3f66', color2: '#54e0ff', height: 2.9 })
    cr.position.set(x, 0.6, z)
    scene.add(cr)
    tickables.push(cr)
    const light = new THREE.PointLight(i % 2 ? '#ff5ae0' : '#54e0ff', 30, 16, 2)
    light.position.set(x, 2.8, z)
    scene.add(light)
  }

  // ---------- spawn gates ----------
  const gates = []
  const pillarGeo = new THREE.BoxGeometry(0.55, 3.6, 0.55)
  const pillarMat = toonMaterial({ color: '#221a4a', rim: '#c58fff', rimStrength: 0.55 })
  const archGeo = new THREE.TorusGeometry(1.75, 0.16, 10, 26, Math.PI)
  const portalGeo = new THREE.CircleGeometry(1.5, 26)
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) * TAU) / 6
    const g = new THREE.Group()
    g.position.set(Math.cos(a) * 25.3, 0, Math.sin(a) * 25.3)
    g.lookAt(0, 0, 0)
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(pillarGeo, pillarMat)
      p.position.set(1.75 * s, 1.8, 0)
      p.castShadow = true
      g.add(p)
    }
    const archMat = glowMaterial('#c04fff', 1.5)
    const arch = new THREE.Mesh(archGeo, archMat)
    arch.position.y = 3.45
    g.add(arch)
    const portalMat = energyMaterial({ color1: '#2a0a4a', color2: '#c85aff', speed: 1.7, intensity: 1.1 })
    portalMat.side = THREE.DoubleSide
    const portal = new THREE.Mesh(portalGeo, portalMat)
    portal.position.y = 1.8
    g.add(portal)
    scene.add(g)
    gates.push({
      group: g,
      x: Math.cos(a) * 23.4,
      z: Math.sin(a) * 23.4,
      flash: 0,
      archMat,
      baseColor: archMat.color.clone(),
      portalMat,
    })
  }

  // drifting energy motes over the battlefield
  const motes = fireflies({ count: 30, area: [46, 46], height: [0.6, 5.5], color: '#8ff4ff', size: 0.45 })
  scene.add(motes)
  tickables.push(motes)

  // ---------- lighting ----------
  scene.add(new THREE.HemisphereLight('#8899ff', '#331251', 0.95))
  const dir = new THREE.DirectionalLight('#e8ecff', 1.75)
  dir.position.set(18, 30, 10)
  dir.castShadow = true
  dir.shadow.mapSize.set(2048, 2048)
  dir.shadow.camera.left = -30
  dir.shadow.camera.right = 30
  dir.shadow.camera.top = 30
  dir.shadow.camera.bottom = -30
  dir.shadow.camera.near = 6
  dir.shadow.camera.far = 70
  dir.shadow.bias = -0.0004
  scene.add(dir)

  return { tickables, gates, rimMat, rimBase: rimMat.color.clone() }
}
