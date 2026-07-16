import * as THREE from 'three'
import { skyDome, cloudLayer, crystal, fireflies } from '../../art/environment.js'
import { canvasTexture, glowTexture } from '../../core/assets.js'
import { glowMaterial, energyMaterial, toonMaterial } from '../../art/materials.js'
import { rand, TAU } from '../../core/utils.js'

export const ARENA_R = 26

/**
 * Jagged basalt boulder with baked flat normals (the shared rock() helper
 * uses material flatShading, which conflicts with the toon rim shader).
 * Pass a shared material so the rim ring stays cheap.
 */
function pitRock(mat, scale) {
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
  const m = new THREE.Mesh(geo, mat)
  m.scale.setScalar(scale)
  m.rotation.set(rand(TAU), rand(TAU), rand(TAU))
  return m
}

/** Ringed flagstone arena floor: stone blocks, mortar seams, war-paint, wear. */
function drawFloor(ctx, w, h) {
  const cx = w / 2, cy = h / 2, R = w / 2
  ctx.fillStyle = '#241b12'
  ctx.fillRect(0, 0, w, h)

  // ring bands of flagstone blocks (staggered joints, per-block tone shifts)
  const stones = ['#4c3e2d', '#453727', '#403224', '#524335', '#48392b', '#3d3123']
  const bands = [0.105, 0.2, 0.32, 0.44, 0.56, 0.7, 0.86, 0.985]
  for (let bi = 0; bi < bands.length - 1; bi++) {
    const r0 = bands[bi] * R, r1 = bands[bi + 1] * R
    const n = 9 + bi * 6
    const off = rand(TAU)
    for (let b = 0; b < n; b++) {
      const a0 = off + (b * TAU) / n, a1 = a0 + TAU / n
      ctx.fillStyle = stones[Math.floor(rand(stones.length))]
      ctx.beginPath()
      ctx.arc(cx, cy, r1, a0, a1)
      ctx.arc(cx, cy, r0, a1, a0, true)
      ctx.closePath()
      ctx.fill()
      // occasional soot-charred or ember-warmed slab
      const roll = Math.random()
      if (roll < 0.24) {
        ctx.globalAlpha = roll < 0.14 ? rand(0.1, 0.22) : rand(0.06, 0.12)
        ctx.fillStyle = roll < 0.14 ? '#0e0a06' : '#7a3d1c'
        ctx.fill()
        ctx.globalAlpha = 1
      }
      // radial mortar joint
      ctx.strokeStyle = 'rgba(18, 12, 7, 0.85)'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0)
      ctx.lineTo(cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1)
      ctx.stroke()
    }
    // ring mortar seam
    ctx.strokeStyle = 'rgba(18, 12, 7, 0.9)'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.arc(cx, cy, r0, 0, TAU)
    ctx.stroke()
  }

  // center slab where the champion stands
  ctx.fillStyle = '#4f4030'
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.105, 0, TAU)
  ctx.fill()

  // sandstone mottling + soot patches
  for (let i = 0; i < 380; i++) {
    const a = rand(TAU), r = Math.sqrt(Math.random()) * R
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
    const s = rand(12, 70)
    ctx.globalAlpha = rand(0.03, 0.09)
    ctx.fillStyle = Math.random() < 0.45 ? '#75603f' : (Math.random() < 0.5 ? '#211710' : '#836c4a')
    ctx.beginPath()
    ctx.ellipse(x, y, s, s * rand(0.35, 0.9), rand(TAU), 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // deliberate crimson war-paint rings + carved sigil ring
  ctx.save()
  ctx.strokeStyle = '#77201d'
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 22
  ctx.setLineDash([200, 46])
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.59, 0, TAU)
  ctx.stroke()
  ctx.globalAlpha = 0.4
  ctx.lineWidth = 9
  ctx.setLineDash([90, 34])
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.545, rand(TAU), rand(TAU) + TAU)
  ctx.stroke()
  ctx.setLineDash([26, 20])
  ctx.globalAlpha = 0.4
  ctx.lineWidth = 8
  ctx.strokeStyle = '#8a2320'
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.155, 0, TAU)
  ctx.stroke()
  ctx.restore()

  // bone-paint rune ticks around the outer band
  for (let i = 0; i < 36; i++) {
    const a = (i * TAU) / 36 + rand(-0.03, 0.03)
    ctx.save()
    ctx.translate(cx + Math.cos(a) * R * 0.925, cy + Math.sin(a) * R * 0.925)
    ctx.rotate(a + Math.PI / 2)
    ctx.globalAlpha = rand(0.12, 0.24)
    ctx.fillStyle = '#e0cba0'
    ctx.fillRect(-3, -rand(10, 22), 6, rand(20, 44))
    ctx.restore()
  }

  // hairline cracks across slabs
  ctx.lineCap = 'round'
  for (let i = 0; i < 26; i++) {
    const a0 = rand(TAU)
    let x = cx + Math.cos(a0) * rand(R * 0.1, R * 0.8)
    let y = cy + Math.sin(a0) * rand(R * 0.1, R * 0.8)
    let dir = rand(TAU)
    ctx.strokeStyle = 'rgba(16, 10, 6, 0.55)'
    ctx.lineWidth = rand(1.5, 3)
    ctx.globalAlpha = rand(0.3, 0.6)
    ctx.beginPath()
    ctx.moveTo(x, y)
    const steps = 3 + Math.floor(rand(4))
    for (let s = 0; s < steps; s++) {
      dir += rand(-0.7, 0.7)
      const len = rand(14, 44)
      x += Math.cos(dir) * len
      y += Math.sin(dir) * len
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // radial shading: torchlit center falling to charred edge
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
  g.addColorStop(0, 'rgba(122, 88, 48, 0.18)')
  g.addColorStop(0.5, 'rgba(34, 24, 15, 0.22)')
  g.addColorStop(0.85, 'rgba(12, 8, 5, 0.55)')
  g.addColorStop(1, 'rgba(5, 3, 2, 0.88)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // center emblem: carved arena sigil (kept dim — the hero stands here)
  ctx.save()
  ctx.globalAlpha = 0.45
  ctx.strokeStyle = '#1c110a'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.05, 0, TAU)
  ctx.stroke()
  ctx.globalAlpha = 0.22
  ctx.strokeStyle = '#d9c39a'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.028, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

/** Emissive layer: mostly black, with molten ember fissures + faint rune ring. */
function drawEmbers(ctx, w, h) {
  const cx = w / 2, cy = h / 2, R = w / 2
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)

  // heat seeping in around the pit's outer edge
  const eg = ctx.createRadialGradient(cx, cy, R * 0.84, cx, cy, R)
  eg.addColorStop(0, 'rgba(0,0,0,0)')
  eg.addColorStop(1, 'rgba(200, 62, 18, 0.16)')
  ctx.fillStyle = eg
  ctx.fillRect(0, 0, w, h)

  // molten fissures: short jagged veins with a hot core, thickest near the rim
  ctx.lineCap = 'round'
  for (let i = 0; i < 16; i++) {
    const a0 = rand(TAU)
    const r = i < 12 ? rand(R * 0.52, R * 0.93) : rand(R * 0.14, R * 0.4)
    const pts = [[cx + Math.cos(a0) * r, cy + Math.sin(a0) * r]]
    let dir = rand(TAU)
    const steps = 2 + Math.floor(rand(4))
    for (let s = 0; s < steps; s++) {
      dir += rand(-0.8, 0.8)
      const len = rand(12, 42)
      const [px, py] = pts[pts.length - 1]
      pts.push([px + Math.cos(dir) * len, py + Math.sin(dir) * len])
    }
    const trace = () => {
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let s = 1; s < pts.length; s++) ctx.lineTo(pts[s][0], pts[s][1])
      ctx.stroke()
    }
    ctx.save()
    ctx.strokeStyle = '#e04a1c'
    ctx.shadowColor = '#ff5a26'
    ctx.shadowBlur = 8
    ctx.lineWidth = rand(1.6, 2.6)
    ctx.globalAlpha = rand(0.2, 0.4)
    trace()
    ctx.strokeStyle = '#ffb84d'
    ctx.shadowBlur = 3
    ctx.lineWidth = 0.9
    ctx.globalAlpha = rand(0.25, 0.45)
    trace()
    ctx.restore()
  }

  // stray hot coals
  for (let i = 0; i < 36; i++) {
    const a = rand(TAU), r = Math.sqrt(Math.random()) * R * 0.95
    ctx.save()
    ctx.fillStyle = Math.random() < 0.6 ? '#ff8c3b' : '#ffb84d'
    ctx.shadowColor = '#ff5a26'
    ctx.shadowBlur = 5
    ctx.globalAlpha = rand(0.12, 0.32)
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, rand(1, 2.2), 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  // faint rune ring at the war-paint band + center sigil
  ctx.save()
  ctx.strokeStyle = '#c23b2e'
  ctx.shadowColor = '#c23b2e'
  ctx.shadowBlur = 10
  ctx.globalAlpha = 0.14
  ctx.lineWidth = 4
  ctx.setLineDash([26, 44])
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.585, 0, TAU)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 0.24
  ctx.strokeStyle = '#ffb84d'
  ctx.shadowColor = '#ffb84d'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.05, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

/** Torn crimson war banner cloth with a bone sigil. */
function drawBanner(ctx, w, h) {
  ctx.clearRect(0, 0, w, h)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#8a2026')
  g.addColorStop(0.6, '#6e181d')
  g.addColorStop(1, '#3f0e10')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // weave shading
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = rand(0.04, 0.1)
    ctx.fillStyle = Math.random() < 0.5 ? '#000000' : '#c23b2e'
    ctx.fillRect(rand(0, w), rand(0, h), rand(4, 14), rand(20, 70))
  }
  ctx.globalAlpha = 1
  // bronze trim
  ctx.fillStyle = '#b0793a'
  ctx.fillRect(0, 0, w, 8)
  // bone sigil: ring + fang
  ctx.strokeStyle = '#e0cba0'
  ctx.lineWidth = 6
  ctx.globalAlpha = 0.85
  ctx.beginPath()
  ctx.arc(w / 2, h * 0.34, w * 0.22, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(w / 2, h * 0.2)
  ctx.lineTo(w / 2, h * 0.62)
  ctx.stroke()
  ctx.globalAlpha = 1
  // torn bottom edge
  ctx.globalCompositeOperation = 'destination-out'
  for (let x = 0; x < w; x += 10) {
    const d = rand(6, 26)
    ctx.beginPath()
    ctx.moveTo(x - 4, h)
    ctx.lineTo(x + 5, h - d)
    ctx.lineTo(x + 14, h)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

/** Rising ember-updraft particles. Call points.tick(dt) each frame. */
function emberUpdraft({ count = 90, radius = 34, top = 24, color = '#ff8c3b', size = 0.55 } = {}) {
  const base = new Float32Array(count * 3)
  const speed = new Float32Array(count)
  const phase = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const a = rand(TAU), r = Math.sqrt(Math.random()) * radius
    base.set([Math.cos(a) * r, rand(-2, top), Math.sin(a) * r], i * 3)
    speed[i] = rand(1.1, 3)
    phase[i] = rand(TAU)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3))
  const mat = new THREE.PointsMaterial({
    map: glowTexture(), color, size, transparent: true, opacity: 0.8,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const pts = new THREE.Points(geo, mat)
  let t = 0
  pts.tick = dt => {
    t += dt
    const p = pts.geometry.attributes.position
    for (let i = 0; i < count; i++) {
      let y = p.getY(i) + speed[i] * dt
      if (y > top) y = -2
      p.setXYZ(i,
        base[i * 3] + Math.sin(t * 0.8 + phase[i] + y * 0.35) * 0.9,
        y,
        base[i * 3 + 2] + Math.cos(t * 0.6 + phase[i]) * 0.9,
      )
    }
    p.needsUpdate = true
    mat.opacity = 0.62 + 0.22 * Math.sin(t * 2.1)
  }
  return pts
}

/**
 * Builds the whole THE PIT environment into `scene`: a torch-ringed fighting
 * pit sunk in a volcanic cavern. Returns { tickables, gates, rimMat, rimBase }
 * — caller ticks tickables, flashes gates on spawn, and pulses rimMat when
 * the hero hits the wall.
 */
export function buildArena(scene) {
  const tickables = []

  // ---------- cavern dark + distant lava glow ----------
  scene.fog = new THREE.Fog('#221318', 55, 230)
  scene.add(skyDome({
    top: '#110a15', mid: '#2e1a26', bottom: '#38160e',
    sunDir: new THREE.Vector3(0.55, -0.05, -0.8), sunColor: '#e84a1e', sunSize: 16,
  }))

  // lava-lit smoke banks drifting below the pit rim (kept low so they never
  // slide between the top-down camera and the floor)
  const smokeLow = cloudLayer({ count: 13, radius: 230, height: [-130, -30], color: '#5c2a16', opacity: 0.4, scale: [80, 150] })
  const smokeNear = cloudLayer({ count: 8, radius: 160, height: [-55, -14], color: '#7c3416', opacity: 0.3, scale: [40, 80] })
  scene.add(smokeLow, smokeNear)
  tickables.push(smokeLow, smokeNear)

  // volcanic rock spires rising out of the lava field around the pit
  const basaltA = toonMaterial({ color: '#2e2721', rim: '#ff8c3b', rimStrength: 0.22 })
  const basaltB = toonMaterial({ color: '#3a2f26', rim: '#ff5a26', rimStrength: 0.18 })
  const orbit = new THREE.Group()
  for (let i = 0; i < 14; i++) {
    const r = pitRock(i % 3 ? basaltA : basaltB, rand(2.2, 5))
    r.scale.y *= rand(2.4, 4.2)
    r.rotation.set(rand(-0.2, 0.2), rand(TAU), rand(-0.2, 0.2))
    const a = rand(TAU), rr = rand(34, 58)
    r.position.set(Math.cos(a) * rr, rand(-15, -7), Math.sin(a) * rr)
    orbit.add(r)
  }
  for (let i = 0; i < 4; i++) {
    const c = crystal(i % 2
      ? { color1: '#4a1408', color2: '#ff5a26', height: rand(3.6, 5.6) }
      : { color1: '#3a1408', color2: '#ff7a30', height: rand(3.2, 5) })
    const a = rand(TAU), rr = rand(32, 46)
    c.position.set(Math.cos(a) * rr, rand(-16, -9), Math.sin(a) * rr)
    orbit.add(c)
    tickables.push(c)
  }
  orbit.tick = dt => { orbit.rotation.y += dt * 0.006 }
  scene.add(orbit)
  tickables.push(orbit)

  // ---------- the pit floor ----------
  const floorTex = canvasTexture(2048, 2048, drawFloor)
  const emberTex = canvasTexture(1024, 1024, drawEmbers)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_R, 96),
    new THREE.MeshStandardMaterial({
      map: floorTex, emissiveMap: emberTex, emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 1.0, roughness: 0.92, metalness: 0.04,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_R, ARENA_R - 1.4, 3.4, 96, 1, true),
    new THREE.MeshStandardMaterial({ color: '#241c15', roughness: 1, metalness: 0.05 }),
  )
  skirt.position.y = -1.7
  scene.add(skirt)

  // fire-line at the wall base (pulsed by the scene on wall hits) + magma seams
  const rimMat = glowMaterial('#ff5a26', 1.05)
  const rimHot = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R + 0.1, 0.1, 10, 128), rimMat)
  rimHot.rotation.x = Math.PI / 2
  rimHot.position.y = 0.14
  const rimCool = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R - 1.05, 0.05, 8, 128), glowMaterial('#ffb84d', 0.42))
  rimCool.rotation.x = Math.PI / 2
  rimCool.position.y = 0.1
  const rimUnder = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R - 0.4, 0.14, 8, 96), glowMaterial('#ff5a26', 1.35))
  rimUnder.rotation.x = Math.PI / 2
  rimUnder.position.y = -3.35
  scene.add(rimHot, rimCool, rimUnder)

  // lava haze under the pit
  const under = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: '#ff5a26', transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  under.scale.set(80, 40, 1)
  under.position.y = -12
  scene.add(under)

  // ---------- jagged rock rim ----------
  const rimRockMats = [
    toonMaterial({ color: '#2b241e', rim: '#ff8c3b', rimStrength: 0.24 }),
    toonMaterial({ color: '#352b22', rim: '#ffb84d', rimStrength: 0.2 }),
    toonMaterial({ color: '#221e1a', rim: '#ff5a26', rimStrength: 0.28 }),
  ]
  for (let i = 0; i < 34; i++) {
    const a = (i * TAU) / 34 + rand(-0.05, 0.05)
    // leave openings where the bone gates stand
    const gateA = ((Math.round((a / TAU) * 6 - 0.5) + 0.5) * TAU) / 6
    let dA = Math.abs(a - gateA)
    if (dA > Math.PI) dA = TAU - dA
    if (dA < 0.16) continue
    const r = pitRock(rimRockMats[i % 3], rand(1.5, 3.2))
    if (i % 2) r.scale.y *= rand(1.3, 1.9) // jagged teeth among the boulders
    r.position.set(Math.cos(a) * (ARENA_R + rand(1.2, 2.6)), rand(-0.5, 0.4), Math.sin(a) * (ARENA_R + rand(1.2, 2.6)))
    r.castShadow = true
    scene.add(r)
  }

  // ---------- iron braziers (same 6 stations as the old pylons) ----------
  const ironMat = toonMaterial({ color: '#4a4d55', rim: '#ffb84d', rimStrength: 0.35 })
  const ironDarkMat = toonMaterial({ color: '#33363c', rim: '#ff8c3b', rimStrength: 0.3 })
  const pedGeo = new THREE.CylinderGeometry(0.42, 0.85, 1.5, 8)
  const bowlGeo = new THREE.CylinderGeometry(0.95, 0.45, 0.62, 10)
  const bandGeo = new THREE.TorusGeometry(0.92, 0.07, 8, 18)
  const coalGeo = new THREE.SphereGeometry(0.62, 12, 8)
  const coalMat = glowMaterial('#ff5a26', 2.1)
  const flameGeo = new THREE.ConeGeometry(0.55, 1.7, 10)
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6
    const x = Math.cos(a) * 24.2, z = Math.sin(a) * 24.2
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    const ped = new THREE.Mesh(pedGeo, ironDarkMat)
    ped.position.y = 0.75
    ped.castShadow = true
    const bowl = new THREE.Mesh(bowlGeo, ironMat)
    bowl.position.y = 1.75
    bowl.castShadow = true
    const band = new THREE.Mesh(bandGeo, ironDarkMat)
    band.rotation.x = Math.PI / 2
    band.position.y = 1.95
    const coals = new THREE.Mesh(coalGeo, coalMat)
    coals.scale.set(1, 0.42, 1)
    coals.position.y = 2.06
    const flameMat = energyMaterial({ color1: '#a1252c', color2: '#ffb84d', speed: 2.4, intensity: 1.3 })
    const flame = new THREE.Mesh(flameGeo, flameMat)
    flame.position.y = 2.9
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: '#ff8c3b', transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    halo.scale.setScalar(4.2)
    halo.position.y = 2.9
    g.add(ped, bowl, band, coals, flame, halo)
    scene.add(g)
    const light = new THREE.PointLight('#ff8c3b', 18, 14, 2)
    light.position.set(x, 3.2, z)
    scene.add(light)
    // torch flicker: flame scale + light intensity + halo breathing
    let t = rand(10)
    tickables.push({
      tick: dt => {
        t += dt
        const n = Math.sin(t * 9.2) * 0.5 + Math.sin(t * 23.7 + 1.7) * 0.3 + Math.sin(t * 4.1) * 0.2
        flame.scale.set(1 + 0.1 * n, 1 + 0.22 * n, 1 + 0.1 * n)
        flame.rotation.y += dt * 1.7
        light.intensity = 18 + 5 * n
        halo.material.opacity = 0.34 + 0.1 * n
      },
    })
  }

  // ---------- bone-and-iron spawn gates ----------
  const gates = []
  const boneMat = toonMaterial({ color: '#c9b795', rim: '#ffdfae', rimStrength: 0.4 })
  const pillarGeo = new THREE.CylinderGeometry(0.26, 0.36, 3.6, 7)
  const gateBandGeo = new THREE.TorusGeometry(0.34, 0.06, 6, 14)
  const tuskGeo = new THREE.ConeGeometry(0.16, 1.5, 7)
  const spikeGeo = new THREE.ConeGeometry(0.09, 0.5, 6)
  const archGeo = new THREE.TorusGeometry(1.75, 0.1, 10, 26, Math.PI)
  const portalGeo = new THREE.CircleGeometry(1.15, 26)
  const barGeo = new THREE.BoxGeometry(0.07, 3.3, 0.07)
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) * TAU) / 6
    const g = new THREE.Group()
    g.position.set(Math.cos(a) * 25.3, 0, Math.sin(a) * 25.3)
    g.lookAt(0, 0, 0)
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(pillarGeo, boneMat)
      p.position.set(1.75 * s, 1.8, 0)
      p.castShadow = true
      g.add(p)
      for (const y of [0.9, 2.4]) {
        const band = new THREE.Mesh(gateBandGeo, ironDarkMat)
        band.position.set(1.75 * s, y, 0)
        g.add(band)
      }
      // curved bone tusk leaning over the gate mouth
      const tusk = new THREE.Mesh(tuskGeo, boneMat)
      tusk.position.set(1.55 * s, 3.75, 0)
      tusk.rotation.z = 0.55 * s
      tusk.castShadow = true
      g.add(tusk)
      const spike = new THREE.Mesh(spikeGeo, ironDarkMat)
      spike.position.set(1.75 * s, 3.85, 0)
      g.add(spike)
    }
    // rune-fire arc: flashes bright when a warband pours through
    const archMat = glowMaterial('#ff6a2e', 0.9)
    const arch = new THREE.Mesh(archGeo, archMat)
    arch.position.y = 3.45
    g.add(arch)
    const portalMat = energyMaterial({ color1: '#1c0906', color2: '#e0431c', speed: 1.4, intensity: 0.85 })
    portalMat.side = THREE.DoubleSide
    const portal = new THREE.Mesh(portalGeo, portalMat)
    portal.position.y = 1.8
    g.add(portal)
    // iron portcullis bars across the gate mouth
    for (const bx of [-1.05, -0.35, 0.35, 1.05]) {
      const bar = new THREE.Mesh(barGeo, ironDarkMat)
      bar.position.set(bx, 1.75, 0.2)
      g.add(bar)
    }
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

  // ---------- war banners on iron poles between the gates ----------
  const bannerTex = canvasTexture(128, 256, drawBanner)
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.4, 7)
  const crossGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6)
  const clothGeo = new THREE.PlaneGeometry(1.3, 2.5)
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3 + TAU / 12
    const g = new THREE.Group()
    g.position.set(Math.cos(a) * 27.6, 0, Math.sin(a) * 27.6)
    g.lookAt(0, 0, 0)
    const pole = new THREE.Mesh(poleGeo, ironDarkMat)
    pole.position.y = 2.7
    pole.castShadow = true
    const cross = new THREE.Mesh(crossGeo, ironDarkMat)
    cross.rotation.z = Math.PI / 2
    cross.position.y = 5.2
    const tip = new THREE.Mesh(spikeGeo, ironMat)
    tip.position.y = 5.6
    const cloth = new THREE.Mesh(clothGeo, toonMaterial({
      map: bannerTex, color: '#ffffff', rim: '#ff8c3b', rimStrength: 0.2,
      transparent: true, side: THREE.DoubleSide,
    }))
    cloth.position.set(0, 3.9, 0.06)
    g.add(pole, cross, tip, cloth)
    scene.add(g)
    let t = rand(10)
    tickables.push({
      tick: dt => {
        t += dt
        cloth.rotation.x = 0.1 + Math.sin(t * 1.6) * 0.08
        cloth.rotation.y = Math.sin(t * 1.1) * 0.06
      },
    })
  }

  // ---------- ember updraft + drifting sparks over the battlefield ----------
  const updraft = emberUpdraft({ count: 90, radius: 34, top: 22, color: '#ff8c3b', size: 0.5 })
  scene.add(updraft)
  tickables.push(updraft)
  const sparks = fireflies({ count: 20, area: [46, 46], height: [0.6, 5], color: '#ffb84d', size: 0.4 })
  scene.add(sparks)
  tickables.push(sparks)

  // ---------- lighting: dim cavern ambience + warm torch key ----------
  scene.add(new THREE.HemisphereLight('#3a2838', '#5c2410', 0.62))
  // soft ember glow welling up through the center fissures
  const heart = new THREE.PointLight('#ff7a30', 7, 30, 2)
  heart.position.set(0, 5, 0)
  scene.add(heart)
  const dir = new THREE.DirectionalLight('#ffd2a0', 1.05)
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
