import { DuelAI } from './duelAi.js'
import { ATTACKS, WALL_X } from './fighters.js'
import { rand } from '../../core/utils.js'

/** Configurable duel opponent. The Tower keeps its original DuelAI tuning. */
export class SingleDuelAI extends DuelAI {
  constructor(fighter, cfg, env) {
    super(fighter, cfg, env)
    this.resetReads()
  }

  resetReads() {
    this.decideT = this.cfg.reaction * rand(.85, 1.15)
    this.seenX = -this.f.pos.x
    this.blockHold = this.crouchHold = 0
    this.foeBlockStreak = 0
    this._qrRolled = false
    this.readAttack = null
    this.readWait = 0
    this.attackRead = false
    this.chainKind = null
    this.chainWait = 0
    this.chainUsed = false
  }

  update(dt) {
    const f = this.f, c = this.cfg, foe = this.fight.foeOf(f), it = this.intent
    it.move = it.dash = 0
    it.crouch = it.block = it.jump = it.light = it.heavy = it.throw = false
    for (let i = 0; i < this.cds.length; i++) this.cds[i] = Math.max(0, this.cds[i] - dt)
    this.blockHold = Math.max(0, this.blockHold - dt)
    this.crouchHold = Math.max(0, this.crouchHold - dt)
    it.block = this.blockHold > 0
    it.crouch = this.crouchHold > 0
    this.decideT -= dt

    if (f.kdT > 0) {
      if (!this._qrRolled) { this._qrRolled = true; this._qrDo = Math.random() < c.quickRise }
      if (this._qrDo && f.qrT > 0) it.move = f.facing
      return it
    }
    this._qrRolled = false
    if (!f.canAct() && f.chainT <= 0) return it

    // Observe a visible attack, wait, then make one defensive read. Never read
    // keyboard input or roll again on every rendered frame of the same attack.
    if (foe.attack !== this.readAttack) {
      this.readAttack = foe.attack
      this.readWait = c.reaction * rand(.85, 1.15)
      this.attackRead = false
    }
    this.readWait -= dt
    const distance = Math.abs(foe.pos.x - f.pos.x)
    const def = foe.attack && ATTACKS[foe.attack.kind]
    if (def && !this.attackRead && this.readWait <= 0) {
      this.attackRead = true
      if (distance < 3.4 && def.kind !== 'throw' && Math.random() < c.blockProb) {
        this.blockHold = Math.max(.1, def.startup + def.active + def.recover - foe.attack.t)
        it.block = true
        if (def.low) { this.crouchHold = this.blockHold; it.crouch = true }
      }
    }
    this.foeBlockStreak = foe.blocking && distance < 2.2 ? this.foeBlockStreak + dt : Math.max(0, this.foeBlockStreak - dt)

    const toward = this.seenX > f.pos.x ? 1 : -1
    const seenDistance = Math.abs(this.seenX - f.pos.x)
    if (seenDistance > c.prefRange + .35) it.move = toward
    else if (seenDistance < c.prefRange - .4) it.move = -toward
    if (Math.abs(f.pos.x) > WALL_X - .6 && Math.sign(it.move) === Math.sign(f.pos.x)) it.move = 0

    if (f.chainT <= 0) { this.chainKind = null; this.chainUsed = false }
    if (f.chainT > 0 && f.lastHitKind) {
      if (this.chainKind !== f.lastHitKind) {
        this.chainKind = f.lastHitKind
        this.chainUsed = false
        this.chainWait = Math.min(.18, c.reaction * .45)
      }
      this.chainWait -= dt
      if (!this.chainUsed && this.chainWait <= 0) {
        this.chainUsed = true
        if (Math.random() < c.cancelProb && f.canCast() && this._castBest(distance, foe)) return it
        if (Math.random() < c.chainProb) {
          const next = ATTACKS[f.lastHitKind]?.next
          if (next?.light) it.light = true
          else if (next?.heavy) it.heavy = true
        }
      }
      return it
    }

    if (this.decideT > 0) return it
    this.decideT = c.reaction * rand(.85, 1.15)
    this.seenX = foe.pos.x
    const dx = foe.pos.x - f.pos.x
    const direction = dx >= 0 ? 1 : -1
    if (def && this.attackRead && foe.attack.t > def.startup + def.active && distance < 2.4 && Math.random() < c.whiffPunish) {
      this.blockHold = 0
      it.block = false
      it.light = true
      return it
    }
    if (it.block) return it
    if (!foe.grounded && foe.vel.y < 2 && distance < 2.6 && Math.random() < c.antiAir) {
      if (f.canCast() && this._castBest(distance, foe)) return it
      it.heavy = true
      return it
    }
    if (f.canCast() && this._castBest(distance, foe)) return it
    if (distance < 1.25 && foe.grounded && this.foeBlockStreak > c.readBlockTime && Math.random() < c.throwProb) {
      it.throw = true
      this.foeBlockStreak = 0
      return it
    }
    if (distance < 1.9 * f.reachMul() && foe.pos.y < 1.8 && Math.random() < c.aggression) {
      it[!foe.crouching && Math.random() < .28 ? 'heavy' : 'light'] = true
      return it
    }
    if (distance > 3.4 && distance < 8 && Math.random() < c.dashiness) it.dash = direction
    else if (distance < 6 && Math.random() < c.jumpiness) { it.jump = true; it.move = direction }
    return it
  }

  _castBest(distance, foe) {
    return Math.random() < this.cfg.specialChance && super._castBest(distance, foe)
  }
}
