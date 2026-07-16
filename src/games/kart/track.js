import * as THREE from 'three'
import { canvasTexture } from '../../core/assets.js'
import { glowMaterial } from '../../art/materials.js'
import {
  skyDome, cloudLayer, groundDisc, crystal, tree, fireflies,
} from '../../art/environment.js'
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
    ctx.fillStyle = '#26242e'
    ctx.fillRect(0, 0, w, h)
    // asphalt speckle
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.12)'
      const x = rand(w), y = rand(h)
      ctx.fillRect(x, y, rand(1, 4), rand(1, 4))
    }
    // painted edge lines
    ctx.fillStyle = '#d9a86a'
    ctx.fillRect(8, 0, 7, h)
    ctx.fillRect(w - 15, 0, 7, h)
    ctx.fillStyle = '#c25a3c'
    ctx.fillRect(1, 0, 5, h)
    ctx.fillRect(w - 6, 0, 5, h)
    // dashed center line
    ctx.fillStyle = '#9c9284'
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
        ctx.fillStyle = (x + y) % 2 ? '#14141c' : '#c8c5d4'
        ctx.fillRect(x * s, y * s, s, s)
      }
    }
  })
}

function chevronTexture() {
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#7dffd0'
    ctx.lineWidth = 17
    ctx.lineCap = 'round'
    for (const y of [96, 58, 20]) {
      ctx.beginPath()
      ctx.moveTo(20, y + 14)
      ctx.lineTo(w / 2, y - 14)
      ctx.lineTo(w - 20, y + 14)
      ctx.stroke()
    }
  })
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function signTexture() {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0)
    g.addColorStop(0, '#2b1442')
    g.addColorStop(0.5, '#4b1e57')
    g.addColorStop(1, '#2b1442')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#ffb454'
    ctx.lineWidth = 10
    ctx.strokeRect(10, 10, w - 20, h - 20)
    ctx.font = '900 118px Avenir Next Condensed, Arial Narrow, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffdf9e'
    ctx.shadowColor = '#ff9440'
    ctx.shadowBlur = 34
    ctx.fillText('TURBO KART GP', w / 2, h / 2 + 6)
  })
}

function flagTexture(color) {
  return canvasTexture(64, 96, (ctx, w, h) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '900 52px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('GP', w / 2, h / 2)
  })
}

/** Low-poly jittered rock with baked flat normals (shared rock() flatShading fights the rim shader). */
function redRock({ color = '#a5523c', scale = 1 } = {}) {
  const geo = new THREE.IcosahedronGeometry(0.55, 0) // already non-indexed
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * rand(0.8, 1.3), p.getY(i) * rand(0.55, 1.15), p.getZ(i) * rand(0.8, 1.3))
  }
  geo.computeVertexNormals() // flat normals baked per-face
  const m = new THREE.Mesh(geo, toonMaterial({ color, rimStrength: 0.22, rim: '#ffcf9a' }))
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
 * Builds the full circuit + sunset-canyon environment into `scene`.
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

  // glowing curbs on tight corners (merged strips, HDR orange -> bloom)
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
          pa.x + la.x * (hw + 0.75) * side, 0.06, pa.z + la.z * (hw + 0.75) * side,
          pb.x + lb.x * hw * side, 0.06, pb.z + lb.z * hw * side,
          pb.x + lb.x * (hw + 0.75) * side, 0.06, pb.z + lb.z * (hw + 0.75) * side,
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
    color: new THREE.Color('#ff5a3c').multiplyScalar(1.35), side: THREE.DoubleSide,
  }))
  scene.add(curb)
  let ct = 0
  track.tickables.push({ tick: dt => {
    ct += dt
    curb.material.color.set('#ff5a3c').multiplyScalar(1.15 + 0.45 * (0.5 + 0.5 * Math.sin(ct * 2.4)))
  } })
}

function buildStartArch(scene, track) {
  const p = track.pos[0], l = track.left[0], tn = track.tan[0]
  const g = new THREE.Group()
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#5a2e4f', roughness: 0.7, envMapIntensity: 0.35 })
  const pgeo = new THREE.BoxGeometry(1.4, 9, 1.4)
  for (const side of [1, -1]) {
    const pl = new THREE.Mesh(pgeo, pillarMat)
    pl.position.set(p.x + l.x * (TRACK_HALF_W + 1.6) * side, 4.5, p.z + l.z * (TRACK_HALF_W + 1.6) * side)
    pl.castShadow = true
    g.add(pl)
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), glowMaterial('#ffb454', 2.2))
    gem.position.copy(pl.position).y = 9.6
    g.add(gem)
  }
  const barW = (TRACK_HALF_W + 1.6) * 2 + 1.4
  const bar = new THREE.Mesh(new THREE.BoxGeometry(barW, 2.6, 0.5), new THREE.MeshStandardMaterial({ color: '#33203f', roughness: 0.6, envMapIntensity: 0.35 }))
  bar.position.set(p.x, 9.6, p.z)
  bar.rotation.y = Math.atan2(l.x, l.z) + Math.PI / 2
  g.add(bar)
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(barW - 1, 2.3),
    new THREE.MeshBasicMaterial({ map: signTexture() }),
  )
  sign.position.set(p.x - tn.x * 0.3, 9.6, p.z - tn.z * 0.3)
  sign.rotation.y = Math.atan2(-tn.x, -tn.z) // faces the approaching grid
  const sign2 = sign.clone()
  sign2.position.set(p.x + tn.x * 0.3, 9.6, p.z + tn.z * 0.3)
  sign2.rotation.y = Math.atan2(tn.x, tn.z)
  g.add(sign2)
  g.add(sign)
  // checkered strip on road
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
  // boost pads on straights / sweeper exits (sample indices)
  const at = [30, 150, 380, 560, 760, 930]
  const tex = chevronTexture()
  const geo = new THREE.PlaneGeometry(3.4, 4.6)
  for (const i of at) {
    const p = track.pos[i], tn = track.tan[i], l = track.left[i]
    const off = rand(-1.6, 1.6)
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      color: new THREE.Color('#4cffbe').multiplyScalar(1.8),
    })
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = -Math.PI / 2
    m.rotation.z = Math.atan2(-tn.x, -tn.z)
    m.position.set(p.x + l.x * off, 0.05, p.z + l.z * off)
    scene.add(m)
    const pad = { x: m.position.x, z: m.position.z, mat, t: rand(4) }
    track.pads.push(pad)
    track.tickables.push({ tick: dt => {
      pad.t += dt
      mat.color.set('#4cffbe').multiplyScalar(1.4 + 0.7 * (0.5 + 0.5 * Math.sin(pad.t * 5)))
    } })
  }
}

function buildRings(scene, track) {
  const ringGeo = new THREE.TorusGeometry(1.45, 0.13, 10, 36)
  const ringMat = glowMaterial('#ffd166', 1.85)
  const at = [70, 145, 220, 300, 372, 450, 528, 610, 690, 768, 845, 906, 960]
  for (let k = 0; k < at.length; k++) {
    const i = at[k]
    const p = track.pos[i], tn = track.tan[i], l = track.left[i]
    const off = ((k % 3) - 1) * 2.6
    const g = new THREE.Group()
    const m = new THREE.Mesh(ringGeo, ringMat)
    m.rotation.y = Math.atan2(tn.x, tn.z)
    g.add(m)
    g.position.set(p.x + l.x * off, 1.15, p.z + l.z * off)
    scene.add(g)
    const ring = { pos: g.position, home: g.position.clone(), group: g, active: true, respawnT: 0, t: rand(TAU) }
    track.rings.push(ring)
    track.tickables.push({ tick: dt => {
      ring.t += dt
      if (!ring.active) return
      g.position.y = 1.15 + Math.sin(ring.t * 2.2) * 0.16
      m.rotation.z += dt * 1.4
    } })
  }
}

/* ------------------------------------------------------------------ */

function buildEnvironment(scene, track, distToTrack) {
  scene.fog = new THREE.Fog('#e08a5e', 80, 460)
  const sunDir = new THREE.Vector3(-0.5, 0.42, -0.65).normalize()
  scene.add(skyDome({
    top: '#3b2470', mid: '#c65a7d', bottom: '#ffb066',
    radius: 520, sunDir, sunColor: '#ffd9a0', sunSize: 220,
  }))
  const clouds = cloudLayer({ count: 14, radius: 330, height: [60, 130], color: '#ffc4a2', opacity: 0.55, scale: [70, 150] })
  scene.add(clouds)
  track.tickables.push(clouds)

  const ground = groundDisc({
    radius: 460, repeat: 10,
    texOpts: { base: '#a86538', blotches: ['#b5743f', '#8f5530', '#c08549', '#9a5f36'], alpha: 0.24, count: 560 },
  })
  ground.material.envMapIntensity = 0.3
  scene.add(ground)

  // lights
  scene.add(new THREE.HemisphereLight('#ffb98a', '#5c3a52', 0.5))
  const sun = new THREE.DirectionalLight('#ffc084', 2.7)
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

  // red-rock formations (scaled-up rocks) — placed off-track
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
    const big = redRock({ color: Math.random() > 0.5 ? '#a5523c' : '#8f4534', scale: rand(4, 13) })
    big.position.x = p.x; big.position.z = p.z
    scene.add(big)
    if (Math.random() > 0.55) {
      const cap = redRock({ color: '#b86a48', scale: rand(2, 4.5) })
      cap.position.set(p.x + rand(-1.2, 1.2), big.position.y * 1.5, p.z + rand(-1.2, 1.2))
      scene.add(cap)
    }
  }
  // palms / scrub trees
  for (let i = 0; i < 42; i++) {
    const p = place(9, 170)
    if (!p) continue
    const t = tree({
      trunk: '#7a4a30',
      leaves: Math.random() > 0.5 ? '#4a9a58' : '#7ea34d',
      scale: rand(1, 2.2),
    })
    t.position.x = p.x; t.position.z = p.z
    scene.add(t)
  }
  // crystals: trackside bling
  for (let i = 0; i < 9; i++) {
    const idx = Math.floor(rand(track.N))
    const p = track.pos[idx], l = track.left[idx]
    const side = Math.random() > 0.5 ? 1 : -1
    const c = crystal({
      color1: '#66203a', color2: Math.random() > 0.5 ? '#ff9de2' : '#ffb454',
      height: rand(2.2, 4),
    })
    c.position.set(p.x + l.x * (TRACK_HALF_W + rand(2.5, 5)) * side, 0, p.z + l.z * (TRACK_HALF_W + rand(2.5, 5)) * side)
    scene.add(c)
    track.tickables.push(c)
  }
  // trackside banner flags
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 4.6, 6)
  const poleMat = new THREE.MeshStandardMaterial({ color: '#3a2438', roughness: 0.7 })
  const flagGeo = new THREE.PlaneGeometry(1.5, 2.1, 4, 4)
  const flagCols = ['#ff7a5c', '#ffd166', '#ff9de2']
  for (let k = 0; k < 12; k++) {
    const i = Math.floor((k / 12) * track.N + 20) % track.N
    const p = track.pos[i], l = track.left[i]
    const side = k % 2 ? 1 : -1
    const pole = new THREE.Mesh(poleGeo, poleMat)
    pole.position.set(p.x + l.x * (TRACK_HALF_W + 2.2) * side, 2.3, p.z + l.z * (TRACK_HALF_W + 2.2) * side)
    pole.castShadow = true
    const fmat = new THREE.MeshBasicMaterial({ map: flagTexture(flagCols[k % 3]), side: THREE.DoubleSide })
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
  // dust motes
  const dust = fireflies({ count: 60, area: [260, 240], height: [0.5, 9], color: '#ffcf9a', size: 0.42 })
  scene.add(dust)
  track.tickables.push(dust)
}
