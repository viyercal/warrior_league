import * as THREE from 'three'
import { clamp, lerp } from '../../core/utils.js'

const smooth = k => k * k * (3 - 2 * k)
const _p = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

export const INTRO_DUR = 4.2 // hard budget: ≤ 4.5s
export const BOSS_DUR = 3.4

/**
 * ArenaCine — THE PIT's cinematic director. Owns the two letterboxed beats:
 *  - intro: camera descends into the pit past the brazier rim, "THE PIT" /
 *    "SURVIVE 8 WAVES" plates, gate-flash, snap to the battle camera.
 *  - boss: lights dim, floor fissures surge, the gate portal cracks wide and
 *    the PIT WARDEN strides in under a name slam (duel boss-entrance beat).
 * While `active` the scene freezes gameplay and hands the camera over; the
 * scene routes ANY key here as skip(). Presentation only — no game state.
 */
export class ArenaCine {
  constructor(scene) {
    this.s = scene
    this.mode = null
    this.t = 0
    this.INTRO_DUR = INTRO_DUR
    this.BOSS_DUR = BOSS_DUR
    this._done = null
    this._fired = {}
  }

  get active() { return !!this.mode }

  // ============================== intro ==============================

  startIntro(onDone) {
    const hud = this.s.hud
    this.mode = 'intro'
    this.t = 0
    this._fired = {}
    this._done = onDone
    this._bars(true)
    this.titleEl = hud.el('div', 'arena-title')
    hud.el('div', 'arena-title-main', 'THE PIT', this.titleEl)
    hud.el('div', 'arena-title-plate', 'SURVIVE 8 WAVES', this.titleEl)
    hud.el('div', 'arena-title-hint', 'PRESS ANY KEY', this.titleEl)
    this._introCam(0) // own the camera from frame one
  }

  _intro() {
    const t = this.t
    if (t >= 0.5 && !this._fired.title) { this._fired.title = 1; this.titleEl.classList.add('in') }
    if (t >= 3.1 && !this._fired.tOut) { this._fired.tOut = 1; this.titleEl.classList.add('out') }
    if (t >= 3.3 && !this._fired.gates) this._gateFlash()
    this._introCam(t)
    if (t >= INTRO_DUR) this._finish(false)
  }

  /** High overlook -> dive past the brazier rim -> low hero pass -> crane up to the battle camera. */
  _introCam(t) {
    const s = this.s
    const cam = s.camera
    const hp = s.hero.group.position
    if (t < 1.8) {
      const k = smooth(t / 1.8)
      cam.position.set(lerp(40, 26, k), lerp(26, 5.2, k), lerp(14, 3.0, k))
      s._look.set(0, lerp(3, 1.5, k), 0)
    } else if (t < 3.3) {
      const k = smooth((t - 1.8) / 1.5)
      cam.position.set(lerp(26, 7.5, k), lerp(5.2, 3.0, k), lerp(3.0, 7.0, k))
      s._look.set(hp.x, lerp(1.5, 1.1, k), hp.z)
    } else {
      const k = smooth(clamp((t - 3.3) / (INTRO_DUR - 3.3), 0, 1))
      cam.position.set(
        lerp(7.5, hp.x + s.camOffset.x, k),
        lerp(3.0, s.camOffset.y, k),
        lerp(7.0, hp.z + s.camOffset.z, k),
      )
      s._look.set(hp.x, lerp(1.1, 0.6, k), hp.z)
    }
    cam.lookAt(s._look)
  }

  /** Every spawn gate flares at once — the pit wakes up. */
  _gateFlash() {
    this._fired.gates = 1
    for (const g of this.s.env.gates) g.flash = 1
    this.s.ctx.audio.play('tower', { vol: 0.5 })
    this.s.ctx.audio.play('cast', { vol: 0.5, delay: 0.08 })
  }

  // ============================== boss entrance ==============================

  startBoss({ boss, gate }, onDone) {
    const s = this.s
    this.mode = 'boss'
    this.t = 0
    this._fired = {}
    this._done = onDone
    this.boss = boss
    this.gate = gate
    this._bars(true)
    s.exposureT = 0.5 // the lights die
    const len = Math.hypot(gate.x, gate.z) || 1
    this.ux = gate.x / len
    this.uz = gate.z / len
    this.walkFrom = boss.group.position.clone()
    this.walkTo = new THREE.Vector3(this.ux * 16.8, 0, this.uz * 16.8)
    this.camFrom = s.camera.position.clone()
    this.lookFrom = s._look.clone()
    this.dustT = 0.3
    s.ctx.audio.play('spawn', { vol: 0.9 })
    s.ctx.audio.play('tower', { vol: 0.7 })
    // ember surge rolls around the brazier ring
    s.env.brazierPositions.forEach((p, i) => {
      s._timeout(() => {
        _p.copy(p)
        s.vfx.burst(_p, { color: '#c23b2e', count: 14, speed: 4, size: 0.28, life: 0.8, up: 6, gravity: 2 })
      }, 150 + i * 90)
    })
  }

  _boss(dt) {
    const s = this.s
    const t = this.t
    const g = this.gate
    const boss = this.boss

    // the portal cracks wide and blazes while the warden steps through
    if (t < 2.9) g.flash = Math.max(g.flash, 0.9)
    const crack = smooth(clamp(t / 0.8, 0, 1))
    g.portal.scale.setScalar(1 + crack * (0.8 + 0.07 * Math.sin(t * 9)))
    // ember fissures pulse under the dimmed lights
    s.env.fissureSurge.k = smooth(clamp(t / 0.6, 0, 1)) * (0.72 + 0.28 * Math.sin(t * 6.5))

    // the warden strides in, dust at his heels
    const wk = smooth(clamp((t - 0.35) / 2.4, 0, 1))
    boss.group.position.lerpVectors(this.walkFrom, this.walkTo, wk)
    boss.hero.setMoveSpeed(wk > 0 && wk < 1 ? 2.9 : 0)
    boss.hero.faceTowards(s.hero.group.position, dt, 5)
    boss.hero.update(dt)
    if (wk > 0 && wk < 1) {
      this.dustT -= dt
      if (this.dustT <= 0) {
        this.dustT = 0.34
        _p.copy(boss.group.position)
        _p.y = 0.3
        s.vfx.burst(_p, { color: '#57493a', count: 6, speed: 2.6, size: 0.3, life: 0.5, up: 1.5 })
        s.ctx.engine.shake(0.08, 0.12)
      }
    }

    if (t >= 1.05 && !this._fired.slam) {
      this._fired.slam = 1
      s.hud.banner('PIT WARDEN', {
        sub: 'KEEPER OF THE CRUCIBLE&rsquo;S SHADOW', color: '#c23b2e', duration: 2.1, cls: 'arena-nameslam',
      })
      s.ctx.engine.shake(0.35, 0.7)
      s.ctx.audio.play('tower', { vol: 0.8 })
      s.ctx.audio.play('kill', { vol: 0.5, delay: 0.1 })
    }

    // camera: swing low to the gate, hold on the stride, crane back to battle
    const hp = s.hero.group.position
    const px = -this.uz, pz = this.ux
    if (t < 0.7) {
      const k = smooth(t / 0.7)
      _a.set(this.ux * 14.5 + px * 8.5, 4.2, this.uz * 14.5 + pz * 8.5)
      s.camera.position.lerpVectors(this.camFrom, _a, k)
      _b.set(boss.group.position.x, 3.4, boss.group.position.z)
      s._look.lerpVectors(this.lookFrom, _b, k)
    } else if (t < 2.75) {
      const k = smooth((t - 0.7) / 2.05)
      s.camera.position.set(
        lerp(this.ux * 14.5 + px * 8.5, this.ux * 11.5 + px * 5, k),
        lerp(4.2, 2.9, k),
        lerp(this.uz * 14.5 + pz * 8.5, this.uz * 11.5 + pz * 5, k),
      )
      s._look.set(boss.group.position.x, lerp(3.4, 2.6, k), boss.group.position.z)
    } else {
      const k = smooth((t - 2.75) / (BOSS_DUR - 2.75))
      _a.set(this.ux * 11.5 + px * 5, 2.9, this.uz * 11.5 + pz * 5)
      _b.set(hp.x + s.camOffset.x, s.camOffset.y, hp.z + s.camOffset.z)
      s.camera.position.lerpVectors(_a, _b, k)
      _b.set(boss.group.position.x, 2.6, boss.group.position.z)
      _p.set(hp.x, 0.6, hp.z)
      s._look.lerpVectors(_b, _p, k)
    }
    s.camera.lookAt(s._look)

    if (t >= BOSS_DUR) this._finish(false)
  }

  // ============================== shared plumbing ==============================

  update(dt) {
    if (!this.mode) return
    this.t += dt
    if (this.mode === 'intro') this._intro()
    else this._boss(dt)
  }

  /** End the current cinematic now. quiet = no stingers/banners (debug/QA paths). */
  skip(quiet = false) { if (this.mode) this._finish(quiet) }

  _finish(quiet) {
    const s = this.s
    const mode = this.mode
    this.mode = null
    this._bars(false)
    this.titleEl?.remove()
    this.titleEl = null
    if (mode === 'boss') {
      s.exposureT = 1.12
      this.boss.group.position.copy(this.walkTo)
      this.boss.hero.setMoveSpeed(0)
      this.gate.portal.scale.setScalar(1)
      this.boss = this.gate = null
    } else if (!quiet && !this._fired.gates) {
      this._gateFlash()
    }
    // snap to the battle camera
    const hp = s.hero.group.position
    s.camera.position.set(hp.x + s.camOffset.x, s.camOffset.y, hp.z + s.camOffset.z)
    s._look.set(hp.x, 0.6, hp.z)
    s.camera.lookAt(s._look)
    const done = this._done
    this._done = null
    done?.(quiet)
  }

  _bars(on) {
    if (!this.barT) {
      this.barT = this.s.hud.el('div', 'arena-cine arena-cine-top')
      this.barB = this.s.hud.el('div', 'arena-cine arena-cine-bot')
    }
    this.barT.classList.toggle('on', on)
    this.barB.classList.toggle('on', on)
    // dim gameplay HUD chrome while letterboxed (#ui class survives scene
    // changes, so it is also cleared in dispose())
    this.s.hud.root.classList.toggle('arena-cine-on', on)
  }

  dispose() {
    this.mode = null
    this.s.hud.root.classList.remove('arena-cine-on')
  }
}
