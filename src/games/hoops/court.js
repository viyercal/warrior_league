import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { canvasTexture } from '../../core/assets.js'
import { toonMaterial, glowMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { lightShaft, fireflies } from '../../art/environment.js'
import { rand, TAU, clamp } from '../../core/utils.js'
import { COURT } from './constants.js'

/* ============================= torch flames =============================
   Shared per-arena flame factory: two glow cones per flame, flicker via tick. */

function flameKit() {
  const mats = [glowMaterial('#ff5a26', 2.2), glowMaterial('#ffb84d', 3.4)]
  const spriteMat = glowSpriteMaterial('#ff8c3b', 0.5)
  const geos = [
    new THREE.ConeGeometry(0.11, 0.52, 7).translate(0, 0.27, 0),
    new THREE.ConeGeometry(0.055, 0.32, 7).translate(0, 0.21, 0),
  ]
  const flames = []
  return {
    make(s = 1) {
      const g = new THREE.Group()
      g.add(new THREE.Mesh(geos[0], mats[0]), new THREE.Mesh(geos[1], mats[1]))
      const halo = new THREE.Sprite(spriteMat)
      halo.scale.setScalar(1.1)
      halo.position.y = 0.24
      g.add(halo)
      g.scale.setScalar(s)
      g.userData = { phase: rand(TAU), s }
      flames.push(g)
      return g
    },
    tick(t) {
      for (const f of flames) {
        const { phase, s } = f.userData
        const k = 1 + 0.17 * Math.sin(t * 10.3 + phase) + 0.08 * Math.sin(t * 23.7 + phase * 1.7)
        f.scale.set(s * (1 + (k - 1) * 0.45), s * k, s * (1 + (k - 1) * 0.45))
      }
    },
  }
}

/* ============================= floor texture =============================
   Packed sand-and-stone gladiator floor, painted crimson lines, carved emblem. */

function courtTexture() {
  const PXW = 2048, PXH = 1620
  const FW = COURT.FLOOR_W, FD = COURT.FLOOR_D
  const sx = PXW / FW, sz = PXH / FD
  const px = x => (x + FW / 2) * sx
  const pz = z => (z + FD / 2) * sz
  const tex = canvasTexture(PXW, PXH, ctx => {
    // --- packed sand base ---
    ctx.fillStyle = '#7c603e'
    ctx.fillRect(0, 0, PXW, PXH)
    // sand mottling
    for (let i = 0; i < 340; i++) {
      ctx.globalAlpha = rand(0.04, 0.11)
      ctx.fillStyle = Math.random() > 0.5 ? '#5c4227' : '#97794e'
      ctx.beginPath()
      ctx.ellipse(rand(PXW), rand(PXH), rand(24, 130), rand(16, 80), rand(TAU), 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    // --- worn stone slabs under the sand: offset courses ---
    ctx.strokeStyle = 'rgba(42,28,14,0.32)'
    ctx.lineWidth = 4
    const slabH = 1.55 * sz
    for (let r = 0; r * slabH < PXH + slabH; r++) {
      const y = r * slabH
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(PXW, y); ctx.stroke()
      const off = (r % 2) * 1.1 * sx
      for (let x = off; x < PXW + 2.2 * sx; x += 2.2 * sx) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rand(-14, 14), y + slabH); ctx.stroke()
        if (Math.random() < 0.24) { // odd slab tinted
          ctx.globalAlpha = 0.09
          ctx.fillStyle = Math.random() > 0.5 ? '#443020' : '#a8875a'
          ctx.fillRect(x - 2.1 * sx, y, 2.15 * sx, slabH)
          ctx.globalAlpha = 1
        }
      }
    }
    // battle scratches
    ctx.strokeStyle = 'rgba(30,18,10,0.4)'
    ctx.lineWidth = 2
    for (let i = 0; i < 90; i++) {
      const x0 = rand(PXW), y0 = rand(PXH), a = rand(TAU), l = rand(20, 110)
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); ctx.stroke()
    }

    // --- darker charred apron outside the court ---
    ctx.beginPath()
    ctx.rect(0, 0, PXW, PXH)
    ctx.rect(px(COURT.MINX), pz(COURT.BASE_Z), (COURT.MAXX - COURT.MINX) * sx, (COURT.HALF_Z - COURT.BASE_Z) * sz)
    ctx.fillStyle = 'rgba(24,15,10,0.52)'
    ctx.fill('evenodd')
    // --- umber tint beyond the 3pt arc (inside court) ---
    ctx.save()
    ctx.beginPath()
    ctx.rect(px(COURT.MINX), pz(COURT.BASE_Z), (COURT.MAXX - COURT.MINX) * sx, (COURT.HALF_Z - COURT.BASE_Z) * sz)
    ctx.clip()
    ctx.beginPath()
    ctx.rect(px(COURT.MINX), pz(COURT.BASE_Z), (COURT.MAXX - COURT.MINX) * sx, (COURT.HALF_Z - COURT.BASE_Z) * sz)
    ctx.ellipse(px(0), pz(COURT.RIM_FLOOR.z), COURT.ARC_R * sx, COURT.ARC_R * sz, 0, 0, TAU)
    ctx.fillStyle = 'rgba(52,28,20,0.32)'
    ctx.fill('evenodd')
    ctx.restore()

    // --- painted key: weathered blood crimson ---
    const keyW = 4.9, ftZ = -1.2
    ctx.fillStyle = 'rgba(140,30,32,0.44)'
    ctx.fillRect(px(-keyW / 2), pz(COURT.BASE_Z), keyW * sx, (ftZ - COURT.BASE_Z) * sz)
    // wear streaks in the paint
    ctx.globalAlpha = 0.16
    ctx.fillStyle = '#7c603e'
    for (let i = 0; i < 26; i++) {
      ctx.beginPath()
      ctx.ellipse(px(rand(-keyW / 2, keyW / 2)), pz(rand(COURT.BASE_Z, ftZ)), rand(10, 60), rand(6, 26), rand(TAU), 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // --- painted crimson lines (dark undercoat, then paint) ---
    const rect = (x0, z0, x1, z1) => ctx.strokeRect(px(x0), pz(z0), (x1 - x0) * sx, (z1 - z0) * sz)
    const circle = (cx, cz, r, a0 = 0, a1 = TAU) => {
      ctx.beginPath()
      ctx.ellipse(px(cx), pz(cz), r * sx, r * sz, 0, a0, a1)
      ctx.stroke()
    }
    const lines = () => {
      rect(COURT.MINX, COURT.BASE_Z, COURT.MAXX, COURT.HALF_Z)       // boundary
      rect(-keyW / 2, COURT.BASE_Z, keyW / 2, ftZ)                   // key
      circle(0, ftZ, 1.8)                                            // FT circle
      circle(0, COURT.RIM_FLOOR.z, 1.25, 0, Math.PI)                 // restricted arc
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
      ctx.beginPath()
      ctx.moveTo(px(COURT.MINX), pz(COURT.HALF_Z))
      ctx.lineTo(px(COURT.MAXX), pz(COURT.HALF_Z))
      ctx.stroke()
      circle(0, COURT.HALF_Z, 1.8)
    }
    ctx.strokeStyle = 'rgba(46,10,8,0.6)'   // carved shadow under the paint
    ctx.lineWidth = 11
    lines()
    ctx.strokeStyle = '#c23b2e'
    ctx.lineWidth = 7
    lines()

    // --- carved center emblem ---
    ctx.save()
    ctx.translate(px(0), pz(2.55))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // carved rings
    ctx.lineWidth = 9
    ctx.strokeStyle = 'rgba(40,24,12,0.55)'
    ctx.beginPath(); ctx.arc(0, 0, 208, 0, TAU); ctx.stroke()
    ctx.strokeStyle = 'rgba(176,121,58,0.4)'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(0, 0, 190, 0, TAU); ctx.stroke()
    // chiselled title
    ctx.font = '900 96px Georgia, "Times New Roman", serif'
    ctx.lineWidth = 12
    ctx.strokeStyle = 'rgba(30,16,8,0.85)'
    ctx.strokeText('BLOOD COURT', 0, -6)
    ctx.fillStyle = 'rgba(162,37,44,0.8)'
    ctx.fillText('BLOOD COURT', 0, -6)
    ctx.font = '700 42px Georgia, "Times New Roman", serif'
    ctx.strokeStyle = 'rgba(30,16,8,0.6)'
    ctx.lineWidth = 6
    ctx.strokeText('I W L', 0, 92)
    ctx.fillStyle = 'rgba(176,121,58,0.7)'
    ctx.fillText('I W L', 0, 92)
    ctx.restore()

    // soft edge vignette so the floor melts into the night
    const vg = ctx.createRadialGradient(px(0), pz(0), PXH * 0.28, px(0), pz(0), PXH * 0.76)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(8,5,3,0.72)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, PXW, PXH)
  })
  tex.anisotropy = 8
  return tex
}

/* ============================= hoop: iron ring on a stone column ============================= */

function buildHoop(kit) {
  const g = new THREE.Group()
  const iron = new THREE.MeshStandardMaterial({ color: '#4a4d55', metalness: 0.78, roughness: 0.42 })
  const bronze = new THREE.MeshStandardMaterial({ color: '#b0793a', metalness: 0.82, roughness: 0.34 })
  const stone = new THREE.MeshStandardMaterial({ color: '#655843', roughness: 0.92, flatShading: true })
  const stoneDark = new THREE.MeshStandardMaterial({ color: '#3a3126', roughness: 0.95 })

  // carved stone column (same footprint as the old pole)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 4.4, 10), stone)
  pole.position.set(0, 2.2, -7.55)
  pole.castShadow = true
  g.add(pole)
  for (const [y, r] of [[0.95, 0.3], [3.6, 0.27]]) {   // bronze binding rings
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 14), bronze)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, y, -7.55)
    g.add(ring)
  }
  const capital = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.2, 0.72), stoneDark)
  capital.position.set(0, 4.42, -7.55)
  capital.castShadow = true
  g.add(capital)
  // stone plinth base
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.36, 1.4), stoneDark)
  base.position.set(0, 0.18, -7.55)
  base.castShadow = true
  g.add(base)
  const base2 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.34, 1.0), stone)
  base2.position.set(0, 0.5, -7.55)
  base2.castShadow = true
  g.add(base2)
  // iron support arm
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.5), iron)
  arm.position.set(0, 3.85, -6.8)
  arm.rotation.x = 0.32
  g.add(arm)

  // carved stone backboard slab (same box position/size as the old glass)
  const boardTex = canvasTexture(512, 320, ctx => {
    const grad = ctx.createLinearGradient(0, 0, 0, 320)
    grad.addColorStop(0, '#5c5142')
    grad.addColorStop(1, '#403627')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 512, 320)
    // chisel marks
    for (let i = 0; i < 130; i++) {
      ctx.globalAlpha = rand(0.05, 0.14)
      ctx.fillStyle = Math.random() > 0.5 ? '#2c2216' : '#7d6c50'
      ctx.fillRect(rand(512), rand(320), rand(8, 40), rand(2, 6))
    }
    ctx.globalAlpha = 1
    // carved border groove
    ctx.strokeStyle = 'rgba(20,12,6,0.7)'
    ctx.lineWidth = 8
    ctx.strokeRect(18, 18, 476, 284)
    // faded crimson ring emblem behind the shooter square
    ctx.strokeStyle = 'rgba(140,32,34,0.5)'
    ctx.lineWidth = 10
    ctx.beginPath(); ctx.arc(256, 190, 96, 0, TAU); ctx.stroke()
    // cracks
    ctx.strokeStyle = 'rgba(18,10,5,0.55)'
    ctx.lineWidth = 3
    for (let i = 0; i < 5; i++) {
      let x = rand(512), y = rand(320)
      ctx.beginPath(); ctx.moveTo(x, y)
      for (let k = 0; k < 4; k++) { x += rand(-50, 50); y += rand(-40, 40); ctx.lineTo(x, y) }
      ctx.stroke()
    }
  })
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.1, 0.08), new THREE.MeshStandardMaterial({ map: boardTex, color: '#efe2c8', roughness: 0.88, emissive: '#3a2a18', emissiveIntensity: 0.35 }))
  board.position.set(0, 3.52, COURT.BOARD_Z)
  board.castShadow = true
  g.add(board)

  // bronze outer frame + ember rune shooter square
  const frame = (w, h, cx, cy, mat, th = 0.04) => {
    const geos = [
      new THREE.BoxGeometry(w, th, th).translate(cx, cy + h / 2, 0),
      new THREE.BoxGeometry(w, th, th).translate(cx, cy - h / 2, 0),
      new THREE.BoxGeometry(th, h, th).translate(cx - w / 2, cy, 0),
      new THREE.BoxGeometry(th, h, th).translate(cx + w / 2, cy, 0),
    ]
    return new THREE.Mesh(mergeGeometries(geos), mat)
  }
  const outer = frame(1.85, 1.1, 0, 3.52, bronze, 0.055)
  outer.position.z = COURT.BOARD_Z
  g.add(outer)
  const square = frame(0.6, 0.45, 0, 3.35, glowMaterial('#ffb84d', 1.5), 0.028)
  square.position.z = COURT.BOARD_Z + 0.05
  g.add(square)

  // brazier flames at the backboard corners
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.13, 8), iron)
    cup.position.set(s * 0.98, 4.12, COURT.BOARD_Z)
    g.add(cup)
    const fl = kit.make(0.85)
    fl.position.set(s * 0.98, 4.16, COURT.BOARD_Z)
    g.add(fl)
  }

  // forge-hot iron ring (same rim position)
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.022, 10, 32),
    new THREE.MeshStandardMaterial({ color: '#565a62', metalness: 0.85, roughness: 0.3, emissive: '#ff5a26', emissiveIntensity: 0.42 }),
  )
  rim.rotation.x = Math.PI / 2
  rim.position.copy(COURT.RIM)
  rim.castShadow = true
  g.add(rim)
  const rimGlow = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.05, 8, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8c3b').multiplyScalar(1.4), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  rimGlow.rotation.x = Math.PI / 2
  rimGlow.position.copy(COURT.RIM)
  g.add(rimGlow)
  // rim-to-board bracket
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.26), iron)
  bracket.position.set(0, 3.02, COURT.BOARD_Z + 0.16)
  g.add(bracket)

  // --- rope net: tapered criss-cross line segments ---
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
  const net = new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: '#d8c9a8', transparent: true, opacity: 0.88 }))
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

/* ============================= crowd: toga + armor silhouettes ============================= */

function buildCrowd() {
  const body = new THREE.CapsuleGeometry(0.27, 0.5, 4, 8).translate(0, 0.52, 0)
  const head = new THREE.SphereGeometry(0.17, 8, 7).translate(0, 1.06, 0)
  const geo = mergeGeometries([body, head])
  const mat = toonMaterial({ color: '#665542', rim: '#ff9a4d', rimStrength: 0.5, rimPower: 2.4 })

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
  // leather, umber, iron and rag-cloth tones; hot = crimson/bronze/gold/bone
  const palette = ['#3a2c22', '#4a352a', '#2f2a26', '#503c2c', '#41302e', '#5a4432', '#37262b', '#463a2b']
  const hot = ['#a1252c', '#b0793a', '#ffb84d', '#e8dcc4']
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

/* ============================= stone tiers / banners / brazier-board ============================= */

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
    new THREE.MeshStandardMaterial({ color: '#3e3126', roughness: 0.95, metalness: 0 }),
  )
  mesh.receiveShadow = true
  return mesh
}

function adsTexture() {
  const tex = canvasTexture(2048, 128, ctx => {
    // war-banner cloth: dark leather with a woven sheen
    const g = ctx.createLinearGradient(0, 0, 0, 128)
    g.addColorStop(0, '#2c1c12')
    g.addColorStop(0.5, '#1e1209')
    g.addColorStop(1, '#140c07')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 2048, 128)
    // stitched top/bottom hems
    ctx.strokeStyle = 'rgba(176,121,58,0.5)'
    ctx.setLineDash([14, 10])
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(2048, 8); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, 120); ctx.lineTo(2048, 120); ctx.stroke()
    ctx.setLineDash([])
    const items = [
      ['IWL', '#ffb84d'], ['BLOOD COURT', '#c23b2e'], ['THE PIT', '#e8dcc4'], ['ON FIRE', '#ff8c3b'],
    ]
    ctx.textBaseline = 'middle'
    ctx.font = '900 72px Georgia, "Times New Roman", serif'
    let x = 40
    for (let rep = 0; rep < 3; rep++) {
      for (const [txt, color] of items) {
        ctx.strokeStyle = 'rgba(12,6,3,0.9)'
        ctx.lineWidth = 8
        ctx.strokeText(txt, x, 66)
        ctx.fillStyle = color
        ctx.fillText(txt, x, 66)
        x += ctx.measureText(txt).width + 44
        // bronze spearhead divider
        ctx.fillStyle = 'rgba(176,121,58,0.75)'
        ctx.beginPath()
        ctx.moveTo(x - 26, 50); ctx.lineTo(x - 10, 64); ctx.lineTo(x - 26, 78); ctx.closePath()
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
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color('#ffffff').multiplyScalar(1.06) })
  const group = new THREE.Group()
  const mk = (len, pos, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.62), mat)
    m.position.copy(pos)
    m.rotation.y = rotY
    group.add(m)
    const back = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.72, 0.1), new THREE.MeshStandardMaterial({ color: '#1b130c', roughness: 0.9 }))
    back.position.copy(pos)
    back.position.y = 0.35
    back.rotation.y = rotY
    back.translateZ(-0.07)
    group.add(back)
  }
  mk(18.6, new THREE.Vector3(0, 0.36, -8.95), 0)
  mk(16.5, new THREE.Vector3(-8.95, 0.36, 0.4), Math.PI / 2)
  mk(16.5, new THREE.Vector3(8.95, 0.36, 0.4), -Math.PI / 2)
  const tick = dt => { tex.offset.x = (tex.offset.x + dt * 0.028) % 1 }
  return { group, tick }
}

function buildJumbotron(kit) {
  const group = new THREE.Group()
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 300
  const cx = c.getContext('2d')
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace

  const draw = ({ you = 0, cpu = 0, clock = 14, poss = 'player' } = {}) => {
    // iron plate warmed by firelight
    const g = cx.createLinearGradient(0, 0, 0, 300)
    g.addColorStop(0, '#221812')
    g.addColorStop(1, '#0d0806')
    cx.fillStyle = g
    cx.fillRect(0, 0, 512, 300)
    // bronze frame + rivets
    cx.strokeStyle = 'rgba(176,121,58,0.85)'
    cx.lineWidth = 8
    cx.strokeRect(8, 8, 496, 284)
    cx.strokeStyle = 'rgba(232,220,196,0.18)'
    cx.lineWidth = 2
    cx.strokeRect(20, 20, 472, 260)
    cx.fillStyle = 'rgba(176,121,58,0.9)'
    for (const [rx, ry] of [[16, 16], [496, 16], [16, 284], [496, 284]]) {
      cx.beginPath(); cx.arc(rx, ry, 5, 0, TAU); cx.fill()
    }
    cx.textAlign = 'center'
    cx.font = '900 40px Georgia, "Times New Roman", serif'
    cx.fillStyle = '#ffb84d'
    cx.fillText('BLOOD COURT', 256, 52)
    cx.font = '900 92px Georgia, "Times New Roman", serif'
    cx.fillStyle = '#ffb84d'
    cx.textAlign = 'right'
    cx.fillText(String(you), 175, 152)
    cx.textAlign = 'left'
    cx.fillStyle = '#c9432f'
    cx.fillText(String(cpu), 337, 152)
    cx.textAlign = 'center'
    cx.fillStyle = '#e8dcc4'
    cx.fillText(':', 256, 146)
    cx.font = '700 30px Georgia, "Times New Roman", serif'
    cx.fillStyle = poss === 'player' ? '#ffb84d' : '#57493a'
    cx.fillText('YOU ' + (poss === 'player' ? '●' : ''), 130, 198)
    cx.fillStyle = poss === 'ai' ? '#c9432f' : '#57493a'
    cx.fillText((poss === 'ai' ? '● ' : '') + 'CPU', 384, 198)
    // shot clock
    cx.font = '900 74px Georgia, "Times New Roman", serif'
    cx.fillStyle = clock <= 5 ? '#e04338' : '#e8dcc4'
    cx.fillText(String(Math.max(0, Math.ceil(clock))), 256, 264)
    tex.needsUpdate = true
  }
  draw()

  const screenMat = new THREE.MeshBasicMaterial({ map: tex })
  const ironMat = new THREE.MeshStandardMaterial({ color: '#171009', roughness: 0.6, metalness: 0.5 })
  const cube = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.1, 3.6), [screenMat, screenMat, ironMat, ironMat, screenMat, screenMat])
  cube.position.y = 0
  group.add(cube)
  // bronze bands
  const bandMat = new THREE.MeshStandardMaterial({ color: '#b0793a', metalness: 0.85, roughness: 0.3 })
  for (const y of [-1.12, 1.12]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.09, 3.72), bandMat)
    band.position.y = y
    group.add(band)
  }
  // corner brazier fires on the top rim
  const cupGeo = new THREE.CylinderGeometry(0.13, 0.07, 0.16, 8)
  for (const [x, z] of [[-1.62, -1.62], [1.62, -1.62], [-1.62, 1.62], [1.62, 1.62]]) {
    const cup = new THREE.Mesh(cupGeo, ironMat)
    cup.position.set(x, 1.24, z)
    group.add(cup)
    const fl = kit.make(1.15)
    fl.position.set(x, 1.3, z)
    group.add(fl)
  }
  // hanging chains
  const chainMat = new THREE.MeshStandardMaterial({ color: '#1f1913', roughness: 0.7, metalness: 0.6 })
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    const cbl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 4.4, 5), chainMat)
    cbl.position.set(x, 3.2, z)
    group.add(cbl)
  }
  group.position.set(0, 10.6, -0.4)
  return { group, set: draw }
}

/* ============================= colosseum wall ============================= */

function wallTexture() {
  const W = 1024, H = 512
  const tex = canvasTexture(W, H, ctx => {
    // night stone
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#241a19')
    g.addColorStop(0.55, '#2a211b')
    g.addColorStop(1, '#171009')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    // block courses
    ctx.strokeStyle = 'rgba(12,8,5,0.5)'
    ctx.lineWidth = 3
    for (let y = 40; y < H; y += 46) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      const off = ((y / 46) % 2) * 60
      for (let x = off; x < W; x += 120) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 46); ctx.stroke()
      }
    }
    // crenellated top rim
    ctx.fillStyle = '#0d0906'
    for (let x = 0; x < W; x += 86) ctx.fillRect(x, 0, 43, 26)
    // gallery arches, torch-lit from within
    const archY = 150, archH = 130, archW = 62
    for (let i = 0; i < 6; i++) {
      const cxx = i * 170 + 85
      ctx.fillStyle = '#0b0705'
      ctx.beginPath()
      ctx.moveTo(cxx - archW / 2, archY + archH)
      ctx.lineTo(cxx - archW / 2, archY + 30)
      ctx.arc(cxx, archY + 30, archW / 2, Math.PI, 0)
      ctx.lineTo(cxx + archW / 2, archY + archH)
      ctx.closePath()
      ctx.fill()
      if (i % 3 !== 1) { // most galleries glow with torchlight
        const fg = ctx.createRadialGradient(cxx, archY + archH - 10, 4, cxx, archY + archH - 10, archW * 0.9)
        fg.addColorStop(0, 'rgba(255,150,60,0.85)')
        fg.addColorStop(0.5, 'rgba(255,110,40,0.3)')
        fg.addColorStop(1, 'rgba(255,90,30,0)')
        ctx.fillStyle = fg
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(cxx - archW / 2, archY + archH)
        ctx.lineTo(cxx - archW / 2, archY + 30)
        ctx.arc(cxx, archY + 30, archW / 2, Math.PI, 0)
        ctx.lineTo(cxx + archW / 2, archY + archH)
        ctx.closePath()
        ctx.clip()
        ctx.fillRect(cxx - archW, archY, archW * 2, archH + 10)
        ctx.restore()
      }
      // war banner hanging between arches
      const bx = cxx + 85
      if (i < 5) {
        const bg = ctx.createLinearGradient(0, archY - 16, 0, archY + 128)
        bg.addColorStop(0, i % 2 ? '#8c2228' : '#4a2a3e')
        bg.addColorStop(1, i % 2 ? '#4e1114' : '#241220')
        ctx.fillStyle = bg
        ctx.fillRect(bx - 20, archY - 16, 40, 120)
        ctx.beginPath()
        ctx.moveTo(bx - 20, archY + 104); ctx.lineTo(bx, archY + 128); ctx.lineTo(bx + 20, archY + 104)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = 'rgba(255,196,100,0.8)'
        ctx.beginPath(); ctx.arc(bx, archY + 34, 10, 0, TAU); ctx.fill()
        ctx.strokeStyle = 'rgba(200,150,80,0.85)'
        ctx.lineWidth = 4
        ctx.strokeRect(bx - 20, archY - 16, 40, 8)
      }
    }
  })
  tex.wrapS = THREE.RepeatWrapping
  tex.repeat.set(7, 1)
  return tex
}

/* ============================= arena assembly ============================= */

export function buildArena(scene) {
  const group = new THREE.Group()
  scene.add(group)
  const kit = flameKit()

  // sand-and-stone floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.FLOOR_W, COURT.FLOOR_D),
    new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.86, metalness: 0, envMapIntensity: 0.3 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  group.add(floor)

  // charred earth beyond the floor
  const outer = new THREE.Mesh(
    new THREE.CircleGeometry(70, 32),
    new THREE.MeshStandardMaterial({ color: '#160f0b', roughness: 0.98 }),
  )
  outer.rotation.x = -Math.PI / 2
  outer.position.y = -0.02
  group.add(outer)

  const hoop = buildHoop(kit)
  group.add(hoop.group)

  const stands = buildStands()
  group.add(stands)

  const crowd = buildCrowd()
  group.add(crowd.mesh)

  const ads = buildAds()
  group.add(ads.group)

  const jumbo = buildJumbotron(kit)
  group.add(jumbo.group)

  // colosseum shell: torchlit arched galleries all around
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(28, 30, 26, 40, 1, true),
    new THREE.MeshStandardMaterial({ map: wallTexture(), color: '#b09a88', roughness: 1, side: THREE.BackSide }),
  )
  wall.position.y = 10
  group.add(wall)

  // standing torches ringing the court
  const torchPole = new THREE.CylinderGeometry(0.05, 0.075, 3.2, 6)
  const torchCup = new THREE.CylinderGeometry(0.15, 0.08, 0.18, 8)
  const torchMat = new THREE.MeshStandardMaterial({ color: '#2b2118', roughness: 0.8, metalness: 0.4 })
  for (const [x, z] of [[-8.9, -4], [8.9, -4], [-8.9, 4.5], [8.9, 4.5], [-5, -8.9], [5, -8.9]]) {
    const pole = new THREE.Mesh(torchPole, torchMat)
    pole.position.set(x, 1.6, z)
    pole.castShadow = true
    group.add(pole)
    const cup = new THREE.Mesh(torchCup, torchMat)
    cup.position.set(x, 3.26, z)
    group.add(cup)
    const fl = kit.make(1.2)
    fl.position.set(x, 3.32, z)
    group.add(fl)
  }

  // drifting embers
  const embers = fireflies({ count: 26, area: [26, 22], height: [1.2, 9], color: '#ff9a4d', size: 0.38 })
  group.add(embers)

  // --- lighting: moonlight + torch warmth ---
  group.add(new THREE.HemisphereLight('#3a2030', '#1a1210', 0.3))
  const moon = new THREE.DirectionalLight('#aab6dd', 0.75)
  moon.position.set(7, 17, 10)
  moon.target.position.set(0, 0, -2)
  moon.castShadow = true
  moon.shadow.mapSize.set(2048, 2048)
  moon.shadow.camera.left = -13
  moon.shadow.camera.right = 13
  moon.shadow.camera.top = 14
  moon.shadow.camera.bottom = -14
  moon.shadow.camera.far = 45
  moon.shadow.bias = -0.0004
  group.add(moon, moon.target)

  const torchA = new THREE.PointLight('#ff9a5c', 22, 20, 2)   // hoop end
  torchA.position.set(0, 6.5, -6)
  group.add(torchA)
  const torchB = new THREE.PointLight('#ff8c3b', 16, 24, 2)   // check end
  torchB.position.set(0, 7, 6)
  group.add(torchB)
  const moonBeam = new THREE.SpotLight('#c9d4ee', 26, 50, 0.55, 0.6, 1.8)
  moonBeam.position.set(0, 16, 3)
  moonBeam.target.position.set(0, 0, -1)
  group.add(moonBeam, moonBeam.target)

  // fake-volumetric torch shafts + one drifting haze beam
  const shaftDefs = [
    [-6, -4, '#ffab5e'], [6, -4, '#ff9a5c'], [-6, 5, '#ff9a5c'], [6, 5, '#ffab5e'],
  ]
  for (const [x, z, col] of shaftDefs) {
    const s = lightShaft({ color: col, height: 15, radius: 2.5, opacity: 0.016 })
    s.position.set(x, 0, z)
    s.rotation.z = x > 0 ? 0.16 : -0.16
    group.add(s)
  }
  const sweepPivot = new THREE.Group()
  sweepPivot.position.set(0, 14.5, -1)
  const sweep = lightShaft({ color: '#ffbd7a', height: 16, radius: 2.2, opacity: 0.028 })
  sweep.position.y = -8   // hang downward from pivot
  sweep.rotation.x = Math.PI // apex up at pivot
  const sweepArm = new THREE.Group()
  sweepArm.rotation.z = 0.42
  sweepArm.add(sweep)
  sweepPivot.add(sweepArm)
  group.add(sweepPivot)

  // iron fire-ring overhead: dark ring + burning bowls
  const rig = new THREE.Group()
  const truss = new THREE.Mesh(
    new THREE.TorusGeometry(7.5, 0.16, 6, 40),
    new THREE.MeshStandardMaterial({ color: '#241d16', roughness: 0.75, metalness: 0.5 }),
  )
  truss.rotation.x = Math.PI / 2
  rig.add(truss)
  const bowlGeo = new THREE.CylinderGeometry(0.16, 0.09, 0.18, 8)
  const bowlMat = new THREE.MeshStandardMaterial({ color: '#1f1913', roughness: 0.7, metalness: 0.5 })
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU
    const bowl = new THREE.Mesh(bowlGeo, bowlMat)
    bowl.position.set(Math.cos(a) * 7.5, -0.18, Math.sin(a) * 7.5)
    rig.add(bowl)
    const fl = kit.make(1.05)
    fl.position.set(Math.cos(a) * 7.5, -0.12, Math.sin(a) * 7.5)
    rig.add(fl)
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
      embers.tick(dt)
      kit.tick(t)
      sweepPivot.rotation.y = Math.sin(t * 0.18) * 1.4
      hoop.rimGlow.material.opacity = 0.13 + Math.sin(t * 2.6) * 0.05
      // torchlight breathes
      torchA.intensity = 22 + Math.sin(t * 9.1) * 1.8 + Math.sin(t * 23.7) * 1.0
      torchB.intensity = 16 + Math.sin(t * 8.3 + 2) * 1.4 + Math.sin(t * 21.1) * 0.8
    },
  }
}
