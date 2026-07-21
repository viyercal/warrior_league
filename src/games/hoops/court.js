import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { canvasTexture, normalMapFromHeight, dirtOverlay } from '../../core/assets.js'
import {
  pbrMaterial, stoneMaterial, ironMaterial, bronzeMaterial, woodMaterial,
  boneMaterial, clothMaterial, fireMaterial, emberGlowMaterial, contactShadow,
  glowSpriteMaterial,
} from '../../art/materials.js'
import { lightShaft, fireflies } from '../../art/environment.js'
import { sky } from '../../art/sky.js'
import { ridgeRing, watchFires } from '../../art/backdrop.js'
import { rand, TAU, clamp } from '../../core/utils.js'
import { COURT } from './constants.js'

/* ============================= uv helpers ============================= */

/** Scale a geometry's UVs so a RepeatWrapping texture tiles at ~world scale. */
function uvScale(geo, su, sv) {
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  return geo
}

/** Per-face world-size UVs for a BoxGeometry (before rotate/translate). */
function worldUVBox(geo, texScale = 2.6) {
  const p = geo.attributes.position
  const uv = geo.attributes.uv
  for (let f = 0; f < p.count; f += 4) {
    let nx = Infinity, ny = Infinity, nz = Infinity, mx = -Infinity, my = -Infinity, mz = -Infinity
    for (let i = f; i < f + 4; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      nx = Math.min(nx, x); ny = Math.min(ny, y); nz = Math.min(nz, z)
      mx = Math.max(mx, x); my = Math.max(my, y); mz = Math.max(mz, z)
    }
    const dims = [mx - nx, my - ny, mz - nz].filter(d => d > 1e-6)
    const su = (dims[0] || 1) / texScale
    const sv = (dims[1] ?? dims[0] ?? 1) / texScale
    for (let i = f; i < f + 4; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  }
  return geo
}

/* ============================= torch flames =============================
   Real layered fire: additive blackbody shader cones (auto-ticked uTime) with
   a faint warm scatter halo; per-flame flicker via tick. Materials shared. */

function flameKit() {
  const outerMat = fireMaterial({ intensity: 1.55, speed: 1.6 })
  const innerMat = fireMaterial({
    intensity: 1.9, speed: 2.3,
    edgeColor: '#c8441a', midColor: '#ff9438', coreColor: '#ffe8b0',
  })
  const haloMat = glowSpriteMaterial('#ff7a30', 0.07)
  const geos = [
    new THREE.ConeGeometry(0.13, 0.6, 8, 3, true).translate(0, 0.3, 0),
    new THREE.ConeGeometry(0.065, 0.36, 7, 2, true).translate(0, 0.2, 0),
  ]
  const flames = []
  let boost = 1, boostT = 1   // match-point flare: every flame swells together
  return {
    make(s = 1) {
      const g = new THREE.Group()
      g.add(new THREE.Mesh(geos[0], outerMat), new THREE.Mesh(geos[1], innerMat))
      const halo = new THREE.Sprite(haloMat)
      halo.scale.setScalar(0.6)
      halo.position.y = 0.26
      g.add(halo)
      g.scale.setScalar(s)
      g.userData = { phase: rand(TAU), s }
      flames.push(g)
      return g
    },
    setBoost(b) { boostT = b },
    tick(t, dt = 0.016) {
      boost += (boostT - boost) * Math.min(1, dt * 2.2)
      for (const f of flames) {
        const { phase, s } = f.userData
        const k = 1 + 0.15 * Math.sin(t * 10.3 + phase) + 0.07 * Math.sin(t * 23.7 + phase * 1.7)
        const sb = s * boost
        f.scale.set(sb * (1 + (k - 1) * 0.45), sb * k, sb * (1 + (k - 1) * 0.45))
      }
    },
  }
}

/* ============================= floor: albedo + normal + roughness =============================
   Sand over worn flagstone: slab joints recessed in the normal map, traffic
   wear paths polished (shinier in the roughness map), painted crimson lines
   chipped and faded, grime + speckle overlay. */

const fx = x => (x + COURT.FLOOR_W / 2) / COURT.FLOOR_W   // world → 0..1 u
const fz = z => (z + COURT.FLOOR_D / 2) / COURT.FLOOR_D   // world → 0..1 v (canvas y)

function courtAlbedo() {
  const PXW = 2048, PXH = 1620
  const FW = COURT.FLOOR_W, FD = COURT.FLOOR_D
  const sx = PXW / FW, sz = PXH / FD
  const px = x => (x + FW / 2) * sx
  const pz = z => (z + FD / 2) * sz
  const tex = canvasTexture(PXW, PXH, ctx => {
    // --- packed sand base (desaturated, night-dark) ---
    ctx.fillStyle = '#5d4c32'
    ctx.fillRect(0, 0, PXW, PXH)
    for (let i = 0; i < 340; i++) {
      ctx.globalAlpha = rand(0.04, 0.11)
      ctx.fillStyle = Math.random() > 0.5 ? '#46351e' : '#715c3c'
      ctx.beginPath()
      ctx.ellipse(rand(PXW), rand(PXH), rand(24, 130), rand(16, 80), rand(TAU), 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    // --- worn stone slabs under the sand: offset courses ---
    ctx.strokeStyle = 'rgba(42,28,14,0.34)'
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
          ctx.fillStyle = Math.random() > 0.5 ? '#40301f' : '#997c52'
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

    // --- traffic wear: lighter polished path down the drive lane + key scuff ---
    for (let i = 0; i < 85; i++) {
      const z = rand(-6.4, 6.2)
      const x = rand(-1.8, 1.8) * (0.55 + Math.min(1, Math.abs(z) * 0.09))
      ctx.globalAlpha = rand(0.045, 0.11)
      ctx.fillStyle = '#715a38'
      ctx.beginPath()
      ctx.ellipse(px(x), pz(z), rand(28, 88), rand(46, 128), 0, 0, TAU)
      ctx.fill()
    }
    for (let i = 0; i < 55; i++) { // heavy scuffing under the ring
      ctx.globalAlpha = rand(0.05, 0.12)
      ctx.fillStyle = Math.random() > 0.4 ? '#715a38' : '#42301e'
      ctx.beginPath()
      ctx.ellipse(px(rand(-2.5, 2.5)), pz(COURT.RIM_FLOOR.z + rand(-0.4, 3)), rand(24, 70), rand(18, 50), rand(TAU), 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // --- darker charred apron outside the court ---
    ctx.beginPath()
    ctx.rect(0, 0, PXW, PXH)
    ctx.rect(px(COURT.MINX), pz(COURT.BASE_Z), (COURT.MAXX - COURT.MINX) * sx, (COURT.HALF_Z - COURT.BASE_Z) * sz)
    ctx.fillStyle = 'rgba(22,14,9,0.52)'
    ctx.fill('evenodd')
    // --- umber tint beyond the 3pt arc (inside court) ---
    ctx.save()
    ctx.beginPath()
    ctx.rect(px(COURT.MINX), pz(COURT.BASE_Z), (COURT.MAXX - COURT.MINX) * sx, (COURT.HALF_Z - COURT.BASE_Z) * sz)
    ctx.clip()
    ctx.beginPath()
    ctx.rect(px(COURT.MINX), pz(COURT.BASE_Z), (COURT.MAXX - COURT.MINX) * sx, (COURT.HALF_Z - COURT.BASE_Z) * sz)
    ctx.ellipse(px(0), pz(COURT.RIM_FLOOR.z), COURT.ARC_R * sx, COURT.ARC_R * sz, 0, 0, TAU)
    ctx.fillStyle = 'rgba(46,26,18,0.3)'
    ctx.fill('evenodd')
    ctx.restore()

    // --- painted key: weathered blood crimson ---
    const keyW = 4.9, ftZ = -1.2
    ctx.fillStyle = 'rgba(104,30,27,0.36)'
    ctx.fillRect(px(-keyW / 2), pz(COURT.BASE_Z), keyW * sx, (ftZ - COURT.BASE_Z) * sz)
    // wear streaks in the paint
    ctx.globalAlpha = 0.18
    ctx.fillStyle = '#5d4c32'
    for (let i = 0; i < 30; i++) {
      ctx.beginPath()
      ctx.ellipse(px(rand(-keyW / 2, keyW / 2)), pz(rand(COURT.BASE_Z, ftZ)), rand(10, 60), rand(6, 26), rand(TAU), 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // --- painted crimson lines (dark undercoat, faded paint, chipped) ---
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
    ctx.strokeStyle = 'rgba(40,12,9,0.55)'   // carved shadow under the paint
    ctx.lineWidth = 11
    lines()
    ctx.strokeStyle = 'rgba(118,42,34,0.82)' // weathered pigment, not fresh paint
    ctx.lineWidth = 7
    lines()
    // chips: sand shows through the paint in dashes
    ctx.strokeStyle = 'rgba(93,76,50,0.55)'
    ctx.lineWidth = 8
    ctx.setLineDash([5, 37])
    ctx.lineDashOffset = 11
    lines()
    ctx.setLineDash([9, 53])
    ctx.lineDashOffset = 31
    ctx.strokeStyle = 'rgba(100,80,52,0.4)'
    lines()
    ctx.setLineDash([])

    // --- carved center emblem ---
    ctx.save()
    ctx.translate(px(0), pz(2.55))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 9
    ctx.strokeStyle = 'rgba(40,24,12,0.55)'
    ctx.beginPath(); ctx.arc(0, 0, 208, 0, TAU); ctx.stroke()
    ctx.strokeStyle = 'rgba(150,106,56,0.38)'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(0, 0, 190, 0, TAU); ctx.stroke()
    ctx.font = '900 96px Georgia, "Times New Roman", serif'
    ctx.lineWidth = 12
    ctx.strokeStyle = 'rgba(30,16,8,0.85)'
    ctx.strokeText('BLOOD COURT', 0, -6)
    ctx.fillStyle = 'rgba(108,34,36,0.66)'
    ctx.fillText('BLOOD COURT', 0, -6)
    ctx.font = '700 42px Georgia, "Times New Roman", serif'
    ctx.strokeStyle = 'rgba(30,16,8,0.6)'
    ctx.lineWidth = 6
    ctx.strokeText('I W L', 0, 92)
    ctx.fillStyle = 'rgba(150,106,56,0.65)'
    ctx.fillText('I W L', 0, 92)
    ctx.restore()

    // soft edge vignette so the floor melts into the night
    const vg = ctx.createRadialGradient(px(0), pz(0), PXH * 0.28, px(0), pz(0), PXH * 0.76)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(8,5,3,0.78)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, PXW, PXH)
    // extra corner/edge AO (floor meets stands)
    for (const [x0, y0, x1, y1] of [[0, 0, 0, PXH * 0.09], [0, PXH, 0, PXH * 0.91], [0, 0, PXW * 0.07, 0], [PXW, 0, PXW * 0.93, 0]]) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1)
      g.addColorStop(0, 'rgba(6,4,2,0.5)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, PXW, PXH)
    }
  })
  tex.anisotropy = 8
  return dirtOverlay(tex, { amount: 0.4, edge: 0, speckle: 0.55, seed: 17 })
}

function courtNormal() {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const x2 = c.getContext('2d')
  x2.fillStyle = '#7d7d7d'
  x2.fillRect(0, 0, S, S)
  // sandy undulation
  for (let i = 0; i < 130; i++) {
    x2.globalAlpha = rand(0.04, 0.1)
    x2.fillStyle = Math.random() > 0.5 ? '#8f8f8f' : '#6c6c6c'
    x2.beginPath()
    x2.ellipse(rand(S), rand(S), rand(8, 46), rand(6, 30), rand(TAU), 0, TAU)
    x2.fill()
  }
  x2.globalAlpha = 1
  // slab joints, recessed (same course layout as albedo)
  const slabH = (1.55 / COURT.FLOOR_D) * S
  const colW = (2.2 / COURT.FLOOR_W) * S
  x2.strokeStyle = 'rgba(44,44,44,0.8)'
  x2.lineWidth = 1.7
  let r = 0
  for (let y = 0; y < S + slabH; y += slabH, r++) {
    x2.beginPath(); x2.moveTo(0, y); x2.lineTo(S, y); x2.stroke()
    const off = (r % 2) * colW * 0.5
    for (let x = off; x < S + colW; x += colW) {
      x2.beginPath(); x2.moveTo(x, y); x2.lineTo(x + rand(-3, 3), y + slabH); x2.stroke()
    }
  }
  // cracks
  x2.strokeStyle = 'rgba(32,32,32,0.7)'
  x2.lineWidth = 1.2
  for (let i = 0; i < 26; i++) {
    let x = rand(S), y = rand(S)
    x2.beginPath(); x2.moveTo(x, y)
    for (let k = 0; k < 5; k++) { x += rand(-26, 26); y += rand(-20, 20); x2.lineTo(x, y) }
    x2.stroke()
  }
  return normalMapFromHeight(c, { strength: 2.2 })
}

function courtRoughness() {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const x2 = c.getContext('2d')
  const u = x => fx(x) * S, v = z => fz(z) * S
  x2.fillStyle = '#c9c9c9'                              // sand ≈ 0.79
  x2.fillRect(0, 0, S, S)
  for (let i = 0; i < 110; i++) {                       // breakup
    x2.globalAlpha = rand(0.06, 0.14)
    x2.fillStyle = Math.random() > 0.5 ? '#dedede' : '#a8a8a8'
    x2.beginPath()
    x2.ellipse(rand(S), rand(S), rand(10, 50), rand(8, 34), rand(TAU), 0, TAU)
    x2.fill()
  }
  x2.globalAlpha = 1
  // charred apron: rougher
  x2.beginPath()
  x2.rect(0, 0, S, S)
  x2.rect(u(COURT.MINX), v(COURT.BASE_Z), (COURT.MAXX - COURT.MINX) / COURT.FLOOR_W * S, (COURT.HALF_Z - COURT.BASE_Z) / COURT.FLOOR_D * S)
  x2.fillStyle = 'rgba(238,238,238,0.8)'
  x2.fill('evenodd')
  // traffic-polished lane + key: shinier (moon/torch sheen where warriors run)
  for (let i = 0; i < 70; i++) {
    const z = rand(-6.4, 6.2)
    const x = rand(-1.9, 1.9) * (0.55 + Math.min(1, Math.abs(z) * 0.09))
    x2.globalAlpha = rand(0.1, 0.22)
    x2.fillStyle = '#6e6e6e'
    x2.beginPath()
    x2.ellipse(u(x), v(z), rand(8, 24), rand(14, 34), 0, 0, TAU)
    x2.fill()
  }
  for (let i = 0; i < 40; i++) {
    x2.globalAlpha = rand(0.1, 0.24)
    x2.fillStyle = '#666666'
    x2.beginPath()
    x2.ellipse(u(rand(-2.4, 2.4)), v(COURT.RIM_FLOOR.z + rand(-0.4, 3)), rand(7, 20), rand(6, 16), rand(TAU), 0, TAU)
    x2.fill()
  }
  x2.globalAlpha = 1
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

/* ============================= hoop: iron ring on a stone column ============================= */

function buildHoop(kit) {
  const g = new THREE.Group()
  const iron = ironMaterial('#5a5e66')
  const bronze = bronzeMaterial()
  const stone = stoneMaterial('#c4b49c')
  const stoneDark = stoneMaterial('#8a7b6a')

  // carved stone column (same footprint as the old pole)
  const poleGeo = uvScale(new THREE.CylinderGeometry(0.24, 0.3, 4.4, 14), 1, 2.6)
  const pole = new THREE.Mesh(poleGeo, stone)
  pole.position.set(0, 2.2, -7.55)
  pole.castShadow = true
  g.add(pole)
  for (const [y, r] of [[0.95, 0.3], [3.6, 0.27]]) {   // bronze binding rings
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 18), bronze)
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
  const plinthShadow = contactShadow(1.2, 0.5)
  plinthShadow.position.set(0, 0.021, -7.55)
  g.add(plinthShadow)
  // iron support arm
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.5), iron)
  arm.position.set(0, 3.85, -6.8)
  arm.rotation.x = 0.32
  g.add(arm)

  // carved stone backboard slab (same box position/size as the old glass)
  const boardTex = canvasTexture(512, 320, ctx => {
    const grad = ctx.createLinearGradient(0, 0, 0, 320)
    grad.addColorStop(0, '#564c3f')
    grad.addColorStop(1, '#3b3226')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 512, 320)
    // chisel marks
    for (let i = 0; i < 130; i++) {
      ctx.globalAlpha = rand(0.05, 0.14)
      ctx.fillStyle = Math.random() > 0.5 ? '#2a2115' : '#75654b'
      ctx.fillRect(rand(512), rand(320), rand(8, 40), rand(2, 6))
    }
    ctx.globalAlpha = 1
    // carved border groove
    ctx.strokeStyle = 'rgba(20,12,6,0.7)'
    ctx.lineWidth = 8
    ctx.strokeRect(18, 18, 476, 284)
    // faded crimson ring emblem behind the shooter square
    ctx.strokeStyle = 'rgba(126,34,32,0.45)'
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
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 1.1, 0.08),
    pbrMaterial({
      color: '#e6dcc6', roughness: 0.95, metalness: 0,
      maps: { map: boardTex, normalMap: normalMapFromHeight(boardTex.image, { strength: 1.3 }) },
      normalScale: 0.8, envMapIntensity: 0.25,
    }),
  )
  board.position.set(0, 3.52, COURT.BOARD_Z)
  board.castShadow = true
  g.add(board)

  // bronze outer frame + ember rune shooter square (the one true emissive)
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
  const square = frame(0.6, 0.45, 0, 3.35, emberGlowMaterial(1.35, '#ffb84d'), 0.028)
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

  // forge-warm worn iron ring (same rim position) — heat as faint emissive, not neon
  const rimMat = ironMaterial('#61656d')
  rimMat.roughness = 0.6
  rimMat.emissive = new THREE.Color('#ff5a26')
  rimMat.emissiveIntensity = 0.3
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.022, 10, 32), rimMat)
  rim.rotation.x = Math.PI / 2
  rim.position.copy(COURT.RIM)
  rim.castShadow = true
  g.add(rim)
  const rimGlow = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.05, 8, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8c3b').multiplyScalar(1.2), transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }),
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
  const net = new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: '#b3a488', transparent: true, opacity: 0.8 }))
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
  const mat = clothMaterial('#ffffff')   // per-instance albedo below; grain breakup
  mat.side = THREE.FrontSide
  mat.envMapIntensity = 0.06             // crowd sits in the dark, lit only by torch pools

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
  // leather, umber, iron and rag-cloth tones; hot = pigment cloth, not glow
  const palette = ['#3a2c22', '#4a352a', '#2f2a26', '#503c2c', '#41302e', '#5a4432', '#37262b', '#463a2b']
  const hot = ['#8f2d2f', '#9a7245', '#b8925a', '#b5a58a']
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
    col.set(Math.random() < 0.13 ? hot[Math.floor(rand(hot.length))] : palette[Math.floor(rand(palette.length))])
    col.multiplyScalar(rand(0.55, 0.88))   // darker + varied so rows don't band
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
    const b = worldUVBox(new THREE.BoxGeometry(w, 0.85, d), 2.8)
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
  const geo = mergeGeometries(geos)
  // baked vertex AO: each riser darkens into the step corner below it
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const stepIdx = Math.floor((y + 0.004) / 0.85 - 1e-4)
    const k = clamp((y - stepIdx * 0.85) / 0.85, 0, 1)
    const ao = 0.42 + 0.58 * Math.pow(k, 0.65)
    colors[i * 3] = ao
    colors[i * 3 + 1] = ao * 0.985
    colors[i * 3 + 2] = ao * 0.96
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const mat = stoneMaterial('#7b6c5a')
  mat.vertexColors = true
  mat.envMapIntensity = 0.1
  const mesh = new THREE.Mesh(geo, mat)
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
    ctx.strokeStyle = 'rgba(158,110,56,0.5)'
    ctx.setLineDash([14, 10])
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(2048, 8); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, 120); ctx.lineTo(2048, 120); ctx.stroke()
    ctx.setLineDash([])
    const items = [
      ['IWL', '#d9a252'], ['BLOOD COURT', '#a83a2e'], ['THE PIT', '#cfc3a8'], ['ON FIRE', '#d0762f'],
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
        ctx.fillStyle = 'rgba(158,110,56,0.7)'
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
  // lit cloth: standard material + faint warm emissiveMap so the weave text
  // reads as catching torchlight, never as an LED strip
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.94, metalness: 0,
    emissive: '#8a5c30', emissiveIntensity: 0.5, emissiveMap: tex,
  })
  mat.envMapIntensity = 0.15
  const group = new THREE.Group()
  const backMat = pbrMaterial({ color: '#1b130c', roughness: 0.9 })
  const mk = (len, pos, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.62), mat)
    m.position.copy(pos)
    m.rotation.y = rotY
    group.add(m)
    const back = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.72, 0.1), backMat)
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

  let last = { you: 0, cpu: 0, clock: 14, poss: 'player' }
  let flashState = null   // { text, color, t } — momentum/match-point flashes

  const draw = (state = {}) => {
    last = { ...last, ...state }
    const { you, cpu, clock, poss } = last
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
    // drama flash plate: "5-0 RUN" / "MATCH POINT" over the lower board
    if (flashState) {
      cx.fillStyle = 'rgba(12,6,3,0.82)'
      cx.fillRect(22, 96, 468, 118)
      cx.strokeStyle = flashState.color
      cx.lineWidth = 4
      cx.strokeRect(30, 104, 452, 102)
      cx.textAlign = 'center'
      cx.font = 'italic 900 58px Georgia, "Times New Roman", serif'
      cx.fillStyle = flashState.color
      cx.fillText(flashState.text, 256, 174)
    }
    tex.needsUpdate = true
  }
  draw()

  const flash = (text, color = '#ffb84d') => {
    flashState = { text, color, t: 1.7 }
    draw()
  }
  const jumboTick = dt => {
    if (!flashState) return
    flashState.t -= dt
    if (flashState.t <= 0) { flashState = null; draw() }
  }

  // dimmed below bloom threshold: fire-lit board, not an LED wall
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, color: '#d8d0c2' })
  const ironMat = ironMaterial('#3a322a')
  const cube = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.1, 3.6), [screenMat, screenMat, ironMat, ironMat, screenMat, screenMat])
  cube.position.y = 0
  group.add(cube)
  // bronze bands
  const bandMat = bronzeMaterial()
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
    const fl = kit.make(1.0)
    fl.position.set(x, 1.3, z)
    group.add(fl)
  }
  // hanging chains
  const chainMat = ironMaterial('#33291f')
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    const cbl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 4.4, 5), chainMat)
    cbl.position.set(x, 3.2, z)
    group.add(cbl)
  }
  group.position.set(0, 10.6, -0.4)
  return { group, set: draw, flash, tick: jumboTick }
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
    // stone mottling / weathering streaks
    for (let i = 0; i < 90; i++) {
      ctx.globalAlpha = rand(0.04, 0.1)
      ctx.fillStyle = Math.random() > 0.5 ? '#120c08' : '#3a2f24'
      const x = rand(W), y = rand(H)
      ctx.fillRect(x, y, rand(20, 90), rand(40, 160))
    }
    ctx.globalAlpha = 1
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
        fg.addColorStop(0, 'rgba(240,140,58,0.75)')
        fg.addColorStop(0.5, 'rgba(220,104,40,0.26)')
        fg.addColorStop(1, 'rgba(200,84,30,0)')
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
        bg.addColorStop(0, i % 2 ? '#772426' : '#42293a')
        bg.addColorStop(1, i % 2 ? '#431114' : '#20121d')
        ctx.fillStyle = bg
        ctx.fillRect(bx - 20, archY - 16, 40, 120)
        ctx.beginPath()
        ctx.moveTo(bx - 20, archY + 104); ctx.lineTo(bx, archY + 128); ctx.lineTo(bx + 20, archY + 104)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = 'rgba(230,176,92,0.7)'
        ctx.beginPath(); ctx.arc(bx, archY + 34, 10, 0, TAU); ctx.fill()
        ctx.strokeStyle = 'rgba(180,134,72,0.8)'
        ctx.lineWidth = 4
        ctx.strokeRect(bx - 20, archY - 16, 40, 8)
      }
    }
  })
  tex.wrapS = THREE.RepeatWrapping
  tex.repeat.set(7, 1)
  return tex
}

/* ============================= ground clutter: pebbles + bone shards ============================= */

function scatterSpot() {
  // apron ring only: outside the painted court, inside the floor slab
  for (let k = 0; k < 12; k++) {
    const x = rand(-11.4, 11.4), z = rand(-9, 9)
    if (Math.abs(x) > 7.9 || z < -7.3 || z > 7.35) return [x, z]
  }
  return [rand(8.2, 11), rand(-8.8, 8.8)]
}

function buildClutter() {
  const g = new THREE.Group()
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler()
  const sc = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color()

  // pebbles: one jittered rock hull, instanced
  const pebGeo = new THREE.IcosahedronGeometry(1, 0)
  const pp = pebGeo.attributes.position
  for (let i = 0; i < pp.count; i++) {
    pv.set(pp.getX(i) * rand(0.75, 1.25), pp.getY(i) * rand(0.55, 1.0), pp.getZ(i) * rand(0.75, 1.25))
    pp.setXYZ(i, pv.x, pv.y, pv.z)
  }
  pebGeo.computeVertexNormals()
  const NP = 120
  const pebbles = new THREE.InstancedMesh(pebGeo, stoneMaterial('#8b7f6d'), NP)
  for (let i = 0; i < NP; i++) {
    const [x, z] = scatterSpot()
    const s = rand(0.025, 0.075)
    eu.set(rand(-0.2, 0.2), rand(TAU), rand(-0.2, 0.2))
    q.setFromEuler(eu)
    sc.set(s, s * rand(0.55, 0.8), s)
    m4.compose(pv.set(x, s * 0.5, z), q, sc)
    pebbles.setMatrixAt(i, m4)
    col.set('#ffffff').multiplyScalar(rand(0.7, 1.05))
    pebbles.setColorAt(i, col)
  }
  pebbles.instanceColor.needsUpdate = true
  pebbles.receiveShadow = true
  g.add(pebbles)

  // bone shards / splinters near the stands
  const shardGeo = new THREE.ConeGeometry(0.028, 0.16, 5)
  const NS = 30
  const shards = new THREE.InstancedMesh(shardGeo, boneMaterial('#d6c7ab'), NS)
  for (let i = 0; i < NS; i++) {
    const [x, z] = scatterSpot()
    eu.set(Math.PI / 2 + rand(-0.25, 0.25), rand(TAU), rand(-0.3, 0.3))
    q.setFromEuler(eu)
    const s = rand(0.7, 1.5)
    sc.set(s, s, s)
    m4.compose(pv.set(x, 0.02, z), q, sc)
    shards.setMatrixAt(i, m4)
  }
  shards.receiveShadow = true
  g.add(shards)
  return g
}

/* ============================= arena assembly ============================= */

export function buildArena(scene) {
  const group = new THREE.Group()
  scene.add(group)
  const kit = flameKit()

  // sand-and-stone floor: PBR with slab-joint normals + traffic-worn sheen
  const floorMat = new THREE.MeshStandardMaterial({
    map: courtAlbedo(), normalMap: courtNormal(), roughnessMap: courtRoughness(),
    roughness: 1.0, metalness: 0,
  })
  floorMat.normalScale.set(0.9, 0.9)
  floorMat.envMapIntensity = 0.12
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(COURT.FLOOR_W, COURT.FLOOR_D), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  group.add(floor)

  // charred earth beyond the floor
  const outer = new THREE.Mesh(
    new THREE.CircleGeometry(70, 32),
    pbrMaterial({ color: '#14100b', roughness: 1, envMapIntensity: 0.1 }),
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

  group.add(buildClutter())

  // open-top colosseum: cold night sky through the oculus, and a ruined
  // burning city skyline looming over the rim
  group.add(sky({
    top: '#07060e', mid: '#161022', bottom: '#241423', radius: 185,
    moonDir: new THREE.Vector3(0.3, 0.62, -0.55), moonColor: '#d4dcf0',
    stars: 0.9,
    clouds: { color: '#241a28', shade: '#0e0a12', amount: 0.45, scale: 1.4, speed: 0.7 },
  }))
  const skyline = ridgeRing({ kind: 'citadel', radius: 62, height: 36, y: 6, color: '#2c1e30', seed: 17 })
  group.add(skyline)
  const cityFires = watchFires({ ring: skyline, count: 18, color: '#ff7a3b', size: 4.2, seed: 9 })
  group.add(cityFires)

  // colosseum shell: torchlit arched galleries all around
  const wallMat = pbrMaterial({ color: '#8a7d70', roughness: 1, side: THREE.BackSide, envMapIntensity: 0.04 })
  wallMat.map = wallTexture()
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(28, 30, 26, 40, 1, true), wallMat)
  wall.position.y = 10
  group.add(wall)

  // standing torches ringing the court: wood hafts, iron cups, real flame
  const torchPole = uvScale(new THREE.CylinderGeometry(0.05, 0.075, 3.2, 7), 1, 6)
  const torchCup = new THREE.CylinderGeometry(0.15, 0.08, 0.18, 8)
  const poleMat = woodMaterial('#a88a64')
  const cupMat = ironMaterial('#4a463c')
  for (const [x, z] of [[-8.9, -4], [8.9, -4], [-8.9, 4.5], [8.9, 4.5], [-5, -8.9], [5, -8.9]]) {
    const pole = new THREE.Mesh(torchPole, poleMat)
    pole.position.set(x, 1.6, z)
    pole.castShadow = true
    group.add(pole)
    const cup = new THREE.Mesh(torchCup, cupMat)
    cup.position.set(x, 3.26, z)
    group.add(cup)
    const fl = kit.make(1.05)
    fl.position.set(x, 3.32, z)
    group.add(fl)
    const cs = contactShadow(0.5, 0.42)
    cs.position.set(x, 0.021, z)
    group.add(cs)
  }

  // drifting embers
  const embers = fireflies({ count: 22, area: [26, 22], height: [1.2, 9], color: '#ff9a4d', size: 0.3 })
  group.add(embers)

  // --- lighting: one cool moon key + physical torch falloff, black blacks ---
  group.add(new THREE.HemisphereLight('#2c2840', '#171008', 0.12))
  const moon = new THREE.DirectionalLight('#9fb2d8', 0.28)
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
  moon.shadow.normalBias = 0.02
  group.add(moon, moon.target)

  const torchA = new THREE.PointLight('#ff9a5c', 20, 20, 2)   // hoop end
  torchA.position.set(0, 6.5, -6)
  group.add(torchA)
  const torchB = new THREE.PointLight('#ff8c3b', 13, 24, 2)   // check end
  torchB.position.set(0, 7, 6)
  group.add(torchB)
  const moonBeam = new THREE.SpotLight('#b9c8ea', 26, 50, 0.55, 0.65, 1.8)
  moonBeam.position.set(0, 16, 3)
  moonBeam.target.position.set(0, 0, -1)
  group.add(moonBeam, moonBeam.target)

  // one barely-there drifting haze beam (smoke over the braziers catching light)
  const sweepPivot = new THREE.Group()
  sweepPivot.position.set(0, 14.5, -1)
  const sweep = lightShaft({ color: '#ffbd7a', height: 16, radius: 2.2, opacity: 0.012 })
  sweep.position.y = -8   // hang downward from pivot
  sweep.rotation.x = Math.PI // apex up at pivot
  const sweepArm = new THREE.Group()
  sweepArm.rotation.z = 0.42
  sweepArm.add(sweep)
  sweepPivot.add(sweepArm)
  group.add(sweepPivot)

  // iron fire-ring overhead: dark ring + burning bowls
  const rig = new THREE.Group()
  const rigIron = ironMaterial('#37302a')
  const truss = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.16, 6, 40), rigIron)
  rig.add(truss)
  truss.rotation.x = Math.PI / 2
  const bowlGeo = new THREE.CylinderGeometry(0.16, 0.09, 0.18, 8)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU
    const bowl = new THREE.Mesh(bowlGeo, rigIron)
    bowl.position.set(Math.cos(a) * 7.5, -0.18, Math.sin(a) * 7.5)
    rig.add(bowl)
    const fl = kit.make(0.95)
    fl.position.set(Math.cos(a) * 7.5, -0.12, Math.sin(a) * 7.5)
    rig.add(fl)
  }
  rig.position.y = 14.5
  group.add(rig)

  let t = 0
  let flare = 0, flareT = 0   // match-point flare: braziers + torch pools surge
  return {
    group,
    crowd,
    jumbo,
    netFlare: hoop.netFlare,
    /** MATCH POINT mode: every flame swells, torch pools burn hotter. */
    setMatchPoint(on) {
      flareT = on ? 1 : 0
      kit.setBoost(on ? 1.3 : 1)
    },
    tick(dt) {
      t += dt
      crowd.tick(dt)
      ads.tick(dt)
      hoop.netTick(dt)
      embers.tick(dt)
      kit.tick(t, dt)
      jumbo.tick(dt)
      cityFires.tick(dt)
      sweepPivot.rotation.y = Math.sin(t * 0.18) * 1.4
      flare += (flareT - flare) * Math.min(1, dt * 2)
      hoop.rimGlow.material.opacity = 0.055 + Math.sin(t * 2.6) * 0.02 + flare * 0.05
      // torchlight breathes (hotter when the match hangs on the next basket)
      torchA.intensity = (20 + Math.sin(t * 9.1) * 1.7 + Math.sin(t * 23.7) * 0.9) * (1 + flare * 0.55)
      torchB.intensity = (13 + Math.sin(t * 8.3 + 2) * 1.2 + Math.sin(t * 21.1) * 0.7) * (1 + flare * 0.55)
    },
  }
}
