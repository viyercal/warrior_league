import * as THREE from 'three'
import { clamp, lerp, TAU } from '../../core/utils.js'

const SEG = 1.25       // seconds per fighter beat
const LEAP_AT = 0.12   // leap start within a beat
const LEAP_DUR = 0.58  // airtime of the entrance leap
const PULL_DUR = 0.6   // final pull-back to fight framing
const smooth = k => k * k * (3 - 2 * k)
const _p = new THREE.Vector3()
const _p2 = new THREE.Vector3()

/**
 * MORTAL ARENA entrance cinematic: warriors leap onto the slab one by one
 * (player last), a name plate slams on each landing with a dust burst, the
 * camera hard-cuts between them, then pulls back to the fight framing.
 * Pure presentation — no combat state advances while it runs; the scene
 * skips it on any keypress via finalize(). Total runtime ≈ 4.35s.
 */
export class BrawlIntro {
  constructor({ camera, look, vfx, audio, engine, bHud, entries }) {
    Object.assign(this, { camera, look, vfx, audio, engine, bHud, entries })
    this.t = 0
    this.seg = -1
    this.plate = null
    this.pull = null
    this.finished = false
    for (const e of entries) {
      e.landed = false
      e.leaping = false
      e.f.root.visible = false
    }
    bHud.setCine(true)
  }

  get total() { return this.entries.length * SEG + PULL_DUR }

  /** Advance the cinematic. Returns true once it has fully played out. */
  update(dt) {
    if (this.finished) return true
    this.t += dt
    const seg = Math.min(this.entries.length, Math.floor(this.t / SEG))
    if (seg !== this.seg) this._cut(seg)
    if (seg < this.entries.length) this._beat(this.entries[seg], this.t - seg * SEG, dt)
    else this._pullBack()
    for (const e of this.entries) if (e.landed) e.f.hero.update(dt) // landed warriors idle in frame
    return this.t >= this.total ? (this.finished = true) : false
  }

  /** Hard camera cut at the start of each beat; last cut begins the pull-back. */
  _cut(seg) {
    this.seg = seg
    this.plate?.()
    this.plate = null
    if (seg >= this.entries.length) {
      this.pull = { from: this.camera.position.clone(), at: this.look.clone() }
      this.bHud.setCine(false)
      return
    }
    const lx = this.entries[seg].f.spawnX
    this.camAnchor = { x: lx * 0.78 + (lx === 0 ? 1.5 : 0), lx }
  }

  /** One fighter's beat: leap arc + flip, landing slam, slow dolly-in. */
  _beat(e, lt, dt) {
    const f = e.f
    const k = clamp((lt - LEAP_AT) / LEAP_DUR, 0, 1)
    if (k > 0 && !e.landed) {
      if (!e.leaping) {
        e.leaping = true
        f.root.visible = true
        f.blob.visible = false
        this.audio.play('dash', { vol: 0.3 })
      }
      f.pos.x = lerp(e.from.x, f.spawnX, k)
      f.pos.y = lerp(e.from.y, 0, k) + Math.sin(k * Math.PI) * e.arc
      f.hero.setMoveSpeed(0)
      f.hero.update(dt)
      f.hero.hips.rotation.x -= TAU * smooth(Math.min(1, k * 1.15)) // entrance front-flip
      if (k >= 1) this._land(e)
    }
    const a = this.camAnchor
    this.camera.position.set(a.x + lt * 0.22, 2.1 + lt * 0.14, 9.0 - lt * 0.8)
    this.look.set(a.lx, 1.32, 0)
    this.camera.lookAt(this.look)
  }

  _land(e) {
    const f = e.f
    e.landed = true
    f.pos.set(f.spawnX, 0, 0)
    f.blob.visible = true
    f.root.rotation.y = f.facing * 0.55 // squared up to the close-up camera; fight pose damps back in
    _p.set(f.spawnX, 0.05, 0)
    this.vfx.burst(_p, { color: '#bfae8e', count: 18, speed: 4.6, size: 0.24, life: 0.6, gravity: -6, up: 2.6 })
    this.vfx.burst(_p, { color: '#8a7d6a', count: 10, speed: 2.6, size: 0.3, life: 0.75, gravity: -4, up: 1.4 })
    this.vfx.ring(_p, { color: f.glow, radius: 2.1, life: 0.38, y: 0.07 })
    this.engine.shake(0.34, 0.3)
    this.audio.play('bounce', { vol: 0.5 })
    this.audio.play('tower', { vol: 0.2 })
    this.plate = this.bHud.introPlate({ name: f.name, title: e.title, color: f.color })
  }

  _pullBack() {
    const k = smooth(clamp((this.t - this.entries.length * SEG) / PULL_DUR, 0, 1))
    this.camera.position.lerpVectors(this.pull.from, _p.set(0, 3.7, 21.6), k)
    this.look.lerpVectors(this.pull.at, _p2.set(0, 2, 0), k)
    this.camera.lookAt(this.look)
  }

  /** Snap straight to the post-intro tableau (skip / forced finish). Idempotent. */
  finalize() {
    this.finished = true
    this.plate?.()
    this.plate = null
    this.bHud.setCine(false)
    for (const e of this.entries) {
      const f = e.f
      if (f.state === 'out') continue // debug end-states hide fighters — leave them be
      f.root.visible = true
      f.blob.visible = true
      f.pos.set(f.spawnX, 0, 0)
      f.vel.set(0, 0)
    }
  }
}
