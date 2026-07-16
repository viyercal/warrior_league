import * as THREE from 'three'
import { toonMaterial, glowMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { createHero, createMinion } from '../../art/characterFactory.js'

/**
 * Per-scene factory sharing wheel/frame geometry between all six war chariots.
 * buildKart() → visual handle; chariot forward = local +Z, origin at ground.
 * Handle contract (kartScene depends on it): group, body, wheelSpins[4]
 * (0-1 front, 2-3 rear), frontSteer, exhausts, spoiler, hero, minion, under,
 * poseDriver(dt, {speed, steer}), setGhost(on).
 */
export function createKartFactory() {
  // wheels: big spoked wood-and-iron
  const rimGeo = new THREE.TorusGeometry(0.44, 0.06, 8, 18)
  const bandGeo = new THREE.TorusGeometry(0.5, 0.025, 6, 18)
  const spokeGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.82, 5)
  const hubGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.2, 8)
  // frame
  const floorGeo = new THREE.BoxGeometry(1.05, 0.09, 1.72)
  const bowGeo = new THREE.CylinderGeometry(0.55, 0.62, 0.72, 12, 1, true, 0, Math.PI)
  const sideGeo = new THREE.BoxGeometry(0.07, 0.42, 1.05)
  const railGeo = new THREE.TorusGeometry(0.56, 0.045, 8, 16, Math.PI)
  const postGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.46, 6)
  const prowGeo = new THREE.ConeGeometry(0.14, 0.85, 6)
  const axleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.72, 6)
  const poleGeo = new THREE.CylinderGeometry(0.035, 0.055, 1.75, 6)
  const pennantGeo = new THREE.PlaneGeometry(0.62, 0.42, 4, 2)
  const pipeGeo = new THREE.CylinderGeometry(0.055, 0.08, 0.34, 8)
  const reinsBarGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.56, 6)
  const reinGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.95, 4)
  const studGeo = new THREE.SphereGeometry(0.035, 6, 5)

  function buildKart({ primary, secondary, glow, driver = 'minion', appearance = null, minionColor = '#8fd5ff' }) {
    // per-chariot materials — setGhost() mutates them, so they must NOT be shared across karts
    const wood = toonMaterial({ color: '#4a352a', rimStrength: 0.3, rim: '#ffb98a' })
    const woodDark = toonMaterial({ color: '#33241c', rimStrength: 0.25, rim: '#ff9a5c' })
    const iron = toonMaterial({ color: '#6b6f78', rimStrength: 0.5, rim: '#ffe0b0' })
    const bronze = toonMaterial({ color: '#b0793a', rimStrength: 0.55, rim: '#ffd9a0' })
    const priMat = toonMaterial({ color: primary, rim: '#ffe2c0', rimStrength: 0.5 })
    const secMat = toonMaterial({ color: secondary, rim: '#ffc9a0', rimStrength: 0.4 })
    const glowMat = glowMaterial(glow, 1.7)
    const hubMat = glowMaterial(glow, 1.25) // wheel hubs: ember-lit, not blinding

    const group = new THREE.Group()
    const body = new THREE.Group() // lean/roll pivot
    body.position.y = 0.32
    group.add(body)

    const add = (geo, mat, [x, y, z], { rot = null, scale = null, shadow = true, parent = body } = {}) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      if (rot) m.rotation.set(...rot)
      if (scale) m.scale.set(...scale)
      m.castShadow = shadow
      parent.add(m)
      return m
    }

    // ---- basket: plank floor, curved war-bow front, open rear ----
    add(floorGeo, woodDark, [0, 0.12, 0])
    // low rim flood: the interior (backface) is what the chase camera sees
    const bowMat = toonMaterial({ color: primary, rim: '#ffe2c0', rimStrength: 0.12, side: THREE.DoubleSide })
    add(bowGeo, bowMat, [0, 0.42, 0.55], { rot: [0, -Math.PI / 2, 0] })
    // side boards
    for (const s of [-1, 1]) {
      add(sideGeo, secMat, [0.5 * s, 0.35, -0.12])
      // bronze rail arcs along the basket rim
      add(railGeo, bronze, [0.5 * s, 0.55, -0.1], { rot: [0, Math.PI / 2, 0], scale: [1, 0.5, 0.14], shadow: false })
      // rune-ember trim strip
      add(new THREE.BoxGeometry(0.035, 0.05, 1.0), glowMat, [0.54 * s, 0.45, -0.12], { shadow: false })
      // rail posts
      add(postGeo, bronze, [0.5 * s, 0.4, -0.6])
      // bronze studs on the bow
      add(studGeo, bronze, [0.38 * s, 0.55, 0.94], { shadow: false })
    }
    // front rim rail across the bow + ram prow blade
    add(railGeo, bronze, [0, 0.78, 0.55], { rot: [0, 0, 0], scale: [1, 0.62, 1], shadow: false })
    add(prowGeo, iron, [0, 0.32, 1.35], { rot: [Math.PI / 2, 0, 0] })
    add(studGeo, glowMat, [0, 0.48, 1.06], { shadow: false }) // ember sigil on the prow

    // ---- axle + rear board + ember vents (exhaust anchors for flames/smoke) ----
    add(axleGeo, iron, [0, -0.02, -0.55], { rot: [0, 0, Math.PI / 2] })
    add(new THREE.BoxGeometry(0.92, 0.3, 0.06), secMat, [0, 0.28, -0.82]) // rear board
    add(new THREE.BoxGeometry(0.5, 0.045, 0.02), glowMat, [0, 0.3, -0.86], { shadow: false }) // ember rune strip
    const exhausts = []
    for (const s of [-1, 1]) {
      const pipe = add(pipeGeo, iron, [0.26 * s, 0.16, -0.98], { rot: [1.35, 0, 0] })
      exhausts.push(pipe)
    }

    // ---- war-banner pole at the rear ----
    add(poleGeo, woodDark, [-0.42, 1.0, -0.72])
    add(new THREE.ConeGeometry(0.05, 0.16, 5), bronze, [-0.42, 1.95, -0.72])
    // face the cloth's front (+Z) at the chase camera — the custom rim shader
    // floods backfaces with rim color, so never show the back to the player
    const pennant = add(
      pennantGeo.clone(),
      toonMaterial({ color: primary, rim: '#ffcf9a', rimStrength: 0.12, side: THREE.DoubleSide }),
      [-0.22, 1.68, -0.72], { rot: [0, Math.PI, 0], scale: [0.8, 0.8, 1], shadow: false },
    )
    add(new THREE.BoxGeometry(0.03, 0.36, 0.02), glowMat, [-0.41, 1.68, -0.72], { shadow: false }) // ember hoist edge
    const pennantBase = pennant.geometry.attributes.position.array.slice()
    let pennantT = Math.random() * 10

    // ---- reins: crossbar the warrior grips + two straps to the bow ----
    const reinsBar = add(reinsBarGeo, wood, [0, 0.98, 0.1], { rot: [0, 0, Math.PI / 2], shadow: false })
    for (const s of [-1, 1]) {
      add(reinGeo, woodDark, [0.14 * s, 0.9, 0.48], { rot: [1.05, 0, 0.1 * s], shadow: false })
    }

    // ---- wheels: steer group -> spin group -> spoked wheel ----
    // order matters: 0-1 front (small), 2-3 rear (big) — scene sparks use [2,3]
    const frontSteer = []
    const wheelSpins = []
    const mkWheel = (x, z, front) => {
      const wheelScale = front ? 0.8 : 1.25
      const steer = new THREE.Group()
      steer.position.set(x, 0.525 * wheelScale - 0.32, z) // axle height = iron band radius
      const spin = new THREE.Group()
      steer.add(spin)
      const rim = new THREE.Mesh(rimGeo, wood)
      rim.rotation.y = Math.PI / 2
      rim.castShadow = true
      const band = new THREE.Mesh(bandGeo, iron)
      band.rotation.y = Math.PI / 2
      const hub = new THREE.Mesh(hubGeo, hubMat)
      hub.rotation.z = Math.PI / 2
      spin.add(rim, band, hub)
      for (let i = 0; i < 3; i++) {
        const spoke = new THREE.Mesh(spokeGeo, woodDark)
        spoke.rotation.x = (i / 3) * Math.PI
        spin.add(spoke)
      }
      spin.scale.setScalar(wheelScale)
      body.add(steer)
      wheelSpins.push(spin)
      if (front) frontSteer.push(steer)
    }
    mkWheel(0.66, 0.72, true)
    mkWheel(-0.66, 0.72, true)
    mkWheel(0.78, -0.55, false)
    mkWheel(-0.78, -0.55, false)

    // ember underglow halo (firelight spilling beneath the frame)
    const under = new THREE.Sprite(glowSpriteMaterial(glow, 0.3))
    under.scale.set(1.9, 1.1, 1)
    under.position.y = 0.05
    group.add(under)

    // ---- the warrior stands in the basket, gripping the reins ----
    let hero = null, minion = null
    if (driver === 'hero') {
      hero = createHero(appearance, { auraRing: false })
      hero.group.scale.setScalar(0.7)
      hero.group.position.set(0, 0.18, -0.42)
      body.add(hero.group)
    } else {
      minion = createMinion({ color: minionColor, scale: 0.95 })
      minion.group.position.set(0, 0.24, -0.45)
      body.add(minion.group)
    }

    const visual = {
      group, body, wheelSpins, frontSteer, exhausts, spoiler: pennant, hero, minion, under,
      _ghostSaved: null,
    }

    /** Standing charioteer pose override — call AFTER hero.update(dt). */
    visual.poseDriver = (dt, { speed = 0, steer = 0 } = {}) => {
      // war banner ripples with speed
      pennantT += dt * (2.5 + Math.min(Math.abs(speed) * 0.18, 5))
      const attr = pennant.geometry.attributes.position
      for (let vi = 0; vi < attr.count; vi++) {
        const bx = pennantBase[vi * 3]
        attr.setZ(vi, Math.sin(pennantT * 3 + bx * 5) * 0.07 * (bx + 0.34))
      }
      attr.needsUpdate = true

      if (hero) {
        hero.update(dt)
        // braced stance, leaning into the wind
        hero.hips.position.y = 0.8
        hero.hips.rotation.x = 0.1 + Math.min(Math.abs(speed) * 0.003, 0.1)
        hero.hips.rotation.y = 0
        for (const [key, s] of [['L', -1], ['R', 1]]) {
          const arm = hero.arms[key]
          arm.pivot.rotation.x = -0.85 + steer * 0.2 * s
          arm.pivot.rotation.z = s * -0.14
          arm.elbow.rotation.x = -0.38
          const leg = hero.legs[key]
          leg.pivot.rotation.x = -0.18
          leg.knee.rotation.x = 0.3
        }
        hero.head.rotation.y = steer * 0.3
        reinsBar.rotation.y = -steer * 0.4
      } else if (minion) {
        minion.update(dt)
        minion.group.rotation.z = steer * 0.12
      }
    }

    /** Translucent wraith-cloak toggle (also used for the decoy spirit). */
    visual.setGhost = on => {
      if (on && !visual._ghostSaved) {
        const saved = new Map()
        group.traverse(o => {
          if (o.material && !saved.has(o.material)) {
            saved.set(o.material, [o.material.transparent, o.material.opacity])
            o.material.transparent = true
            o.material.opacity = Math.min(o.material.opacity ?? 1, 0.3)
          }
        })
        visual._ghostSaved = saved
      } else if (!on && visual._ghostSaved) {
        for (const [m, [tr, op]] of visual._ghostSaved) {
          m.transparent = tr
          m.opacity = op
        }
        visual._ghostSaved = null
      }
    }

    return visual
  }

  return { buildKart }
}
