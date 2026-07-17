import * as THREE from 'three'
import { lerp } from '../../core/utils.js'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const smooth = k => k * k * (3 - 2 * k)

const FLY_END = 2.55   // spline flyover past the landmarks
const GRID_END = 4.1   // sweep over the grid, plates popping
const INTRO_END = 4.5  // settled behind the player -> countdown

/**
 * WAR CHARIOTS opening cinematic (presentation only — race state frozen).
 * Letterboxed track flyover riding the spline past braziers/bone arches,
 * a low sweep across the grid with a name plate popping per chariot, then
 * the camera settles behind the player. ANY key skips to the countdown.
 */
export class KartIntro {
  constructor({ camera, track, karts, player, hud, ui, audio }) {
    Object.assign(this, { camera, track, karts, player, hud, ui, audio })
    this.T = 0
    this.active = false
    this.plates = []
    this._banner = null
  }

  start() {
    this.active = true
    this.ui.setCine(true)
    this._banner = this.hud.banner('WAR CHARIOTS', {
      sub: '3 LAPS · 6 CHARIOTS · NO MERCY', color: '#ffb84d', duration: 2.4,
    })
    this.audio.play('crowd', { vol: 0.55 })
    this.audio.play('tower', { vol: 0.5, delay: 0.15 })

    // name plates, front of the grid first (largest sCont = closest to the line)
    const order = [...this.karts].sort((a, b) => b.sCont - a.sCont)
    this.plates = order.map((k, i) => {
      const el = this.hud.el('div', `kart-plate${k.isPlayer ? ' you' : ''}`)
      el.style.setProperty('--pc', k.isPlayer ? '#ffb84d' : k.mapColor)
      el.innerHTML = `<b>${k.name}</b>${k.isPlayer ? '<span>YOU</span>' : ''}`
      return { el, kart: k, popAt: FLY_END + 0.18 + i * 0.19, on: false }
    })
  }

  /** Advance the cinematic. Returns false once finished. */
  update(dt) {
    if (!this.active) return false
    this.T += dt
    const T = this.T
    const cam = this.camera
    const L = this.track.length

    if (T < FLY_END) {
      // ride the spline toward the start line, height easing down
      const k = smooth(T / FLY_END)
      const s = lerp(0.3, 0.012, k)
      this.track.posAt(s, _v1)
      this.track.leftAt(s, _v2)
      cam.position.set(_v1.x + _v2.x * 2.2, lerp(9.5, 4.2, k), _v1.z + _v2.z * 2.2)
      this.track.posAt(s - 0.045, _v3)
      _v3.y = 1.6
      cam.lookAt(_v3)
    } else if (T < GRID_END) {
      // low sweep down the grid, past the racers
      const k = smooth((T - FLY_END) / (GRID_END - FLY_END))
      const sCam = lerp(2 / L, -20 / L, k)
      this.track.posAt(sCam, _v1)
      this.track.leftAt(sCam, _v2)
      cam.position.set(_v1.x + _v2.x * 6.2, lerp(3.7, 2.5, k), _v1.z + _v2.z * 6.2)
      this.track.posAt(lerp(-5 / L, -17 / L, k), _v3)
      _v3.y = 1.05
      cam.lookAt(_v3)
    } else {
      // settle behind the player for the countdown
      const p = this.player
      const pp = p.group.position
      _v3.set(Math.sin(p.heading), 0, Math.cos(p.heading))
      _v1.set(pp.x - _v3.x * 7.5, 2.6, pp.z - _v3.z * 7.5)
      cam.position.lerp(_v1, 1 - Math.exp(-8 * dt))
      _v2.set(pp.x, 1.1, pp.z)
      cam.lookAt(_v2)
    }

    this._updatePlates()
    if (T >= INTRO_END) { this.end(); return false }
    return true
  }

  _updatePlates() {
    for (const p of this.plates) {
      if (!p.on && this.T >= p.popAt) {
        p.on = true
        p.el.classList.add('on')
        this.audio.play('click', { vol: 0.3 })
      }
      if (!p.on) continue
      _v1.copy(p.kart.group.position)
      _v1.y += 2.15
      _v1.project(this.camera)
      const behind = _v1.z > 1 || _v1.z < -1
      p.el.style.opacity = behind ? '0' : ''
      p.el.style.left = `${(_v1.x * 0.5 + 0.5) * 100}%`
      p.el.style.top = `${(-_v1.y * 0.5 + 0.5) * 100}%`
    }
  }

  /** Tear down all intro presentation (also the skip path). */
  end() {
    if (!this.active) return
    this.active = false
    this._banner?.remove()
    this._banner = null
    for (const p of this.plates) p.el.remove()
    this.plates.length = 0
    this.ui.setCine(false)
  }
}
