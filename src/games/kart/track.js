import * as THREE from 'three'
import { canvasTexture } from '../../core/assets.js'
import { glowMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { skyDome, cloudLayer, groundDisc, fireflies } from '../../art/environment.js'
import { toonMaterial } from '../../art/materials.js'
import { rand, TAU, clamp } from '../../core/utils.js'

export const TRACK_HALF_W = 5.5
export const WALL_DIST = 26 // soft invisible wall, lateral distance from center line
const N = 1024 // curve samples

const _v = new THREE.Vector3()

/* ------------------------------------------------------------------ */
/* textures                                                            */
/* ------------------------------------------------------------------ */

function roadTexture() {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    // packed scorched earth / old war-road stone
    ctx.fillStyle = '#241e18'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(232,220,196,0.04)' : 'rgba(0,0,0,0.15)'
      const x = rand(w), y = rand(h)
      ctx.fillRect(x, y, rand(1, 4), rand(1, 4))
    }
    // cracks
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = 1.5
    for (let i = 0; i < 7; i++) {
      ctx.beginPath()
      let x = rand(w), y = rand(h)
      ctx.moveTo(x, y)
      for (let s = 0; s < 4; s++) { x += rand(-26, 26); y += rand(10, 40); ctx.lineTo(x, y) }
      ctx.stroke()
    }
    // worn bone-painted edge lines over crimson kill-strips
    ctx.fillStyle = '#786a4f'
    ctx.fillRect(8, 0, 7, h)
    ctx.fillRect(w - 15, 0, 7, h)
    ctx.fillStyle = '#78201c'
    ctx.fillRect(1, 0, 5, h)
    ctx.fillRect(w - 6, 0, 5, h)
    // dashed center line — faded ash
    ctx.fillStyle = '#4a4033'
    ctx.fillRect(w / 2 - 3, 12, 6, 74)
    ctx.fillRect(w / 2 - 3, 140, 6, 74)
  })
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

function checkerTexture() {
  return canvasTexture(128, 64, (ctx, w, h) => {
    const s = 16
    for (let y = 0; y < h / s; y++) {
      for (let x = 0; x < w / s; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#191410' : '#d8ccb0'
        ctx.fillRect(x * s, y * s, s, s)
      }
    }
  })
}

/** Ember-rune chevrons for boost slabs (additive — only the glow drawn). */
function runeTexture() {
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#ffcf9a'
    ctx.lineWidth = 14
    ctx.lineCap = 'square'
    for (const y of [98, 62, 26]) {
      ctx.beginPath()
      ctx.moveTo(22, y + 13)
      ctx.lineTo(w / 2, y - 13)
      ctx.lineTo(w - 22, y + 13)
      ctx.stroke()
    }
    // flanking rune ticks
    ctx.lineWidth = 6
    for (const x of [10, w - 10]) {
      ctx.beginPath()
      ctx.moveTo(x, 20)
      ctx.lineTo(x, 108)
      ctx.stroke()
    }
  })
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function signTexture() {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    // ragged war-banner silhouette
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(w, 0)
    ctx.lineTo(w, h - 26)
    for (let x = w; x > 0; x -= 64) {
      ctx.lineTo(x - 32, h - rand(0, 14))
      ctx.lineTo(x - 64, h - 26 - rand(0, 10))
    }
    ctx.closePath()
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#5a161b')
    g.addColorStop(0.55, '#431114')
    g.addColorStop(1, '#2e0c0f')
    ctx.fillStyle = g
    ctx.fill()
    ctx.save()
    ctx.clip()
    // leather grime
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(232,220,196,0.03)'
      ctx.fillRect(rand(w), rand(h), rand(2, 9), rand(2, 9))
    }
    ctx.restore()
    // bronze frame
    ctx.strokeStyle = '#b0793a'
    ctx.lineWidth = 10
    ctx.strokeRect(12, 12, w - 24, h - 60)
    ctx.strokeStyle = 'rgba(255, 184, 77, 0.5)'
    ctx.lineWidth = 3
    ctx.strokeRect(24, 24, w - 48, h - 84)
    // rivets
    ctx.fillStyle = '#d8a558'
    for (const x of [40, w - 40]) for (const y of [40, h - 76]) {
      ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill()
    }
    ctx.font = '900 116px Palatino, "Book Antiqua", Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffdf9e'
    ctx.shadowColor = '#ff8c3b'
    ctx.shadowBlur = 34
    ctx.fillText('WAR CHARIOTS', w / 2, h / 2 - 14)
  })
}

/** Trackside war banner: ragged cloth with a faded sword emblem. */
function flagTexture(color) {
  return canvasTexture(64, 96, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    // ragged-bottom banner silhouette
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(w, 0)
    ctx.lineTo(w, h - 16)
    ctx.lineTo(w * 0.75, h - 6)
    ctx.lineTo(w * 0.5, h - 18)
    ctx.lineTo(w * 0.25, h - 4)
    ctx.lineTo(0, h - 14)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    ctx.save()
    ctx.clip()
    // grime + shading
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.4)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fillRect(rand(w), rand(h), rand(2, 6), rand(2, 6))
    }
    // faded sword emblem
    ctx.fillStyle = 'rgba(232,220,196,0.55)'
    ctx.beginPath() // blade
    ctx.moveTo(w / 2, 16)
    ctx.lineTo(w / 2 + 4, 26)
    ctx.lineTo(w / 2 + 4, 54)
    ctx.lineTo(w / 2 - 4, 54)
    ctx.lineTo(w / 2 - 4, 26)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(w / 2 - 11, 52, 22, 5) // guard
    ctx.fillRect(w / 2 - 2, 57, 4, 13) // grip
    ctx.restore()
  })
}

/** Low-poly jittered rock with baked flat normals (shared rock() flatShading fights the rim shader). */
function redRock({ color = '#6e392b', scale = 1 } = {}) {
  const geo = new THREE.IcosahedronGeometry(0.55, 0) // already non-indexed
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * rand(0.8, 1.3), p.getY(i) * rand(0.55, 1.15), p.getZ(i) * rand(0.8, 1.3))
  }
  geo.computeVertexNormals() // flat normals baked per-face
  const m = new THREE.Mesh(geo, toonMaterial({ color, rimStrength: 0.22, rim: '#ff9a5c' }))
  m.scale.setScalar(scale)
  m.position.y = 0.3 * scale
  m.rotation.y = rand(TAU)
  m.castShadow = true
  return m
}

/* ------------------------------------------------------------------ */
/* track                                                               */
/* ------------------------------------------------------------------ */

/**
 * Builds the full circuit + scorched-badlands war-road into `scene`.
 * Returns geometry helpers, pads, rings, sun light and tickables.
 */
export function buildTrack(scene) {
  // control points: long top straight, right sweeper, east hairpin,
  // mid chicane, south sweeper, west hairpin, return sweeper.
  const ctrl = [
    [-70, 90], [10, 100], [70, 88], [105, 45], [95, -10], [55, -30],
    [30, 8], [-5, -18], [-45, -60], [-100, -45], [-115, 20], [-95, 65],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z))
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'catmullrom', 0.5)
  const length = curve.getLength()

  // dense samples: pos / tangent / left / curvature
  const pos = [], tan = [], left = [], curvArr = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const t = i / N
    pos.push(curve.getPointAt(t))
    tan.push(curve.getTangentAt(t).normalize())
    left.push(new THREE.Vector3(tan[i].z, 0, -tan[i].x)) // up x tangent
  }
  const segLen = length / N
  for (let i = 0; i < N; i++) {
    const a = tan[i], b = tan[(i + 6) % N]
    curvArr[i] = Math.acos(clamp(a.dot(b), -1, 1)) / (segLen * 6) // 1/turn-radius
  }

  const track = {
    curve, length, halfW: TRACK_HALF_W, N, pos, tan, left, curv: curvArr,
    tickables: [], pads: [], rings: [],
    minimapPts: pos.filter((_, i) => i % 8 === 0).map(p => [p.x, p.z]),
  }

  track.posAt = (s, out) => {
    const f = ((s % 1) + 1) % 1 * N
    const i = Math.floor(f) % N, j = (i + 1) % N
    return out.copy(pos[i]).lerp(pos[j], f - Math.floor(f))
  }
  track.tanAt = (s, out) => {
    const i = Math.floor(((s % 1) + 1) % 1 * N) % N
    return out.copy(tan[i])
  }
  track.leftAt = (s, out) => {
    const i = Math.floor(((s % 1) + 1) % 1 * N) % N
    return out.copy(left[i])
  }
  /** Windowed nearest-sample search (cheap, call with last known idx). */
  track.nearestIdx = (p, lastIdx, window = 60) => {
    let best = lastIdx, bd = Infinity
    for (let o = -window; o <= window; o++) {
      const i = (lastIdx + o + N) % N
      const dx = pos[i].x - p.x, dz = pos[i].z - p.z
      const d = dx * dx + dz * dz
      if (d < bd) { bd = d; best = i }
    }
    return best
  }
  track.maxCurvAhead = (idx, count = 46) => {
    let m = 0
    for (let o = 0; o < count; o += 3) m = Math.max(m, curvArr[(idx + o) % N])
    return m
  }
  /** Min distance from point to track centerline (coarse). */
  const distToTrack = p => {
    let bd = Infinity
    for (let i = 0; i < N; i += 12) {
      const dx = pos[i].x - p.x, dz = pos[i].z - p.z
      bd = Math.min(bd, dx * dx + dz * dz)
    }
    return Math.sqrt(bd)
  }

  buildRoad(scene, track)
  buildStartArch(scene, track)
  buildPads(scene, track)
  buildRings(scene, track)
  buildEnvironment(scene, track, distToTrack)
  return track
}

/* ------------------------------------------------------------------ */

function buildRoad(scene, track) {
  const { pos, left, curv } = track
  const hw = TRACK_HALF_W
  // road ribbon
  const verts = new Float32Array((N + 1) * 2 * 3)
  const uvs = new Float32Array((N + 1) * 2 * 2)
  const idx = []
  for (let i = 0; i <= N; i++) {
    const k = i % N
    const p = pos[k], l = left[k]
    verts.set([p.x + l.x * hw, 0.02, p.z + l.z * hw, p.x - l.x * hw, 0.02, p.z - l.z * hw], i * 6)
    const v = (i / N) * 96
    uvs.set([0, v, 1, v], i * 4)
    if (i < N) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: roadTexture(), roughness: 0.92, metalness: 0, envMapIntensity: 0.25,
  }))
  road.receiveShadow = true
  scene.add(road)

  // smoldering ember curbs on tight corners (merged strips, HDR fire -> bloom)
  const curbVerts = []
  const curbIdx = []
  let vi = 0
  for (let i = 0; i < N; i += 2) {
    if (curv[i] < 0.028) continue
    const j = (i + 2) % N
    for (const side of [1, -1]) {
      for (const [a, b] of [[i, j]]) {
        const pa = pos[a], pb = pos[b], la = left[a], lb = left[b]
        curbVerts.push(
          pa.x + la.x * hw * side, 0.06, pa.z + la.z * hw * side,
          pa.x + la.x * (hw + 0.55) * side, 0.06, pa.z + la.z * (hw + 0.55) * side,
          pb.x + lb.x * hw * side, 0.06, pb.z + lb.z * hw * side,
          pb.x + lb.x * (hw + 0.55) * side, 0.06, pb.z + lb.z * (hw + 0.55) * side,
        )
        curbIdx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2)
        vi += 4
      }
    }
  }
  const cgeo = new THREE.BufferGeometry()
  cgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(curbVerts), 3))
  cgeo.setIndex(curbIdx)
  const curb = new THREE.Mesh(cgeo, new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ff5a26').multiplyScalar(1.0), side: THREE.DoubleSide,
  }))
  scene.add(curb)
  let ct = 0
  track.tickables.push({ tick: dt => {
    ct += dt
    curb.material.color.set('#ff5a26').multiplyScalar(0.8 + 0.4 * (0.5 + 0.5 * Math.sin(ct * 2.4)))
  } })
}

function buildStartArch(scene, track) {
  const p = track.pos[0], l = track.left[0], tn = track.tan[0]
  const g = new THREE.Group()
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#3d352c', roughness: 0.85, envMapIntensity: 0.3 })
  const stoneDark = new THREE.MeshStandardMaterial({ color: '#2a241d', roughness: 0.9, envMapIntensity: 0.25 })
  const pgeo = new THREE.BoxGeometry(1.7, 9, 1.7)
  const capGeo = new THREE.BoxGeometry(2.3, 0.55, 2.3)
  const baseGeo = new THREE.BoxGeometry(2.5, 0.8, 2.5)
  const flameGeo = new THREE.ConeGeometry(0.34, 1.0, 7)
  const flames = []
  for (const side of [1, -1]) {
    const px = p.x + l.x * (TRACK_HALF_W + 1.8) * side
    const pz = p.z + l.z * (TRACK_HALF_W + 1.8) * side
    const pl = new THREE.Mesh(pgeo, stoneMat)
    pl.position.set(px, 4.5, pz)
    pl.castShadow = true
    g.add(pl)
    const base = new THREE.Mesh(baseGeo, stoneDark)
    base.position.set(px, 0.4, pz)
    g.add(base)
    const cap = new THREE.Mesh(capGeo, stoneDark)
    cap.position.set(px, 9.2, pz)
    cap.castShadow = true
    g.add(cap)
    // pillar-top brazier fire
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.28, 0.45, 8), stoneDark)
    bowl.position.set(px, 9.7, pz)
    g.add(bowl)
    const fl = new THREE.Mesh(flameGeo, glowMaterial('#ff8c3b', 2.4))
    fl.position.set(px, 10.35, pz)
    g.add(fl)
    const halo = new THREE.Sprite(glowSpriteMaterial('#ff8c3b', 0.5))
    halo.scale.setScalar(2.6)
    halo.position.set(px, 10.3, pz)
    g.add(halo)
    flames.push({ fl, halo, ph: rand(TAU) })
  }
  let ft = 0
  track.tickables.push({ tick: dt => {
    ft += dt
    for (const { fl, halo, ph } of flames) {
      const s = 1 + 0.16 * Math.sin(ft * 11 + ph) + 0.09 * Math.sin(ft * 23 + ph * 2)
      fl.scale.set(s, 1 + 0.28 * Math.abs(Math.sin(ft * 7 + ph)), s)
      halo.material.opacity = 0.4 + 0.16 * Math.sin(ft * 9 + ph)
    }
  } })
  // timber crossbar lashed between the pillars
  const barW = (TRACK_HALF_W + 1.8) * 2 + 1.7
  const bar = new THREE.Mesh(new THREE.BoxGeometry(barW, 0.75, 0.6), new THREE.MeshStandardMaterial({ color: '#33241a', roughness: 0.8, envMapIntensity: 0.3 }))
  bar.position.set(p.x, 9.35, p.z)
  bar.rotation.y = Math.atan2(l.x, l.z) + Math.PI / 2
  g.add(bar)
  // WAR CHARIOTS banner hangs from the bar (both faces)
  const signMat = new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(barW - 2.4, 2.3), signMat)
  sign.position.set(p.x - tn.x * 0.32, 7.9, p.z - tn.z * 0.32)
  sign.rotation.y = Math.atan2(-tn.x, -tn.z) // faces the approaching grid
  const sign2 = sign.clone()
  sign2.position.set(p.x + tn.x * 0.32, 7.9, p.z + tn.z * 0.32)
  sign2.rotation.y = Math.atan2(tn.x, tn.z)
  g.add(sign2)
  g.add(sign)
  // bone-mosaic start strip on the road
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_HALF_W * 2, 3),
    new THREE.MeshBasicMaterial({ map: checkerTexture() }),
  )
  strip.rotation.x = -Math.PI / 2
  strip.rotation.z = bar.rotation.y
  strip.position.set(p.x, 0.035, p.z)
  g.add(strip)
  scene.add(g)
}

function buildPads(scene, track) {
  // glowing rune slabs on straights / sweeper exits (sample indices)
  const at = [30, 150, 380, 560, 760, 930]
  const tex = runeTexture()
  const geo = new THREE.PlaneGeometry(3.4, 4.6)
  const slabGeo = new THREE.BoxGeometry(3.8, 0.05, 5.0)
  const slabMat = new THREE.MeshStandardMaterial({ color: '#231d17', roughness: 0.85, envMapIntensity: 0.25 })
  for (const i of at) {
    const p = track.pos[i], tn = track.tan[i], l = track.left[i]
    const off = rand(-1.6, 1.6)
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      color: new THREE.Color('#ff8c3b').multiplyScalar(1.8),
    })
    const slab = new THREE.Mesh(slabGeo, slabMat)
    slab.rotation.y = Math.atan2(-tn.x, -tn.z)
    slab.position.set(p.x + l.x * off, 0.03, p.z + l.z * off)
    scene.add(slab)
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = -Math.PI / 2
    m.rotation.z = Math.atan2(-tn.x, -tn.z)
    m.position.set(p.x + l.x * off, 0.07, p.z + l.z * off)
    scene.add(m)
    const pad = { x: m.position.x, z: m.position.z, mat, t: rand(4) }
    track.pads.push(pad)
    track.tickables.push({ tick: dt => {
      pad.t += dt
      mat.color.set('#ff8c3b').multiplyScalar(1.4 + 0.7 * (0.5 + 0.5 * Math.sin(pad.t * 5)))
    } })
  }
}

function buildRings(scene, track) {
  // flaming hoops — collect for boost meter
  const ringGeo = new THREE.TorusGeometry(1.45, 0.13, 10, 36)
  const ringMat = glowMaterial('#ff8c3b', 1.85)
  const at = [70, 145, 220, 300, 372, 450, 528, 610, 690, 768, 845, 906, 960]
  for (let k = 0; k < at.length; k++) {
    const i = at[k]
    const p = track.pos[i], tn = track.tan[i], l = track.left[i]
    const off = ((k % 3) - 1) * 2.6
    const g = new THREE.Group()
    const m = new THREE.Mesh(ringGeo, ringMat)
    m.rotation.y = Math.atan2(tn.x, tn.z)
    g.add(m)
    const halo = new THREE.Sprite(glowSpriteMaterial('#ff6a2e', 0.34))
    halo.scale.setScalar(4.4)
    g.add(halo)
    g.position.set(p.x + l.x * off, 1.15, p.z + l.z * off)
    scene.add(g)
    const ring = { pos: g.position, home: g.position.clone(), group: g, active: true, respawnT: 0, t: rand(TAU) }
    track.rings.push(ring)
    track.tickables.push({ tick: dt => {
      ring.t += dt
      if (!ring.active) return
      g.position.y = 1.15 + Math.sin(ring.t * 2.2) * 0.16
      m.rotation.z += dt * 1.4
      const fs = 4.1 + 0.5 * Math.sin(ring.t * 9) + 0.25 * Math.sin(ring.t * 21)
      halo.scale.setScalar(fs)
      halo.material.opacity = 0.28 + 0.1 * Math.sin(ring.t * 13)
    } })
  }
}

/* ------------------------------------------------------------------ */

/** Gnarled dead tree: bare trunk + angled branches (shared geo/material). */
function deadTree(shared, scale) {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(shared.trunkGeo, shared.wood)
  trunk.position.y = 0.8
  trunk.rotation.z = rand(-0.09, 0.09)
  trunk.castShadow = true
  g.add(trunk)
  const n = 2 + Math.floor(rand(0, 2.4))
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(shared.branchGeo, shared.wood)
    const a = rand(TAU)
    b.position.set(Math.cos(a) * 0.12, rand(1.0, 1.6), Math.sin(a) * 0.12)
    b.rotation.set(Math.cos(a) * rand(0.5, 1.0), 0, Math.sin(a) * rand(0.5, 1.0) + rand(-0.2, 0.2))
    b.castShadow = true
    g.add(b)
  }
  g.scale.setScalar(scale * rand(0.85, 1.2))
  g.rotation.y = rand(TAU)
  return g
}

/** Colossal bone rib-arch spanning the war road. */
function boneArch(track, idx, boneMat) {
  const g = new THREE.Group()
  const p = track.pos[idx], tn = track.tan[idx]
  const arc = new THREE.Mesh(new THREE.TorusGeometry(8.2, 0.5, 8, 26, Math.PI), boneMat)
  arc.castShadow = true
  g.add(arc)
  // vertebral spurs along the crown
  for (const a of [Math.PI * 0.32, Math.PI * 0.5, Math.PI * 0.68]) {
    const spur = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.3, 6), boneMat)
    spur.position.set(Math.cos(a) * 8.9, Math.sin(a) * 8.9, 0)
    spur.rotation.z = a - Math.PI / 2
    g.add(spur)
  }
  g.position.set(p.x, 0, p.z)
  g.rotation.y = Math.atan2(tn.x, tn.z)
  g.rotation.x = rand(-0.05, 0.05)
  return g
}

function buildEnvironment(scene, track, distToTrack) {
  // dusk over the scorched badlands: umber night above, ember horizon below
  scene.fog = new THREE.Fog('#3d221b', 70, 430)
  const sunDir = new THREE.Vector3(-0.5, 0.38, -0.65).normalize()
  scene.add(skyDome({
    top: '#1a1420', mid: '#3a2030', bottom: '#a8431f',
    radius: 520, sunDir, sunColor: '#ff8c3b', sunSize: 170,
  }))
  const clouds = cloudLayer({ count: 14, radius: 330, height: [60, 130], color: '#4e2c2a', opacity: 0.5, scale: [70, 150] })
  scene.add(clouds)
  track.tickables.push(clouds)

  const ground = groundDisc({
    radius: 460, repeat: 10,
    texOpts: { base: '#33211a', blotches: ['#3e2818', '#28190f', '#472e1d', '#20140d'], alpha: 0.3, count: 560 },
  })
  ground.material.envMapIntensity = 0.25
  scene.add(ground)

  // lights — low forge-fire sun
  scene.add(new THREE.HemisphereLight('#7e4636', '#1c130e', 0.45))
  const sun = new THREE.DirectionalLight('#ff9a5c', 2.5)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 220
  const sc = sun.shadow.camera
  sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42
  sc.updateProjectionMatrix()
  sun.shadow.bias = -0.0004
  scene.add(sun, sun.target)
  track.sun = sun
  track.sunDir = sunDir

  // dark red rock mesas — placed off-track
  const place = (min, max) => {
    for (let tries = 0; tries < 40; tries++) {
      _v.set(rand(-230, 230), 0, rand(-200, 210))
      const d = distToTrack(_v)
      if (d > min && d < max) return _v.clone()
    }
    return null
  }
  for (let i = 0; i < 26; i++) {
    const p = place(14, 210)
    if (!p) continue
    const big = redRock({ color: Math.random() > 0.5 ? '#6e392b' : '#5c2f24', scale: rand(4, 13) })
    big.position.x = p.x; big.position.z = p.z
    scene.add(big)
    if (Math.random() > 0.55) {
      const cap = redRock({ color: '#7e4632', scale: rand(2, 4.5) })
      cap.position.set(p.x + rand(-1.2, 1.2), big.position.y * 1.5, p.z + rand(-1.2, 1.2))
      scene.add(cap)
    }
  }

  // dead trees across the wastes
  const treeShared = {
    trunkGeo: new THREE.CylinderGeometry(0.08, 0.2, 1.7, 6),
    branchGeo: new THREE.CylinderGeometry(0.03, 0.08, 1.1, 5),
    wood: toonMaterial({ color: '#33261d', rimStrength: 0.2, rim: '#ff9a5c' }),
  }
  for (let i = 0; i < 42; i++) {
    const p = place(9, 170)
    if (!p) continue
    const t = deadTree(treeShared, rand(1.2, 2.6))
    t.position.x = p.x; t.position.z = p.z
    scene.add(t)
  }

  // bone — giant rib arches over the road + scattered rib spurs
  const boneMat = toonMaterial({ color: '#d8ccb0', rimStrength: 0.3, rim: '#ffd9a0' })
  for (const idx of [258, 522, 792]) scene.add(boneArch(track, idx, boneMat))
  const ribGeo = new THREE.ConeGeometry(0.16, 2.6, 5)
  for (let i = 0; i < 10; i++) {
    const p = place(10, 120)
    if (!p) continue
    const cluster = new THREE.Group()
    for (let r = 0; r < 3; r++) {
      const rib = new THREE.Mesh(ribGeo, boneMat)
      rib.position.set(rand(-1.2, 1.2), rand(0.7, 1.1), rand(-0.5, 0.5))
      rib.rotation.z = rand(-0.65, 0.65)
      rib.rotation.x = rand(-0.3, 0.3)
      rib.castShadow = true
      cluster.add(rib)
    }
    cluster.position.set(p.x, 0, p.z)
    cluster.rotation.y = rand(TAU)
    scene.add(cluster)
  }

  // standing runestones flanking the road (ember-lit obelisks)
  const runeGlow = glowMaterial('#ff8c3b', 1.6)
  const obeliskGeo = new THREE.CylinderGeometry(0.32, 0.55, 1, 4)
  const runeStripGeo = new THREE.BoxGeometry(0.09, 0.62, 0.04)
  const stoneToon = toonMaterial({ color: '#3d352c', rimStrength: 0.24, rim: '#ff9a5c' })
  const runeStrips = []
  for (let i = 0; i < 9; i++) {
    const idx = Math.floor(rand(track.N))
    const p = track.pos[idx], l = track.left[idx]
    const side = Math.random() > 0.5 ? 1 : -1
    const h = rand(2.2, 4)
    const ob = new THREE.Mesh(obeliskGeo, stoneToon)
    ob.scale.set(1, h, 1)
    ob.position.set(
      p.x + l.x * (TRACK_HALF_W + rand(2.5, 5)) * side, h / 2,
      p.z + l.z * (TRACK_HALF_W + rand(2.5, 5)) * side,
    )
    ob.rotation.y = rand(TAU)
    ob.castShadow = true
    scene.add(ob)
    const strip = new THREE.Mesh(runeStripGeo, runeGlow)
    strip.scale.y = h * 0.55
    strip.position.set(ob.position.x, h * 0.55, ob.position.z)
    strip.rotation.y = ob.rotation.y
    strip.translateZ(0.42)
    scene.add(strip)
    runeStrips.push({ strip, ph: rand(TAU) })
  }
  let rt = 0
  track.tickables.push({ tick: dt => {
    rt += dt
    for (const { strip, ph } of runeStrips) {
      // material is shared — shimmer via scale only
      const s = 1 + 0.06 * Math.sin(rt * 3 + ph)
      strip.scale.x = s
      strip.scale.z = s
    }
  } })

  // torch-lined track edges
  const torchPole = new THREE.CylinderGeometry(0.06, 0.1, 2.3, 6)
  const torchBowl = new THREE.CylinderGeometry(0.19, 0.08, 0.26, 7)
  const torchFlameGeo = new THREE.ConeGeometry(0.16, 0.52, 7)
  const poleWood = toonMaterial({ color: '#3a2c20', rimStrength: 0.2, rim: '#ff9a5c' })
  const ironMat = toonMaterial({ color: '#4a4a50', rimStrength: 0.4, rim: '#ffd9a0' })
  const torchGlow = glowMaterial('#ff8c3b', 2.6)
  const torchFlames = []
  for (let k = 0; k < 18; k++) {
    const i = Math.floor((k / 18) * track.N + 46) % track.N
    const p = track.pos[i], l = track.left[i]
    const side = k % 2 ? 1 : -1
    const x = p.x + l.x * (TRACK_HALF_W + 1.5) * side
    const z = p.z + l.z * (TRACK_HALF_W + 1.5) * side
    const pole = new THREE.Mesh(torchPole, poleWood)
    pole.position.set(x, 1.15, z)
    pole.castShadow = true
    const bowl = new THREE.Mesh(torchBowl, ironMat)
    bowl.position.set(x, 2.36, z)
    const flame = new THREE.Mesh(torchFlameGeo, torchGlow)
    flame.position.set(x, 2.7, z)
    const halo = new THREE.Sprite(glowSpriteMaterial('#ff8c3b', 0.42))
    halo.scale.setScalar(1.7)
    halo.position.set(x, 2.66, z)
    scene.add(pole, bowl, flame, halo)
    torchFlames.push({ flame, halo, ph: rand(TAU) })
  }
  let tt = 0
  track.tickables.push({ tick: dt => {
    tt += dt
    for (const { flame, halo, ph } of torchFlames) {
      const s = 1 + 0.2 * Math.sin(tt * 12 + ph) + 0.1 * Math.sin(tt * 27 + ph * 2)
      flame.scale.set(s, 1 + 0.3 * Math.abs(Math.sin(tt * 8 + ph)), s)
      halo.material.opacity = 0.34 + 0.14 * Math.sin(tt * 10 + ph)
    }
  } })

  // trackside war banners
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 4.6, 6)
  const poleMat = new THREE.MeshStandardMaterial({ color: '#33261c', roughness: 0.75 })
  const flagGeo = new THREE.PlaneGeometry(1.5, 2.1, 4, 4)
  const flagCols = ['#a1252c', '#b0793a', '#4a352a']
  for (let k = 0; k < 12; k++) {
    const i = Math.floor((k / 12) * track.N + 20) % track.N
    const p = track.pos[i], l = track.left[i]
    const side = k % 2 ? 1 : -1
    const pole = new THREE.Mesh(poleGeo, poleMat)
    pole.position.set(p.x + l.x * (TRACK_HALF_W + 2.2) * side, 2.3, p.z + l.z * (TRACK_HALF_W + 2.2) * side)
    pole.castShadow = true
    const fmat = new THREE.MeshBasicMaterial({ map: flagTexture(flagCols[k % 3]), side: THREE.DoubleSide, transparent: true, alphaTest: 0.4 })
    const flag = new THREE.Mesh(flagGeo.clone(), fmat)
    flag.position.set(pole.position.x, 3.7, pole.position.z)
    flag.rotation.y = rand(TAU)
    scene.add(pole, flag)
    const base = flag.geometry.attributes.position.array.slice()
    let ft = rand(10)
    track.tickables.push({ tick: dt => {
      ft += dt
      const attr = flag.geometry.attributes.position
      for (let vi = 0; vi < attr.count; vi++) {
        const bx = base[vi * 3]
        attr.setZ(vi, Math.sin(ft * 4 + bx * 3) * 0.14 * (bx + 0.75))
      }
      attr.needsUpdate = true
    } })
  }
  // drifting embers on the wind
  const embers = fireflies({ count: 70, area: [260, 240], height: [0.5, 10], color: '#ff8c3b', size: 0.44 })
  scene.add(embers)
  track.tickables.push(embers)
}
