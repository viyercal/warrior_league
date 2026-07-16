import { rand } from '../../core/utils.js'
import { MAIN } from './stage.js'

/**
 * Free-for-all brawler AI. Produces an intent object each frame:
 * { move, jump, fastFall, drop, jab, smash, dodge }.
 * Discrete decisions (attack / dodge / hop) happen on reaction ticks
 * (~200-350ms); steering and recovery run continuously.
 */
export class BrawlAI {
  constructor(fighter, { jabsOnly = false } = {}) {
    this.f = fighter
    this.jabsOnly = jabsOnly
    this.reaction = rand(0.2, 0.35)
    this.decideT = rand(0.2, 0.6)
    this.retargetT = 0
    this.target = null
    this.spacing = rand(1.05, 1.45)
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
      this.retargetT = rand(1.4, 2.8)
      this.target = this._pickTarget(fighters)
    }

    const pos = f.pos
    // ---------- recovery: get back to the island at all costs ----------
    if (Math.abs(pos.x) > MAIN.halfW - 0.3 || pos.y < -1) {
      it.move = pos.x > 0 ? -1 : 1
      if (f.vel.y < 1.5 && pos.y < 2.5 && (f.grounded || f.airJumps > 0)) it.jump = true
      if (pos.y < -7 && f.airJumps > 0) it.jump = true
      return it
    }

    const tgt = this.target
    if (!tgt) {
      it.move = pos.x > 1 ? -0.5 : pos.x < -1 ? 0.5 : 0
      return it
    }

    const dx = tgt.pos.x - pos.x
    const dy = tgt.pos.y - pos.y
    const adx = Math.abs(dx)

    this.decideT -= dt
    const decide = this.decideT <= 0
    if (decide) this.decideT = this.reaction * rand(0.8, 1.5)

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
      if (inRange && tgt.state === 'fight' && !tgt.untouchable()) {
        const killable = tgt.dmg >= 85
        if (!this.jabsOnly && Math.random() < (killable ? 0.6 : 0.22)) it.smash = true
        else it.jab = true
      }
    }

    // ---------- defensive dodge ----------
    if (decide && tgt.attack && adx < 2.7 && f.grounded && Math.random() < 0.32) {
      it.dodge = dx > 0 ? -1 : 1
    }
    return it
  }

  _pickTarget(fighters) {
    let best = null, bs = Infinity
    for (const o of fighters) {
      if (o === this.f || o.team === this.f.team) continue
      if (o.stocks <= 0 || o.state === 'out') continue
      const d = Math.abs(o.pos.x - this.f.pos.x) + Math.abs(o.pos.y - this.f.pos.y) * 0.6
      const score = d - (o.dmg >= 85 ? 7 : 0)
      if (score < bs) { bs = score; best = o }
    }
    return best
  }
}
