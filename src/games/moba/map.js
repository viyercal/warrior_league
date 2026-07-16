import * as THREE from 'three'
import { skyDome, starField, cloudLayer, crystal, fireflies } from '../../art/environment.js'
import { canvasTexture } from '../../core/assets.js'
import { toonMaterial, glowMaterial, waterMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { rand, TAU } from '../../core/utils.js'
import { NEXUS_X, TOWER_XS, TOWER_Z, RIVER_ANGLE, TEAMS } from './constants.js'

/* ============================================================
 * WAR RIFT — a war-torn battlefield lane at storm-dusk.
 * Mud + trampled grass, wooden palisades, stone watchtowers,
 * war-crystal shrines, torch posts, banners, tents, ember air.
 * ============================================================ */

// banner cloth: deep dyed fabric per team
const CLOTH = { blue: '#3d6a94', red: '#8f1f26' }

// team flame tints (firelight, not neon): red = ember, blue = cold blue-white
const FLAME = {
  red: { outer: '#ff8c3b', inner: '#ffd9a0', halo: '#ff8c3b' },
  blue: { outer: '#7fb2dc', inner: '#cfe8f8', halo: '#8fbcd8' },
}

// shared materials for repeated props
const WOOD = toonMaterial({ color: '#3a2c20', rim: '#c9a578', rimStrength: 0.25 })
const WOOD_DK = toonMaterial({ color: '#2e211a', rim: '#a8886a', rimStrength: 0.2 })
const IRON = toonMaterial({ color: '#3f4148', rim: '#b9b2a2', rimStrength: 0.35 })
const STONE = toonMaterial({ color: '#4f4a40', rim: '#d8c8a0', rimStrength: 0.3 })
const STONE_DK = toonMaterial({ color: '#3a352c', rim: '#b8a888', rimStrength: 0.28 })

/** Bake flat facet normals (toonMaterial's rim shader breaks with material.flatShading). */
function facet(geo) {
  const g = geo.toNonIndexed()
  g.computeVertexNormals()
  return g
}
const LEATHER = toonMaterial({ color: '#4a352a', rim: '#c9a578', rimStrength: 0.3 })
const LEATHER_DK = toonMaterial({ color: '#3b2a20', rim: '#a8886a', rimStrength: 0.25 })
const BONE = toonMaterial({ color: '#e8dcc4', rimStrength: 0.3 })

/** Low-poly rock with baked flat normals (shared rock() flatShading fights the rim shader). */
function flatRock(color, scale) {
  let geo = new THREE.IcosahedronGeometry(0.55, 0)
  const p = geo.attributes.position
  const seed = rand(100)
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + 0.5 * Math.abs(Math.sin(p.getX(i) * 12.9 + p.getY(i) * 7.1 + p.getZ(i) * 3.7 + seed))
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k)
  }
  geo = geo.toNonIndexed()
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, toonMaterial({ color, rim: '#d8c8a0', rimStrength: 0.3 }))
  m.scale.setScalar(scale)
  m.position.y = 0.28 * scale
  m.rotation.y = rand(TAU)
  m.castShadow = true
  return m
}

/** Wrap-safe painterly churned-battlefield texture (mud + trampled dead grass). */
function battlegroundTexture() {
  const tex = canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#38301f'
    ctx.fillRect(0, 0, w, h)
    const blotch = (x, y, r, col, a) => {
      const xs = [0]
      const ys = [0]
      if (x < r) xs.push(w); else if (x > w - r) xs.push(-w)
      if (y < r) ys.push(h); else if (y > h - r) ys.push(-h)
      for (const ox of xs) {
        for (const oy of ys) {
          const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r)
          g.addColorStop(0, col)
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.globalAlpha = a
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(x + ox, y + oy, r, 0, TAU)
          ctx.fill()
        }
      }
    }
    // muddy earth + surviving olive grass + scorched patches
    const cols = ['#4a4028', '#2f281c', '#55492c', '#4a352a', '#5c5432', '#262117', '#403626']
    for (let i = 0; i < 90; i++) blotch(rand(1024), rand(1024), rand(60, 170), cols[Math.floor(rand(cols.length))], rand(0.12, 0.24))
    for (let i = 0; i < 420; i++) blotch(rand(1024), rand(1024), rand(9, 42), cols[Math.floor(rand(cols.length))], rand(0.12, 0.3))
    // dead-grass flecks
    ctx.globalAlpha = 1
    for (let i = 0; i < 900; i++) {
      const x = rand(1024), y = rand(1024)
      ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(168,148,94,0.15)' : 'rgba(24,18,12,0.2)'
      ctx.lineWidth = rand(1, 2.2)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + rand(-3, 3), y - rand(3, 7))
      ctx.stroke()
    }
  })
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** Churned mud lane strip with soft alpha edges, wheel ruts and boot scars. */
function laneTexture() {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, 'rgba(66,48,34,0)')
    g.addColorStop(0.18, 'rgba(66,48,34,0.92)')
    g.addColorStop(0.5, 'rgba(78,58,40,0.96)')
    g.addColorStop(0.82, 'rgba(66,48,34,0.92)')
    g.addColorStop(1, 'rgba(66,48,34,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 260; i++) {
      const x = rand(w), y = rand(h * 0.14, h * 0.86), r = rand(6, 26)
      const dark = Math.random() < 0.55
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r)
      rg.addColorStop(0, dark ? 'rgba(34,24,16,0.4)' : 'rgba(110,84,56,0.3)')
      rg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
    }
    // deep chariot ruts
    ctx.strokeStyle = 'rgba(24,16,10,0.4)'
    ctx.lineWidth = 7
    for (const off of [-22, 22]) {
      ctx.beginPath()
      for (let x = 0; x <= w; x += 32) {
        const y = h / 2 + off + Math.sin(x * 0.02) * 6
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    // boot scars
    ctx.fillStyle = 'rgba(20,14,9,0.3)'
    for (let i = 0; i < 130; i++) {
      const x = rand(w), y = rand(h * 0.2, h * 0.8)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rand(TAU))
      ctx.fillRect(-3, -1.4, 6, 2.8)
      ctx.restore()
    }
  })
}

/** Soft radial team-tint decal. */
function tintDecal(color, radius) {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.3, depthWrite: false }),
  )
  m.rotation.x = -Math.PI / 2
  return m
}

// ============================== fire ==============================

/**
 * Twin-cone torch flame + halo sprite. Returns { group, flick } —
 * push flick into a shared flicker tickable list.
 */
function flame(team, scale = 1) {
  const F = FLAME[team] || FLAME.red
  const group = new THREE.Group()
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.68, 8), glowMaterial(F.outer, 1.4))
  outer.position.y = 0.26
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.4, 8), glowMaterial(F.inner, 1.55))
  inner.position.y = 0.18
  const halo = new THREE.Sprite(glowSpriteMaterial(F.halo, 0.3))
  halo.scale.setScalar(1.1)
  halo.position.y = 0.3
  group.add(outer, inner, halo)
  group.scale.setScalar(scale)
  return { group, flick: { outer, inner, halo, phase: rand(TAU), baseOp: 0.3 } }
}

/** One tickable animating every flame in the scene (cheap flicker). */
function flameTicker(flicks) {
  let t = rand(10)
  return {
    tick: dt => {
      t += dt
      for (const f of flicks) {
        const k = 0.82 + 0.18 * Math.sin(t * 11 + f.phase) * Math.sin(t * 5.3 + f.phase * 2)
        f.outer.scale.set(1, k, 1)
        f.inner.scale.set(1, 0.7 + 0.3 * k, 1)
        f.halo.material.opacity = f.baseOp * (0.75 + 0.35 * k)
      }
    },
  }
}

/** Wooden torch post with an iron cup and live flame. */
function torchPost(flicks, team = 'red') {
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.5, 6), WOOD)
  pole.position.y = 1.25
  pole.castShadow = true
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.12, 0.24, 7), IRON)
  cup.position.y = 2.58
  const f = flame(team, 1)
  f.group.position.y = 2.68
  flicks.push(f.flick)
  g.add(pole, cup, f.group)
  return g
}

// ============================== battlefield props ==============================

/** Stylized pine: dark stacked cones on a bare trunk. */
function pine() {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.2, 6), WOOD_DK)
  trunk.position.y = 0.6
  trunk.castShadow = true
  g.add(trunk)
  const lm = toonMaterial({ color: '#24402a', rim: '#a8c890', rimStrength: 0.25 })
  const tiers = [[1.4, 1.05, 1.3], [2.3, 0.8, 1.1], [3.1, 0.55, 0.9]]
  for (const [y, r, h] of tiers) {
    const c = new THREE.Mesh(facet(new THREE.ConeGeometry(r, h, 7)), lm)
    c.position.y = y
    c.castShadow = true
    g.add(c)
  }
  return g
}

/** Dead oak: bare trunk with clawed branches — a burnt battlefield silhouette. */
function deadOak() {
  const g = new THREE.Group()
  const bark = toonMaterial({ color: '#392e22', rim: '#b89878', rimStrength: 0.3 })
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, 2, 6), bark)
  trunk.position.y = 1
  trunk.rotation.z = rand(-0.08, 0.08)
  trunk.castShadow = true
  g.add(trunk)
  const nb = 3 + Math.floor(rand(3))
  for (let i = 0; i < nb; i++) {
    const len = rand(0.9, 1.7)
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.085, len, 5), bark)
    const a = (i / nb) * TAU + rand(0.6)
    b.position.set(Math.cos(a) * 0.16, rand(1.5, 2), Math.sin(a) * 0.16)
    b.rotation.set(Math.sin(a) * rand(0.6, 1.1), 0, Math.cos(a) * rand(0.6, 1.1))
    b.translateY(len / 2)
    b.castShadow = true
    g.add(b)
    if (Math.random() < 0.7) {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, len * 0.55, 4), bark)
      tw.position.copy(b.position)
      tw.rotation.set(b.rotation.x + rand(-0.7, 0.7), rand(TAU), b.rotation.z + rand(-0.7, 0.7))
      tw.translateY(len * 0.28)
      g.add(tw)
    }
  }
  return g
}

/** Sharpened wooden palisade segment (a few leaning stakes lashed together). */
function palisade(count = 6) {
  const g = new THREE.Group()
  for (let i = 0; i < count; i++) {
    const h = rand(1.5, 2.1)
    const stake = new THREE.Group()
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, h, 6), Math.random() < 0.5 ? WOOD : WOOD_DK)
    shaft.position.y = h / 2
    shaft.castShadow = true
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 6), WOOD_DK)
    tip.position.y = h + 0.14
    tip.castShadow = true
    stake.add(shaft, tip)
    stake.position.x = (i - count / 2) * 0.42 + rand(-0.06, 0.06)
    stake.rotation.z = rand(-0.1, 0.1)
    stake.rotation.x = rand(-0.16, 0.05)
    g.add(stake)
  }
  // lashing beam
  const beam = new THREE.Mesh(new THREE.BoxGeometry(count * 0.42, 0.09, 0.09), WOOD_DK)
  beam.position.y = 1.1
  beam.rotation.z = rand(-0.04, 0.04)
  g.add(beam)
  return g
}

/** War tent: leather pyramid + pole, with a small pennant. */
function tent(team) {
  const T = TEAMS[team]
  const g = new THREE.Group()
  const canvas = new THREE.Mesh(facet(new THREE.ConeGeometry(1.5, 1.7, 5)), Math.random() < 0.5 ? LEATHER : LEATHER_DK)
  canvas.position.y = 0.85
  canvas.rotation.y = rand(TAU)
  canvas.castShadow = true
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 5), WOOD_DK)
  pole.position.y = 2
  const pennant = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.3),
    toonMaterial({ color: CLOTH[team], side: THREE.DoubleSide, emissive: CLOTH[team], emissiveIntensity: 0.15 }),
  )
  pennant.position.set(0.28, 2.28, 0)
  g.add(canvas, pole, pennant)
  g.userData.pennant = pennant
  return g
}

/** Tall war banner: wooden pole, crossbar, hanging team cloth. Returns cloth for the sway tick. */
function warBanner(team, cloths) {
  const T = TEAMS[team]
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 3.6, 6), WOOD)
  pole.position.y = 1.8
  pole.castShadow = true
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.08), WOOD_DK)
  bar.position.y = 3.42
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 1.7),
    toonMaterial({ color: CLOTH[team], rim: '#ffe6c8', rimStrength: 0.3, side: THREE.DoubleSide, emissive: CLOTH[team], emissiveIntensity: 0.22 }),
  )
  cloth.position.set(0, 2.52, 0)
  cloth.userData.phase = rand(TAU)
  cloths.push(cloth)
  // bone finial
  const skullish = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), BONE)
  skullish.position.y = 3.68
  g.add(pole, bar, cloth, skullish)
  return g
}

/** Rune monolith: hewn standing stone with an ember rune-strip in team flame color. */
function runeStone(team, h = 2.2) {
  const F = FLAME[team] || FLAME.red
  const g = new THREE.Group()
  const stone = new THREE.Mesh(new THREE.BoxGeometry(0.72, h, 0.5), STONE_DK)
  stone.position.y = h / 2
  stone.rotation.set(rand(-0.06, 0.06), rand(TAU), rand(-0.08, 0.08))
  stone.castShadow = true
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.16, h * 0.62), glowMaterial(F.outer, 1.35))
  rune.position.set(0, h * 0.52, 0.26)
  stone.add(rune)
  const rune2 = rune.clone()
  rune2.position.z = -0.26
  rune2.rotation.y = Math.PI
  stone.add(rune2)
  g.add(stone)
  return g
}

/** Cluster of river reeds with cattail heads. */
function reedClump() {
  const g = new THREE.Group()
  const reedMat = toonMaterial({ color: '#465532', rim: '#c8d89a', rimStrength: 0.35 })
  const n = 4 + Math.floor(rand(4))
  for (let i = 0; i < n; i++) {
    const h = rand(0.7, 1.35)
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, h, 4), reedMat)
    blade.position.set(rand(-0.22, 0.22), h / 2, rand(-0.22, 0.22))
    blade.rotation.set(rand(-0.18, 0.18), 0, rand(-0.18, 0.18))
    g.add(blade)
    if (Math.random() < 0.45) {
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 5), LEATHER_DK)
      tail.position.copy(blade.position)
      tail.position.y = h + 0.08
      tail.rotation.copy(blade.rotation)
      g.add(tail)
    }
  }
  return g
}

// ============================== bases + towers ==============================

function buildBase(scene, tickables, flicks, cloths, team) {
  const T = TEAMS[team]
  const F = FLAME[team]
  const x = T.sign * NEXUS_X
  const g = new THREE.Group()
  g.position.set(x, 0, 0)

  // two-step hewn stone shrine platform
  const plat = new THREE.Mesh(facet(new THREE.CylinderGeometry(6.9, 7.7, 0.42, 8)), STONE_DK)
  plat.position.y = 0.21
  plat.rotation.y = Math.PI / 8
  plat.receiveShadow = true
  plat.castShadow = true
  const step = new THREE.Mesh(facet(new THREE.CylinderGeometry(4.9, 5.6, 0.44, 8)), STONE)
  step.position.y = 0.62
  step.receiveShadow = true
  step.castShadow = true
  g.add(plat, step)

  // aged-bronze trim ring catching the firelight
  const trim = new THREE.Mesh(new THREE.TorusGeometry(6.75, 0.09, 8, 48), glowMaterial('#b0793a', 1.05))
  trim.rotation.x = Math.PI / 2
  trim.position.y = 0.44
  g.add(trim)

  // ember rune ring around the shrine heart
  const inner = new THREE.Mesh(
    new THREE.RingGeometry(3.6, 3.95, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(F.outer).multiplyScalar(1.1), transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  )
  inner.rotation.x = -Math.PI / 2
  inner.position.y = 0.86
  g.add(inner)

  // WAR CRYSTAL on a stone plinth
  const plinth = new THREE.Mesh(facet(new THREE.CylinderGeometry(1.25, 1.65, 0.85, 8)), STONE)
  plinth.position.y = 1.2
  plinth.castShadow = true
  g.add(plinth)
  const nex = crystal({ color1: T.dark, color2: T.color, height: 4.1 })
  nex.position.y = 1.55
  nex.scale.setScalar(1.12)
  g.add(nex)
  tickables.push(nex)

  // four shrine pillars with team-flame braziers
  for (const a of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4]) {
    const px = Math.cos(a) * 3.4, pz = Math.sin(a) * 3.4
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.5, 0.6), STONE)
    pil.position.set(px, 2.05, pz)
    pil.castShadow = true
    g.add(pil)
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.28, 7), IRON)
    cup.position.set(px, 3.42, pz)
    g.add(cup)
    const f = flame(team, 1.5)
    f.group.position.set(px, 3.5, pz)
    flicks.push(f.flick)
    g.add(f.group)
  }

  // firelight
  const light = new THREE.PointLight(F.outer, team === 'red' ? 12 : 9, 24, 1.9)
  light.position.set(0, 5, 0)
  g.add(light)

  // war banners around the platform rim
  const flags = []
  const flagMat = toonMaterial({ color: CLOTH[team], rim: '#ffe6c8', rimStrength: 0.35, side: THREE.DoubleSide, emissive: CLOTH[team], emissiveIntensity: 0.22 })
  for (const a of [0.7, 2.44, -0.7, -2.44]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 3.8, 6), WOOD)
    pole.position.set(Math.cos(a) * 6.1, 2.2, Math.sin(a) * 6.1)
    pole.castShadow = true
    g.add(pole)
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), flagMat)
    flag.position.set(Math.cos(a) * 6.1 + 0.75, 3.6, Math.sin(a) * 6.1)
    flag.userData.baseYaw = rand(TAU)
    g.add(flag)
    flags.push(flag)
  }
  let ft = rand(10)
  tickables.push({
    tick: dt => {
      ft += dt
      for (let i = 0; i < flags.length; i++) {
        flags[i].rotation.y = Math.sin(ft * 1.7 + i * 1.3) * 0.28
        flags[i].rotation.z = Math.sin(ft * 2.3 + i) * 0.08
      }
    },
  })

  scene.add(g)
  const tint = tintDecal(team === 'blue' ? 'rgba(120,160,200,0.45)' : 'rgba(210,80,40,0.5)', 15)
  tint.position.set(x * 0.92, 0.012, 0)
  scene.add(tint)

  return {
    team, x, group: g, nexGroup: nex,
    topPos: new THREE.Vector3(x, 4.6, 0),
    light,
  }
}

function buildTower(scene, tickables, flicks, team, tier) {
  const T = TEAMS[team]
  const F = FLAME[team]
  const x = T.sign * TOWER_XS[tier]
  const z = TOWER_Z[tier]
  const g = new THREE.Group()
  g.position.set(x, 0, z)

  // hewn stone watchtower
  const base = new THREE.Mesh(facet(new THREE.CylinderGeometry(2.15, 2.6, 0.7, 8)), STONE_DK)
  base.position.y = 0.35
  base.castShadow = base.receiveShadow = true
  const body = new THREE.Mesh(facet(new THREE.CylinderGeometry(1.02, 1.72, 4.4, 8)), STONE)
  body.position.y = 2.55
  body.castShadow = true
  const collar = new THREE.Mesh(facet(new THREE.CylinderGeometry(1.42, 1.12, 0.62, 8)), STONE_DK)
  collar.position.y = 4.95
  collar.castShadow = true
  g.add(base, body, collar)

  // crenellated battlement
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.24), STONE)
    c.position.set(Math.cos(a) * 1.28, 5.4, Math.sin(a) * 1.28)
    c.rotation.y = -a
    c.castShadow = true
    g.add(c)
  }

  // bronze trim band
  const trim = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.09, 8, 28), glowMaterial('#b0793a', 1.05))
  trim.rotation.x = Math.PI / 2
  trim.position.y = 4.62
  g.add(trim)

  // signal brazier crowning the tower (the tower's "eye")
  const gem = new THREE.Group()
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.4, 0.34, 8), IRON)
  const f = flame(team, 2.1)
  f.group.position.y = 0.16
  flicks.push(f.flick)
  gem.add(bowl, f.group)
  gem.position.y = 5.85
  g.add(gem)

  const halo = new THREE.Sprite(glowSpriteMaterial(F.halo, 0.24))
  halo.scale.setScalar(2.6)
  halo.position.y = 6.1
  g.add(halo)

  // targeting flare (pulses while the tower aims)
  const aimSpr = new THREE.Sprite(glowSpriteMaterial('#ffffff', 0))
  aimSpr.scale.setScalar(2.2)
  aimSpr.position.y = 6.1
  g.add(aimSpr)

  // invulnerability ward ring — pale bone-gold runes
  const shield = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.07, 8, 40), glowMaterial('#d8cfae', 0.95))
  shield.rotation.x = Math.PI / 2
  shield.position.y = 0.78
  g.add(shield)

  // defensive stake ring around the foot
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rand(0.2)
    const h = rand(1, 1.4)
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.1, h, 5), WOOD_DK)
    stake.position.set(Math.cos(a) * 2.85, h * 0.42, Math.sin(a) * 2.85)
    stake.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55)
    stake.castShadow = true
    g.add(stake)
  }

  let t = rand(10)
  tickables.push({
    tick: dt => {
      t += dt
      gem.position.y = 5.85 + Math.sin(t * 1.5) * 0.12
      halo.position.y = gem.position.y + 0.35
      aimSpr.position.y = gem.position.y + 0.35
    },
  })

  scene.add(g)
  return {
    team, tier, x, z, group: g,
    topPos: new THREE.Vector3(x, 5.9, z),
    aimSpr, halo, shield, trimMesh: trim, gem,
  }
}

/** Distance from point (x,z) to the river center line through origin. */
export function riverDist(x, z) {
  const dx = Math.sin(RIVER_ANGLE), dz = Math.cos(RIVER_ANGLE)
  return Math.abs(x * dz - z * dx)
}

/**
 * Builds the whole war-torn Rift into `scene`.
 * Returns { tickables, towerDefs, nexusDefs } — caller ticks tickables each frame.
 */
export function buildMap(scene) {
  const tickables = []
  const flicks = [] // every torch/brazier flame, one shared ticker
  const cloths = [] // war-banner cloths, one shared sway ticker

  // ---------- storm-dusk sky in umber + indigo ----------
  scene.fog = new THREE.Fog('#241a20', 44, 155)
  scene.add(skyDome({
    top: '#1a1420', mid: '#3a2030', bottom: '#8a4022', radius: 470,
    sunDir: new THREE.Vector3(-0.55, 0.12, -0.4), sunColor: '#ff8c3b', sunSize: 30,
  }))
  scene.add(starField({ count: 240, size: 1.8, radius: 430, color: '#cfc4b0' }))
  const cl1 = cloudLayer({ count: 9, radius: 250, height: [55, 110], color: '#4a3242', opacity: 0.5, scale: [60, 120] })
  const cl2 = cloudLayer({ count: 7, radius: 220, height: [35, 80], color: '#2a1e28', opacity: 0.42, scale: [55, 100] })
  scene.add(cl1, cl2)
  tickables.push(cl1, cl2)

  // ---------- churned battlefield ground + mud lane + dark river ----------
  const gtex = battlegroundTexture()
  gtex.repeat.set(5, 3)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(170, 100),
    new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.98, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(102, 11.4),
    new THREE.MeshStandardMaterial({ map: laneTexture(), transparent: true, roughness: 1, metalness: 0, depthWrite: false }),
  )
  lane.rotation.x = -Math.PI / 2
  lane.position.y = 0.02
  lane.receiveShadow = true
  scene.add(lane)

  const riverGeo = new THREE.PlaneGeometry(9, 72)
  riverGeo.rotateX(-Math.PI / 2)
  const river = new THREE.Mesh(riverGeo, waterMaterial({ shallow: '#3a5c4e', deep: '#0e1a1e', opacity: 0.26, speed: 0.65 }))
  river.rotation.y = RIVER_ANGLE
  river.position.y = 0.055
  scene.add(river)
  // dark silt bed under the water so the mud doesn't glow through
  const bedGeo = new THREE.PlaneGeometry(10.2, 73)
  bedGeo.rotateX(-Math.PI / 2)
  const bed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ color: '#10140f', roughness: 0.95 }))
  bed.rotation.y = RIVER_ANGLE
  bed.position.y = 0.035
  bed.receiveShadow = true
  scene.add(bed)

  // reed banks along the stream
  const cosA = Math.cos(RIVER_ANGLE), sinA = Math.sin(RIVER_ANGLE)
  for (let v = -30; v <= 30; v += 2.6) {
    for (const s of [-1, 1]) {
      if (Math.random() < 0.3) continue
      const u = s * rand(4.7, 6.3)
      const wx = u * cosA + v * sinA
      const wz = -u * sinA + v * cosA
      if (Math.abs(wx) > 50 || Math.abs(wz) > 20) continue
      if (Math.abs(wz) < 4.5 && Math.random() < 0.65) continue // keep the mid crossing readable
      const r = reedClump()
      r.position.set(wx + rand(-0.5, 0.5), 0, wz + rand(-0.5, 0.5))
      r.rotation.y = rand(TAU)
      scene.add(r)
    }
  }

  // pale marsh-motes over the water (cold, faint — not neon)
  const riverGlow = fireflies({ count: 10, area: [7, 56], height: [0.35, 1.8], color: '#a8c4b8', size: 0.28 })
  riverGlow.rotation.y = RIVER_ANGLE
  scene.add(riverGlow)
  tickables.push(riverGlow)

  const riverLight = new THREE.PointLight('#5a7a72', 5, 18, 1.9)
  riverLight.position.set(0, 2.5, 0)
  scene.add(riverLight)

  // drifting embers over the battlefield
  const embers = fireflies({ count: 32, area: [95, 34], height: [0.6, 5], color: '#ff8c3b', size: 0.42 })
  scene.add(embers)
  tickables.push(embers)

  // ---------- forest framing the lane: pines west, dead oaks east ----------
  const templates = {
    west: [pine(), pine(), deadOak()],
    east: [deadOak(), deadOak(), pine()],
  }
  const forest = new THREE.Group()
  const place = (x, z, big) => {
    if (riverDist(x, z) < 8.5 || Math.abs(x) > 57 || Math.abs(z) > 34) return
    const side = x < -4 ? 'west' : x > 4 ? 'east' : (Math.random() < 0.5 ? 'west' : 'east')
    const t = templates[side][Math.floor(rand(3))].clone()
    t.position.set(x, 0, z)
    t.rotation.y = rand(TAU)
    t.scale.setScalar(rand(0.85, 1.25) * (big ? 1.5 : 1))
    forest.add(t)
  }
  for (let x = -52; x <= 52; x += 4.2) {
    for (const zs of [-1, 1]) {
      if (Math.random() < 0.92) place(x + rand(-1.6, 1.6), zs * rand(8.6, 12.5), false)
      if (Math.random() < 0.8) place(x + rand(-2, 2), zs * rand(13.5, 19), Math.random() < 0.6)
      if (Math.random() < 0.85) place(x + rand(-2, 2), zs * rand(19.5, 30), true)
    }
  }
  scene.add(forest)

  // underbrush: moor scrub + dead bracken sharing two materials
  const bushMats = [
    toonMaterial({ color: '#3f4426', rim: '#c8c890', rimStrength: 0.28 }),
    toonMaterial({ color: '#4a3222', rim: '#d8a878', rimStrength: 0.28 }),
  ]
  const bushGeo = new THREE.SphereGeometry(0.55, 9, 7)
  const bushes = new THREE.Group()
  for (let i = 0; i < 60; i++) {
    const x = rand(-52, 52)
    const z = (Math.random() < 0.5 ? -1 : 1) * rand(6.6, 22)
    if (riverDist(x, z) < 7.5) continue
    const b = new THREE.Mesh(bushGeo, bushMats[x > 4 ? 1 : 0])
    b.position.set(x, 0.28, z)
    b.scale.set(rand(0.7, 1.5), rand(0.5, 0.85), rand(0.7, 1.5))
    b.rotation.y = rand(TAU)
    b.castShadow = true
    bushes.add(b)
  }
  scene.add(bushes)

  // rocks near lane edges + river banks
  for (let i = 0; i < 14; i++) {
    const x = rand(-44, 44)
    const z = (Math.random() < 0.5 ? -1 : 1) * rand(6.8, 9.5)
    if (riverDist(x, z) < 7) continue
    const rk = flatRock(Math.random() < 0.5 ? '#5c564c' : '#4a4540', rand(0.7, 1.6))
    rk.position.set(x, 0.2, z)
    scene.add(rk)
  }

  // ---------- war-camp dressing: torches, palisades, banners, tents ----------
  for (let x = -46; x <= 46; x += 11.5) {
    for (const s of [-1, 1]) {
      const tx = x + rand(-1, 1), tz = s * rand(6.6, 7.2)
      if (riverDist(tx, tz) < 7.5) continue
      const tp = torchPost(flicks, tx < 0 ? 'blue' : 'red')
      tp.position.set(tx, 0, tz)
      tp.rotation.y = rand(TAU)
      scene.add(tp)
    }
  }
  for (const [px, pzs] of [[-33, 1], [-19, -1], [21, 1], [35, -1], [-41, -1], [43, 1]]) {
    const pz = pzs * rand(6.4, 7)
    if (riverDist(px, pz) < 8) continue
    const pal = palisade(5 + Math.floor(rand(3)))
    pal.position.set(px, 0, pz)
    pal.rotation.y = rand(-0.25, 0.25)
    scene.add(pal)
  }
  for (const [bx, bz] of [[-24, 7.4], [-12, -7.4], [14, -7.4], [27, 7.4]]) {
    if (riverDist(bx, bz) < 8) continue
    const wb = warBanner(bx < 0 ? 'blue' : 'red', cloths)
    wb.position.set(bx, 0, bz)
    wb.rotation.y = rand(TAU)
    scene.add(wb)
  }
  for (const [tx, tz, team] of [[-38, 11, 'blue'], [-43, -12, 'blue'], [39, -11, 'red'], [44, 12, 'red']]) {
    const t = tent(team)
    t.position.set(tx, 0, tz)
    scene.add(t)
    cloths.push(t.userData.pennant)
  }

  // rune monoliths where ley-crystals once stood
  const runeSpots = [
    [-14, 9, 'blue'], [16, -9.5, 'red'], [-30, -8.5, 'blue'], [32, 8.5, 'red'], [-8, 16, 'blue'],
  ]
  for (const [cx, cz, tm] of runeSpots) {
    const rs = runeStone(tm, rand(1.9, 2.6))
    rs.position.set(cx, 0, cz)
    scene.add(rs)
  }

  // one shared flicker + one shared cloth sway
  tickables.push(flameTicker(flicks))
  let ct = rand(10)
  tickables.push({
    tick: dt => {
      ct += dt
      for (const c of cloths) {
        c.rotation.y = Math.sin(ct * 1.6 + c.userData.phase) * 0.24
        c.rotation.z = Math.sin(ct * 2.4 + c.userData.phase * 1.7) * 0.07
      }
    },
  })

  // ---------- structures ----------
  const nexusDefs = { blue: buildBase(scene, tickables, flicks, cloths, 'blue'), red: buildBase(scene, tickables, flicks, cloths, 'red') }
  const towerDefs = [
    buildTower(scene, tickables, flicks, 'blue', 0), buildTower(scene, tickables, flicks, 'blue', 1),
    buildTower(scene, tickables, flicks, 'red', 0), buildTower(scene, tickables, flicks, 'red', 1),
  ]

  // ---------- lighting: low ember sun + cold night bounce ----------
  scene.add(new THREE.HemisphereLight('#5a4a58', '#241d16', 0.5))
  const dir = new THREE.DirectionalLight('#ffa055', 1.45)
  dir.position.set(30, 24, 16)
  dir.castShadow = true
  dir.shadow.mapSize.set(2048, 2048)
  dir.shadow.camera.left = -60
  dir.shadow.camera.right = 60
  dir.shadow.camera.top = 34
  dir.shadow.camera.bottom = -34
  dir.shadow.camera.near = 8
  dir.shadow.camera.far = 95
  dir.shadow.bias = -0.0004
  scene.add(dir)

  return { tickables, towerDefs, nexusDefs }
}
