import * as THREE from 'three'
import { canvasTexture } from '../../core/assets.js'
import { clamp, rand, TAU } from '../../core/utils.js'
import { COURT, GRAV } from './constants.js'

const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _tmp = new THREE.Vector3()

function ballTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.38, h * 0.34, 20, w / 2, h / 2, w * 0.72)
    g.addColorStop(0, '#ff9a4a')
    g.addColorStop(0.6, '#f07423')
    g.addColorStop(1, '#c2551a')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#3a1a08'
    ctx.lineWidth = 5
    // vertical + horizontal seams (equirect maps to sphere)
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()
    // curved seams
    ctx.beginPath(); ctx.ellipse(0, h / 2, w * 0.3, h * 0.42, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(w, h / 2, w * 0.3, h * 0.42, 0, Math.PI / 2, Math.PI * 1.5); ctx.stroke()
    // pebble noise
    ctx.globalAlpha = 0.05
    ctx.fillStyle = '#000'
    for (let i = 0; i < 500; i++) ctx.fillRect(rand(w), rand(h), 2, 2)
    ctx.globalAlpha = 1
  })
}

/**
 * The game ball: held (auto-dribble), flight (solved parabola), loose
 * (bouncy physics), drop (falling through net after a make).
 * Scene supplies an env via bind(): { audio, vfx, game, getPose(who) }.
 */
export class HoopsBall {
  constructor(scene) {
    this.scene = scene
    this.R = 0.17
    this.mat = new THREE.MeshStandardMaterial({
      map: ballTexture(), roughness: 0.55, metalness: 0,
      emissive: '#ff6a20', emissiveIntensity: 0,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.R, 20, 16), this.mat)
    this.mesh.castShadow = true
    scene.add(this.mesh)
    this.pos = this.mesh.position
    this.vel = new THREE.Vector3()

    this.state = 'held'          // held | flight | loose | drop | dead
    this.holder = 'player'
    this.dribblePhase = 0
    this.hesitate = 0            // crossover ball-hesitation timer
    this.spin = 0
    this.fire = false
    this._fireTrail = null
    this._sprintTrail = null
    this._flight = null
    this._wasLow = false
  }

  bind(env) { this.env = env }

  /* ---------------- state changes ---------------- */

  give(holder) {
    this.state = 'held'
    this.holder = holder
    this.vel.set(0, 0, 0)
    this._stopSprintTrail()
  }

  /**
   * Launch a real arc to `target` over `time`. onArrive fires once at the
   * end of the solved parabola.
   */
  shoot({ from, target, time = 1.1, onArrive = null, lateralError = 0 }) {
    this.state = 'flight'
    this.holder = null
    this.pos.copy(from)
    const T = time
    this.vel.set(
      (target.x - from.x) / T + lateralError * rand(-1, 1),
      (target.y - from.y - 0.5 * GRAV * T * T) / T,
      (target.z - from.z) / T,
    )
    this._flight = { t: 0, T, onArrive, target: target.clone() }
    this.spin = -9
  }

  /** Knock the ball free (blocks, swats). */
  swat(vel) {
    this.state = 'loose'
    this.holder = null
    this._flight = null
    this.vel.copy(vel)
    this._stopSprintTrail()
  }

  /** Rim-out: called at flight arrival on a miss. */
  bounceOut(strength = 1) {
    const a = rand(TAU)
    this.state = 'loose'
    this._flight = null
    this.vel.set(Math.cos(a) * rand(2, 4.4) * strength, rand(2.6, 4.2), Math.sin(a) * rand(2, 4.4) * strength + rand(0, 2.2))
  }

  /** Drop straight through the net after a make. */
  dropThrough() {
    this.state = 'drop'
    this._flight = null
    this.pos.copy(COURT.RIM).setY(COURT.RIM.y - 0.1)
    this.vel.set(rand(-0.3, 0.3), -2.2, rand(-0.3, 0.3))
  }

  setFire(on) {
    if (on === this.fire) return
    this.fire = on
    this.mat.emissiveIntensity = on ? 0.9 : 0
    if (on && !this._fireTrail) this._fireTrail = this.env.vfx.trail(this.mesh, { color: '#ff8a3c', size: 0.85, rate: 60, life: 0.5 })
    if (!on && this._fireTrail) { this._fireTrail.stop(); this._fireTrail = null }
  }

  setSprintTrail(on, color = '#7df9ff') {
    if (on && !this._sprintTrail) this._sprintTrail = this.env.vfx.trail(this.mesh, { color, size: 0.5, rate: 40, life: 0.3 })
    else if (!on) this._stopSprintTrail()
  }

  _stopSprintTrail() {
    if (this._sprintTrail) { this._sprintTrail.stop(); this._sprintTrail = null }
  }

  /* ---------------- update ---------------- */

  update(dt) {
    const { audio, game } = this.env
    if (this.state === 'held') this._updateHeld(dt)
    else if (this.state === 'flight') this._updateFlight(dt)
    else if (this.state === 'loose' || this.state === 'drop') this._updatePhysics(dt)

    this.mesh.rotation.x += this.spin * dt
    this.spin *= Math.exp(-0.4 * dt)
    if (this.fire) this.mat.emissiveIntensity = 0.7 + Math.sin(game.t * 9) * 0.3
    void audio
  }

  _updateHeld(dt) {
    const { game, audio } = this.env
    const e = game[this.holder]
    const grp = e.hero.group
    _fwd.set(Math.sin(grp.rotation.y), 0, Math.cos(grp.rotation.y))
    _right.set(_fwd.z, 0, -_fwd.x)
    const s = grp.scale.x

    if (e.metering || e.jumpT > 0 || game.phase === 'dunk') {
      // gathered in both hands, raised with the jump
      _tmp.copy(grp.position).addScaledVector(_fwd, 0.34 * s).addScaledVector(_right, 0.1 * s)
      const raise = e.metering ? 1.05 : 1.9
      this.pos.copy(_tmp).setY(grp.position.y + raise * s)
      return
    }
    // auto-dribble on a timed sine, hand -> floor
    if (this.hesitate > 0) this.hesitate -= dt
    else {
      const moving = e.hero.speed > 0.4
      const freq = moving ? 2.6 : 2.0
      const prev = this.dribblePhase
      this.dribblePhase += dt * freq
      if (Math.floor(prev + 0.5) !== Math.floor(this.dribblePhase + 0.5)) {
        if (this.holder === 'player') audio.play('bounce', { vol: 0.14 })
        else audio.play('bounce', { vol: 0.07 })
      }
    }
    const k = Math.abs(Math.sin(this.dribblePhase * Math.PI))
    _tmp.copy(grp.position).addScaledVector(_right, 0.46 * s).addScaledVector(_fwd, 0.18 * s)
    this.pos.copy(_tmp).setY(this.R + k * (0.78 * s))
    this.spin = 0
    this.mesh.rotation.x = 0
  }

  _updateFlight(dt) {
    const f = this._flight
    f.t += dt
    this.vel.y += GRAV * dt
    this.pos.addScaledVector(this.vel, dt)
    if (f.t >= f.T) {
      this.pos.copy(f.target)
      const cb = f.onArrive
      this._flight = null
      cb?.()
    }
  }

  _updatePhysics(dt) {
    const { audio, game } = this.env
    this.vel.y += GRAV * dt
    // gravity-rebound skill: loose balls curve to the player
    if (this.state === 'loose' && game.eff.pullT > 0) {
      _tmp.copy(game.player.hero.group.position).setY(this.pos.y).sub(this.pos)
      const d = _tmp.length()
      if (d > 0.3) this.vel.addScaledVector(_tmp.normalize(), dt * 14)
      this.vel.multiplyScalar(Math.exp(-0.5 * dt))
    }
    this.pos.addScaledVector(this.vel, dt)
    // floor
    if (this.pos.y < this.R) {
      this.pos.y = this.R
      if (this.state === 'drop') { this.state = 'loose' }
      if (Math.abs(this.vel.y) > 1.2) audio.play('bounce', { vol: clamp(Math.abs(this.vel.y) * 0.05, 0.05, 0.3) })
      this.vel.y = -this.vel.y * 0.6
      this.vel.x *= 0.86
      this.vel.z *= 0.86
      if (Math.abs(this.vel.y) < 0.6) this.vel.y = 0
    }
    // walls
    const B = COURT.BOUND
    if (this.pos.x < B.minX) { this.pos.x = B.minX; this.vel.x = Math.abs(this.vel.x) * 0.6 }
    if (this.pos.x > B.maxX) { this.pos.x = B.maxX; this.vel.x = -Math.abs(this.vel.x) * 0.6 }
    if (this.pos.z < B.minZ) { this.pos.z = B.minZ; this.vel.z = Math.abs(this.vel.z) * 0.6 }
    if (this.pos.z > B.maxZ) { this.pos.z = B.maxZ; this.vel.z = -Math.abs(this.vel.z) * 0.6 }
    // backboard face
    if (this.pos.z < COURT.BOARD_Z + this.R && this.pos.y > 2.9 && this.pos.y < 4.1 && Math.abs(this.pos.x) < 1) {
      this.pos.z = COURT.BOARD_Z + this.R
      this.vel.z = Math.abs(this.vel.z) * 0.55
    }
    this.spin = this.vel.length() * 2
  }
}
