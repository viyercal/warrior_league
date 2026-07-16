import * as THREE from 'three'
import { toonMaterial, glowMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { createHero, createMinion } from '../../art/characterFactory.js'

const darken = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString()

/**
 * Per-scene factory sharing wheel/detail geometry between all six karts.
 * buildKart() → visual handle; kart forward = local +Z, origin at ground.
 */
export function createKartFactory() {
  const tireGeo = new THREE.TorusGeometry(0.3, 0.15, 10, 18)
  const hubGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.24, 10)
  const bodyGeo = new THREE.BoxGeometry(1.15, 0.34, 1.9)
  const noseGeo = new THREE.ConeGeometry(0.44, 0.85, 4)
  const podGeo = new THREE.BoxGeometry(0.26, 0.26, 1.1)
  const seatGeo = new THREE.BoxGeometry(0.62, 0.5, 0.14)
  const spoilerGeo = new THREE.BoxGeometry(1.3, 0.08, 0.42)
  const strutGeo = new THREE.BoxGeometry(0.07, 0.34, 0.07)
  const pipeGeo = new THREE.CylinderGeometry(0.055, 0.08, 0.34, 8)
  const wheelMat = toonMaterial({ color: '#20202a', rimStrength: 0.28, rim: '#ffb98a' })
  const seatMat = toonMaterial({ color: '#2a2233', rimStrength: 0.3 })
  const pipeMat = toonMaterial({ color: '#585e6e', rimStrength: 0.5, rim: '#ffe0b0' })
  const steerGeo = new THREE.TorusGeometry(0.15, 0.035, 6, 14)

  function buildKart({ primary, secondary, glow, driver = 'minion', appearance = null, minionColor = '#8fd5ff' }) {
    const group = new THREE.Group()
    const body = new THREE.Group() // lean/roll pivot
    body.position.y = 0.32
    group.add(body)

    const priMat = toonMaterial({ color: primary, rim: '#ffe2c0', rimStrength: 0.5 })
    const secMat = toonMaterial({ color: secondary, rim: '#ffc9a0', rimStrength: 0.4 })
    const glowMat = glowMaterial(glow, 1.7)

    const add = (geo, mat, [x, y, z], { rot = null, scale = null, shadow = true } = {}) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      if (rot) m.rotation.set(...rot)
      if (scale) m.scale.set(...scale)
      m.castShadow = shadow
      body.add(m)
      return m
    }

    // chassis
    add(bodyGeo, priMat, [0, 0.1, 0.05])
    add(bodyGeo, secMat, [0, 0.26, -0.28], { scale: [0.8, 0.55, 0.55] })
    add(noseGeo, priMat, [0, 0.1, 1.25], { rot: [Math.PI / 2, Math.PI / 4, 0] })
    for (const s of [-1, 1]) {
      add(podGeo, secMat, [0.62 * s, 0.08, 0.1])
      add(new THREE.BoxGeometry(0.05, 0.06, 1.55), glowMat, [0.7 * s, 0.16, 0.1], { shadow: false }) // glow trim
    }
    add(new THREE.BoxGeometry(0.5, 0.05, 0.3), glowMat, [0, 0.29, 1.05], { shadow: false }) // nose stripe
    add(seatGeo, seatMat, [0, 0.5, -0.62], { rot: [-0.18, 0, 0] })
    // spoiler
    const spoiler = add(spoilerGeo, secMat, [0, 0.72, -0.95], { rot: [-0.24, 0, 0] })
    add(new THREE.BoxGeometry(1.3, 0.035, 0.09), glowMat, [0, 0.755, -1.08], { rot: [-0.24, 0, 0], shadow: false })
    for (const s of [-1, 1]) add(strutGeo, seatMat, [0.45 * s, 0.55, -0.95])
    // exhaust pipes (world refs for smoke/flames)
    const exhausts = []
    for (const s of [-1, 1]) {
      const pipe = add(pipeGeo, pipeMat, [0.24 * s, 0.32, -1.02], { rot: [1.3, 0, 0] })
      exhausts.push(pipe)
    }
    // steering wheel
    const wheel = add(steerGeo, seatMat, [0, 0.62, -0.1], { rot: [0.5, 0, 0], shadow: false })
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), seatMat, [0, 0.52, 0.02], { rot: [1.05, 0, 0] })

    // wheels: steer group -> spin group -> tire+hub
    const frontSteer = []
    const wheelSpins = []
    const mkWheel = (x, z, front) => {
      const steer = new THREE.Group()
      steer.position.set(x, 0.13, z)
      const spin = new THREE.Group()
      steer.add(spin)
      const tire = new THREE.Mesh(tireGeo, wheelMat)
      tire.rotation.y = Math.PI / 2
      tire.castShadow = true
      const hub = new THREE.Mesh(hubGeo, glowMat)
      hub.rotation.z = Math.PI / 2
      spin.add(tire, hub)
      body.add(steer)
      wheelSpins.push(spin)
      if (front) frontSteer.push(steer)
    }
    mkWheel(0.72, 0.78, true)
    mkWheel(-0.72, 0.78, true)
    mkWheel(0.72, -0.72, false)
    mkWheel(-0.72, -0.72, false)

    // underglow halo
    const under = new THREE.Sprite(glowSpriteMaterial(glow, 0.3))
    under.scale.set(1.9, 1.1, 1)
    under.position.y = 0.05
    group.add(under)

    // driver
    let hero = null, minion = null
    if (driver === 'hero') {
      hero = createHero(appearance, { auraRing: false })
      hero.group.scale.setScalar(0.7)
      hero.group.position.set(0, 0.38, -0.42)
      body.add(hero.group)
    } else {
      minion = createMinion({ color: minionColor, scale: 0.95 })
      minion.group.position.set(0, 0.42, -0.5)
      body.add(minion.group)
    }

    const visual = {
      group, body, wheelSpins, frontSteer, exhausts, spoiler, hero, minion, under,
      _ghostSaved: null,
    }

    /** Seated pose override — call AFTER hero.update(dt). */
    visual.poseDriver = (dt, { speed = 0, steer = 0 } = {}) => {
      if (hero) {
        hero.update(dt)
        hero.hips.position.y = 0.66
        hero.hips.rotation.x = 0.12
        hero.hips.rotation.y = 0
        for (const [key, s] of [['L', -1], ['R', 1]]) {
          const arm = hero.arms[key]
          arm.pivot.rotation.x = -1.35 + steer * 0.22 * s
          arm.pivot.rotation.z = s * -0.32
          arm.elbow.rotation.x = -0.5
          const leg = hero.legs[key]
          leg.pivot.rotation.x = -1.35
          leg.knee.rotation.x = 1.25
        }
        hero.head.rotation.y = steer * 0.3
        wheel.rotation.z = -steer * 0.65
      } else if (minion) {
        minion.update(dt)
        minion.group.rotation.z = steer * 0.12
      }
    }

    /** Translucent phase-cloak toggle (also used for holo decoy). */
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
