import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { canvasTexture } from '../../core/assets.js'
import { toonMaterial, glowMaterial } from '../../art/materials.js'
import { lightShaft } from '../../art/environment.js'
import { rand, TAU, clamp } from '../../core/utils.js'
import { COURT } from './constants.js'

/* ============================= floor texture ============================= */

function courtTexture() {
  const PXW = 2048, PXH = 1620
  const FW = COURT.FLOOR_W, FD = COURT.FLOOR_D
  const sx = PXW / FW, sz = PXH / FD
  const px = x => (x + FW / 2) * sx
  const pz = z => (z + FD / 2) * sz
  const tex = canvasTexture(PXW, PXH, ctx => {
    // --- hardwood planks (running baseline -> half-court) ---
    let x = -FW / 2
    while (x < FW / 2) {
      const w = 0.3 + Math.random() * 0.16
      const L = 50 + Math.random() * 10
      ctx.fillStyle = `hsl(29, 48%, ${L}%)`
      ctx.fillRect(px(x) - 1, 0, w * sx + 2, PXH)
      // grain streaks
      ctx.globalAlpha = 0.1
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#5a3517' : '#e8c087'
        const gx = px(x + Math.random() * w)
        ctx.fillRect(gx, 0, 1.5, PXH)
      }
      ctx.globalAlpha = 1
      // plank end seams
      let z = -FD / 2 + Math.random() * 2
      while (z < FD / 2) {
        ctx.fillStyle = 'rgba(58,32,14,0.4)'
        ctx.fillRect(px(x), pz(z), w * sx, 3)
        z += 1.5 + Math.random() * 2.4
      }
      x += w
    }
    // --- darker stained apron outside the court ---
    ctx.beginPath()
    ctx.rect(0, 0, PXW, PXH)
    ctx.rect(px(COURT.MINX), pz(COURT.BASE_Z), (COURT.MAXX - COURT.MINX) * sx, (COURT.HALF_Z - COURT.BASE_Z) * sz)
    ctx.fillStyle = 'rgba(16,10,38,0.62)'
    ctx.fill('evenodd')
    // --- tint beyond the 3pt arc (inside court) ---
    ctx.save()
    ctx.beginPath()
    ctx.rect(px(COURT.MINX), pz(COURT.BASE_Z), (COURT.MAXX - COURT.MINX) * sx, (COURT.HALF_Z - COURT.BASE_Z) * sz)
    ctx.clip()
    ctx.beginPath()
    ctx.rect(px(COURT.MINX), pz(COURT.BASE_Z), (COURT.MAXX - COURT.MINX) * sx, (COURT.HALF_Z - COURT.BASE_Z) * sz)
    ctx.ellipse(px(0), pz(COURT.RIM_FLOOR.z), COURT.ARC_R * sx, COURT.ARC_R * sz, 0, 0, TAU)
    ctx.fillStyle = 'rgba(46,22,96,0.34)'
    ctx.fill('evenodd')
    ctx.restore()

    // --- painted key ---
    const keyW = 4.9, ftZ = -1.2
    ctx.fillStyle = 'rgba(64,26,140,0.5)'
    ctx.fillRect(px(-keyW / 2), pz(COURT.BASE_Z), keyW * sx, (ftZ - COURT.BASE_Z) * sz)

    // --- lines ---
    ctx.strokeStyle = '#d9d0b6'
    ctx.lineWidth = 7
    const rect = (x0, z0, x1, z1) => ctx.strokeRect(px(x0), pz(z0), (x1 - x0) * sx, (z1 - z0) * sz)
    rect(COURT.MINX, COURT.BASE_Z, COURT.MAXX, COURT.HALF_Z)       // boundary
    rect(-keyW / 2, COURT.BASE_Z, keyW / 2, ftZ)                   // key
    const circle = (cx, cz, r, a0 = 0, a1 = TAU) => {
      ctx.beginPath()
      ctx.ellipse(px(cx), pz(cz), r * sx, r * sz, 0, a0, a1)
      ctx.stroke()
    }
    circle(0, ftZ, 1.8)                                            // FT circle
    circle(0, COURT.RIM_FLOOR.z, 1.25, 0, Math.PI)                 // restricted arc
    // 3pt: corner lines + clipped arc
    const cornerX = 6.6
    const arcMeetZ = COURT.RIM_FLOOR.z + Math.sqrt(COURT.ARC_R ** 2 - cornerX ** 2)
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(px(s * cornerX), pz(COURT.BASE_Z))
      ctx.lineTo(px(s * cornerX), pz(arcMeetZ))
      ctx.stroke()
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(px(-cornerX), 0, cornerX * 2 * sx, PXH)
    ctx.clip()
    circle(0, COURT.RIM_FLOOR.z, COURT.ARC_R, 0, Math.PI)
    ctx.restore()
    // half-court line + center circle
    ctx.beginPath()
    ctx.moveTo(px(COURT.MINX), pz(COURT.HALF_Z))
    ctx.lineTo(px(COURT.MAXX), pz(COURT.HALF_Z))
    ctx.stroke()
    circle(0, COURT.HALF_Z, 1.8)

    // --- center logo ---
    ctx.save()
    ctx.translate(px(0), pz(2.55))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'italic 900 118px Avenir Next, Arial Black, sans-serif'
    ctx.lineWidth = 10
    ctx.strokeStyle = 'rgba(214,166,60,0.6)'
    ctx.strokeText('SLAM CITY', 0, 0)
    ctx.fillStyle = 'rgba(84,178,190,0.62)'
    ctx.fillText('SLAM CITY', 0, 0)
    ctx.font = 'italic 700 46px Avenir Next, Arial Black, sans-serif'
    ctx.fillStyle = 'rgba(214,204,178,0.4)'
    ctx.fillText('2 K', 0, 108)
    ctx.restore()

    // soft edge vignette so the floor melts into the arena dark
    const vg = ctx.createRadialGradient(px(0), pz(0), PXH * 0.32, px(0), pz(0), PXH * 0.78)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(4,4,16,0.55)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, PXW, PXH)
  })
  tex.anisotropy = 8
  return tex
}

/* ============================= hoop + net ============================= */

function buildHoop() {
  const g = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: '#39415e', metalness: 0.75, roughness: 0.35 })
  const pad = toonMaterial({ color: '#232a4d', rim: '#7d9bff', rimStrength: 0.35 })

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 4.4, 12), steel)
  pole.position.set(0, 2.2, -7.55)
  pole.castShadow = true
  g.add(pole)
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.2), pad)
  base.position.set(0, 0.25, -7.55)
  base.castShadow = true
  g.add(base)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.5), steel)
  arm.position.set(0, 3.85, -6.8)
  arm.rotation.x = 0.32
  g.add(arm)

  // glass backboard
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 1.1, 0.05),
    new THREE.MeshPhysicalMaterial({
      color: '#b8dcff', transparent: true, opacity: 0.22, roughness: 0.05,
      metalness: 0, clearcoat: 1, side: THREE.DoubleSide, envMapIntensity: 1.6,
    }),
  )
  board.position.set(0, 3.52, COURT.BOARD_Z)
  g.add(board)

  // glowing trim: outer frame + shooter square
  const trimMat = glowMaterial('#7df9ff', 1.7)
  const frame = (w, h, cx, cy, th = 0.035) => {
    const geos = [
      new THREE.BoxGeometry(w, th, th).translate(cx, cy + h / 2, 0),
      new THREE.BoxGeometry(w, th, th).translate(cx, cy - h / 2, 0),
      new THREE.BoxGeometry(th, h, th).translate(cx - w / 2, cy, 0),
      new THREE.BoxGeometry(th, h, th).translate(cx + w / 2, cy, 0),
    ]
    return new THREE.Mesh(mergeGeometries(geos), trimMat)
  }
  const outer = frame(1.85, 1.1, 0, 3.52)
  outer.position.z = COURT.BOARD_Z
  g.add(outer)
  const square = frame(0.6, 0.45, 0, 3.35, 0.028)
  square.position.z = COURT.BOARD_Z + 0.035
  g.add(square)

  // rim
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.022, 10, 32),
    new THREE.MeshStandardMaterial({ color: '#ff7130', metalness: 0.55, roughness: 0.3, emissive: '#ff5a1e', emissiveIntensity: 0.5 }),
  )
  rim.rotation.x = Math.PI / 2
  rim.position.copy(COURT.RIM)
  rim.castShadow = true
  g.add(rim)
  const rimGlow = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.05, 8, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a3c').multiplyScalar(1.4), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  rimGlow.rotation.x = Math.PI / 2
  rimGlow.position.copy(COURT.RIM)
  g.add(rimGlow)
  // rim-to-board bracket
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.26), steel)
  bracket.position.set(0, 3.02, COURT.BOARD_Z + 0.16)
  g.add(bracket)

  // --- net: tapered criss-cross line segments ---
  const SEG = 12, rows = [[0.22, 0], [0.17, -0.18], [0.13, -0.34], [0.115, -0.46]]
  const pts = []
  const ringPt = (r, y, i) => {
    const a = (i / SEG) * TAU
    return [Math.cos(a) * r, y, Math.sin(a) * r]
  }
  for (let ri = 0; ri < rows.length - 1; ri++) {
    const [r0, y0] = rows[ri], [r1, y1] = rows[ri + 1]
    for (let i = 0; i < SEG; i++) {
      pts.push(...ringPt(r0, y0, i), ...ringPt(r1, y1, i + 0.5))
      pts.push(...ringPt(r0, y0, i + 1), ...ringPt(r1, y1, i + 0.5))
    }
  }
  // bottom ring
  for (let i = 0; i < SEG; i++) {
    const [r, y] = rows[rows.length - 1]
    pts.push(...ringPt(r, y, i), ...ringPt(r, y, i + 1))
  }
  const netGeo = new THREE.BufferGeometry()
  const netBase = new Float32Array(pts)
  netGeo.setAttribute('position', new THREE.BufferAttribute(netBase.slice(), 3))
  const net = new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: '#f2f6ff', transparent: true, opacity: 0.85 }))
  net.position.copy(COURT.RIM).add(new THREE.Vector3(0, -0.02, 0))
  g.add(net)

  let netT = 0
  const netTick = dt => {
    if (netT <= 0) return
    netT = Math.max(0, netT - dt * 2.2)
    const p = netGeo.attributes.position
    const k = Math.sin(netT * Math.PI) // swell in-out
    for (let i = 0; i < p.count; i++) {
      const bx = netBase[i * 3], by = netBase[i * 3 + 1], bz = netBase[i * 3 + 2]
      const depth = clamp(-by / 0.46, 0, 1)
      const s = 1 + k * 0.5 * depth
      p.setXYZ(i, bx * s, by - k * 0.16 * depth, bz * s)
    }
    p.needsUpdate = true
  }

  return { group: g, rimGlow, netFlare: () => { netT = 1 }, netTick }
}

/* ============================= crowd ============================= */

function buildCrowd() {
  const body = new THREE.CapsuleGeometry(0.27, 0.5, 4, 8).translate(0, 0.52, 0)
  const head = new THREE.SphereGeometry(0.17, 8, 7).translate(0, 1.06, 0)
  const geo = mergeGeometries([body, head])
  const mat = toonMaterial({ color: '#767b94', rim: '#5c78d6', rimStrength: 0.5, rimPower: 2.4 })

  const spots = []
  const addRow = (fromX, toX, z, y, faceYaw, jitter = 0.35) => {
    for (let x = fromX; x <= toX; x += 0.78) {
      if (Math.random() < 0.12) continue // empty seats
      spots.push({ x: x + rand(-jitter, jitter) * 0.4, y, z: z + rand(-jitter, jitter) * 0.4, yaw: faceYaw + rand(-0.3, 0.3), s: rand(0.85, 1.12) })
    }
  }
  for (let t = 0; t < 5; t++) {
    const d = 9.6 + t * 1.15, y = 0.55 + t * 0.85
    addRow(-9.5, 9.5, -d, y, 0)                    // behind hoop, face +z
  }
  // side rows (x fixed, z varies)
  for (let t = 0; t < 5; t++) {
    const d = 9.4 + t * 1.15, y = 0.55 + t * 0.85
    for (let z = -7.6; z <= 8.4; z += 0.78) {
      if (Math.random() < 0.12) continue
      for (const s of [-1, 1]) {
        spots.push({ x: s * d + rand(-0.14, 0.14), y, z: z + rand(-0.14, 0.14), yaw: s * -Math.PI / 2 + rand(-0.3, 0.3), s: rand(0.85, 1.12) })
      }
    }
  }
  const all = spots

  const N = all.length
  const im = new THREE.InstancedMesh(geo, mat, N)
  im.castShadow = false
  const palette = ['#1c2340', '#262e55', '#2e2050', '#372343', '#1a2c4e', '#412a5e', '#553355', '#274060']
  const hot = ['#c9484f', '#c9903e', '#3e9bc9', '#b455c9']
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), eu = new THREE.Euler()
  const col = new THREE.Color()
  const phase = new Float32Array(N), baseY = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const p = all[i]
    eu.set(0, p.yaw, 0)
    q.setFromEuler(eu)
    sc.setScalar(p.s)
    m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, sc)
    im.setMatrixAt(i, m4)
    col.set(Math.random() < 0.18 ? hot[Math.floor(rand(hot.length))] : palette[Math.floor(rand(palette.length))])
    im.setColorAt(i, col)
    phase[i] = rand(TAU)
    baseY[i] = p.y
  }
  im.instanceColor.needsUpdate = true

  let t = 0, hype = 0
  const tick = dt => {
    t += dt
    hype = Math.max(0, hype - dt * 0.4)
    const arr = im.instanceMatrix.array
    const idleAmp = 0.045, hypeAmp = 0.5 * Math.min(1, hype)
    for (let i = 0; i < N; i++) {
      const bob = Math.abs(Math.sin(t * (2 + hypeAmp * 5) + phase[i]))
      arr[i * 16 + 13] = baseY[i] + bob * (idleAmp + hypeAmp)
    }
    im.instanceMatrix.needsUpdate = true
  }
  return { mesh: im, tick, hype: (amt = 1) => { hype = Math.max(hype, amt * 2.2) } }
}

/* ============================= stands / ads / jumbotron ============================= */

function buildStands() {
  const geos = []
  const step = (w, d, cx, cz, t, rotY = 0) => {
    const b = new THREE.BoxGeometry(w, 0.85, d)
    b.rotateY(rotY)
    b.translate(cx, 0.42 + t * 0.85, cz)
    geos.push(b)
  }
  for (let t = 0; t < 5; t++) {
    const off = 9.15 + t * 1.15
    step(21.5, 1.15, 0, -off, t)                    // behind hoop
    step(1.15, 17.5, -off, 0.4, t, 0)
    step(1.15, 17.5, off, 0.4, t, 0)
  }
  const mesh = new THREE.Mesh(
    mergeGeometries(geos),
    new THREE.MeshStandardMaterial({ color: '#12172e', roughness: 0.92, metalness: 0 }),
  )
  mesh.receiveShadow = true
  return mesh
}

function adsTexture() {
  const tex = canvasTexture(2048, 128, ctx => {
    const g = ctx.createLinearGradient(0, 0, 0, 128)
    g.addColorStop(0, '#0b1030')
    g.addColorStop(1, '#060818')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 2048, 128)
    const items = [
      ['IPL', '#7df9ff'], ['SLAM CITY 2K', '#ffd166'], ['NOVA COLA', '#ff5c8a'], ['ON FIRE', '#ff9a3c'],
    ]
    ctx.textBaseline = 'middle'
    ctx.font = 'italic 900 74px Avenir Next, Arial Black, sans-serif'
    let x = 40
    for (let rep = 0; rep < 3; rep++) {
      for (const [txt, color] of items) {
        ctx.fillStyle = color
        ctx.fillText(txt, x, 66)
        x += ctx.measureText(txt).width + 46
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.beginPath()
        ctx.arc(x - 24, 64, 7, 0, TAU)
        ctx.fill()
        x += 22
      }
    }
  })
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

function buildAds() {
  const tex = adsTexture()
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color('#ffffff').multiplyScalar(1.12) })
  const group = new THREE.Group()
  const mk = (len, pos, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.62), mat)
    m.position.copy(pos)
    m.rotation.y = rotY
    group.add(m)
    const back = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.72, 0.1), new THREE.MeshStandardMaterial({ color: '#0a0d1f', roughness: 0.8 }))
    back.position.copy(pos)
    back.position.y = 0.35
    back.rotation.y = rotY
    back.translateZ(-0.07)
    group.add(back)
  }
  mk(18.6, new THREE.Vector3(0, 0.36, -8.95), 0)
  mk(16.5, new THREE.Vector3(-8.95, 0.36, 0.4), Math.PI / 2)
  mk(16.5, new THREE.Vector3(8.95, 0.36, 0.4), -Math.PI / 2)
  const tick = dt => { tex.offset.x = (tex.offset.x + dt * 0.045) % 1 }
  return { group, tick }
}

function buildJumbotron() {
  const group = new THREE.Group()
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 300
  const cx = c.getContext('2d')
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace

  const draw = ({ you = 0, cpu = 0, clock = 14, poss = 'player' } = {}) => {
    const g = cx.createLinearGradient(0, 0, 0, 300)
    g.addColorStop(0, '#0c1233')
    g.addColorStop(1, '#050714')
    cx.fillStyle = g
    cx.fillRect(0, 0, 512, 300)
    cx.strokeStyle = 'rgba(125,249,255,0.6)'
    cx.lineWidth = 6
    cx.strokeRect(6, 6, 500, 288)
    cx.textAlign = 'center'
    cx.font = 'italic 900 40px Avenir Next, Arial Black, sans-serif'
    cx.fillStyle = '#ffd166'
    cx.fillText('SLAM CITY 2K', 256, 48)
    cx.font = '900 92px Avenir Next, Arial Black, sans-serif'
    cx.fillStyle = '#7df9ff'
    cx.textAlign = 'right'
    cx.fillText(String(you), 175, 150)
    cx.textAlign = 'left'
    cx.fillStyle = '#ff6a6a'
    cx.fillText(String(cpu), 337, 150)
    cx.textAlign = 'center'
    cx.fillStyle = '#f4ecd7'
    cx.fillText(':', 256, 144)
    cx.font = '700 30px Avenir Next, Arial, sans-serif'
    cx.fillStyle = poss === 'player' ? '#7df9ff' : '#39406b'
    cx.fillText('YOU ' + (poss === 'player' ? '●' : ''), 130, 196)
    cx.fillStyle = poss === 'ai' ? '#ff6a6a' : '#39406b'
    cx.fillText((poss === 'ai' ? '● ' : '') + 'CPU', 384, 196)
    // shot clock
    cx.font = '900 74px Avenir Next, Arial Black, sans-serif'
    cx.fillStyle = clock <= 5 ? '#ff4d4d' : '#f4ecd7'
    cx.fillText(String(Math.max(0, Math.ceil(clock))), 256, 262)
    tex.needsUpdate = true
  }
  draw()

  const screenMat = new THREE.MeshBasicMaterial({ map: tex })
  const darkMat = new THREE.MeshStandardMaterial({ color: '#0a0d1f', roughness: 0.7, metalness: 0.3 })
  const cube = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.1, 3.6), [screenMat, screenMat, darkMat, darkMat, screenMat, screenMat])
  cube.position.y = 0
  group.add(cube)
  // glow bands
  const bandMat = glowMaterial('#7df9ff', 1.5)
  for (const y of [-1.12, 1.12]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.09, 3.72), bandMat)
    band.position.y = y
    group.add(band)
  }
  // cables
  const cableMat = new THREE.MeshBasicMaterial({ color: '#0e1226' })
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    const cbl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.4, 5), cableMat)
    cbl.position.set(x, 3.2, z)
    group.add(cbl)
  }
  group.position.set(0, 10.6, -0.4)
  return { group, set: draw }
}

/* ============================= arena assembly ============================= */

export function buildArena(scene) {
  const group = new THREE.Group()
  scene.add(group)

  // floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.FLOOR_W, COURT.FLOOR_D),
    new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.22, metalness: 0.06, envMapIntensity: 0.5 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  group.add(floor)

  // dark surrounding ground so the arena floor doesn't float in void
  const outer = new THREE.Mesh(
    new THREE.CircleGeometry(70, 32),
    new THREE.MeshStandardMaterial({ color: '#07091a', roughness: 0.95 }),
  )
  outer.rotation.x = -Math.PI / 2
  outer.position.y = -0.02
  group.add(outer)

  const hoop = buildHoop()
  group.add(hoop.group)

  const stands = buildStands()
  group.add(stands)

  const crowd = buildCrowd()
  group.add(crowd.mesh)

  const ads = buildAds()
  group.add(ads.group)

  const jumbo = buildJumbotron()
  group.add(jumbo.group)

  // arena shell: giant dark cylinder wall + ceiling void
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(28, 30, 26, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: '#0a0e22', roughness: 1, side: THREE.BackSide }),
  )
  wall.position.y = 10
  group.add(wall)

  // --- lighting ---
  group.add(new THREE.HemisphereLight('#31406e', '#0a0c1a', 0.32))
  const sun = new THREE.DirectionalLight('#fff2dd', 1.45)
  sun.position.set(7, 17, 10)
  sun.target.position.set(0, 0, -2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -13
  sun.shadow.camera.right = 13
  sun.shadow.camera.top = 14
  sun.shadow.camera.bottom = -14
  sun.shadow.camera.far = 45
  sun.shadow.bias = -0.0004
  group.add(sun, sun.target)

  const warm = new THREE.PointLight('#ff9a5c', 20, 20, 2)
  warm.position.set(0, 6.5, -6)
  group.add(warm)
  const cool = new THREE.PointLight('#5c8cff', 17, 24, 2)
  cool.position.set(0, 7, 6)
  group.add(cool)
  const sheen = new THREE.SpotLight('#cfe0ff', 65, 50, 0.55, 0.6, 1.8)
  sheen.position.set(0, 16, 3)
  sheen.target.position.set(0, 0, -1)
  group.add(sheen, sheen.target)

  // fake-volumetric shafts + one sweeping
  const shaftDefs = [
    [-6, -4, '#ffe0b0'], [6, -4, '#b8ccff'], [-6, 5, '#b8ccff'], [6, 5, '#ffe0b0'],
  ]
  for (const [x, z, col] of shaftDefs) {
    const s = lightShaft({ color: col, height: 15, radius: 3.4, opacity: 0.032 })
    s.position.set(x, 0, z)
    s.rotation.z = x > 0 ? 0.16 : -0.16
    group.add(s)
  }
  const sweepPivot = new THREE.Group()
  sweepPivot.position.set(0, 14.5, -1)
  const sweep = lightShaft({ color: '#9fd8ff', height: 16, radius: 2.6, opacity: 0.055 })
  sweep.position.y = -8   // hang downward from pivot
  sweep.rotation.x = Math.PI // apex up at pivot
  const sweepArm = new THREE.Group()
  sweepArm.rotation.z = 0.42
  sweepArm.add(sweep)
  sweepPivot.add(sweepArm)
  group.add(sweepPivot)

  // ceiling light rig: dark truss ring + glowing bulbs
  const rig = new THREE.Group()
  const truss = new THREE.Mesh(
    new THREE.TorusGeometry(7.5, 0.16, 6, 40),
    new THREE.MeshStandardMaterial({ color: '#141a30', roughness: 0.8, metalness: 0.4 }),
  )
  truss.rotation.x = Math.PI / 2
  rig.add(truss)
  const bulbMat = glowMaterial('#fff3d0', 2.4)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), bulbMat)
    b.position.set(Math.cos(a) * 7.5, -0.25, Math.sin(a) * 7.5)
    rig.add(b)
  }
  rig.position.y = 14.5
  group.add(rig)

  let t = 0
  return {
    group,
    crowd,
    jumbo,
    netFlare: hoop.netFlare,
    tick(dt) {
      t += dt
      crowd.tick(dt)
      ads.tick(dt)
      hoop.netTick(dt)
      sweepPivot.rotation.y = Math.sin(t * 0.24) * 1.5
      hoop.rimGlow.material.opacity = 0.13 + Math.sin(t * 2.6) * 0.05
    },
  }
}
