import { rand } from '../../core/utils.js'
import { getSkill } from '../../meta/skills.js'
import { ATTACKS, WALL_X } from './fighters.js'

/**
 * Personality-driven duel AI. Produces an intent each frame
 * { move, crouch, block, jump, light, heavy, throw, dash } and casts its own
 * specials (with cooldowns + meter surge) through the shared DuelSpecials.
 *
 * Continuous steering (footsies) runs every frame; discrete reads (attack,
 * block, punish, anti-air, throw) happen on reaction ticks so each opponent
 * feels deliberate rather than frame-perfect. Stage-1 tuning is deliberately
 * beatable: slow reactions, low block probability, no whiff punishing.
 */
export class DuelAI {
  constructor(fighter, cfg, { specials, fight }) {
    this.f = fighter
    this.cfg = cfg
    this.specials = specials
    this.fight = fight
    this.skills = cfg.specials.map(getSkill)
    this.cds = this.skills.map(() => rand(1, 3)) // stagger openers
    this.decideT = rand(0.4, 0.8)
    this.blockHold = 0
    this.crouchHold = 0
    this.foeBlockStreak = 0    // reads an over-blocking player -> throws
    this.intent = { move: 0, crouch: false, block: false, jump: false, light: false, heavy: false, throw: false, dash: 0 }
  }

  update(gdt) {
    const it = this.intent
    it.jump = it.light = it.heavy = it.throw = false
    it.dash = 0
    it.move = 0
    it.crouch = false
    const f = this.f
    const c = this.cfg
    const foe = this.fight.foeOf(f)
    for (let i = 0; i < this.cds.length; i++) this.cds[i] = Math.max(0, this.cds[i] - gdt)
    this.blockHold = Math.max(0, this.blockHold - gdt)
    this.crouchHold = Math.max(0, this.crouchHold - gdt)
    it.block = this.blockHold > 0
    it.crouch = this.crouchHold > 0

    if (!f.canAct() && f.chainT <= 0) {
      // committed / stunned — but keep holding a block through blockstun
      return it
    }

    const dx = foe.pos.x - f.pos.x
    const adx = Math.abs(dx)
    const toward = dx > 0 ? 1 : -1

    // ---------- continuous reads (block / anti-air are reactions) ----------
    // reactive blocking: probability = difficulty, rolled once per foe attack
    if (foe.attack && !foe.attack._aiRead && ATTACKS[foe.attack.kind] && !ATTACKS[foe.attack.kind].air) {
      foe.attack._aiRead = true
      if (adx < 3.4 && Math.random() < c.blockProb) {
        this.blockHold = ATTACKS[foe.attack.kind].startup + 0.35 + rand(0, 0.2)
        // boss / grappler sometimes ducks a heavy to whiff-punish it
        if (ATTACKS[foe.attack.kind].high && Math.random() < c.whiffPunish * 0.6) {
          this.crouchHold = this.blockHold
          this.blockHold = 0
        }
      }
    }
    // anti-air: foe airborne and dropping onto us
    if (!foe.grounded && foe.vel.y < 2 && adx < 2.6 && Math.random() < c.antiAir * gdt * 6) {
      const ni = this.skills.findIndex(s => s.archetype === 'nova')
      if (ni >= 0 && this.cds[ni] <= 0 && f.canCast() && this.specials.cast(f, this.skills[ni])) {
        this.cds[ni] = this.skills[ni].cd * 1.15
      } else it.heavy = true
    }
    // whiff punish: foe attack in recovery right next to us
    if (foe.attack && adx < 2.4 && Math.random() < c.whiffPunish * gdt * 8) {
      const def = ATTACKS[foe.attack.kind]
      if (def && foe.attack.t > def.startup + def.active) { it.light = true; this.blockHold = 0 }
    }
    // chase an open chain window — the AI lands its own combos
    if (f.chainT > 0 && f.lastHitKind) {
      if (Math.random() < c.cancelProb && this._castBest(adx, foe)) return it
      if (Math.random() < c.chainProb) {
        const nxt = ATTACKS[f.lastHitKind].next
        if (nxt?.light) it.light = true
        else if (nxt?.heavy) it.heavy = true
        return it
      }
    }

    // track over-blocking players
    if (foe.blocking && adx < 2.2) this.foeBlockStreak += gdt
    else this.foeBlockStreak = Math.max(0, this.foeBlockStreak - gdt * 0.5)

    // ---------- footsies steering (every frame) ----------
    const drift = Math.sin(f.hero.t * 1.7) * 0.6 // dance around the preferred range
    const want = c.prefRange + drift
    if (adx > want + 0.5) it.move = toward
    else if (adx < want - 0.5) it.move = -toward
    it.move *= c.walkMul
    // grappler walks you to the corner: shade toward the foe's back wall
    if (c.archetype === 'grappler' && adx < 3 && Math.abs(foe.pos.x) < WALL_X - 3) it.move = toward * 0.8

    // ---------- reaction-tick decisions ----------
    this.decideT -= gdt
    if (this.decideT > 0) return it
    this.decideT = c.reaction * rand(0.8, 1.6)

    // specials with intent
    if (f.canCast() && this._castBest(adx, foe)) return it

    // throw an over-blocker (or just get grabby, if that's your thing)
    if (adx < 1.25 && foe.grounded && (this.foeBlockStreak > 0.7 || Math.random() < c.throwProb * 0.4)) {
      if (Math.random() < c.throwProb + (this.foeBlockStreak > 0.7 ? 0.35 : 0)) {
        it.throw = true
        this.foeBlockStreak = 0
        return it
      }
    }

    // strike when in range
    const reach = 1.9 * f.reachMul()
    if (adx < reach && foe.pos.y < 1.8 && f.canAct()) {
      const roll = Math.random()
      if (roll < c.aggression * 0.75) {
        if (foe.crouching) it.light = true // don't whiff heavies over crouchers
        else it[roll < c.aggression * 0.28 ? 'heavy' : 'light'] = true
        return it
      }
    }

    // dash in / jump in
    if (adx > 3.4 && adx < 8 && Math.random() < c.dashiness * 0.5) { it.dash = toward; return it }
    if (Math.random() < c.jumpiness * 0.5 && adx < 6) { it.jump = true; it.move = toward; return it }
    // zoner: back off if crowded
    if (c.archetype === 'zoner' && adx < 3 && Math.random() < 0.5) {
      if (Math.random() < 0.35) it.dash = -toward
      else it.move = -toward
    }
    return it
  }

  /** Pick the special this personality wants right now. Returns true if cast. */
  _castBest(adx, foe) {
    for (let i = 0; i < this.skills.length; i++) {
      if (this.cds[i] > 0) continue
      const s = this.skills[i]
      let want = false
      switch (s.archetype) {
        case 'projectile': want = adx > 4.5 && foe.grounded; break
        case 'slowfield': want = adx > 3 && adx < 9 && foe.grounded && foe.chillT <= 0; break
        case 'dash': want = adx > 2.8 && adx < 7 && Math.random() < 0.7; break
        case 'nova': want = adx < 2 || (!foe.grounded && adx < 2.6); break
        case 'giant': want = this.f.giantT <= 0 && adx < 5; break
        case 'pull': want = adx > 3.5 && adx < 6.8 && foe.grounded; break
        case 'meteor': want = Math.abs(foe.pos.x) < 2.4 && (foe.kdT > 0 || foe.hitstun > 0 || Math.random() < 0.4); break
        case 'buff': want = adx < 4; break
        case 'shield': want = adx < 3 && foe.attack == null; break
        case 'heal': want = this.f.hp < 45 && adx > 4; break
        case 'summon': want = adx < 5; break
        case 'ghost': want = foe.blocking || this.foeBlockStreak > 0.5; break
      }
      if (!want) continue
      if (this.specials.cast(this.f, s)) {
        this.cds[i] = s.cd * 1.15
        return true
      }
    }
    return false
  }
}
