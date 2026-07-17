import * as THREE from 'three'
import { lerp } from '../../core/utils.js'
import { NEXUS_X } from './constants.js'

const smooth = k => k * k * (3 - 2 * k)
const DUR = 4.2      // total cinematic length (hard cap ≤ 4.5s)
const T_LANE = 1.1   // leave the enemy war fire, begin the lane run
const T_BASE = 2.9   // arrive west, rise over the home war camp
const _look = new THREE.Vector3()
const _p = new THREE.Vector3()

/**
 * WAR RIFT opening cinematic — a 4.2s letterboxed sweep from the enemy war
 * fire down the lane to the player's base: title card, VS plates, then the
 * gates-open moment before snapping to the gameplay camera. ANY key (or
 * click) skips it. Pure presentation: the scene routes update() here and
 * nowhere else while it runs, so no gameplay state advances.
 */
export class MobaIntro {
  constructor(g) {
    this.g = g
    this.t = 0
    this.done = false
    this._title = null
    this._vs = null
    this._titleOut = false
    this._vsOut = false
    this._gate = false
    g.ui.cineMode(true)
    g.ui.setCine(true)
  }

  update(dt) {
    const g = this.g
    this.t += dt
    // idle-breathe the champions (animation clocks only — no AI, no movement)
    g.hero.setMoveSpeed(0)
    g.hero.update(dt)
    g.enemy.hero.setMoveSpeed(0)
    g.enemy.hero.update(dt)

    // ---- overlay schedule ----
    if (!this._title && this.t >= 0.2) this._title = g.ui.showTitle()
    if (this._title && !this._titleOut && this.t >= 1.45) { this._titleOut = true; this._title.out() }
    if (!this._vs && this.t >= 1.65) { this._vs = g.ui.showVs(g.playerName); g.ctx.audio.play('cast', { vol: 0.5 }) }
    if (this._vs && !this._vsOut && this.t >= 2.95) { this._vsOut = true; this._vs.out() }
    if (!this._gate && this.t >= 3.1) this._fireGate()

    this._camera(this.t)
    if (this.t >= DUR) this.finish()
  }

  /** Sweep: enemy war fire → lane run (sampling the lane path) → rise over home base. */
  _camera(t) {
    const cam = this.g.camera
    if (t < T_LANE) {
      // tight on the enemy war fire, sliding down toward the lane mouth
      const s = smooth(t / T_LANE)
      cam.position.set(lerp(52.5, 44, s), lerp(4.9, 4.7, s), lerp(6.9, 7.0, s))
      _look.set(lerp(NEXUS_X, 38, s * s), lerp(4.1, 1.5, s), 0)
    } else if (t < T_BASE) {
      const s = smooth((t - T_LANE) / (T_BASE - T_LANE))
      const x = lerp(44, -30, s)
      cam.position.set(x, 4.8 + Math.sin(s * Math.PI) * 1.1, 7.2 + Math.sin(x * 0.05) * 0.7)
      const w = smooth(Math.min(1, s * 3))
      _look.set(lerp(38, x - 11, w), 1.2, Math.sin((x - 11) * 0.06) * 1.3 * w)
    } else {
      const s = smooth((t - T_BASE) / (DUR - T_BASE))
      cam.position.set(lerp(-30, -42.5, s), lerp(4.8, 24, s), lerp(6.5, 14, s))
      _look.set(lerp(-41, -42.5, s), lerp(1.2, 0.4, s), Math.sin(-41 * 0.06) * 1.3 * (1 - s))
    }
    cam.lookAt(_look)
  }

  /** Gates-open: the home war camp roars awake as the champion musters. */
  _fireGate() {
    this._gate = true
    const g = this.g
    const base = g.env.nexusDefs.blue
    _p.set(base.x, 0, 0)
    g.vfx.ring(_p, { color: '#ffb84d', radius: 8, life: 0.6 })
    for (const a of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4]) {
      _p.set(base.x + Math.cos(a) * 3.4, 3.6, Math.sin(a) * 3.4)
      g.vfx.burst(_p, { color: '#ffb84d', count: 14, speed: 4, size: 0.26, life: 0.7, up: 5, gravity: 2 })
    }
    g.ctx.audio.play('tower', { vol: 0.5 })
    g.ctx.audio.play('go', { vol: 0.5 })
    g.ctx.engine.shake(0.22, 0.5)
  }

  skip() { this.finish() }

  finish() {
    if (this.done) return
    this.done = true
    const g = this.g
    this._title?.out()
    this._vs?.out()
    g.ui.setCine(false)
    g.ui.cineMode(false)
    // The war was mustering behind the gates: credit the intro's run time
    // against the FIRST wave timer so wall-clock pacing matches the
    // pre-cinematic game (nothing moved or fought during the intro itself).
    g.waveT = Math.max(0.5, g.waveT - this.t)
    g._beginPlay()
  }
}
