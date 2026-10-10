import { rand } from '../../core/utils.js'
import { MAIN } from './stage.js'
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
    if (this.retargetT <= 0 || !this.target || this.target.stocks <= 0 || this.target.state === 'out') {
      this.retargetT = this.difficulty.retarget * rand(.8, 1.2)
      this.target = this._pickTarget(fighters)
      if (this.target) { this.seenX = this.target.pos.x; this.seenY = this.target.pos.y }
    }

    const pos = f.pos
    // ---------- recovery: get back to the island at all costs ----------
    if (Math.abs(pos.x) > MAIN.halfW - 0.3 || pos.y < -1) {
      it.move = pos.x > 0 ? -1 : 1
      // burn the air jump LOW while holding toward stage — the jump's momentum
      // redirect kills outward launch velocity, then air-drift does the rest
      const canAct = f.hitstun <= 0 && !f.grounded && f.airJumps > 0
      if (canAct && f.vel.y < 0 && pos.y < this.difficulty.recoveryHeight) it.jump = true
      if (canAct && pos.y < -7) it.jump = true
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

    // ---------- steering ----------
    let want = dx > 0 ? 1 : -1
    if (f.dmg > 110 && adx < 3.4 && tgt.attack) want *= -1 // scared at kill %
    else if (adx < this.spacing * 0.5) want *= -0.4 // don't stack
    // never chase off the ledge
    if (Math.abs(pos.x) > MAIN.halfW - 1.2 && Math.sign(want) === Math.sign(pos.x) && Math.abs(tgt.pos.x) > MAIN.halfW) want = 0
    it.move = want

    // ---------- vertical play ----------
    if (decide) {
      if (dy > 2.2 && f.grounded && adx < 7) it.jump = true
      else if (dy < -2.5 && f.grounded && f.platform && !f.platform.solid) it.drop = true
      else if (f.grounded && Math.random() < 0.07) it.jump = true // stay lively
    }
    it.fastFall = !f.grounded && f.vel.y < 0 && dy < -2.5

    // ---------- attacks ----------
    if (decide && f.hitstun <= 0 && !f.attack && f.dodgeT <= 0) {
      const inRange = adx < 2.1 * f.scaleMul && Math.abs(dy) < 1.7
      if (inRange && tgt.state === 'fight' && !tgt.untouchable() && Math.random() < this.difficulty.aggression) {
        const killable = tgt.dmg >= 85
        if (!this.jabsOnly && Math.random() < (killable ? this.difficulty.finishChance : this.difficulty.smashChance)) it.smash = true
        else it.jab = true
      }
    }

    // ---------- defensive dodge ----------
    if (decide && tgt.attack && this.dodgeRead !== tgt.attack && adx < 2.7 && f.grounded) {
      this.dodgeRead = tgt.attack
      if (Math.random() < this.difficulty.dodgeChance) {
        it.dodge = dx > 0 ? -1 : 1
        it.jab = it.smash = false
      }
    }
    return it
  }

  _pickTarget(fighters) {
    let best = null, bs = Infinity
    for (const o of fighters) {
      if (o === this.f || o.team === this.f.team) continue
      if (o.stocks <= 0 || o.state === 'out') continue
      const d = Math.abs(o.pos.x - this.f.pos.x) + Math.abs(o.pos.y - this.f.pos.y) * 0.6
      const score = d - (o.dmg >= 85 ? this.difficulty.targetFinishBias : 0)
      if (score < bs) { bs = score; best = o }
    }
    return best
  }
}
