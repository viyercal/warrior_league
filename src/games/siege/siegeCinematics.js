import * as THREE from 'three'
import { glowTexture, cloudTexture } from '../../core/assets.js'
import { lerp, rand, TAU } from '../../core/utils.js'
import { CITADEL_POS } from './siegeEnv.js'

const smooth = k => k * k * (3 - 2 * k)
const _p = new THREE.Vector3()
const _l = new THREE.Vector3()

export const INTRO_DUR = 4.2
export const BOSS_CINE_DUR = 3.0

/**
 * Opening flight (≤4.5s, any key skips, world state frozen while it runs):
 * hold on the burning war camps beyond the west war-gate, pull back down the
 * torch-lined lane, then rise over the gate to reveal the bastion + title.
 * Owns the camera while active; the scene snaps to gameplay when done.
 */
export class IntroCinematic {
  constructor(camera) {
    this.camera = camera
    this.t = 0
    this.done = false
  }

  skip() { this.t = INTRO_DUR }

  /** Advance; returns true once finished (caller snaps to gameplay). */
  update(dt) {
    this.t += dt
    const t = this.t
    if (t >= INTRO_DUR) { this.done = true; return true }
    if (t < 1.15) {
      // the horizon burns — war camps framed beside the west war-gate
      const s = smooth(t / 1.15)
      _p.set(lerp(-8.2, -9.4, s), lerp(3.0, 3.2, s), lerp(-16.8, -15.6, s))
      _l.set(-66, 8, -122)
    } else if (t < 2.75) {
      // pull back along the lane, torch-lined road streaming beneath
      const s = smooth((t - 1.15) / 1.6)
      _p.set(lerp(-9.4, -6.4, s), lerp(3.2, 4.8, s), lerp(-15.6, 5.6, s))
      _l.set(lerp(-66, -19, s), lerp(8, 3.4, s), lerp(-122, -26.5, s))
    } else {
      // rise over the gate: portcullis, walls, the great beacon
      const s = smooth((t - 2.75) / (INTRO_DUR - 2.75))
      _p.set(lerp(-6.4, 0, s), lerp(4.8, 11.6, s), lerp(5.6, 2.2, s))
      _l.set(lerp(-19, CITADEL_POS.x, s), lerp(3.4, 6.2, s), lerp(-26.5, CITADEL_POS.z, s))
    }
    this.camera.position.copy(_p)
    this.camera.lookAt(_l)
    return false
  }
}

/**
 * SIEGE COLOSSUS entrance: lights dimmed by the scene, drum hits on a beat,
 * low frontal horizon-march framing that cranes up to sell the scale.
 * The boss marches during the shot; everything else stays frozen.
 */
export class BossEntrance {
  constructor(camera, boss) {
    this.camera = camera
    this.boss = boss
    this.t = 0
    this.done = false
  }

  skip() { this.t = BOSS_CINE_DUR }

  update(dt) {
    this.t += dt
    const t = this.t
    if (t >= BOSS_CINE_DUR) { this.done = true; return true }
    const bp = this.boss.group.position
    if (t < 1.5) {
      // low frontal: the Colossus against the burning horizon
      const s = smooth(t / 1.5)
      _p.set(bp.x + 3.1, lerp(1.5, 1.9, s), bp.z + lerp(9.2, 7.8, s))
      _l.set(bp.x, 4.9, bp.z)
    } else {
      // crane up + around as it marches on the gate
      const s = smooth((t - 1.5) / (BOSS_CINE_DUR - 1.5))
      _p.set(bp.x + lerp(3.1, -3.6, s), lerp(1.9, 7.4, s), bp.z + lerp(7.8, 12.8, s))
      _l.set(bp.x, lerp(4.9, 3.4, s), bp.z)
    }
    this.camera.position.copy(_p)
    this.camera.lookAt(_l)
    return false
  }
}

/**
 * Persistent ember-smoke at the breached gate while the bastion is below 25%.
 * One pooled group (5 smoke puffs + 7 embers), ticked only while visible.
 */
export class GateSmolder {
  constructor(scene) {
    const g = this.group = new THREE.Group()
    g.position.set(0, 0, CITADEL_POS.z - 9.6)
    this.puffs = []
    const smokeTex = cloudTexture()
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, color: '#191008', transparent: true, opacity: 0,
        depthWrite: false, rotation: rand(TAU),
      }))
      this.puffs.push({ s, k: i / 5, x: rand(-2.4, 2.4), vr: rand(-0.3, 0.3) })
      g.add(s)
    }
    this.embers = []
    const glowTex = glowTexture()
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: '#ff8a34', transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }))
      s.scale.setScalar(rand(0.14, 0.3))
      this.embers.push({ s, k: rand(1), x: rand(-2.6, 2.6), ph: rand(TAU) })
      g.add(s)
    }
    this.on = false
    this.fade = 0
    g.visible = false
    scene.add(g)
  }

  setActive(on) { this.on = on }

  tick(dt) {
    this.fade = Math.max(0, Math.min(1, this.fade + (this.on ? dt * 1.5 : -dt * 1.5)))
    this.group.visible = this.fade > 0.01
    if (!this.group.visible) return
    for (const p of this.puffs) {
      p.k += dt * 0.22
      if (p.k >= 1) { p.k -= 1; p.x = rand(-2.4, 2.4) }
      p.s.position.set(p.x + p.k * 1.2, 0.4 + p.k * 4.2, rand(-0.1, 0.1))
      const sc = 1.1 + p.k * 3.4
      p.s.scale.set(sc, sc * 0.85, 1)
      p.s.material.rotation += p.vr * dt
      p.s.material.opacity = this.fade * 0.26 * Math.sin(Math.min(1, p.k * 3) * Math.PI * 0.5) * (1 - p.k * 0.85)
    }
    for (const e of this.embers) {
      e.k += dt * rand(0.5, 0.7)
      if (e.k >= 1) { e.k -= 1; e.x = rand(-2.6, 2.6) }
      e.s.position.set(e.x + Math.sin(e.k * 9 + e.ph) * 0.4, 0.2 + e.k * 3.6, 0)
      e.s.material.opacity = this.fade * (0.5 + 0.5 * Math.sin(e.k * 30 + e.ph)) * (1 - e.k)
    }
  }
}
