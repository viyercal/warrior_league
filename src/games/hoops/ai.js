import * as THREE from 'three'
import { clamp, damp, distXZ, rand, pick } from '../../core/utils.js'
import { COURT } from './constants.js'

const _tmp = new THREE.Vector3()
const _tmp2 = new THREE.Vector3()

/**
 * CPU opponent brain. Reads/writes the shared game object; outputs a wish
 * velocity (game.ai.wish) + sprint flag; triggers shots/steals through
 * scene-provided helpers: { aiStartShot(kind), aiStealAttempt() }.
 */
export class CpuBrain {
  constructor(env) {
    this.env = env               // { game, helpers }
    this.mode = 'idle'
    this.decideT = 0
    this.spot = new THREE.Vector3()
    this.seen = new THREE.Vector3()  // lagged view of the player (reaction delay)
    this.stealT = 0
    this.contestT = 0
    this.driveSide = 1
  }

  update(dt) {
    const { game } = this.env
    const ai = game.ai
    ai.wish.set(0, 0, 0)
    ai.sprint = false
    if (game.phase !== 'live' || ai.stunT > 0) return

    // reaction lag: the brain sees a smoothed player position
    const P = game.player.hero.group.position
    this.seen.x = damp(this.seen.x, P.x, 6.5, dt)
    this.seen.z = damp(this.seen.z, P.z, 6.5, dt)
    if (ai.confuseT > 0) { ai.confuseT -= dt; return }   // bit on the decoy

    const ball = game.ball
    if (ball.state === 'loose' || ball.state === 'drop') return this._chaseBall(dt)
    if (game.offense === 'ai' && ball.holder === 'ai') return this._offense(dt)
    if (game.offense === 'player') return this._defense(dt)
  }

  /* ------------------------- rebounding ------------------------- */

  _chaseBall(dt) {
    const { game } = this.env
    const ball = game.ball
    _tmp.copy(ball.pos).setY(0)
    this._steerTo(_tmp, true)
    void dt
  }

  /* ------------------------- offense ------------------------- */

  _offense(dt) {
    const { game, helpers } = this.env
    const ai = game.ai
    const A = ai.hero.group.position
    if (ai.windup) return // mid-shot

    this.decideT -= dt
    const distRim = distXZ(A, COURT.RIM_FLOOR)
    const clockPanic = game.clock < 3.2

    if (this.mode !== 'drive' && this.mode !== 'stepback' && (this.decideT <= 0 || clockPanic)) {
      this.decideT = rand(0.7, 1.4)
      const laneOpen = this._laneOpen()
      if (clockPanic) this.mode = laneOpen && distRim < 5.5 ? 'drive' : 'shoot'
      else if (laneOpen && Math.random() < 0.55) {
        this.mode = 'drive'
        this.driveSide = Math.sign(rand(-1, 1)) || 1
        helpers.aiCrossover?.(this.driveSide)   // crossover burst into the drive
      }
      else if (distRim < 7.6 && Math.random() < 0.3) this.mode = 'stepback'
      else {
        this.mode = 'probe'
        const spots = [[-4.5, 1.5], [4.5, 1.5], [0, 3.6], [-6.2, -2.4], [6.2, -2.4], [-2.5, -0.5], [2.5, -0.5]]
        const s = pick(spots)
        this.spot.set(s[0] + rand(-0.6, 0.6), 0, s[1] + rand(-0.6, 0.6))
      }
    }

    if (this.mode === 'probe') {
      this._steerTo(this.spot, false)
      if (distXZ(A, this.spot) < 0.7) {
        // arrived: shoot if space, else re-decide
        if (this._playerFar(2.2) && Math.random() < 0.6) this.mode = 'shoot'
        else this.decideT = 0
      }
    } else if (this.mode === 'drive') {
      _tmp.set(this.driveSide * 1.4, 0, COURT.RIM_FLOOR.z + 1.6)
      const entry = distRim > 4.2 ? _tmp : _tmp.copy(COURT.RIM_FLOOR).setZ(COURT.RIM_FLOOR.z + 1.1)
      this._steerTo(entry, true)
      if (distRim < 2.3) { helpers.aiStartShot('layup'); this.mode = 'idle' }
      else if (!this._laneOpen() && distRim > 3.4 && Math.random() < 0.02) this.mode = 'stepback'
    } else if (this.mode === 'stepback') {
      _tmp.copy(A).sub(COURT.RIM_FLOOR).setY(0).normalize()
      _tmp2.copy(A).addScaledVector(_tmp, 2.2)
      this._steerTo(_tmp2, false)
      if (this._playerFar(1.8) || distXZ(A, _tmp2) < 0.4) { helpers.aiStartShot('jumper'); this.mode = 'idle' }
    } else if (this.mode === 'shoot') {
      helpers.aiStartShot(distRim < 3 ? 'layup' : 'jumper')
      this.mode = 'idle'
    }
  }

  _laneOpen() {
    // is the player parked between the AI and the rim?
    const { game } = this.env
    if (game.eff?.ghostT > 0) { /* player phased == still guards; ghost helps player offense */ }
    const A = game.ai.hero.group.position
    _tmp.copy(COURT.RIM_FLOOR).sub(A).setY(0)
    const len = _tmp.length()
    if (len < 1) return true
    _tmp.divideScalar(len)
    _tmp2.copy(this.seen).sub(A).setY(0)
    const along = _tmp2.dot(_tmp)
    if (along < 0 || along > len) return true
    const perp = Math.sqrt(Math.max(0, _tmp2.lengthSq() - along * along))
    return perp > 1.6
  }

  _playerFar(d) {
    return distXZ(this.env.game.ai.hero.group.position, this.seen) > d
  }

  /* ------------------------- defense ------------------------- */

  _defense(dt) {
    const { game, helpers } = this.env
    const ai = game.ai
    const A = ai.hero.group.position
    const p = game.player

    // guard spot: between (lagged) player and rim
    _tmp.copy(COURT.RIM_FLOOR).sub(this.seen).setY(0)
    const dRim = _tmp.length()
    _tmp.normalize()
    const guardDist = clamp(dRim * 0.35, 1.1, 2.6)
    _tmp2.copy(this.seen).addScaledVector(_tmp, guardDist)
    this._steerTo(_tmp2, distXZ(A, _tmp2) > 3)

    const dp = distXZ(A, p.hero.group.position)

    // contest: jump when the player is metering up close
    this.contestT -= dt
    if (p.metering && dp < 2.6 && ai.jumpT <= 0 && this.contestT <= 0 && Math.random() < 0.05) {
      helpers.aiJump()
      this.contestT = 1.2
    }

    // steal swipe when the handler dribbles carelessly close
    this.stealT -= dt
    if (this.stealT <= 0 && dp < 1.7 && !p.metering && game.ball.holder === 'player') {
      this.stealT = rand(1.6, 2.8)
      if (Math.random() < 0.38) helpers.aiStealAttempt()
    }
  }

  /* ------------------------- steering ------------------------- */

  _steerTo(target, sprint) {
    const { game } = this.env
    const ai = game.ai
    const A = ai.hero.group.position
    _tmp2.copy(target).sub(A).setY(0)
    const d = _tmp2.length()
    if (d < 0.12) return
    _tmp2.divideScalar(d)
    // decoy screen: steer around the hologram
    const dec = game.eff?.decoy
    if (dec) {
      const dd = distXZ(A, dec.pos)
      if (dd < 2.1) {
        const away = _tmp.copy(A).sub(dec.pos).setY(0).normalize()
        _tmp2.addScaledVector(away, (2.1 - dd) * 1.4)
        // tangential slide
        _tmp2.x += -away.z * 0.8
        _tmp2.z += away.x * 0.8
        _tmp2.normalize()
      }
    }
    ai.wish.copy(_tmp2)
    ai.sprint = !!sprint && d > 1.4
  }
}
