import * as THREE from 'three'
import { canvasTexture, cloudTexture, groundTexture, glowTexture } from '../../core/assets.js'
import { toonMaterial, glowMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { skyDome, starField, cloudLayer, fireflies } from '../../art/environment.js'
import { rand, TAU } from '../../core/utils.js'

/** Collision data — index 0 is the solid main arena, the rest are pass-through. */
export const MAIN = { x: 0, y: 0, halfW: 13, solid: true }
export const PLATFORMS = [
  MAIN,
  { x: -7.5, y: 3.6, halfW: 3.4, solid: false },
  { x: 7.2, y: 6.2, halfW: 3.1, solid: false },
]
export const BLAST = { x: 26, bottom: -14, top: 22 }

// MORTAL ARENA palette — torchlight, stone, iron, bronze, ember. No neon.
const EMBER = '#ff8c3b'
const TORCH_GOLD = '#ffb84d'
const FORGE = '#ff5a26'
const CRIMSON = '#a1252c'
const STONE = '#4a443c'
const STONE_DARK = '#332d26'
const BASALT = '#241d17'

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

/** Low-poly rubble rock with baked flat normals. */
function stageRock({ color = '#57504a', scale = 1 } = {}) {
  let geo = new THREE.IcosahedronGeometry(0.55, 0)
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * rand(0.8, 1.25), p.getY(i) * rand(0.6, 1.1), p.getZ(i) * rand(0.8, 1.25))
  }
  geo = geo.toNonIndexed()
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, toonMaterial({ color, rimStrength: 0.22, rim: '#ffb27a' }))
  m.scale.setScalar(scale)
  m.position.y = 0.3 * scale
  m.rotation.y = rand(TAU)
  m.castShadow = true
  return m
}

/** Angular war-rune glyph strip, carved-then-lit look. */
function runeTexture() {
  return canvasTexture(1024, 96, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#ffd9a0'
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

/** Cooled lava crust: dark basalt plates over glowing cracks. */
function lavaTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#b8481a'
    ctx.fillRect(0, 0, w, h)
    // molten hot spots bleeding through
    for (let i = 0; i < 26; i++) {
      const x = rand(0, w), y = rand(0, h), r = rand(18, 60)
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, 'rgba(255, 156, 70, 0.9)')
      grad.addColorStop(1, 'rgba(255, 156, 70, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
    // crust plates — the gaps between them read as ember cracks
    for (let i = 0; i < 170; i++) {
      const x = rand(0, w), y = rand(0, h), r = rand(14, 46)
      const n = 5 + Math.floor(rand(0, 4))
      ctx.fillStyle = `rgb(${Math.round(rand(14, 26))}, ${Math.round(rand(7, 12))}, ${Math.round(rand(4, 8))})`
      ctx.beginPath()
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2
        const rr = r * rand(0.65, 1.1)
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
      }
      ctx.fill()
    }
  })
}

/** Ragged crimson war banner texture with a bone sigil. */
function bannerTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6e1a1c'
    ctx.fillRect(0, 0, w, h)
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(255, 140, 60, 0.25)')
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.05)')
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.55)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    // bone sigil: crossed axes glyph
    ctx.strokeStyle = '#e8dcc4'
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(w * 0.28, h * 0.3); ctx.lineTo(w * 0.72, h * 0.62)
    ctx.moveTo(w * 0.72, h * 0.3); ctx.lineTo(w * 0.28, h * 0.62)
    ctx.moveTo(w * 0.5, h * 0.25); ctx.lineTo(w * 0.5, h * 0.7)
    ctx.stroke()
    // ragged bottom edge
    ctx.globalCompositeOperation = 'destination-out'
    for (let x = 0; x < w; x += 10) {
      ctx.beginPath()
      ctx.moveTo(x, h)
      ctx.lineTo(x + 5, h - rand(8, 34))
      ctx.lineTo(x + 10, h)
      ctx.fill()
    }
  })
}

// ---------- shared geometry / materials for repeated props ----------
const SHARED = {}
function shared() {
  if (SHARED.ready) return SHARED
  SHARED.ready = true
  SHARED.stoneMat = toonMaterial({ color: STONE, rim: EMBER, rimStrength: 0.3 })
  SHARED.stoneDarkMat = toonMaterial({ color: STONE_DARK, rim: '#ff9a5a', rimStrength: 0.35 })
  SHARED.ironMat = toonMaterial({ color: '#3d4048', rim: '#8a8f9a', rimStrength: 0.3 })
  SHARED.bronzeMat = toonMaterial({ color: '#b0793a', rim: TORCH_GOLD, rimStrength: 0.5 })
  SHARED.linkGeo = new THREE.TorusGeometry(0.16, 0.045, 6, 10)
  SHARED.flameTex = glowTexture()
  return SHARED
}

const _m4 = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

/** Hanging iron chain — alternating torus links, one instanced draw call. */
function chain(len, scale = 1) {
  const S = shared()
  const n = Math.max(2, Math.round(len / (0.26 * scale)))
  const inst = new THREE.InstancedMesh(S.linkGeo, S.ironMat, n)
  _s.setScalar(scale)
  for (let i = 0; i < n; i++) {
    _e.set(i % 2 ? 0.12 : -0.08, i % 2 ? Math.PI / 2 : 0, 0)
    _q.setFromEuler(_e)
    _p.set(0, -i * 0.26 * scale, 0)
    _m4.compose(_p, _q, _s)
    inst.setMatrixAt(i, _m4)
  }
  inst.instanceMatrix.needsUpdate = true
  return inst
}

/** Torch / brazier flame: layered glow sprites + flicker tick. */
function flame({ size = 1, color = EMBER } = {}) {
  const S = shared()
  const g = new THREE.Group()
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: S.flameTex, color: new THREE.Color('#ffe9c0').multiplyScalar(1.7),
    transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  core.scale.set(0.55 * size, 0.9 * size, 1)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: S.flameTex, color, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  halo.scale.set(1.7 * size, 2.1 * size, 1)
  g.add(halo, core)
  let t = rand(10)
  g.tick = dt => {
    t += dt
    const f = 0.82 + 0.18 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1.7)
    core.scale.set(0.55 * size * f, 0.9 * size * (0.85 + 0.3 * f), 1)
    core.material.opacity = 0.7 + 0.3 * f
    halo.material.opacity = 0.38 + 0.24 * f
  }
  return g
}

/** Bronze brazier bowl on a stone base, with fire. */
function brazier(tickables, { light = false } = {}) {
  const S = shared()
  const g = new THREE.Group()
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.44, 0.5, 8), S.stoneDarkMat)
  base.position.y = 0.25
  base.castShadow = true
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 8), S.ironMat)
  stem.position.y = 0.85
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.24, 0.34, 10), S.bronzeMat)
  bowl.position.y = 1.3
  bowl.castShadow = true
  const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 10), glowMaterial(FORGE, 1.6))
  coals.position.y = 1.45
  const f = flame({ size: 1.5 })
  f.position.y = 1.9
  g.add(base, stem, bowl, coals, f)
  tickables.push(f)
  if (light) {
    const pl = new THREE.PointLight(TORCH_GOLD, 14, 16, 2)
    pl.position.y = 2
    g.add(pl)
    let t = rand(10)
    tickables.push({ tick: dt => { t += dt; pl.intensity = 12 + 4 * Math.sin(t * 8.7) * Math.sin(t * 5.1) } })
  }
  return g
}

/** Ragged war banner on an iron pole; cloth sways. */
function warBanner(tickables, { h = 3.4 } = {}) {
  const S = shared()
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, h, 6), S.ironMat)
  pole.position.y = h / 2
  pole.castShadow = true
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), S.ironMat)
  arm.rotation.z = Math.PI / 2
  arm.position.set(0.5, h - 0.15, 0)
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), S.bronzeMat)
  finial.position.y = h + 0.15
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 2.1, 1, 6),
    new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.9, side: THREE.DoubleSide, transparent: true }),
  )
  cloth.position.set(0.55, h - 1.25, 0)
  cloth.castShadow = true
  g.add(pole, arm, finial, cloth)
  let t = rand(10)
  tickables.push({ tick: dt => {
    t += dt
    cloth.rotation.y = Math.sin(t * 1.3) * 0.16
    cloth.rotation.x = Math.sin(t * 1.9 + 1) * 0.05
  } })
  return g
}

/** The main dueling platform: carved stone slab with an ember rune edge. */
function mainArena(tickables) {
  const S = shared()
  const g = new THREE.Group()
  const stoneTex = groundTexture({
    base: '#453e34', blotches: ['#362f27', '#524a3e', '#2b251f', '#5c5344', '#403930'], count: 560, alpha: 0.3,
  })
  stoneTex.repeat.set(3.4, 1)
  const topMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.94, metalness: 0.04, envMapIntensity: 0.25 })
  const sideMat = toonMaterial({ color: '#3d372f', rim: EMBER, rimStrength: 0.32 })
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(26, 1.1, 6.6),
    [sideMat, sideMat, topMat, sideMat, sideMat, sideMat],
  )
  slab.position.y = -0.55
  slab.castShadow = true
  slab.receiveShadow = true
  g.add(slab)

  // rocky basalt underside tapering into the chasm, rim-lit by the lava below
  const under = new THREE.Mesh(
    jitterCone(8.6, 8.6, 11),
    toonMaterial({ color: BASALT, rim: FORGE, rimStrength: 0.45, rimPower: 3 }),
  )
  under.rotation.x = Math.PI
  under.position.y = -5.15
  under.castShadow = true
  g.add(under)

  // carved war-rune trim along the front face — embers, not neon
  const runeMat = new THREE.MeshBasicMaterial({
    map: runeTexture(), color: new THREE.Color(EMBER).multiplyScalar(1.5),
    transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const runes = new THREE.Mesh(new THREE.PlaneGeometry(25.2, 0.62), runeMat)
  runes.position.set(0, -0.42, 3.32)
  g.add(runes)
  const trim = new THREE.Mesh(new THREE.BoxGeometry(26.1, 0.06, 0.06), glowMaterial(TORCH_GOLD, 1.35))
  trim.position.set(0, -0.02, 3.32)
  g.add(trim)
  let runeT = 0
  tickables.push({ tick: dt => { runeT += dt; runeMat.opacity = 0.6 + 0.3 * Math.sin(runeT * 1.7) * Math.sin(runeT * 0.9 + 2) } })

  // lava under-glow halo
  const halo = new THREE.Sprite(glowSpriteMaterial(FORGE, 0.13))
  halo.scale.set(26, 13, 1)
  halo.position.y = -4
  g.add(halo)

  // iron chains anchored to the slab flanks, trailing into the chasm
  for (const [x, len, sway] of [[-13.2, 6, 0.1], [13.2, 7.5, -0.12], [-10.8, 4.5, 0.07]]) {
    const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.24), S.ironMat)
    anchor.position.set(x, -0.6, 2.6)
    const ch = chain(len, 0.9)
    ch.position.set(x, -0.9, 2.6)
    ch.rotation.z = sway
    g.add(anchor, ch)
    let t = rand(10)
    tickables.push({ tick: dt => { t += dt; ch.rotation.z = sway + Math.sin(t * 0.7) * 0.05 } })
  }

  // top decoration (kept behind the fight plane)
  const b1 = brazier(tickables, { light: true })
  b1.position.set(-11.4, 0, -2.2)
  const b2 = brazier(tickables, { light: true })
  b2.position.set(11.4, 0, -2.2)
  g.add(b1, b2)
  const w1 = warBanner(tickables)
  w1.position.set(-12.6, 0, -2.8)
  const w2 = warBanner(tickables, { h: 3 })
  w2.position.set(12.7, 0, -2.9)
  g.add(w1, w2)
  const r1 = stageRock({ color: '#575047', scale: 0.9 })
  r1.position.set(-9.3, 0, -2.5)
  const r2 = stageRock({ color: '#4a4239', scale: 0.6 })
  r2.position.set(9, 0, -2.6)
  g.add(r1, r2)
  // fallen column drum + broken stub, old-temple wreckage
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 10), S.stoneMat)
  drum.rotation.z = Math.PI / 2
  drum.rotation.y = 0.4
  drum.position.set(6.4, 0.55, -2.5)
  drum.castShadow = true
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 1.1, 10), S.stoneDarkMat)
  stub.position.set(-6.8, 0.55, -2.6)
  stub.castShadow = true
  g.add(drum, stub)
  return g
}

/** Pass-through side platform: a broken pillar capital, chained to the sky. */
function brokenPillar(p, tickables) {
  const S = shared()
  const g = new THREE.Group()
  g.position.set(p.x, p.y, 0)
  const stoneTex = groundTexture({ base: '#514a40', blotches: ['#3e372e', '#5f574b', '#332d25'], size: 256, count: 110, alpha: 0.26 })
  const topMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.94, envMapIntensity: 0.25 })
  const sideMat = toonMaterial({ color: '#423b32', rim: '#ffb27a', rimStrength: 0.3 })
  const slab = new THREE.Mesh(new THREE.BoxGeometry(p.halfW * 2, 0.42, 2.8), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat])
  slab.position.y = -0.21
  slab.castShadow = true
  slab.receiveShadow = true
  g.add(slab)

  // fluted column stub, snapped off jagged below
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(p.halfW * 0.34, p.halfW * 0.4, 1.1, 10), S.stoneMat)
  shaft.position.y = -0.95
  shaft.castShadow = true
  const jag = new THREE.Mesh(jitterCone(p.halfW * 0.42, 1.4, 8), toonMaterial({ color: BASALT, rim: FORGE, rimStrength: 0.4 }))
  jag.rotation.x = Math.PI
  jag.position.y = -2
  jag.castShadow = true
  g.add(shaft, jag)

  // bronze banding + faint ember rune edge
  const band = new THREE.Mesh(new THREE.BoxGeometry(p.halfW * 2 + 0.1, 0.08, 0.08), glowMaterial(TORCH_GOLD, 1.25))
  band.position.set(0, -0.44, 1.42)
  g.add(band)

  // suspension chains rising out of frame — the arena's shackled ruins
  for (const s of [-1, 1]) {
    const ch = chain(16, 0.8)
    ch.position.set(s * (p.halfW - 0.5), 16, 0)
    ch.rotation.z = -s * 0.05
    g.add(ch)
  }

  const halo = new THREE.Sprite(glowSpriteMaterial(FORGE, 0.12))
  halo.scale.set(p.halfW * 2.4, 3.4, 1)
  halo.position.y = -1.2
  g.add(halo)
  let tt = rand(10)
  tickables.push({ tick: dt => { tt += dt; halo.material.opacity = 0.09 + 0.05 * Math.sin(tt * 1.8) } })
  return g
}

/** Chained colossus statue — a kneeling stone warlord, shackled to its pedestal. */
function chainedStatue({ x, z, s = 1, flip = 1 }, tickables) {
  const S = shared()
  const g = new THREE.Group()
  const mat = toonMaterial({ color: '#38322b', rim: '#c96a3a', rimStrength: 0.42, rimPower: 2.6 })
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.4, 3, 8), S.stoneDarkMat)
  pedestal.position.y = 1.5
  g.add(pedestal)
  // kneeling body
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.5, 3.2, 8), mat)
  torso.position.set(0, 4.4, 0)
  torso.rotation.x = 0.22
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 1.05), mat)
  head.position.set(0, 6.35, 0.4)
  head.rotation.x = 0.35 // head bowed
  const pauldronL = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), mat)
  pauldronL.position.set(-1.4, 5.4, 0.1)
  const pauldronR = pauldronL.clone()
  pauldronR.position.x = 1.4
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.6, 7), mat)
  armL.position.set(-1.7, 4, 0.7)
  armL.rotation.x = 0.9
  const armR = armL.clone()
  armR.position.x = 1.7
  const knee = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 1.6), mat)
  knee.position.set(0.9 * flip, 3.3, 1.3)
  g.add(torso, head, pauldronL, pauldronR, armL, armR, knee)
  // shackle chains wrist -> pedestal
  for (const sx of [-1, 1]) {
    const ch = chain(2.6, 1.4)
    ch.position.set(sx * 1.7, 3, 1.5)
    ch.rotation.z = sx * 0.5
    g.add(ch)
  }
  // ember eyes smoldering under the brow
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.06), glowMaterial(FORGE, 1.8))
    eye.position.set(sx * 0.26, 6.3, 0.95)
    eye.rotation.x = 0.35
    g.add(eye)
  }
  // votive fire at the statue's knees, lighting the stone from below
  const f = flame({ size: 3 })
  f.position.set(0, 3.6, 2.6)
  g.add(f)
  tickables.push(f)
  g.position.set(x, -9, z)
  g.scale.setScalar(s)
  g.rotation.y = flip * 0.35
  return g
}

/** Distant ruined colonnade / temple silhouettes rising from the chasm haze. */
function ruinBackdrop(tickables) {
  const S = shared()
  const g = new THREE.Group()
  const colMat = toonMaterial({ color: '#302a24', rim: '#b0562e', rimStrength: 0.38, rimPower: 2.6 })
  const farMat = toonMaterial({ color: '#231a1c', rim: CRIMSON, rimStrength: 0.4, rimPower: 2.4 })
  const colGeo = new THREE.CylinderGeometry(1.3, 1.55, 1, 9)
  const capGeo = new THREE.BoxGeometry(3.6, 1, 3.6)

  // mid-ground broken colonnade with torch flames — instanced, 2 draw calls
  const cols = [
    [-34, 15, -34, true], [-24, 22, -38, false], [-15, 12, -33, true],
    [15, 19, -36, false], [25, 11, -33, true], [35, 24, -40, false], [45, 14, -36, true],
  ]
  const colInst = new THREE.InstancedMesh(colGeo, colMat, cols.length)
  const capInst = new THREE.InstancedMesh(capGeo, colMat, cols.length)
  cols.forEach(([x, h, z, torch], i) => {
    _q.setFromEuler(_e.set(0, 0, 0))
    _m4.compose(_p.set(x, h / 2 - 12, z), _q, _s.set(1.5, h, 1.5))
    colInst.setMatrixAt(i, _m4)
    _q.setFromEuler(_e.set(0, rand(-0.1, 0.1), 0))
    _m4.compose(_p.set(x, h - 11.6, z), _q, _s.set(1, 1, 1))
    capInst.setMatrixAt(i, _m4)
    if (torch) {
      const f = flame({ size: 2.6 })
      f.position.set(x, h - 10.2, z)
      g.add(f)
      tickables.push(f)
    }
  })
  colInst.instanceMatrix.needsUpdate = true
  capInst.instanceMatrix.needsUpdate = true
  g.add(colInst, capInst)
  // architrave beams bridging two pairs — the ruined arcade line
  for (const [x1, x2, y, z] of [[-34, -24, 8.5, -36], [25, 35, 10.5, -36.5]]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x2 - x1) + 3, 1.4, 2.6), colMat)
    beam.position.set((x1 + x2) / 2, y, z)
    beam.rotation.z = rand(-0.03, 0.03)
    g.add(beam)
  }

  // great ruined gate, dead center back
  const gate = new THREE.Group()
  for (const s of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 34, 7), farMat)
    tower.position.set(s * 12, 5, 0)
    gate.add(tower)
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(32, 5, 6), farMat)
  lintel.position.y = 19.5
  const crown = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 6), farMat)
  crown.position.set(-6, 24, 0)
  crown.rotation.z = 0.08
  gate.add(lintel, crown)
  // two watch-fires smoldering on the gate towers
  for (const s of [-1, 1]) {
    const f = flame({ size: 5 })
    f.position.set(s * 12, 24.5, 0)
    gate.add(f)
    tickables.push(f)
  }
  gate.position.set(4, -8, -150)
  gate.scale.setScalar(1.35)
  g.add(gate)

  // farthest broken towers, pure silhouette
  for (const [x, h, z, w] of [[-70, 40, -150, 12], [-45, 26, -135, 9], [62, 48, -160, 14], [88, 30, -130, 10], [-100, 34, -140, 11]]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), farMat)
    t.position.set(x, h / 2 - 16, z)
    t.rotation.y = rand(TAU)
    g.add(t)
  }
  return g
}

/** Rising ember updraft particles out of the chasm. */
function emberUpdraft({ count = 110, area = [64, 30], bottom = -24, top = 15, size = 0.55, color = EMBER } = {}) {
  const pos = new Float32Array(count * 3)
  const spd = new Float32Array(count)
  const phase = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos.set([rand(-area[0] / 2, area[0] / 2), rand(bottom, top), rand(-area[1] / 2, area[1] * 0.2)], i * 3)
    spd[i] = rand(1.6, 4.6)
    phase[i] = rand(TAU)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    map: glowTexture(), color, size, transparent: true, opacity: 0.85,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const pts = new THREE.Points(geo, mat)
  let t = 0
  pts.tick = dt => {
    t += dt
    const p = pts.geometry.attributes.position
    for (let i = 0; i < count; i++) {
      let y = p.getY(i) + spd[i] * dt
      if (y > top) y = bottom + rand(0, 3)
      p.setY(i, y)
      p.setX(i, p.getX(i) + Math.sin(t * 1.3 + phase[i]) * dt * 0.8)
    }
    p.needsUpdate = true
    mat.opacity = 0.7 + 0.2 * Math.sin(t * 3.1)
  }
  return pts
}

/** Blood-red moon disc + haze halo. */
function bloodMoon() {
  const g = new THREE.Group()
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.5)
    grad.addColorStop(0, '#e8604a')
    grad.addColorStop(0.75, '#b83228')
    grad.addColorStop(1, '#8a1f1e')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, w * 0.5 - 2, 0, Math.PI * 2)
    ctx.fill()
    // craters
    ctx.fillStyle = 'rgba(90, 20, 20, 0.45)'
    for (let i = 0; i < 14; i++) {
      const a = rand(TAU), r = rand(0, w * 0.36)
      ctx.beginPath()
      ctx.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, rand(4, 16), 0, Math.PI * 2)
      ctx.fill()
    }
  })
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(17, 40),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }),
  )
  disc.material.color.setScalar(1.25) // just enough to catch bloom as haze
  const halo = new THREE.Sprite(glowSpriteMaterial(CRIMSON, 0.4))
  halo.scale.set(85, 85, 1)
  g.add(halo, disc)
  g.position.set(58, 92, -300)
  g.lookAt(0, 4, 0)
  return g
}

/** Build the whole torchlit arena-over-the-chasm stage. Returns { tickables }. */
export function buildStage(scene) {
  const tickables = []
  scene.fog = new THREE.Fog('#1c1216', 70, 380)

  scene.add(skyDome({
    top: '#140e1e', mid: '#2c1826', bottom: '#4a2426',
    sunDir: new THREE.Vector3(0.42, 0.6, -0.68), sunColor: '#a1252c', sunSize: 40,
  }))
  scene.add(starField({ count: 420, radius: 420, size: 1.8, color: '#ffe4c8' }))
  scene.add(bloodMoon())

  // ---------- the lava chasm ----------
  // fog-aware basalt floor to the horizon, with a molten seam under the arena
  const basaltFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 600),
    new THREE.MeshStandardMaterial({ color: '#170a07', roughness: 1, metalness: 0 }),
  )
  basaltFloor.rotation.x = -Math.PI / 2
  basaltFloor.position.y = -26.5
  scene.add(basaltFloor)
  const lavaTex = lavaTexture()
  lavaTex.repeat.set(3, 1.4)
  const lava = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 62),
    new THREE.MeshBasicMaterial({ map: lavaTex }),
  )
  lava.rotation.x = -Math.PI / 2
  lava.position.set(0, -26, -22) // molten river kept back in the chasm; foreground stays dark
  scene.add(lava)
  let lavaT = 0
  tickables.push({ tick: dt => {
    lavaT += dt
    lavaTex.offset.x += dt * 0.0035 // crust slowly drifting
    lava.material.color.setScalar(0.72 + 0.11 * Math.sin(lavaT * 1.3)) // molten breathing
  } })
  // molten heart directly beneath the arena
  const heart = new THREE.Sprite(glowSpriteMaterial(FORGE, 0.16))
  heart.scale.set(36, 12, 1)
  heart.position.set(0, -24, -10)
  scene.add(heart)

  // rolling smoke band that veils the lava/floor seam
  const smokeTex = cloudTexture()
  const band = new THREE.Group()
  const bandData = []
  for (const [x, y, z, s, o] of [
    [-58, -18, -34, 70, 0.75], [-20, -19, -30, 84, 0.8], [22, -18, -32, 78, 0.75],
    [60, -19, -36, 72, 0.7],
    [0, -16, -52, 100, 0.7], [-46, -15, -56, 92, 0.6], [48, -15, -58, 96, 0.6],
  ]) {
    const mat = new THREE.SpriteMaterial({ map: smokeTex, color: '#241210', transparent: true, opacity: o, depthWrite: false })
    const sp = new THREE.Sprite(mat)
    sp.position.set(x, y, z)
    sp.scale.set(s, s * 0.32, 1)
    band.add(sp)
    bandData.push({ sp, x, speed: rand(0.15, 0.4), amp: rand(5, 11), phase: rand(TAU) })
  }
  scene.add(band)
  let bandT = 0
  tickables.push({ tick: dt => {
    bandT += dt
    for (const b of bandData) b.sp.position.x = b.x + Math.sin(bandT * b.speed + b.phase) * b.amp
  } })

  // smoke rolling over the lava + high haze
  const smokeLow = cloudLayer({ count: 15, radius: 150, height: [-24, -13], opacity: 0.5, scale: [45, 100], color: '#4a2418' })
  const hazeFar = cloudLayer({ count: 9, radius: 300, height: [22, 70], opacity: 0.22, scale: [80, 150], color: '#3a1c22' })
  scene.add(smokeLow, hazeFar)
  tickables.push(smokeLow, hazeFar)

  // hand-placed smoke plumes drifting under the arena, visible in frame
  const puffTex = cloudTexture()
  const puffs = new THREE.Group()
  const puffData = []
  for (const [x, y, z, s] of [[-20, -11, -14, 38], [12, -15, -10, 48], [30, -10, -20, 34], [-34, -17, -8, 44], [2, -19, -16, 56], [-9, -8.5, 5, 24], [16, -12, 6, 28]]) {
    const mat = new THREE.SpriteMaterial({ map: puffTex, color: '#6e3a24', transparent: true, opacity: rand(0.4, 0.6), depthWrite: false })
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

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight('#3a2438', '#69281a', 0.5))
  const key = new THREE.DirectionalLight('#ffc98a', 1.45)
  key.position.set(-14, 24, -15)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -18, right: 18, top: 24, bottom: -14, near: 4, far: 80 })
  key.shadow.camera.updateProjectionMatrix()
  key.shadow.bias = -0.0004
  scene.add(key, key.target)

  // lava up-light rimming the underside of the arena
  const lavaLight = new THREE.PointLight(FORGE, 15, 36, 2)
  lavaLight.position.set(0, -9, 3)
  scene.add(lavaLight)
  let lt = 0
  tickables.push({ tick: dt => { lt += dt; lavaLight.intensity = 13 + 4 * Math.sin(lt * 2.3) * Math.sin(lt * 1.1 + 2) } })

  // ---------- stage ----------
  scene.add(mainArena(tickables))
  for (let i = 1; i < PLATFORMS.length; i++) scene.add(brokenPillar(PLATFORMS[i], tickables))

  // ---------- backdrop: temple ruins + chained colossi ----------
  scene.add(ruinBackdrop(tickables))
  scene.add(chainedStatue({ x: -42, z: -54, s: 2.1, flip: 1 }, tickables))
  scene.add(chainedStatue({ x: 44, z: -60, s: 2.4, flip: -1 }, tickables))

  // ---------- atmosphere particles ----------
  const updraft = emberUpdraft({})
  const updraftNear = emberUpdraft({ count: 36, area: [30, 8], bottom: -12, top: 8, size: 0.4, color: '#ffb27a' })
  scene.add(updraft, updraftNear)
  tickables.push(updraft, updraftNear)
  const sparks = fireflies({ count: 34, area: [36, 12], height: [0.5, 9], color: '#ff9a3b', size: 0.5 })
  const ash = fireflies({ count: 46, area: [80, 34], height: [-6, 16], color: '#7a6c5c', size: 0.26 })
  scene.add(sparks, ash)
  tickables.push(sparks, ash)

  return { tickables }
}
