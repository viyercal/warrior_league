import * as THREE from 'three'
import { skyDome, starField, cloudLayer, crystal, tree, fireflies, lightShaft } from '../../art/environment.js'
import { canvasTexture } from '../../core/assets.js'
import { toonMaterial, glowMaterial, energyMaterial, waterMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { rand, TAU } from '../../core/utils.js'
import { NEXUS_X, TOWER_XS, TOWER_Z, RIVER_ANGLE, TEAMS } from './constants.js'

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
  const m = new THREE.Mesh(geo, toonMaterial({ color, rim: '#cbb8ff', rimStrength: 0.3 }))
  m.scale.setScalar(scale)
  m.position.y = 0.28 * scale
  m.rotation.y = rand(TAU)
  m.castShadow = true
  return m
}

/** Wrap-safe painterly grass texture (blotches drawn with wrap copies — no tiling seams). */
function grassTexture() {
  const tex = canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#276b40'
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
    const cols = ['#3a8a55', '#245c36', '#49a065', '#2f7d54', '#57b06b', '#1f5230']
    for (let i = 0; i < 90; i++) blotch(rand(1024), rand(1024), rand(60, 170), cols[Math.floor(rand(cols.length))], rand(0.1, 0.22))
    for (let i = 0; i < 420; i++) blotch(rand(1024), rand(1024), rand(9, 42), cols[Math.floor(rand(cols.length))], rand(0.12, 0.3))
    // grass flecks
    ctx.globalAlpha = 1
    for (let i = 0; i < 900; i++) {
      const x = rand(1024), y = rand(1024)
      ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(120,220,150,0.16)' : 'rgba(20,70,40,0.18)'
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

/** Dirt lane strip texture with soft alpha edges. */
function laneTexture() {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, 'rgba(134,102,70,0)')
    g.addColorStop(0.18, 'rgba(134,102,70,0.92)')
    g.addColorStop(0.5, 'rgba(148,114,78,0.96)')
    g.addColorStop(0.82, 'rgba(134,102,70,0.92)')
    g.addColorStop(1, 'rgba(134,102,70,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 260; i++) {
      const x = rand(w), y = rand(h * 0.14, h * 0.86), r = rand(6, 26)
      const dark = Math.random() < 0.5
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r)
      rg.addColorStop(0, dark ? 'rgba(96,70,46,0.35)' : 'rgba(178,144,100,0.3)')
      rg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
    }
    // worn wheel tracks
    ctx.strokeStyle = 'rgba(92,66,44,0.28)'
    ctx.lineWidth = 7
    for (const off of [-22, 22]) {
      ctx.beginPath()
      for (let x = 0; x <= w; x += 32) {
        const y = h / 2 + off + Math.sin(x * 0.02) * 6
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
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

function buildBase(scene, tickables, team) {
  const T = TEAMS[team]
  const x = T.sign * NEXUS_X
  const g = new THREE.Group()
  g.position.set(x, 0, 0)

  const plat = new THREE.Mesh(
    new THREE.CylinderGeometry(6.6, 7.6, 0.34, 28),
    toonMaterial({ color: '#3b4157', rim: '#9fb4ff', rimStrength: 0.3 }),
  )
  plat.position.y = 0.17
  plat.receiveShadow = true
  plat.castShadow = true
  g.add(plat)

  const trim = new THREE.Mesh(new THREE.TorusGeometry(6.65, 0.1, 8, 72), glowMaterial(T.color, 1.55))
  trim.rotation.x = Math.PI / 2
  trim.position.y = 0.36
  g.add(trim)

  const inner = new THREE.Mesh(
    new THREE.RingGeometry(3.6, 3.95, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(T.color).multiplyScalar(1.2), transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  )
  inner.rotation.x = -Math.PI / 2
  inner.position.y = 0.37
  g.add(inner)

  // NEXUS crystal
  const nex = crystal({ color1: T.dark, color2: T.color, height: 4.3 })
  nex.position.y = 0.55
  nex.scale.setScalar(1.15)
  g.add(nex)
  tickables.push(nex)

  const light = new THREE.PointLight(T.color, 14, 22, 1.9)
  light.position.set(0, 5, 0)
  g.add(light)


  // team banners around the platform rim
  const flags = []
  const poleMat = toonMaterial({ color: '#2a2f42', rimStrength: 0.2 })
  const flagMat = toonMaterial({ color: T.color, rim: '#ffffff', rimStrength: 0.35, side: THREE.DoubleSide, emissive: T.color, emissiveIntensity: 0.22 })
  for (const a of [0.7, 2.44, -0.7, -2.44]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 3.8, 6), poleMat)
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
  const flagTick = {
    tick: dt => {
      ft += dt
      for (let i = 0; i < flags.length; i++) {
        flags[i].rotation.y = Math.sin(ft * 1.7 + i * 1.3) * 0.28
        flags[i].rotation.z = Math.sin(ft * 2.3 + i) * 0.08
      }
    },
  }
  tickables.push(flagTick)

  scene.add(g)
  const tint = tintDecal(team === 'blue' ? 'rgba(60,180,255,0.5)' : 'rgba(255,90,60,0.5)', 15)
  tint.position.set(x * 0.92, 0.012, 0)
  scene.add(tint)

  return {
    team, x, group: g, nexGroup: nex,
    topPos: new THREE.Vector3(x, 4.6, 0),
    light,
  }
}

function buildTower(scene, tickables, team, tier) {
  const T = TEAMS[team]
  const x = T.sign * TOWER_XS[tier]
  const z = TOWER_Z[tier]
  const g = new THREE.Group()
  g.position.set(x, 0, z)

  const stone = toonMaterial({ color: '#5a5f7e', rim: '#aab8ff', rimStrength: 0.45 })
  const stoneDark = toonMaterial({ color: '#454a66', rim: '#8f9cd0', rimStrength: 0.3 })

  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.6, 0.7, 10), stoneDark)
  base.position.y = 0.35
  base.castShadow = base.receiveShadow = true
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.72, 4.4, 10), stone)
  body.position.y = 2.55
  body.castShadow = true
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.12, 0.62, 10), stoneDark)
  collar.position.y = 4.95
  collar.castShadow = true
  g.add(base, body, collar)

  const trim = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.09, 8, 28), glowMaterial(T.color, 1.8))
  trim.rotation.x = Math.PI / 2
  trim.position.y = 4.62
  g.add(trim)

  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.62, 0),
    energyMaterial({ color1: T.dark, color2: T.color, speed: 1.2 }),
  )
  gem.scale.y = 1.7
  gem.position.y = 6
  g.add(gem)

  const halo = new THREE.Sprite(glowSpriteMaterial(T.color, 0.4))
  halo.scale.setScalar(3.4)
  halo.position.y = 6
  g.add(halo)

  // targeting flare (pulses while the tower aims)
  const aimSpr = new THREE.Sprite(glowSpriteMaterial('#ffffff', 0))
  aimSpr.scale.setScalar(2.2)
  aimSpr.position.y = 6
  g.add(aimSpr)

  // invulnerability shield ring
  const shield = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.07, 8, 40), glowMaterial('#bcd7ff', 1.5))
  shield.rotation.x = Math.PI / 2
  shield.position.y = 0.78
  g.add(shield)

  let t = rand(10)
  tickables.push({
    tick: dt => {
      t += dt
      gem.rotation.y += dt * 0.9
      gem.position.y = 6 + Math.sin(t * 1.5) * 0.18
      halo.position.y = gem.position.y
      aimSpr.position.y = gem.position.y
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
 * Builds the whole Rift into `scene`.
 * Returns { tickables, towerDefs, nexusDefs } — caller ticks tickables each frame.
 */
export function buildMap(scene) {
  const tickables = []

  // ---------- dusk sky ----------
  scene.fog = new THREE.Fog('#48386b', 46, 165)
  scene.add(skyDome({
    top: '#1a1c4d', mid: '#7a4b9e', bottom: '#ff9a5e', radius: 470,
    sunDir: new THREE.Vector3(-0.55, 0.14, -0.4), sunColor: '#ffb36b', sunSize: 42,
  }))
  scene.add(starField({ count: 340, size: 2, radius: 430 }))
  const cl1 = cloudLayer({ count: 9, radius: 250, height: [55, 110], color: '#ffb9d9', opacity: 0.4, scale: [60, 120] })
  const cl2 = cloudLayer({ count: 7, radius: 220, height: [35, 80], color: '#8fa6ff', opacity: 0.3, scale: [55, 100] })
  scene.add(cl1, cl2)
  tickables.push(cl1, cl2)

  // ---------- ground + lane + river ----------
  const gtex = grassTexture()
  gtex.repeat.set(5, 3)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(170, 100),
    new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.95, metalness: 0 }),
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
  const river = new THREE.Mesh(riverGeo, waterMaterial({ shallow: '#38bdb2', deep: '#124a80', opacity: 0.42, speed: 1.1 }))
  river.rotation.y = RIVER_ANGLE
  river.position.y = 0.055
  scene.add(river)
  // darker river bed under the water so the grass doesn't glow through
  const bedGeo = new THREE.PlaneGeometry(10.2, 73)
  bedGeo.rotateX(-Math.PI / 2)
  const bed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ color: '#173a4a', roughness: 0.9 }))
  bed.rotation.y = RIVER_ANGLE
  bed.position.y = 0.035
  bed.receiveShadow = true
  scene.add(bed)

  const riverGlow = fireflies({ count: 14, area: [8, 60], height: [0.35, 2.2], color: '#8ff4ff', size: 0.36 })
  riverGlow.rotation.y = RIVER_ANGLE
  scene.add(riverGlow)
  tickables.push(riverGlow)

  const riverLight = new THREE.PointLight('#4fd8e8', 10, 22, 1.9)
  riverLight.position.set(0, 3, 0)
  scene.add(riverLight)

  const moths = fireflies({ count: 34, area: [95, 38], height: [0.6, 5], color: '#ffe27a', size: 0.5 })
  scene.add(moths)
  tickables.push(moths)

  // ---------- forest framing the lane ----------
  const templates = {
    west: [tree({ leaves: '#2f9f5f' }), tree({ leaves: '#3db06e' }), tree({ leaves: '#279257' })],
    east: [tree({ leaves: '#c06a3a' }), tree({ leaves: '#a84f3f' }), tree({ leaves: '#c98a3c' })],
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

  // underbrush: cheap leaf-blob bushes sharing two materials
  const bushMats = [
    toonMaterial({ color: '#2b8a50', rim: '#c9ffd8', rimStrength: 0.3 }),
    toonMaterial({ color: '#b0623a', rim: '#ffd9c0', rimStrength: 0.3 }),
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
    const rk = flatRock(Math.random() < 0.5 ? '#8b93a7' : '#7a8296', rand(0.7, 1.6))
    rk.position.set(x, 0.2, z)
    scene.add(rk)
  }

  // ambient crystals
  const crysSpots = [
    [-14, 9, 'blue'], [16, -9.5, 'red'], [-30, -8.5, 'blue'], [32, 8.5, 'red'], [-8, 16, 'blue'],
  ]
  for (const [cx, cz, tm] of crysSpots) {
    const T = TEAMS[tm]
    const c = crystal({ color1: T.dark, color2: T.color, height: rand(1.9, 2.8) })
    c.position.set(cx, 0, cz)
    scene.add(c)
    tickables.push(c)
  }

  // ---------- structures ----------
  const nexusDefs = { blue: buildBase(scene, tickables, 'blue'), red: buildBase(scene, tickables, 'red') }
  const towerDefs = [
    buildTower(scene, tickables, 'blue', 0), buildTower(scene, tickables, 'blue', 1),
    buildTower(scene, tickables, 'red', 0), buildTower(scene, tickables, 'red', 1),
  ]

  // ---------- lighting ----------
  scene.add(new THREE.HemisphereLight('#8f9fe0', '#2f4a38', 0.62))
  const dir = new THREE.DirectionalLight('#ffd9ae', 1.95)
  dir.position.set(30, 26, 16)
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
