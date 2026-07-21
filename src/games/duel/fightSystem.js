import * as THREE from 'three'
import { clamp } from '../../core/utils.js'
import { ATTACKS, EDGE } from './fighters.js'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()

const SCALING = 0.85 // damage x 0.85^n per combo hit (n = hits so far)

/**
 * Resolves everything that happens BETWEEN the two fighters: strikes, blocks
 * and chip, throws, parry-wards, heavy armor, juggles with damage scaling,
 * meter, hit-stop and combo bookkeeping. Emits events for the scene/HUD.
 *
 * events: { onHit(a,d,info), onBlock(a,d), onParry(a,d), onThrow(a,d),
 *           onComboEnd(d,hits,dmg), onKO(a,d) }
 */
export class FightSystem {
  constructor({ vfx, audio, engine, events }) {
    this.vfx = vfx
    this.audio = audio
    this.engine = engine
    this.events = events
    this.freezeT = 0       // hit-stop (scene skips fighter updates while > 0)
    this.fighters = []
    this.active = true     // hits only land while the round is live
    this._grab = null      // in-flight throw { a, d, t, slammed }
    this._txt = 8
  }

  setFighters(a, b) { this.fighters = [a, b] }
  foeOf(f) { return this.fighters[0] === f ? this.fighters[1] : this.fighters[0] }

  hitStop(kind) {
    this.freezeT = Math.max(this.freezeT, kind === 'special' ? 0.12 : kind === 'heavy' ? 0.09 : 0.06)
  }

  update(gdt) {
    this._txt = 8
    if (this.active) {
      this._resolveGrab(gdt)
      for (const f of this.fighters) this._resolveAttack(f)
      this._separate(gdt)
    }
    // combo end + juggle landings
    for (const f of this.fighters) {
      if (f.juggleFall && f.justLanded) {
        f.startKnockdown()
        this._endCombo(f, 'down')    // combo converted into a knockdown
      } else if (f.comboHits > 0 && f.grounded && f.hitstun <= 0 && !f.juggleFall && f.kdT <= 0 && f.staggerT <= 0 && !f.grabbed) {
        this._endCombo(f, 'escape')  // the victim recovered standing — dropped
      }
    }
  }

  _endCombo(d, reason = 'end') {
    if (d.comboHits <= 0) return
    this.events.onComboEnd?.(d, d.comboHits, Math.round(d.comboDmg), reason)
    d.comboHits = 0
    d.comboDmg = 0
  }

  /** Keep grounded fighters from standing inside each other. */
  _separate(gdt) {
    const [a, b] = this.fighters
    if (!a || !b || a.grabbed || b.grabbed || a.dragT > 0 || b.dragT > 0) return
    const dx = b.pos.x - a.pos.x
    const minD = 0.8
    if (Math.abs(dx) > minD || Math.abs(b.pos.y - a.pos.y) > 1.4) return
    const push = (minD - Math.abs(dx)) * 7 * gdt * (dx >= 0 ? 1 : dx < 0 ? -1 : a.facing)
    a.pos.x = clamp(a.pos.x - push, -EDGE, EDGE)
    b.pos.x = clamp(b.pos.x + push, -EDGE, EDGE)
  }

  // ============================ strikes ============================

  _resolveAttack(a) {
    const atk = a.attack
    if (!atk || atk.hasHit) return
    const def = ATTACKS[atk.kind]
    if (def.kind === 'throw') { this._resolveThrowStart(a, atk, def) ; return }
    const from = def.startup, to = def.startup + def.active
    if (atk.t < from || atk.t > to) return
    const d = this.foeOf(a)
    if (!d) return
    if (d.iFrames > 0 || d.kdT > 0 || d.grabbed) {
      this._whiffOverBody(a, atk, def, d)
      return
    }

    // horizontal reach in front of the attacker
    const dxf = (d.pos.x - a.pos.x) * a.facing
    const reach = def.reach * a.reachMul()
    if (dxf < -0.25 || dxf > reach + 0.35) return
    // vertical layer — generous against airborne bodies so juggles flow
    const dy = d.pos.y - a.pos.y
    const vTol = (!d.grounded || !a.grounded) ? 2.3 : 1.6
    if (Math.abs(dy) > vTol) return
    // high/low layer: standing heavy sails over a crouched foe
    if (def.high && d.crouching && d.grounded) return

    atk.hasHit = true
    this.applyHit(a, d, {
      dmg: def.dmg, kind: def.kind,
      hitstun: def.hitstun || 0.4, kb: def.kb,
      launch: def.launch || 0, knockdown: !!def.knockdown, splat: !!def.splat,
      overhead: !!def.overhead, unblockable: !!atk.unblockable,
      attackKind: atk.kind,
    })
  }

  /**
   * A strike sailing through a downed/invulnerable body must not read broken:
   * the attacker gets a clean whiff (swish, no spark) and the prone victim is
   * tagged 'DOWN' once per knockdown. Purely presentational — still a miss.
   */
  _whiffOverBody(a, atk, def, d) {
    if (atk.whiffCue || atk.hasHit) return
    const dxf = (d.pos.x - a.pos.x) * a.facing
    if (dxf < -0.25 || dxf > def.reach * a.reachMul() + 0.35 || Math.abs(d.pos.y - a.pos.y) > 1.8) return
    atk.whiffCue = true
    this.audio.play('swish', { vol: 0.18 })
    if (d.kdT > 0 && !d.downTag) {
      d.downTag = true
      _v2.set(d.pos.x, d.pos.y + 1.55, 0)
      this.vfx.text(_v2, 'DOWN', { color: '#cfc4ac', size: 0.48, life: 0.7, rise: 0.8 })
    }
  }

  /**
   * The one damage pipeline. Ward > armor > block > hit.
   * Returns 'parried' | 'armored' | 'blocked' | 'hit' | 'miss'.
   */
  applyHit(a, d, {
    dmg, kind = 'light', special = false, hitstun = 0.4, kb = 1.5,
    launch = 0, knockdown = false, splat = false, overhead = false, low = false,
    unblockable = false, stun = 0, surge = false, attackKind = null, color = null,
  } = {}) {
    if (!this.active || d.iFrames > 0 || d.kdT > 0 || d.grabbed) return 'miss'
    const dir = d.pos.x >= a.pos.x ? 1 : -1
    _v1.set((a.pos.x + d.pos.x) / 2, d.pos.y + 1.15, 0.35)
    const fxColor = color || (special ? '#ff8c3b' : a.glow)

    // 1. parry-ward: eats the hit, staggers the attacker — punish window
    if (d.wardT > 0) {
      d.wardT = 0
      a.staggerT = Math.max(a.staggerT, 0.9)
      a.attack = null
      a.chainT = 0
      this.vfx.flash(_v1, { color: '#d8c9a0', size: 3, life: 0.28 })
      this.vfx.ring(_v1, { color: '#e8dcc4', radius: 2.2, life: 0.4, y: 0.1 })
      this.audio.play('shield', { vol: 0.7 })
      this.freezeT = Math.max(this.freezeT, 0.08)
      this.events.onParry?.(d, a)
      return 'parried'
    }

    // 2. colossus armor: a heavy in startup shrugs off one interruption
    if (d.giantT > 0 && d.attack && !d.attack.armorUsed
      && ATTACKS[d.attack.kind]?.kind === 'heavy' && d.attack.t < ATTACKS[d.attack.kind].startup) {
      d.attack.armorUsed = true
      d.hp = Math.max(0, d.hp - dmg * 0.5)
      d.flashT = 0.7
      this.vfx.flash(_v1, { color: '#c9b083', size: 2.2, life: 0.2 })
      this.audio.play('shield', { vol: 0.45 })
      this._meter(a, d, dmg * 0.5)
      if (d.hp <= 0) this.events.onKO?.(a, d)
      return 'armored'
    }

    // 3. block: negates all damage except 15% chip from specials.
    //    Crouch-block loses to overheads (jump strikes).
    const blocked = d.blocking && !unblockable && !(overhead && d.crouching)
    if (blocked) {
      const chip = special ? dmg * 0.15 : 0
      if (chip > 0) {
        d.hp = Math.max(0, d.hp - chip)
        if (this._txt-- > 0) {
          _v2.set(d.pos.x, d.pos.y + 2.3, 0)
          this.vfx.text(_v2, `${Math.max(1, Math.round(chip))}`, { color: '#b8c4c8', size: 0.5, life: 0.6, rise: 1.6 })
        }
      }
      d.blockstun = Math.max(d.blockstun, 0.22)
      // pushback — cornered defenders shove the attacker back instead
      if (Math.abs(d.pos.x) > EDGE - 0.9 && Math.sign(d.pos.x) === dir) a.vel.x -= dir * 6.5
      else d.vel.x = dir * 6.5
      this.vfx.flash(_v1, { color: '#9fb2c8', size: 1.3, life: 0.16 })
      this.vfx.burst(_v1, { color: '#c8d4e2', count: 7, speed: 4, size: 0.16, life: 0.3, up: 1.5 })
      this.audio.play('shield', { vol: 0.3 })
      this._meter(a, d, chip + 0.8)
      this.events.onBlock?.(a, d)
      if (d.hp <= 0) this.events.onKO?.(a, d)
      return 'blocked'
    }

    // 4. clean hit
    if (d.healT > 0) d.healT = 0 // interrupt Warrior's Resolve
    const n = d.comboHits
    const scaled = dmg * Math.pow(SCALING, n) * (surge ? 1.5 : 1)
    d.hp = Math.max(0, d.hp - scaled)
    this._meter(a, d, scaled)
    d.comboHits++
    d.comboDmg += scaled
    d.attack = null
    d.chainT = 0
    d.crouching = false
    d.flashT = 1
    d.staggerT = 0

    const wasAirborne = !d.grounded
    if (wasAirborne) {
      // juggle re-pop
      d.juggleFall = true
      d.vel.y = Math.max(4.6, Math.min(7.4, launch || 5.6))
      d.vel.x = dir * Math.min(1.1, kb * 0.5)
      d.spinV = -dir * 9
    } else if (launch > 0) {
      d.juggleFall = true
      d.grounded = false
      d.pos.y += 0.05
      d.vel.y = launch
      d.vel.x = dir * kb
      d.spinV = -dir * 10
      d.hitstun = 0
    } else if (splat && Math.abs(d.pos.x) > EDGE - 2.2 && Math.sign(d.pos.x) === dir) {
      // corner wall-splat: bounce off the wall, still juggleable
      d.pos.x = clamp(d.pos.x + dir * 0.8, -EDGE, EDGE)
      d.juggleFall = true
      d.grounded = false
      d.pos.y += 0.05
      d.vel.y = 5
      d.vel.x = -dir * 2
      d.spinV = dir * 8
      _v2.set(Math.sign(d.pos.x) * (EDGE + 0.3), d.pos.y + 1.2, 0)
      this.vfx.burst(_v2, { color: '#9a8d78', count: 16, speed: 6, size: 0.24, life: 0.5, up: 3 })
      this.vfx.flash(_v2, { color: '#c9b083', size: 2.4, life: 0.2 })
      this.engine.shake(0.35, 0.3)
      this.audio.play('explode', { vol: 0.4, pan: clamp(d.pos.x / EDGE, -1, 1) * 0.65 })
    } else if (knockdown) {
      d.juggleFall = true
      d.grounded = false
      d.pos.y += 0.04
      d.vel.y = 4.2
      d.vel.x = dir * kb
      d.spinV = -dir * 8
    } else if (stun > 0) {
      d.staggerT = Math.max(d.staggerT, stun)
      d.vel.x = dir * kb * 1.6
    } else {
      d.hitstun = Math.max(d.hitstun, hitstun)
      d.vel.x = dir * kb * 2.4
    }

    // attacker chain window opens on HIT only
    if (attackKind) {
      a.chainT = a.chainWindow()
      a.lastHitKind = attackKind
    }

    // feedback: hit-stop + spark + number + sfx (+shake for heavies/specials)
    this.hitStop(special ? 'special' : kind)
    this.vfx.impact(_v1, { color: fxColor, size: special ? 1.15 : kind === 'heavy' ? 0.95 : 0.6 })
    if (this._txt-- > 0) {
      _v2.set(d.pos.x, d.pos.y + 2.35, 0)
      this.vfx.text(_v2, `${Math.max(1, Math.round(scaled))}`, {
        color: special ? '#ffb454' : kind === 'heavy' ? '#ff9440' : '#ffe9a8',
        size: special ? 0.8 : kind === 'heavy' ? 0.7 : 0.55, life: 0.7, rise: 2,
      })
    }
    const hitPan = clamp(d.pos.x / EDGE, -1, 1) * 0.65
    this.audio.play('hit', { vol: kind === 'heavy' || special ? 0.65 : 0.42, pan: hitPan })
    if (kind === 'heavy') this.audio.play('zap', { vol: 0.3, pan: hitPan })
    if (special) this.audio.play('zap', { vol: 0.4, pan: hitPan })
    if (kind === 'heavy' || special) this.engine.shake(special ? 0.34 : 0.26, 0.28)
    if (surge) this.engine.shake(0.45, 0.35)

    this.events.onHit?.(a, d, { dmg: scaled, combo: d.comboHits, comboDmg: d.comboDmg, special, kind })
    if (d.hp <= 0) this.events.onKO?.(a, d)
    return 'hit'
  }

  _meter(a, d, dmg) {
    a.meter = clamp(a.meter + dmg * 0.35, 0, 100)
    d.meter = clamp(d.meter + dmg * 0.25, 0, 100)
  }

  // ============================ throws ============================

  _resolveThrowStart(a, atk, def) {
    if (atk.t < def.startup || atk.t > def.startup + def.active || this._grab) return
    atk.hasHit = true
    const d = this.foeOf(a)
    const dxf = (d.pos.x - a.pos.x) * a.facing
    const inRange = dxf > -0.2 && dxf < def.reach + 0.25 && d.grounded && Math.abs(d.pos.y) < 0.3
    // throws lose to hits: a foe already mid-startup slips the grab
    const whiff = !inRange || d.iFrames > 0 || d.kdT > 0 || d.inAttackStartup() || d.grabbed
    if (whiff) { this.audio.play('dash', { vol: 0.2 }); return }
    // connect: unblockable — beats block
    d.grabbed = true
    d.attack = null
    d.blocking = false
    d.blockstun = 0
    this._grab = { a, d, t: 0 }
    a.attack = { kind: 'throw', t: def.startup + def.active, hasHit: true } // hold the grab pose
    this.audio.play('hit', { vol: 0.35, pan: clamp(d.pos.x / EDGE, -1, 1) * 0.65 })
  }

  _resolveGrab(gdt) {
    const g = this._grab
    if (!g) return
    g.t += gdt
    const { a, d } = g
    // hold the victim at arm's length, lift, then slam
    const holdX = clamp(a.pos.x + a.facing * 1.05, -EDGE, EDGE)
    if (g.t < 0.3) {
      d.pos.x = holdX
      d.pos.y = Math.min(0.9, g.t * 3.4)
      a.attack = { kind: 'throw', t: ATTACKS.throw.startup, hasHit: true }
    } else {
      // slam
      d.grabbed = false
      d.pos.y = 0.55
      d.grounded = false
      this._grab = null
      a.attack = null
      this.applyHit(a, d, {
        dmg: ATTACKS.throw.dmg, kind: 'heavy', hitstun: 0, kb: 3.4, knockdown: true,
        unblockable: true, attackKind: null, color: a.glow,
      })
      _v1.set(d.pos.x, 0.15, 0.3)
      this.vfx.ring(_v1, { color: '#c9b083', radius: 2, life: 0.35, y: 0.08 })
      this.engine.shake(0.4, 0.3)
      this.audio.play('explode', { vol: 0.45, pan: clamp(d.pos.x / EDGE, -1, 1) * 0.65 })
      this.events.onThrow?.(a, d)
    }
  }

  cancelGrab() {
    if (!this._grab) return
    this._grab.d.grabbed = false
    this._grab.a.attack = null
    this._grab = null
  }

  reset() {
    this.cancelGrab()
    this.freezeT = 0
    for (const f of this.fighters) { f.comboHits = 0; f.comboDmg = 0 }
  }
}
