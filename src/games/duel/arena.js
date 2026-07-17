import * as THREE from 'three'
import { canvasTexture, crackedStoneTexture, dirtOverlay } from '../../core/assets.js'
import {
  pbrMaterial, stoneMaterial, ironMaterial, bronzeMaterial, boneMaterial,
  fireMaterial, emberGlowMaterial, contactShadow, glowSpriteMaterial,
} from '../../art/materials.js'
import { skyDome, starField, fireflies } from '../../art/environment.js'
import { rand, TAU } from '../../core/utils.js'

const EMBER = '#ff8c3b'
const TORCH_GOLD = '#ffb84d'
const FORGE = '#ff5a26'

const _m4 = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

// ---------- shared kit ----------
const K = {}
function kit() {
  if (K.ready) return K
  K.ready = true
  K.stoneSet = crackedStoneTexture({ size: 512, seed: 311, dark: '#38332b', base: '#59534a', light: '#756d5e', mortar: '#1f1a15' })
  dirtOverlay(K.stoneSet.map, { amount: 0.55, edge: 0, speckle: 0.7, seed: 41 })
  K.stone = stoneMaterial()
  K.stone.envMapIntensity = 0.06
  K.stoneDark = stoneMaterial('#665e50')
  K.stoneDark.envMapIntensity = 0.04
  K.iron = ironMaterial('#4e525b')
  K.iron.envMapIntensity = 0.3
  K.bronze = bronzeMaterial()
  K.bronze.envMapIntensity = 0.35
  K.silhouette = new THREE.MeshBasicMaterial({ color: '#120c0e' })
  K.crowd = new THREE.MeshBasicMaterial({ color: '#191114' })
  K.crowdLit = new THREE.MeshBasicMaterial({ color: '#2e2019' })
  K.linkGeo = new THREE.TorusGeometry(0.16, 0.045, 6, 10)
  K.flameGeo = new THREE.PlaneGeometry(0.62, 1.5)
  K.flameGeo.translate(0, 0.75, 0)
  K.fireGold = [fireMaterial({ intensity: 1.5, speed: 1.35 }), fireMaterial({ intensity: 1.5, speed: 1.7, midColor: '#ff9a3e' })]
  K.fireRed = [
    fireMaterial({ intensity: 1.6, speed: 1.6, edgeColor: '#7a0f0f', midColor: '#e02818', coreColor: '#ff9a70' }),
    fireMaterial({ intensity: 1.6, speed: 1.9, edgeColor: '#7a0f0f', midColor: '#d43020', coreColor: '#ffb090' }),
  ]
  return K
}

function cloneSet(set, rx, ry) {
  const out = {}
  for (const k of ['map', 'normalMap', 'roughnessMap']) {
    if (!set[k]) continue
    out[k] = set[k].clone()
    out[k].repeat.set(rx, ry)
  }
  return out
}

/** Iron chain — alternating torus links, one instanced draw. */
function chain(len, scale = 1, bend = 0) {
  const S = kit()
  const n = Math.max(2, Math.round(len / (0.26 * scale)))
  const inst = new THREE.InstancedMesh(S.linkGeo, S.iron, n)
  _s.setScalar(scale)
  for (let i = 0; i < n; i++) {
    _e.set(i % 2 ? 0.12 : -0.08, i % 2 ? Math.PI / 2 : 0, bend * i)
    _q.setFromEuler(_e)
    _p.set(Math.sin(bend * i) * 0.2, -i * 0.26 * scale, 0)
    _m4.compose(_p, _q, _s)
    inst.setMatrixAt(i, _m4)
  }
  inst.instanceMatrix.needsUpdate = true
  return inst
}

/** Crossed flame planes + faint halo. Registers itself for boss re-tinting. */
function flame(fires, { size = 1, red = false } = {}) {
  const S = kit()
  const g = new THREE.Group()
  const idx = Math.floor(rand(0, 2))
  const a = new THREE.Mesh(S.flameGeo, (red ? S.fireRed : S.fireGold)[idx])
  const b = new THREE.Mesh(S.flameGeo, (red ? S.fireRed : S.fireGold)[idx])
  b.rotation.y = Math.PI / 2
  const halo = new THREE.Sprite(glowSpriteMaterial('#ff9448', 0.1))
  halo.scale.set(1.1, 1.5, 1)
  halo.position.y = 0.6
  g.add(a, b, halo)
  g.scale.setScalar(size)
  let t = rand(10)
  g.tick = dt => {
    t += dt
    const f = 0.86 + 0.14 * Math.sin(t * 8.3) * Math.sin(t * 5.1 + 1.7)
    g.scale.set(size * (0.92 + 0.1 * f), size * f, size * (0.92 + 0.1 * f))
    halo.material.opacity = 0.08 + 0.05 * f
  }
  g.setRed = on => {
    a.material = (on ? S.fireRed : S.fireGold)[idx]
    b.material = a.material
    halo.material.color.set(on ? '#e03222' : '#ff9448')
  }
  fires.push(g)
  return g
}

/** Iron crucible brazier on a stone plinth. */
function brazier(tickables, fires, { light = 0, flameSize = 1.4 } = {}) {
  const S = kit()
  const g = new THREE.Group()
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.55, 8), S.stoneDark)
  base.position.y = 0.27
  base.castShadow = true
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.8, 8), S.iron)
  stem.position.y = 0.95
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.26, 0.38, 12), S.iron)
  bowl.position.y = 1.45
  bowl.castShadow = true
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.05, 6, 16), S.bronze)
  rim.rotation.x = Math.PI / 2
  rim.position.y = 1.63
  const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.09, 10), emberGlowMaterial(1.25, FORGE))
  coals.position.y = 1.62
  const f = flame(fires, { size: flameSize })
  f.position.y = 1.7
  const blob = contactShadow(0.8, 0.42)
  g.add(base, stem, bowl, rim, coals, f, blob)
  tickables.push(f)
  if (light > 0) {
    const pl = new THREE.PointLight(TORCH_GOLD, light, 20, 2)
    pl.position.y = 2.2
    g.add(pl)
    g.light = pl
    let t = rand(10)
    tickables.push({ tick: dt => { t += dt; pl.intensity = g.lightBase * (0.85 + 0.18 * Math.sin(t * 8.7) * Math.sin(t * 5.1)) } })
    g.lightBase = light
  }
  g.coals = coals
  return g
}

/** Faded champion banner texture — each one dressed with a unique sigil. */
function championBanner(seed) {
  return canvasTexture(128, 256, (ctx, w, h) => {
    const hues = ['#451316', '#3a2a1a', '#25291f', '#2a1c26', '#332410']
    ctx.fillStyle = hues[seed % hues.length]
    ctx.fillRect(0, 0, w, h)
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(160, 110, 66, 0.16)')
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.14)')
    grad.addColorStop(1, 'rgba(8, 5, 3, 0.75)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 34; i++) {
      ctx.fillStyle = `rgba(${rand(0, 1) < 0.5 ? '18, 10, 8' : '130, 84, 54'}, ${rand(0.04, 0.1)})`
      ctx.fillRect(rand(0, w), 0, rand(1, 3), h)
    }
    // sigil of a fallen champion
    ctx.strokeStyle = 'rgba(186, 170, 140, 0.55)'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.beginPath()
    const cx = w / 2, cy = h * 0.42
    if (seed % 3 === 0) { // crossed spears
      ctx.moveTo(cx - 24, cy - 34); ctx.lineTo(cx + 24, cy + 34)
      ctx.moveTo(cx + 24, cy - 34); ctx.lineTo(cx - 24, cy + 34)
    } else if (seed % 3 === 1) { // horned skull glyph
      ctx.arc(cx, cy, 20, 0, TAU)
      ctx.moveTo(cx - 20, cy - 14); ctx.lineTo(cx - 32, cy - 34)
      ctx.moveTo(cx + 20, cy - 14); ctx.lineTo(cx + 32, cy - 34)
    } else { // rising hammer
      ctx.moveTo(cx, cy + 34); ctx.lineTo(cx, cy - 20)
      ctx.moveTo(cx - 22, cy - 26); ctx.lineTo(cx + 22, cy - 26)
      ctx.moveTo(cx - 22, cy - 26); ctx.lineTo(cx - 22, cy - 8)
      ctx.moveTo(cx + 22, cy - 26); ctx.lineTo(cx + 22, cy - 8)
    }
    ctx.stroke()
    // soot + ragged hem
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(24, 16, 10, ${rand(0.25, 0.5)})`
      ctx.beginPath()
      ctx.arc(rand(0, w), h - rand(0, h * 0.3), rand(2, 5), 0, TAU)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'destination-out'
    for (let x = 0; x < w; x += 9) {
      ctx.beginPath()
      ctx.moveTo(x, h)
      ctx.lineTo(x + 4.5, h - rand(6, 30))
      ctx.lineTo(x + 9, h)
      ctx.fill()
    }
  })
}

/**
 * Floor wear overlay: generations of duel-scars. Scuffed center circle,
 * heel-drag arcs along the fight line, soot rings under braziers,
 * edge vignette into the wall gutter.
 */
function wearOverlay(brazierAngles) {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const cx = w / 2, cy = h / 2
    const u = w / 44 // world units -> px (overlay plane is 44x44)
    // edge vignette toward the wall
    const ev = ctx.createRadialGradient(cx, cy, 12 * u, cx, cy, 21 * u)
    ev.addColorStop(0, 'rgba(10, 7, 5, 0)')
    ev.addColorStop(1, 'rgba(8, 5, 3, 0.72)')
    ctx.fillStyle = ev
    ctx.fillRect(0, 0, w, h)
    // scuffed pale center circle — the dueling ground, worn light by boots
    const cc = ctx.createRadialGradient(cx, cy, 0, cx, cy, 6.4 * u)
    cc.addColorStop(0, 'rgba(196, 178, 148, 0.16)')
    cc.addColorStop(0.72, 'rgba(188, 170, 140, 0.1)')
    cc.addColorStop(1, 'rgba(188, 170, 140, 0)')
    ctx.fillStyle = cc
    ctx.fillRect(0, 0, w, h)
    // heel-drag scars along the fight line (x axis)
    for (let i = 0; i < 60; i++) {
      const y = cy + rand(-1.6, 1.6) * u
      const x = cx + rand(-10.5, 10.5) * u
      const len = rand(0.4, 2.4) * u
      ctx.strokeStyle = `rgba(${rand(0, 1) < 0.5 ? '210, 192, 160' : '30, 22, 14'}, ${rand(0.05, 0.16)})`
      ctx.lineWidth = rand(1, 3.5)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + len, y + rand(-3, 3))
      ctx.stroke()
    }
    // old blood-rust blotches, kept abstract
    for (let i = 0; i < 14; i++) {
      const x = cx + rand(-9, 9) * u, y = cy + rand(-4, 4) * u, r = rand(0.3, 0.9) * u
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(58, 22, 16, ${rand(0.1, 0.22)})`)
      g.addColorStop(1, 'rgba(58, 22, 16, 0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
    // cracked-slab seams radiating off-center
    ctx.strokeStyle = 'rgba(16, 11, 8, 0.4)'
    ctx.lineWidth = 2
    for (let i = 0; i < 9; i++) {
      const a = rand(TAU)
      let x = cx + Math.cos(a) * rand(2, 5) * u
      let y = cy + Math.sin(a) * rand(2, 5) * u
      ctx.beginPath()
      ctx.moveTo(x, y)
      for (let s = 0; s < 5; s++) {
        x += Math.cos(a + rand(-0.5, 0.5)) * rand(0.8, 1.8) * u
        y += Math.sin(a + rand(-0.5, 0.5)) * rand(0.8, 1.8) * u
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    // soot rings under each brazier
    for (const a of brazierAngles) {
      const x = cx + Math.cos(a) * 13.1 * u
      const y = cy + Math.sin(a) * 13.1 * u
      const g = ctx.createRadialGradient(x, y, 2, x, y, 1.3 * u)
      g.addColorStop(0, 'rgba(5, 3, 2, 0.66)')
      g.addColorStop(0.6, 'rgba(12, 7, 4, 0.32)')
      g.addColorStop(1, 'rgba(12, 7, 4, 0)')
      ctx.fillStyle = g
      ctx.fillRect(x - 1.4 * u, y - 1.4 * u, 2.8 * u, 2.8 * u)
    }
  })
}

/** Worn bronze duel-circle inlay, painted straight into a texture ring. */
function inlayRing() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const cx = w / 2, cy = h / 2
    ctx.strokeStyle = 'rgba(150, 106, 54, 0.32)'
    ctx.lineWidth = 9
    ctx.setLineDash([26, 7])
    ctx.beginPath()
    ctx.arc(cx, cy, w * 0.46, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(150, 106, 54, 0.2)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, w * 0.4, 0, TAU)
    ctx.stroke()
    // rune tics around the ring
    ctx.strokeStyle = 'rgba(190, 140, 70, 0.28)'
    ctx.lineWidth = 4
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * w * 0.425, cy + Math.sin(a) * w * 0.425)
      ctx.lineTo(cx + Math.cos(a) * w * 0.445, cy + Math.sin(a) * w * 0.445)
      ctx.stroke()
    }
  })
}

/** Chained titan statue — a colossal shackled warlord looming over the wall. */
function titanStatue(tickables, fires, { flip = 1 }) {
  const S = kit()
  const g = new THREE.Group()
  const mat = pbrMaterial({ color: '#453d33', roughness: 1, maps: cloneSet(S.stoneSet, 1.6, 1.6), normalScale: 1, envMapIntensity: 0.03 })
  const darkMat = pbrMaterial({ color: '#332c24', roughness: 1, maps: cloneSet(S.stoneSet, 1.2, 1.2), envMapIntensity: 0.02 })

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.6, 5, 8), darkMat)
  pedestal.position.y = 2.5
  // kneeling colossus
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 4.6, 9), mat)
  torso.position.set(0, 7.4, 0)
  torso.rotation.x = 0.16
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 1.4), mat)
  head.position.set(0, 10.3, 0.5)
  head.rotation.x = 0.42 // bowed in defeat
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 5), darkMat)
  crest.position.set(0, 11.3, 0.15)
  crest.rotation.x = -0.5
  const pauldronL = new THREE.Mesh(new THREE.SphereGeometry(1.25, 9, 7), mat)
  pauldronL.position.set(-2, 9, 0.1)
  const pauldronR = pauldronL.clone()
  pauldronR.position.x = 2
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 3.6, 8), mat)
  armL.position.set(-2.4, 6.7, 0.9)
  armL.rotation.x = 0.85
  const armR = armL.clone()
  armR.position.x = 2.4
  const fistL = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), darkMat)
  fistL.position.set(-2.4, 5.3, 2.3)
  const fistR = fistL.clone()
  fistR.position.x = 2.4
  const knee = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2, 2.2), mat)
  knee.position.set(1.3 * flip, 5.6, 1.7)
  g.add(pedestal, torso, head, crest, pauldronL, pauldronR, armL, armR, fistL, fistR, knee)

  // shackles: wrists chained down to the pedestal
  for (const sx of [-1, 1]) {
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.14, 6, 12), S.iron)
    cuff.position.set(sx * 2.4, 5.6, 1.9)
    cuff.rotation.x = Math.PI / 2
    const ch = chain(3.6, 1.5)
    ch.position.set(sx * 2.4, 5.4, 2.1)
    ch.rotation.z = sx * 0.4
    g.add(cuff, ch)
  }
  // smoldering ember eyes under the brow
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.08), emberGlowMaterial(1.5, FORGE))
    eye.position.set(sx * 0.36, 10.28, 1.24)
    eye.rotation.x = 0.42
    g.add(eye)
  }
  // votive fire cupped in the fists, uplighting the bowed head
  const f = flame(fires, { size: 2.4 })
  f.position.set(0, 5.6, 2.5)
  g.add(f)
  tickables.push(f)
  return g
}

/**
 * Build THE CRUCIBLE — a torchlit dueling pit sunk into a colosseum.
 * Returns { tickables, setBossMode(on), brazierPositions }.
 */
export function buildArena(scene) {
  const S = kit()
  const tickables = []
  const fires = []       // every flame group (for boss re-tint)
  const brazierLights = []
  scene.fog = new THREE.Fog('#150f14', 26, 150)

  // ---------- sky through the oculus ----------
  scene.add(skyDome({
    top: '#0b0812', mid: '#1a1420', bottom: '#3a2030', radius: 460,
    sunDir: new THREE.Vector3(-0.25, 0.75, -0.55), sunColor: '#4a3050', sunSize: 30,
  }))
  const stars = starField({ count: 220, radius: 420, size: 1.3, color: '#cfc2b4' })
  stars.material.opacity = 0.45
  scene.add(stars)

  // ---------- the pit floor ----------
  const floorSet = cloneSet(S.stoneSet, 7, 7)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(21.5, 64),
    pbrMaterial({ color: '#5f5749', roughness: 1, maps: floorSet, normalScale: 1.2, envMapIntensity: 0.05 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const N_BRAZ = 10
  const brazierAngles = []
  for (let i = 0; i < N_BRAZ; i++) {
    const a = (i / N_BRAZ) * TAU + TAU / (N_BRAZ * 2)
    if (Math.sin(a) > 0.4) continue // leave the camera lane clear
    brazierAngles.push(a)
  }
  const wear = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 44),
    new THREE.MeshBasicMaterial({ map: wearOverlay(brazierAngles), transparent: true, depthWrite: false }),
  )
  wear.rotation.x = -Math.PI / 2
  wear.position.y = 0.012
  scene.add(wear)
  // worn bronze duel circle
  const inlay = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 13),
    new THREE.MeshBasicMaterial({ map: inlayRing(), transparent: true, depthWrite: false }),
  )
  inlay.rotation.x = -Math.PI / 2
  inlay.position.y = 0.014
  scene.add(inlay)

  // instanced pit clutter: pebbles + bone shards (kept off the fight lane)
  const pebGeo = new THREE.IcosahedronGeometry(0.05, 0)
  const pebbles = new THREE.InstancedMesh(pebGeo, S.stoneDark, 56)
  for (let i = 0; i < 56; i++) {
    const a = rand(TAU), r = rand(5, 12.4)
    const z = Math.sin(a) * r
    const sMul = rand(0.5, 1.9)
    _q.setFromEuler(_e.set(rand(TAU), rand(TAU), rand(TAU)))
    _m4.compose(_p.set(Math.cos(a) * r, 0.02 * sMul, Math.abs(z) < 1.4 ? z + Math.sign(z || 1) * 1.6 : z), _q, _s.setScalar(sMul))
    pebbles.setMatrixAt(i, _m4)
  }
  pebbles.instanceMatrix.needsUpdate = true
  pebbles.receiveShadow = true
  const shardGeo = new THREE.BoxGeometry(0.34, 0.045, 0.07)
  const shardMat = boneMaterial('#b0a488')
  shardMat.envMapIntensity = 0.08
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, 16)
  for (let i = 0; i < 16; i++) {
    const a = rand(TAU), r = rand(6, 12)
    _q.setFromEuler(_e.set(0, rand(TAU), rand(-0.1, 0.1)))
    _m4.compose(_p.set(Math.cos(a) * r, 0.028, Math.sin(a) * r + (Math.abs(Math.sin(a) * r) < 1.5 ? 2 : 0)), _q, _s.setScalar(rand(0.7, 1.4)))
    shards.setMatrixAt(i, _m4)
  }
  shards.instanceMatrix.needsUpdate = true
  scene.add(pebbles, shards)

  // ---------- the pit wall: ring of hewn slabs + pilasters ----------
  const wallMat = pbrMaterial({ color: '#332d25', roughness: 1, maps: cloneSet(S.stoneSet, 14, 1), normalScale: 1.5, envMapIntensity: 0.03 })
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(16.8, 16.8, 5.4, 48, 1, true), wallMat)
  wall.position.y = 2.7
  wall.material.side = THREE.BackSide
  wall.receiveShadow = true
  scene.add(wall)
  // pilaster ribs
  const pilGeo = new THREE.BoxGeometry(1.1, 5.8, 0.9)
  const pilasters = new THREE.InstancedMesh(pilGeo, S.stoneDark, 12)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU
    _q.setFromEuler(_e.set(0, -a, 0))
    _m4.compose(_p.set(Math.cos(a) * 16.4, 2.9, Math.sin(a) * 16.4), _q, _s.set(1, 1, 1))
    pilasters.setMatrixAt(i, _m4)
  }
  pilasters.instanceMatrix.needsUpdate = true
  pilasters.receiveShadow = true
  scene.add(pilasters)
  // cornice ring at the wall top
  const cornice = new THREE.Mesh(new THREE.TorusGeometry(16.9, 0.5, 8, 56), S.stoneDark)
  cornice.rotation.x = Math.PI / 2
  cornice.position.y = 5.4
  scene.add(cornice)

  // ---------- champion banners hanging on the wall ----------
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.62 + i * 0.35) // back arc only
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 3.1, 1, 6),
      new THREE.MeshStandardMaterial({
        map: championBanner(i), roughness: 0.98, metalness: 0,
        side: THREE.DoubleSide, transparent: true, envMapIntensity: 0.04,
      }),
    )
    const r = 16.1
    cloth.position.set(Math.cos(a) * r, 3.5, Math.sin(a) * r)
    cloth.rotation.y = -a + Math.PI / 2
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), S.iron)
    rod.rotation.z = Math.PI / 2
    rod.rotation.y = -a + Math.PI / 2
    rod.position.set(Math.cos(a) * r, 5.05, Math.sin(a) * r)
    scene.add(cloth, rod)
    let t = rand(10)
    tickables.push({ tick: dt => {
      t += dt
      cloth.rotation.y = -a + Math.PI / 2 + Math.sin(t * 1.2) * 0.07
      cloth.rotation.x = Math.sin(t * 1.7 + 1) * 0.045
    } })
  }

  // ---------- brazier ring (the firelight ring) ----------
  const brazierPositions = []
  brazierAngles.forEach((a, i) => {
    const lit = i % 2 === 0 // real torchlight on alternating braziers
    const front = Math.sin(a) > 0 // near-frame braziers burn low
    const b = brazier(tickables, fires, { light: lit ? 26 : 0, flameSize: front ? 1.0 : 1.4 })
    b.position.set(Math.cos(a) * 13.1, 0, Math.sin(a) * 13.1)
    scene.add(b)
    brazierPositions.push(b.position.clone())
    if (b.light) brazierLights.push(b)
  })

  // ---------- crowd terraces: tiered silhouettes in the dark ----------
  const tierMat = pbrMaterial({ color: '#1e1913', roughness: 1, maps: cloneSet(S.stoneSet, 12, 1), envMapIntensity: 0.02 })
  const crowdGeo = new THREE.CapsuleGeometry(0.34, 0.5, 3, 7)
  const tiers = [
    { r: 18.6, y: 5.9, n: 42 },
    { r: 20.6, y: 7.3, n: 48 },
    { r: 22.6, y: 8.7, n: 52 },
  ]
  for (const [ti, tier] of tiers.entries()) {
    const step = new THREE.Mesh(new THREE.CylinderGeometry(tier.r + 1, tier.r + 1, 1.7, 40, 1, true), tierMat)
    step.material.side = THREE.BackSide
    step.position.y = tier.y - 1
    scene.add(step)
    const inst = new THREE.InstancedMesh(crowdGeo, ti === 0 ? K.crowdLit : K.crowd, tier.n)
    for (let i = 0; i < tier.n; i++) {
      const a = rand(TAU)
      const rr = tier.r + rand(-0.3, 0.5)
      _q.setFromEuler(_e.set(rand(-0.08, 0.08), rand(TAU), rand(-0.08, 0.08)))
      _m4.compose(
        _p.set(Math.cos(a) * rr, tier.y + rand(-0.15, 0.3), Math.sin(a) * rr),
        _q, _s.set(rand(0.9, 1.2), rand(0.9, 1.5), rand(0.9, 1.2)),
      )
      inst.setMatrixAt(i, _m4)
    }
    inst.instanceMatrix.needsUpdate = true
    scene.add(inst)
  }
  // upper colosseum rim: arched silhouette ring against the sky
  const rimWall = new THREE.Mesh(new THREE.CylinderGeometry(24.5, 24.5, 8, 40, 1, true), K.silhouette)
  rimWall.material.side = THREE.DoubleSide
  rimWall.position.y = 13.4
  scene.add(rimWall)
  const archGeo = new THREE.BoxGeometry(1.6, 4.2, 1)
  const archGlow = new THREE.InstancedMesh(archGeo, new THREE.MeshBasicMaterial({ color: '#2a1826' }), 18)
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + 0.09
    _q.setFromEuler(_e.set(0, -a, 0))
    _m4.compose(_p.set(Math.cos(a) * 24.4, 12.2, Math.sin(a) * 24.4), _q, _s.set(1, 1, 1))
    archGlow.setMatrixAt(i, _m4)
  }
  archGlow.instanceMatrix.needsUpdate = true
  scene.add(archGlow)

  // ---------- the chained titans, looming over the back wall ----------
  const t1 = titanStatue(tickables, fires, { flip: 1 })
  t1.position.set(-8.5, -1.4, -19.5)
  t1.rotation.y = 0.42
  t1.scale.setScalar(0.88)
  const t2 = titanStatue(tickables, fires, { flip: -1 })
  t2.position.set(9, -1.6, -20)
  t2.rotation.y = -0.42
  t2.scale.setScalar(0.95)
  scene.add(t1, t2)
  // great chains from the titans' shoulders down into the pit rim
  for (const [x, z, rz] of [[-6.6, -17, 0.55], [7.2, -17.4, -0.55]]) {
    const ch = chain(5.5, 1.3, 0.02)
    ch.position.set(x, 7.2, z)
    ch.rotation.z = rz
    scene.add(ch)
  }

  // ---------- light rig ----------
  // cool moonlight shaft through the oculus = THE shadow key
  const key = new THREE.DirectionalLight('#a3b4da', 1.1)
  key.position.set(6, 30, 14)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -16, right: 16, top: 18, bottom: -6, near: 6, far: 70 })
  key.shadow.camera.updateProjectionMatrix()
  key.shadow.bias = -0.0003
  key.shadow.normalBias = 0.02
  scene.add(key, key.target)
  // warm counter-glow from the fire ring (no shadows — the braziers carry it)
  const fireFill = new THREE.DirectionalLight('#ff9a4d', 0.3)
  fireFill.position.set(-10, 6, -12)
  scene.add(fireFill, fireFill.target)
  const hemi = new THREE.HemisphereLight('#181420', '#22110c', 0.34)
  scene.add(hemi)

  // moonlight pool on the dueling circle instead of a fake shaft cone —
  // the cone's faces milk the frame with the camera inside it
  const moonPool = new THREE.SpotLight('#8fa4d4', 14, 46, 0.32, 0.5, 2)
  moonPool.position.set(0, 34, 2)
  moonPool.target.position.set(0, 0, 0)
  scene.add(moonPool, moonPool.target)

  // ---------- atmosphere ----------
  const updraft = fireflies({ count: 46, area: [30, 30], height: [0.5, 9], color: EMBER, size: 0.26 })
  const updraftHigh = fireflies({ count: 24, area: [40, 40], height: [6, 16], color: '#c96a2e', size: 0.2 })
  const dust = fireflies({ count: 18, area: [14, 10], height: [1, 8], color: '#8a93a8', size: 0.14 })
  scene.add(updraft, updraftHigh, dust)
  tickables.push(updraft, updraftHigh, dust)

  // ---------- boss mode: braziers flare red, gloom deepens ----------
  let boss = false
  const setBossMode = on => {
    if (on === boss) return
    boss = on
    for (const f of fires) f.setRed(on)
    for (const b of brazierLights) {
      b.light.color.set(on ? '#e0301e' : TORCH_GOLD)
      b.lightBase = on ? 20 : 16
      b.coals.material.color.set(new THREE.Color(on ? '#d92a1e' : FORGE).multiplyScalar(1.25))
    }
    scene.fog.color.set(on ? '#190a0e' : '#150f14')
    scene.fog.far = on ? 110 : 150
    hemi.color.set(on ? '#241016' : '#1c1826')
    hemi.groundColor.set(on ? '#30100c' : '#2a1610')
    fireFill.color.set(on ? '#e04a2e' : '#ff9a4d')
    fireFill.intensity = on ? 0.45 : 0.32
    updraft.material.color.set(on ? '#ff4030' : EMBER)
  }

  return { tickables, setBossMode, brazierPositions }
}
