import * as THREE from 'three'
import { damp, lerp } from '../../core/utils.js'
import { fmtTime } from './kartHud.js'

const EPS = 0.0025 // progress hysteresis (~2m) so side-by-side racing can't flap

/**
 * Presentation-layer race drama: slow-mo envelope + camera punch for money
 * moments, the RIVAL system (crimson chevron, overtake stings), the final-lap
 * war-drum layer + torch flare, and end-of-race stat lines. Pure add-on —
 * reads race state, never mutates driving physics, AI or race rules.
 */
export class RaceDrama {
  constructor({ scene, ui, audio, track, player }) {
    Object.assign(this, { scene, ui, audio, track, player })
    this.slowT = 0
    this.slowScale = 0.3
    this.punch = 0
    this.rival = null
    this._relSign = 0
    this._chevT = 0
    this.finalLapOn = false
    this._drumT = 0.2
    this._drumBeat = 0
    this.raceOver = false
    this.stats = { bestLap: null, topSpeed: 0, driftBoosts: 0, shellsLanded: 0, casts: [0, 0, 0, 0] }

    // crimson war-chevron hovering over the rival's chariot
    this.chevron = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.6, 4),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#c23b2e').multiplyScalar(0.9),
        transparent: true, opacity: 0.92,
      }),
    )
    this.chevron.rotation.x = Math.PI
    this.chevron.visible = false
    scene.add(this.chevron)
  }

  // ---------- time scale / punch ----------

  slowmo(dur, scale = 0.3) {
    if (dur >= this.slowT) { this.slowT = dur; this.slowScale = scale }
  }

  addPunch(v) { this.punch = Math.max(this.punch, v) }

  /** Advance envelopes; returns the world time scale for this frame. */
  tick(dt) {
    this.punch = damp(this.punch, 0, 1.6, dt)
    if (this.slowT > 0) {
      this.slowT -= dt
      return this.slowT > 0.3 ? this.slowScale : lerp(this.slowScale, 1, 1 - Math.max(0, this.slowT) / 0.3)
    }
    return 1
  }

  // ---------- money moments ----------

  /** Player's shell lands square on the rival: 0.5s slow-mo + punch-in. */
  rivalStruck() {
    this.slowmo(0.5, 0.32)
    this.addPunch(0.55)
  }

  /** Player wrecked by shell/comet: brief impact frame so it reads as an event. */
  wreck() {
    this.slowmo(0.4, 0.3)
    this.addPunch(0.4)
    this.ui.impactFlash()
  }

  /** Player crosses the finish line (non-photo): long savoring slow-mo. */
  finishMoment() { this.slowmo(1.5, 0.3) }

  // ---------- per-frame race bookkeeping ----------

  /** Call once per racing frame (real dt): rival, drums, stat sampling. */
  raceTick(dt, standings) {
    if (this.raceOver) return
    const p = this.player
    this.stats.topSpeed = Math.max(this.stats.topSpeed, p.speed)

    // rival overtake / overtaken stings (hysteresis via EPS)
    const r = this.rival
    if (r) {
      const d = r.progress - p.progress
      if (this._relSign > 0 && d < -EPS) {
        this.ui.popup('RIVAL DOWN ▲', 'rival')
        this.audio.play('kill', { vol: 0.5 })
      } else if (this._relSign < 0 && d > EPS) {
        this.ui.popup('RIVAL AHEAD ▼', 'rival-warn')
        this.audio.play('buzzer', { vol: 0.22 })
      }
    }
    // rival = adjacent racer in standings (ahead; the chaser when leading)
    const i = standings.indexOf(p)
    const next = (i > 0 ? standings[i - 1] : standings[i + 1]) || null
    if (next !== this.rival) this._setRival(next)
    if (this.rival) {
      const d = this.rival.progress - p.progress
      if (Math.abs(d) > EPS) this._relSign = Math.sign(d)
      const rp = this.rival.group.position
      this._chevT += dt
      this.chevron.position.set(rp.x, 2.55 + Math.sin(this._chevT * 3.2) * 0.15, rp.z)
      this.chevron.rotation.y += dt * 2.4
    }

    // final lap: subtle war-drum layer under the (music-less) din
    if (this.finalLapOn) {
      this._drumT -= dt
      if (this._drumT <= 0) {
        this._drumT = 0.46
        this._drumBeat++
        const accent = this._drumBeat % 4 === 1
        this.audio.play(accent ? 'hit' : 'bounce', { vol: accent ? 0.15 : 0.11 })
      }
    }
  }

  _setRival(next) {
    this.rival = next
    this.chevron.visible = !!next && !this.raceOver
    this.ui.setRival(next ? next.name : null)
    this._relSign = next ? Math.sign(next.progress - this.player.progress) || 1 : 0
  }

  // ---------- milestones ----------

  /** FINAL LAP: war-horn sting, drums start, trackside torches flare. */
  finalLap() {
    this.finalLapOn = true
    this.track.flareTarget = 1.7
    this.audio.play('tower', { vol: 0.8 })
  }

  noteLap(sec) {
    this.stats.bestLap = this.stats.bestLap == null ? sec : Math.min(this.stats.bestLap, sec)
  }

  setRaceOver() {
    this.raceOver = true
    this.finalLapOn = false
    this.track.flareTarget = 1
    this.chevron.visible = false
    this.ui.setRival(null)
  }

  /** [label, value] rows for the results tablet. */
  finalStats(skillDefs) {
    const s = this.stats
    const max = Math.max(...s.casts)
    const fav = max > 0 ? skillDefs[s.casts.indexOf(max)].name : '—'
    return [
      ['BEST LAP', s.bestLap != null ? fmtTime(s.bestLap) : '—'],
      ['TOP SPEED', `${Math.round(s.topSpeed * 4.4)} km/h`],
      ['DRIFT BOOSTS', String(s.driftBoosts)],
      ['SHELLS LANDED', String(s.shellsLanded)],
      ['FAVORITE ART', fav],
    ]
  }
}
