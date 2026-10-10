import { rand } from '../../core/utils.js'
import { MAIN, PLATFORMS } from './stage.js'
import { ATTACKS } from './fighter.js'
import { cpuDifficulty } from '../../core/cpuDifficulty.js'

/**
 * Free-for-all brawler AI. Produces an intent object each frame:
 * { move, jump, fastFall, drop, jab, smash, dodge }.
 * Discrete decisions (attack / dodge / hop) happen on reaction ticks
 * (about 100-720ms, depending on level); recovery runs continuously.
 */
export class BrawlAI {
  constructor(fighter, { jabsOnly = false, difficulty = cpuDifficulty().brawl } = {}) {
    this.f = fighter
    this.difficulty = difficulty
    this.jabsOnly = jabsOnly
    this.reaction = difficulty.reaction
    this.decideT = this.reaction * rand(.8, 1.2)
    this.retargetT = 0
    this.target = null
    this.spacing = difficulty.spacing * rand(.9, 1.1)
    this.seenX = 0
    this.seenY = 0
    this.dodgeRead = null
    this.comboRead = null
    this.comboDelay = 0
    this.comboDecided = false
    this.intent = { move: 0, jump: false, fastFall: false, drop: false, jab: false, smash: false, dodge: 0 }
  }

  update(dt, fighters) {
    const it = this.intent
    it.jump = it.drop = it.jab = it.smash = false
    it.dodge = 0
    it.fastFall = false
    it.move = 0
    const f = this.f
    if (f.state !== 'fight') return it

    this.retargetT -= dt
    if (this.retargetT <= 0 || !this.target || this.target.stocks <= 0 || this.target.state !== 'fight') {
      this.retargetT = this.difficulty.retarget * rand(.8, 1.2)
      this.target = this._pickTarget(fighters)
      if (this.target) { this.seenX = this.target.pos.x; this.seenY = this.target.pos.y }
    }

    const pos = f.pos
    // ---------- recovery: get back to the island at all costs ----------
    if (Math.abs(pos.x) > MAIN.halfW - 0.3 || pos.y < -1) {
      it.move = pos.x > 0 ? -1 : 1
      // Jump sooner when far out or still travelling away from the island.
      // The air jump redirects momentum, but cannot save a fighter below its
      // maximum jump height. Lower tiers retain their later recovery timing.
      const canAct = f.hitstun <= 0 && !f.grounded && f.airJumps > 0
      const outward = f.vel.x * Math.sign(pos.x)
      const distance = Math.max(0, Math.abs(pos.x) - MAIN.halfW)
      const urgency = Math.min(2.2, distance * 0.28 + Math.max(0, outward) * 0.07)
      if (canAct && f.vel.y < 2 && pos.y < this.difficulty.recoveryHeight + urgency) it.jump = true
      return it
    }

    const tgt = this.target
    if (!tgt) {
      it.move = pos.x > 1 ? -0.5 : pos.x < -1 ? 0.5 : 0
      return it
    }

    this.decideT -= dt
    const decide = this.decideT <= 0
    if (decide) {
      this.decideT = this.reaction * rand(.85, 1.15)
      this.seenX = tgt.pos.x + (tgt.vel?.x || 0) * this.difficulty.anticipation
      this.seenY = tgt.pos.y
    }
    const dx = this.seenX - pos.x
    const dy = this.seenY - pos.y
    const adx = Math.abs(dx)

    // Approach into striking range, then brake without turning our back.
    const direction = dx >= 0 ? 1 : -1
    let want = adx > this.spacing ? direction : f.facing !== direction ? direction * 0.2 : 0
    if (!f.grounded && adx < 2 && Math.abs(f.vel.x) > 2) want = -Math.sign(f.vel.x)
    // Never chase an offstage target past the ledge. Grounded rolls also need
    // enough landing room for their full travel distance.
    if (Math.abs(pos.x) > MAIN.halfW - 1.2 && Math.sign(want) === Math.sign(pos.x) && Math.abs(this.seenX) > MAIN.halfW) want = 0
    it.move = want

    // Reach elevated opponents with the ordinary ground jump + air jump.
    // The upper platform is higher than one jump, so steer beneath its edge
    // first and save the second jump for near the first jump's apex.
    if (decide) {
      if (dy > 1.8 && adx < 7) {
        if (f.grounded) it.jump = true
        else if (f.airJumps > 0 && f.vel.y < 4 && pos.y > 0.6) it.jump = true
      } else if (dy < -2 && f.grounded && f.platform && !f.platform.solid) it.drop = true
    }
    const safeLanding = PLATFORMS.some(p => pos.y >= p.y && Math.abs(pos.x + f.vel.x * 0.18 - p.x) < p.halfW - 0.6)
    it.fastFall = !f.grounded && f.vel.y < 0 && dy < -2.5 && safeLanding && Math.abs(pos.x) < MAIN.halfW - 1

    // One delayed continuation decision per connected jab. Previously the AI
    // only attacked when idle, so it could never use the existing jab combo.
    if (this.comboRead !== f.attack) {
      this.comboRead = f.attack; this.comboDelay = 0; this.comboDecided = false
    }
    if (f.attack?.hasHit && ATTACKS[f.attack.kind]?.next && !this.comboDecided) {
      this.comboDelay += dt
      if (this.comboDelay >= this.reaction * 0.25) {
        this.comboDecided = true
        if (f.hitstun <= 0 && adx < 2.8 * f.scaleMul && Math.abs(dy) < 1.8 && Math.random() < this.difficulty.aggression) it.jab = true
      }
    }

    // ---------- attacks ----------
    if (decide && f.hitstun <= 0 && !f.attack && f.dodgeT <= 0) {
      const inRange = adx < 1.95 * f.scaleMul && Math.abs(dy) < 1.6
      if (inRange && tgt.state === 'fight' && !tgt.untouchable() && Math.random() < this.difficulty.aggression) {
        const killable = tgt.dmg >= 85
        const opening = tgt.hitstun > 0.12 || tgt.attack?.t > 0.3 || (killable && Math.abs(tgt.vel.x) < 3)
        if (!this.jabsOnly && f.grounded && opening && Math.random() < (killable ? this.difficulty.finishChance : this.difficulty.smashChance)) it.smash = true
        else it.jab = true
      }
    }

    // ---------- defensive dodge ----------
    if (decide && tgt.attack && this.dodgeRead !== tgt.attack && adx < 2.7 && Math.abs(dy) < 1.8 && f.grounded && !f.attack && f.hitstun <= 0 && f.dodgeCd <= 0) {
      this.dodgeRead = tgt.attack
      if (Math.random() < this.difficulty.dodgeChance) {
        const away = dx > 0 ? -1 : 1
        it.dodge = Math.abs(pos.x + away * 4.8) < MAIN.halfW - 0.7 ? away : -Math.sign(pos.x || away)
        it.jab = it.smash = false
      }
    }
    // Fighter movement sets facing before a new attack starts. Keep air
    // braking from turning a close-range attack away from its target.
    if ((it.jab || it.smash) && !f.attack) it.move = direction * 0.2
    return it
  }

  _pickTarget(fighters) {
    let best = null, bs = Infinity
    for (const o of fighters) {
      if (o === this.f || o.team === this.f.team) continue
      if (o.stocks <= 0 || o.state !== 'fight') continue
      const d = Math.abs(o.pos.x - this.f.pos.x) + Math.abs(o.pos.y - this.f.pos.y) * 0.6
      const score = d - (o.dmg >= 85 ? this.difficulty.targetFinishBias : 0)
      if (score < bs) { bs = score; best = o }
    }
    return best
  }
}
