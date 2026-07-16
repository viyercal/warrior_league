import * as THREE from 'three'
import { toonMaterial, glowMaterial, glowSpriteMaterial } from './materials.js'
import { glowTexture } from '../core/assets.js'
import { clamp, damp, lerp, rand, TAU, angleLerp } from '../core/utils.js'

const darken = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString()

function mesh(parent, geo, mat, [x, y, z] = [0, 0, 0], { shadow = true, scale = null, rot = null } = {}) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  if (scale) m.scale.set(...scale)
  if (rot) m.rotation.set(...rot)
  m.castShadow = shadow
  parent.add(m)
  return m
}

/**
 * The player hero — one stylized, rim-lit character that carries across
 * every game. Stands ≈2 units tall, origin at the feet.
 *
 * API: group, update(dt), setMoveSpeed(unitsPerSec), setState('normal'|'dance'|'ko'),
 *      cast(), faceTowards(Vector3, dt, rate), castPoint(out), ring, dispose()
 */
export class Hero {
  constructor(appearance = {}, { auraRing = false } = {}) {
    const a = this.appearance = {
      primary: '#3fa7ff', secondary: '#232a4d', glow: '#7df9ff',
      head: 'visor', hair: 'spikes', cape: true, ...appearance,
    }
    const M = this.mats = {
      primary: toonMaterial({ color: a.primary, rim: '#dff2ff', rimStrength: 0.5 }),
      secondary: toonMaterial({ color: a.secondary, rim: '#aac4ff', rimStrength: 0.4 }),
      dark: toonMaterial({ color: darken(a.secondary, 0.55), rimStrength: 0.25 }),
      glove: toonMaterial({ color: darken(a.primary, 0.75), rim: '#dff2ff', rimStrength: 0.5 }),
      hair: toonMaterial({ color: darken(a.primary, 0.45), rim: a.glow, rimStrength: 0.35 }),
      glow: glowMaterial(a.glow, 2.6),
      skin: toonMaterial({ color: '#ffd9c0', rimStrength: 0.3 }),
    }

    this.group = new THREE.Group()
    const hips = this.hips = new THREE.Group()
    hips.position.y = 0.92
    this.group.add(hips)

    // --- torso ---
    mesh(hips, new THREE.BoxGeometry(0.42, 0.2, 0.28), M.secondary, [0, 0.08, 0])
    mesh(hips, new THREE.TorusGeometry(0.22, 0.022, 8, 24), M.glow, [0, 0.17, 0], { rot: [Math.PI / 2, 0, 0], shadow: false })
    this.torso = mesh(hips, new THREE.SphereGeometry(0.3, 18, 14), M.primary, [0, 0.42, 0], { scale: [1.12, 1.3, 0.88] })
    this.gem = mesh(hips, new THREE.OctahedronGeometry(0.08, 0), M.glow, [0, 0.48, 0.24], { scale: [1, 1.35, 1], shadow: false })

    // --- shoulders + arms ---
    this.arms = {}
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group()
      pivot.position.set(0.44 * side, 0.58, 0)
      hips.add(pivot)
      mesh(pivot, new THREE.SphereGeometry(0.15, 14, 10), M.secondary, [0, 0.04, 0], { scale: [1.15, 0.85, 1.15] })
      mesh(pivot, new THREE.TorusGeometry(0.155, 0.02, 8, 24), M.glow, [0, 0.02, 0], { rot: [0, 0, Math.PI / 2], shadow: false })
      mesh(pivot, new THREE.CapsuleGeometry(0.08, 0.22, 4, 10), M.primary, [0, -0.16, 0])
      const elbow = new THREE.Group()
      elbow.position.set(0, -0.32, 0)
      pivot.add(elbow)
      mesh(elbow, new THREE.CapsuleGeometry(0.075, 0.18, 4, 10), M.secondary, [0, -0.1, 0])
      const glove = mesh(elbow, new THREE.SphereGeometry(0.105, 12, 10), M.glove, [0, -0.26, 0])
      this.arms[side === -1 ? 'L' : 'R'] = { pivot, elbow, glove }
    }

    // --- legs ---
    this.legs = {}
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group()
      pivot.position.set(0.14 * side, 0, 0)
      hips.add(pivot)
      mesh(pivot, new THREE.CapsuleGeometry(0.105, 0.24, 4, 10), M.secondary, [0, -0.16, 0])
      const knee = new THREE.Group()
      knee.position.set(0, -0.34, 0)
      pivot.add(knee)
      mesh(knee, new THREE.CapsuleGeometry(0.08, 0.22, 4, 10), M.dark, [0, -0.13, 0])
      mesh(knee, new THREE.SphereGeometry(0.13, 12, 10), M.dark, [0, -0.29, 0.05], { scale: [1, 0.68, 1.5] })
      this.legs[side === -1 ? 'L' : 'R'] = { pivot, knee }
    }

    // --- head ---
    const head = this.head = new THREE.Group()
    head.position.set(0, 0.93, 0)
    hips.add(head)
    mesh(head, new THREE.CylinderGeometry(0.07, 0.09, 0.14, 10), M.secondary, [0, -0.16, 0])
    mesh(head, new THREE.SphereGeometry(0.21, 20, 16), M.secondary, [0, 0, 0])
    if (a.head === 'visor') {
      mesh(head, new THREE.SphereGeometry(0.195, 18, 12), M.glow, [0, 0.01, 0.055], { scale: [0.95, 0.42, 0.95], shadow: false })
    } else if (a.head === 'orb') {
      mesh(head, new THREE.SphereGeometry(0.09, 14, 12), M.glow, [0, 0.01, 0.16], { shadow: false })
    } else {
      mesh(head, new THREE.SphereGeometry(0.175, 16, 12), M.skin, [0, -0.01, 0.06])
      for (const s of [-1, 1]) {
        mesh(head, new THREE.SphereGeometry(0.042, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), [0.075 * s, 0.02, 0.2], { shadow: false })
        mesh(head, new THREE.SphereGeometry(0.02, 6, 6), M.glow, [0.075 * s, 0.02, 0.235], { shadow: false })
      }
    }
    if (a.hair === 'spikes') {
      const spikes = [[0, 0.2, -0.02, 0, 0], [0.09, 0.17, -0.06, 0.5, 0.35], [-0.09, 0.17, -0.06, 0.5, -0.35], [0.05, 0.16, -0.13, 0.8, 0.2], [-0.05, 0.16, -0.13, 0.8, -0.2]]
      for (const [x, y, z, rx, rz] of spikes) {
        mesh(head, new THREE.ConeGeometry(0.06, 0.24, 7), M.hair, [x, y, z], { rot: [-rx, 0, rz] })
      }
    } else if (a.hair === 'swept') {
      mesh(head, new THREE.SphereGeometry(0.19, 16, 12), M.hair, [0, 0.09, -0.04], { scale: [1.05, 0.6, 1.1] })
      mesh(head, new THREE.ConeGeometry(0.08, 0.32, 8), M.hair, [0, 0.1, -0.2], { rot: [-2.2, 0, 0] })
    } else if (a.hair === 'horns') {
      for (const s of [-1, 1]) {
        mesh(head, new THREE.ConeGeometry(0.05, 0.26, 7), M.hair, [0.15 * s, 0.13, 0], { rot: [0, 0, -0.75 * s] })
      }
    }

    // --- cape ---
    if (a.cape) {
      const geo = new THREE.PlaneGeometry(0.62, 0.82, 6, 8)
      geo.translate(0, -0.41, 0)
      this.capeBase = geo.attributes.position.array.slice()
      const capeMat = toonMaterial({ color: darken(a.secondary, 0.8), rim: a.glow, rimStrength: 0.25, side: THREE.DoubleSide })
      this.cape = new THREE.Mesh(geo, capeMat)
      this.cape.position.set(0, 0.6, -0.22)
      this.cape.rotation.x = 0.22
      this.cape.castShadow = true
      hips.add(this.cape)
    }

    // --- ground aura ring (games toggle .visible) ---
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.6, 40),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(a.glow).multiplyScalar(1.6), transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.04
    this.ring.visible = auraRing
    this.group.add(this.ring)

    // anim state
    this.t = rand(10)
    this.phase = 0
    this.speed = 0
    this.moveBlend = 0
    this.castT = 0
    this.castBlend = 0
    this.state = 'normal'
    this.koT = 0
    this._lookTarget = { yaw: 0, pitch: 0 }
    this._lookTimer = 0
  }

  setMoveSpeed(v) { this.speed = v }
  cast() { this.castT = 0.42 }
  setState(s) { this.state = s; if (s === 'ko') this.koT = 0 }

  /** Smoothly yaw the whole hero to face a world point. */
  faceTowards(target, dt, rate = 14) {
    const dx = target.x - this.group.position.x
    const dz = target.z - this.group.position.z
    if (dx * dx + dz * dz < 0.001) return
    const desired = Math.atan2(dx, dz)
    this.group.rotation.y = angleLerp(this.group.rotation.y, desired, 1 - Math.exp(-rate * dt))
  }

  /** World position of the casting hand (spawn projectiles here). */
  castPoint(out = new THREE.Vector3()) {
    return this.arms.R.glove.getWorldPosition(out)
  }

  update(dt) {
    this.t += dt
    const t = this.t
    const sn = clamp(this.speed / 5, 0, 1.2)
    this.moveBlend = damp(this.moveBlend, sn > 0.06 ? Math.min(sn, 1) : 0, 10, dt)
    const w = this.moveBlend
    this.phase += dt * (4 + 7 * Math.min(sn, 1.2)) * (w > 0.02 ? 1 : 0)
    const ph = this.phase

    if (this.state === 'ko') {
      this.koT += dt
      const k = Math.min(1, this.koT / 0.5)
      const e = 1 - Math.pow(1 - k, 3)
      this.hips.rotation.x = -1.42 * e
      this.hips.position.y = 0.92 - 0.5 * e
      return
    }

    // hips: bob + lean
    const danceBob = this.state === 'dance' ? Math.abs(Math.sin(t * 6)) * 0.14 : 0
    this.hips.position.y = 0.92 + Math.sin(t * 2) * 0.015 * (1 - w) + Math.abs(Math.cos(ph)) * 0.055 * w + danceBob
    this.hips.rotation.x = 0.17 * w
    this.hips.rotation.y = this.state === 'dance' ? Math.sin(t * 3) * 0.45 : 0

    // breathing
    const br = 1 + Math.sin(t * 2.1) * 0.015 * (1 - w)
    this.torso.scale.set(1.12 * br, 1.3, 0.88 * br)
    this.gem.rotation.y += dt * 1.5

    // legs
    for (const [key, s] of [['L', -1], ['R', 1]]) {
      const leg = this.legs[key]
      const p = ph + (s === 1 ? Math.PI : 0)
      leg.pivot.rotation.x = Math.sin(p) * 0.9 * w
      leg.knee.rotation.x = (0.08 + Math.max(0, -Math.sin(p)) * 1.15) * w
    }

    // arms
    this.castT = Math.max(0, this.castT - dt)
    this.castBlend = damp(this.castBlend, this.castT > 0.14 ? 1 : 0, 26, dt)
    for (const [key, s] of [['L', -1], ['R', 1]]) {
      const arm = this.arms[key]
      const p = ph + (s === 1 ? 0 : Math.PI)
      let rx = Math.sin(t * 1.8 + s) * 0.05 * (1 - w) - Math.sin(p) * 0.72 * w
      let rz = s * (-0.1 - Math.sin(t * 1.7) * 0.035 * (1 - w))
      let elbowX = -0.25 * (1 - w) - (0.35 + Math.max(0, Math.sin(p)) * 0.55) * w
      if (this.state === 'dance') {
        rx = -2.6 - Math.sin(t * 6 + (s === 1 ? 0 : Math.PI)) * 0.5
        rz = s * -0.5
        elbowX = -0.6
      }
      if (key === 'R' && this.castBlend > 0.01) {
        rx = lerp(rx, -2.25, this.castBlend)
        rz = lerp(rz, 0.15, this.castBlend)
        elbowX = lerp(elbowX, -0.15, this.castBlend)
      }
      arm.pivot.rotation.x = rx
      arm.pivot.rotation.z = rz
      arm.elbow.rotation.x = elbowX
    }

    // idle head wander
    this._lookTimer -= dt
    if (this._lookTimer <= 0) {
      this._lookTimer = rand(1.8, 3.6)
      this._lookTarget = { yaw: rand(-0.45, 0.45), pitch: rand(-0.12, 0.15) }
    }
    const lk = 1 - w
    this.head.rotation.y = damp(this.head.rotation.y, this._lookTarget.yaw * lk, 4, dt)
    this.head.rotation.x = damp(this.head.rotation.x, this._lookTarget.pitch * lk, 4, dt)

    // cape flutter
    if (this.cape) {
      const pos = this.cape.geometry.attributes.position
      const base = this.capeBase
      const amp = 0.05 + 0.16 * w
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1]
        const hang = clamp(-by / 0.82, 0, 1)
        pos.setZ(i, base[i * 3 + 2] - Math.sin(t * 5 + by * 5 + bx * 3) * amp * hang - w * hang * 0.34)
      }
      pos.needsUpdate = true
      this.cape.geometry.computeVertexNormals()
      this.cape.rotation.x = 0.22 + w * 0.5
    }

    // aura ring pulse
    if (this.ring.visible) {
      this.ring.material.opacity = 0.4 + Math.sin(t * 3.5) * 0.14
      this.ring.rotation.z += dt * 0.8
    }
  }

  dispose() { /* geometry/material teardown handled by disposeObject3D on scene */ }
}

/**
 * Small squishy minion / creep. ≈0.75 units tall, origin at feet.
 * API: group, update(dt), setMoving(bool), hitFlash(), dispose()
 */
export class Minion {
  constructor({ color = '#8fd5ff', evil = false, scale = 1 } = {}) {
    this.group = new THREE.Group()
    this.bodyMat = toonMaterial({
      color, rim: evil ? '#ff9a9a' : '#d8f4ff', rimStrength: 0.45,
      emissive: '#000000',
    })
    const g = this.group
    this.body = mesh(g, new THREE.SphereGeometry(0.34, 16, 12), this.bodyMat, [0, 0.4, 0], { scale: [1, 0.85, 0.95] })

    if (evil) {
      const eye = mesh(g, new THREE.SphereGeometry(0.15, 12, 8), glowMaterial('#ff5a3c', 2.6), [0, 0.46, 0.22], { scale: [1.25, 0.4, 0.6], shadow: false })
      eye.rotation.x = 0.15
      for (const s of [-1, 1]) {
        mesh(g, new THREE.ConeGeometry(0.07, 0.22, 6), this.bodyMat, [0.18 * s, 0.66, 0.05], { rot: [0, 0, -0.9 * s] })
      }
    } else {
      for (const s of [-1, 1]) {
        mesh(g, new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), [0.13 * s, 0.48, 0.26], { shadow: false })
        mesh(g, new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: '#1c2333' }), [0.13 * s, 0.48, 0.325], { shadow: false })
      }
      mesh(g, new THREE.CylinderGeometry(0.012, 0.012, 0.24, 5), this.bodyMat, [0, 0.78, 0], { shadow: false })
      mesh(g, new THREE.SphereGeometry(0.045, 8, 6), glowMaterial(color, 2.4), [0, 0.9, 0], { shadow: false })
    }
    this.feet = []
    for (const s of [-1, 1]) {
      this.feet.push(mesh(g, new THREE.SphereGeometry(0.1, 8, 6), this.bodyMat, [0.13 * s, 0.08, 0.04], { scale: [1, 0.65, 1.3] }))
    }
    g.scale.setScalar(scale)
    this.t = rand(10)
    this.moving = false
    this._flash = 0
  }

  setMoving(m) { this.moving = m }
  hitFlash() { this._flash = 1 }

  update(dt) {
    this.t += dt
    const t = this.t
    const w = this.moving ? 1 : 0
    this.body.position.y = 0.4 + Math.abs(Math.sin(t * (this.moving ? 9 : 2))) * (0.03 + 0.05 * w)
    this.group.rotation.z = Math.sin(t * 9) * 0.07 * w
    this.feet[0].position.y = 0.08 + Math.max(0, Math.sin(t * 9)) * 0.09 * w
    this.feet[1].position.y = 0.08 + Math.max(0, -Math.sin(t * 9)) * 0.09 * w
    if (this._flash > 0) {
      this._flash = Math.max(0, this._flash - dt * 6)
      this.bodyMat.emissive.setScalar(this._flash * 0.9)
    }
  }

  dispose() { /* handled by scene deep-dispose */ }
}

export const createHero = (appearance, opts) => new Hero(appearance, opts)
export const createMinion = opts => new Minion(opts)
