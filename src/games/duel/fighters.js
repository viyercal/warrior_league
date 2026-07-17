import * as THREE from 'three'
import { createHero } from '../../art/characterFactory.js'
import { contactShadow, glowSpriteMaterial } from '../../art/materials.js'
import { clamp, damp, lerp, TAU } from '../../core/utils.js'

// ---------------- tuning constants ----------------
export const WALL_X = 11.5      // arena walls (corner pressure)
export const EDGE = WALL_X - 0.35
export const GRAV = 30
export const JUMP_V = 10.6
export const WALK_FWD = 4.5
export const WALK_BACK = 3.1
export const DASH_TIME = 0.22
export const DASH_SPEED = 14
export const BACKDASH_TIME = 0.2
export const BACKDASH_SPEED = -12.5
export const KD_TIME = 0.95     // knockdown lie+rise
export const WAKEUP_INV = 0.5   // extra i-frames after rising
export const CHAIN_WINDOW = 0.35

/**
 * Frame data. All times in seconds; total = startup + active + recover.
 * `next` = chain transitions valid while the PREVIOUS hit's chain window is
 * open (chainT > 0, set only on HIT — never on whiff or block).
 */
export const ATTACKS = {
  jab:      { startup: 0.12, active: 0.08, recover: 0.16, dmg: 5,  kind: 'light', reach: 1.7,  hitstun: 0.40, kb: 1.2, next: { light: 'jab2' }, arm: 'R' },
  jab2:     { startup: 0.10, active: 0.08, recover: 0.18, dmg: 6,  kind: 'light', reach: 1.75, hitstun: 0.42, kb: 1.3, next: { heavy: 'launcher' }, arm: 'L' },
  launcher: { startup: 0.16, active: 0.10, recover: 0.24, dmg: 9,  kind: 'heavy', reach: 1.9,  launch: 11,    kb: 0.25, arm: 'R', rise: true },
  heavy:    { startup: 0.32, active: 0.10, recover: 0.30, dmg: 11, kind: 'heavy', reach: 2.1,  hitstun: 0.55, kb: 2.6, next: { heavy: 'heavy2' }, high: true, lunge: 2.0, arm: 'R' },
  heavy2:   { startup: 0.20, active: 0.10, recover: 0.36, dmg: 12, kind: 'heavy', reach: 2.2,  knockdown: true, kb: 5.5, splat: true, lunge: 1.4, arm: 'L' },
  low:      { startup: 0.10, active: 0.06, recover: 0.16, dmg: 4,  kind: 'light', reach: 1.5,  hitstun: 0.34, kb: 0.9, low: true, next: { light: 'jab' }, arm: 'R' },
  airJ:     { startup: 0.09, active: 0.30, recover: 0.08, dmg: 7,  kind: 'light', reach: 1.6,  hitstun: 0.42, kb: 1.5, overhead: true, air: true, arm: 'R' },
  airK:     { startup: 0.14, active: 0.30, recover: 0.10, dmg: 9,  kind: 'heavy', reach: 1.8,  hitstun: 0.52, kb: 2.4, overhead: true, air: true, arm: 'L' },
  throw:    { startup: 0.12, active: 0.04, recover: 0.50, dmg: 12, kind: 'throw', reach: 1.3, arm: 'R' },
}

const _v1 = new THREE.Vector3()

/**
 * One tournament fighter on the Z=0 plane: physics, stances, timers and
 * per-body presentation. The FightSystem resolves hits BETWEEN fighters;
 * this class owns movement feel and its own feedback (dust, poses, tumble).
 */
export class DuelFighter {
  constructor({ scene, vfx, audio, appearance, name, color, isPlayer = false, spawnX = 0 }) {
    this.scene = scene
    this.vfx = vfx
    this.audio = audio
    this.name = name
    this.color = color
    this.glow = appearance.glow || color
    this.isPlayer = isPlayer

    this.hero = createHero(appearance)
    // the crucible's torch ring pushes bright skin/bone albedos past the bloom
    // threshold — sun-starved pit fighters run darker (our hero instances only)
    if (this.hero.mats.skin) {
      this.hero.mats.skin.color.multiplyScalar(0.5)
      this.hero.mats.skin.envMapIntensity = 0.1
    }
    if (this.hero.mats.bone) {
      this.hero.mats.bone.color.multiplyScalar(0.8)
      this.hero.mats.bone.envMapIntensity = 0.15
    }
    this.root = new THREE.Group()
    this.root.add(this.hero.group)
    scene.add(this.root)
    // hero's built-in blob spins with tumble anims — use a root-level disc
    if (this.hero.shadowBlob) this.hero.shadowBlob.visible = false
    this.blob = contactShadow(0.62, 0.5)
    this.root.add(this.blob)
    this.pos = this.root.position
    this.pos.set(spawnX, 0, 0)
    this.spawnX = spawnX
    this.vel = new THREE.Vector2(0, 0)
    this.facing = spawnX <= 0 ? 1 : -1
    this.root.rotation.y = this.facing * 1.22

    // ---------- combat state ----------
    this.hp = 100
    this.meter = 0
    this.attack = null        // { kind, t, hasHit, unblockable, armorUsed }
    this.chainT = 0           // open cancel window (set on HIT)
    this.lastHitKind = null
    this.hitstun = 0
    this.blockstun = 0
    this.kdT = 0
    this.staggerT = 0
    this.iFrames = 0
    this.grabbed = false
    this.juggleFall = false   // airborne from a launch — knockdown on land
    this.justLanded = false   // one-frame flag read by FightSystem
    this.spinV = 0
    this.flashT = 0
    this.comboHits = 0        // hits TAKEN in the current combo (drives scaling)
    this.comboDmg = 0

    // ---------- movement state ----------
    this.grounded = true
    this.crouching = false
    this.blocking = false
    this.walkDir = 0
    this._bufAtk = null       // buffered attack input { btn, t } — comes out on the first actionable frame
    this.dashT = 0
    this.dashDir = 1
    this.backdash = false
    this.dashCd = 0
    this.airAtkUsed = false

    // ---------- status effects (set by specials, consumed here) ----------
    this.frenzyT = 0          // buff: chain window x1.5, walk x1.2
    this.giantT = 0           // colossus: heavy armor, reach x1.3, walk x0.8
    this.ghostT = 0           // wraith: next strike unblockable
    this.wardT = 0            // parry-ward: absorbs next hit, staggers attacker
    this.healT = 0
    this.healRate = 8
    this.chillT = 0
    this.dragT = 0            // being reeled by chained harrow
    this.dragFrom = 0
    this.dragTo = 0
    this.scaleMul = 1

    // heavy charge glow — gathering forge-fire on the striking glove
    this.chargeS = new THREE.Sprite(glowSpriteMaterial('#ff9a3e', 0))
    this.chargeS.scale.setScalar(0.001)
    this.hero.arms.R.glove.add(this.chargeS)

    // wraith-stance shimmer telegraph
    this.shimmer = new THREE.Sprite(glowSpriteMaterial('#d8d2c2', 0))
    this.shimmer.scale.set(2.2, 3, 1)
    this.shimmer.position.y = 1
    this.root.add(this.shimmer)

    // surge-ready ember aura at the feet
    this.surgeS = new THREE.Sprite(glowSpriteMaterial(this.glow, 0))
    this.surgeS.scale.set(2.6, 1, 1)
    this.surgeS.position.y = 0.25
    this.root.add(this.surgeS)
  }

  // -------------------- queries --------------------
  walkMul() {
    return (this.frenzyT > 0 ? 1.2 : 1) * (this.giantT > 0 ? 0.8 : 1) * (this.chillT > 0 ? 0.55 : 1)
  }
  reachMul() { return this.giantT > 0 ? 1.3 : 1 }
  chainWindow() { return CHAIN_WINDOW * (this.frenzyT > 0 ? 1.5 : 1) }
  airborne() { return !this.grounded }
  /** Free to start a fresh action. */
  canAct() {
    return !this.attack && this.hitstun <= 0 && this.blockstun <= 0 && this.kdT <= 0
      && this.staggerT <= 0 && !this.grabbed && this.dragT <= 0 && !this.juggleFall
  }
  /** Can a special be cast right now (fresh, or as a chain cancel)? */
  canCast() {
    if (this.hitstun > 0 || this.blockstun > 0 || this.kdT > 0 || this.staggerT > 0
      || this.grabbed || this.dragT > 0 || !this.grounded) return false
    return !this.attack || this.chainT > 0
  }
  inAttackStartup() {
    return !!this.attack && this.attack.t < ATTACKS[this.attack.kind].startup
  }

  resetRound(x) {
    this.hp = 100
    this.pos.set(x, 0, 0)
    this.vel.set(0, 0)
    this.attack = null
    this.chainT = 0
    this.lastHitKind = null
    this.hitstun = this.blockstun = this.kdT = this.staggerT = this.iFrames = 0
    this.grabbed = false
    this.juggleFall = false
    this.grounded = true
    this.crouching = this.blocking = false
    this.dashT = this.dashCd = 0
    this.frenzyT = this.giantT = this.ghostT = this.wardT = this.healT = this.chillT = this.dragT = 0
    this.comboHits = this.comboDmg = 0
    this.spinV = 0
    this._bufAtk = null
    this.hero.setState('normal')
    this.hero.group.rotation.x = 0
    this.hero.hips.rotation.x = 0
  }

  // -------------------- per-frame --------------------

  /** gdt = game dt (slow-mo aware); dt = real dt for animation. */
  update(gdt, dt, intent, foe) {
    // timers
    this.iFrames = Math.max(0, this.iFrames - gdt)
    this.chainT = Math.max(0, this.chainT - gdt)
    this.dashCd = Math.max(0, this.dashCd - gdt)
    this.chillT = Math.max(0, this.chillT - gdt)
    this.frenzyT = Math.max(0, this.frenzyT - gdt)
    this.giantT = Math.max(0, this.giantT - gdt)
    this.ghostT = Math.max(0, this.ghostT - gdt)
    this.wardT = Math.max(0, this.wardT - gdt)
    if (this.healT > 0) {
      this.healT = Math.max(0, this.healT - gdt)
      this.hp = Math.min(100, this.hp + this.healRate * gdt)
    }
    this.scaleMul = damp(this.scaleMul, this.giantT > 0 ? 1.18 : 1, 8, dt)
    this.root.scale.setScalar(this.scaleMul)

    // being reeled in by the chained harrow
    if (this.dragT > 0) {
      this.dragT -= gdt
      const k = 1 - Math.max(0, this.dragT) / 0.18
      this.pos.x = lerp(this.dragFrom, this.dragTo, Math.min(1, k))
      this.vel.set(0, 0)
    }

    if (this.grabbed) { this._visuals(dt, foe); return }

    // knockdown: lie, then rise
    if (this.kdT > 0) {
      this.kdT -= gdt
      if (this.kdT <= 0) {
        this.hero.setState('normal')
        this.iFrames = Math.max(this.iFrames, WAKEUP_INV)
      }
      this._visuals(dt, foe)
      return
    }

    this._control(gdt, intent, foe)
    this._physics(gdt)
    this._visuals(dt, foe)
  }

  // -------------------- control --------------------

  _control(dt, intent, foe) {
    // attack timeline
    if (this.attack) {
      const def = ATTACKS[this.attack.kind]
      this.attack.t += dt
      if (def.lunge && !this.attack.lunged && this.attack.t >= def.startup - 0.06) {
        this.attack.lunged = true
        this.vel.x += this.facing * def.lunge * 4
      }
      const total = def.startup + def.active + def.recover
      if (this.attack.t >= total || (def.air && this.grounded && this.attack.t > def.startup)) this.attack = null
    }

    // buffer attack presses so inputs during recovery still come out (0.26s)
    if (intent.light || intent.heavy) this._bufAtk = { btn: intent.light ? 'light' : 'heavy', t: 0.26 }
    else if (this._bufAtk) {
      this._bufAtk.t -= dt
      if (this._bufAtk.t <= 0) this._bufAtk = null
    }

    if (this.hitstun > 0) { this.hitstun -= dt; this.vel.x *= Math.exp(-6 * dt); return }
    if (this.blockstun > 0) { this.blockstun -= dt; this.blocking = true; this.vel.x *= Math.exp(-8 * dt); return }
    if (this.staggerT > 0) { this.staggerT -= dt; this.vel.x *= Math.exp(-6 * dt); return }

    // auto-face the foe when free on the ground
    if (this.grounded && !this.attack && foe) {
      const dx = foe.pos.x - this.pos.x
      if (Math.abs(dx) > 0.12) this.facing = dx > 0 ? 1 : -1
    }

    // stances (held)
    this.crouching = !!intent.crouch && this.grounded && (!this.attack || ATTACKS[this.attack.kind].low)
    this.blocking = !!intent.block && this.grounded && !this.attack && this.dashT <= 0

    // dash (double-tap, buffered event)
    if (intent.dash && this.grounded && this.canAct() && this.dashCd <= 0 && !this.blocking) {
      this.dashDir = intent.dash
      this.backdash = intent.dash !== this.facing
      this.dashT = this.backdash ? BACKDASH_TIME : DASH_TIME
      this.dashCd = 0.32
      if (this.backdash) this.iFrames = Math.max(this.iFrames, 0.2) // back-dash i-frames
      _v1.set(this.pos.x, 0.1, 0)
      this.vfx.burst(_v1, { color: '#8a7d6a', count: 8, speed: 2.8, size: 0.16, life: 0.4, gravity: -4, up: 1.2 })
      this.audio.play('dash', { vol: this.backdash ? 0.25 : 0.35 })
    }
    if (this.dashT > 0) {
      this.dashT -= dt
      const spd = this.backdash ? BACKDASH_SPEED : DASH_SPEED
      this.vel.x = (this.backdash ? this.facing : this.dashDir) * Math.abs(spd) * (this.backdash ? -1 : 1)
    }

    // walking (walk-back slower; crouch/block roots you)
    let mv = 0
    if (this.grounded && this.dashT <= 0 && !this.crouching && !this.attack) {
      mv = intent.move || 0
      if (this.blocking) mv = 0
      const back = mv !== 0 && mv !== this.facing
      const top = (back ? WALK_BACK : WALK_FWD) * this.walkMul()
      this.vel.x = damp(this.vel.x, mv * top, 14, dt)
    } else if (this.grounded && this.dashT <= 0 && !this.attack) {
      this.vel.x = damp(this.vel.x, 0, 14, dt)
    }
    this.walkDir = mv

    // jump (arcing: horizontal locked at takeoff)
    if (intent.jump && this.grounded && this.canAct() && !this.crouching) {
      this.vel.y = JUMP_V
      this.vel.x = (intent.move || 0) * 4.6
      this.grounded = false
      this.airAtkUsed = false
      _v1.set(this.pos.x, 0.06, 0)
      this.vfx.burst(_v1, { color: '#8a7d6a', count: 6, speed: 2.4, size: 0.15, life: 0.35, gravity: -4, up: 1 })
    }

    // attacks (from the input buffer)
    if (this._bufAtk && this._tryAttack(this._bufAtk.btn)) this._bufAtk = null
    if (intent.throw && this.grounded && this.canAct() && !this.crouching) this._beginAttack('throw')
  }

  /** Attempt to start an attack. Returns true if one came out. */
  _tryAttack(btn) {
    // chain continuation: valid only inside the previous HIT's window
    if (this.chainT > 0 && this.lastHitKind) {
      const nxt = ATTACKS[this.lastHitKind].next?.[btn]
      if (nxt) { this.attack = null; this._beginAttack(nxt, true); return true }
    }
    if (this.attack) return false
    if (!this.grounded) {
      if (this.airAtkUsed || this.juggleFall || this.hitstun > 0) return false
      this.airAtkUsed = true
      this._beginAttack(btn === 'light' ? 'airJ' : 'airK')
      return true
    }
    if (!this.canAct()) return false
    if (this.crouching) {
      if (btn === 'light') { this._beginAttack('low'); return true }
      return false
    }
    this._beginAttack(btn === 'light' ? 'jab' : 'heavy')
    return true
  }

  _beginAttack(kind, chained = false) {
    const unblockable = this.ghostT > 0 && kind !== 'throw'
    if (unblockable) {
      this.ghostT = 0 // wraith stance is spent on this one strike
      _v1.set(this.pos.x, this.pos.y + 1.2, 0)
      this.vfx.flash(_v1, { color: '#d8d2c2', size: 1.8, life: 0.2 })
    }
    this.attack = { kind, t: 0, hasHit: false, chained, lunged: false, armorUsed: false, unblockable }
    this.chainT = 0
    if (ATTACKS[kind].kind === 'heavy') this.audio.play('cast', { vol: 0.22 })
  }

  // -------------------- physics --------------------

  _physics(dt) {
    if (!this.grounded) {
      this.vel.y -= GRAV * dt
      // juggled bodies hang near the attacker instead of sailing away
      this.vel.x *= Math.exp(-(this.juggleFall ? 1.1 : 0.2) * dt)
    }
    this.pos.x += this.vel.x * dt
    this.pos.y += this.vel.y * dt
    this.pos.x = clamp(this.pos.x, -EDGE, EDGE)

    this.justLanded = false
    if (this.pos.y <= 0 && this.vel.y <= 0) {
      const impact = -this.vel.y
      this.pos.y = 0
      this.vel.y = 0
      if (!this.grounded) {
        this.grounded = true
        this.justLanded = true
        this.airAtkUsed = false
        if (impact > 5) {
          _v1.set(this.pos.x, 0.06, 0)
          this.vfx.burst(_v1, { color: '#8a7d6a', count: impact > 9 ? 12 : 7, speed: 3, size: 0.18, life: 0.45, gravity: -5, up: 1.6 })
        }
      }
    } else if (this.pos.y > 0) {
      this.grounded = false
    }
  }

  /** Called by FightSystem when a juggled body touches the floor. */
  startKnockdown() {
    this.juggleFall = false
    this.kdT = KD_TIME
    this.iFrames = Math.max(this.iFrames, KD_TIME + WAKEUP_INV)
    this.attack = null
    this.hitstun = 0
    this.spinV = 0
    this.crouching = false
    this.hero.group.rotation.x = 0
    this.hero.setState('ko')
    _v1.set(this.pos.x, 0.08, 0)
    this.vfx.burst(_v1, { color: '#9a8d78', count: 12, speed: 3.6, size: 0.2, life: 0.5, gravity: -6, up: 2 })
    this.audio.play('bounce', { vol: 0.3 })
  }

  // -------------------- presentation --------------------

  _visuals(dt, foe) {
    this.root.rotation.y = damp(this.root.rotation.y, this.facing * 1.22, 12, dt)
    this.hero.setMoveSpeed(this.grounded && this.kdT <= 0 ? Math.abs(this.vel.x) : 0)
    this.hero.update(dt)

    const hips = this.hero.hips
    const arms = this.hero.arms

    // juggle tumble
    if (this.juggleFall && !this.grounded) {
      this.hero.group.rotation.x += this.spinV * dt
    } else if (this.kdT <= 0) {
      let r = this.hero.group.rotation.x % TAU
      if (r > Math.PI) r -= TAU
      if (r < -Math.PI) r += TAU
      this.hero.group.rotation.x = damp(r, 0, 14, dt)
    }

    // stance poses layered over the hero's base animation
    if (this.kdT <= 0 && this.hero.state !== 'ko') {
      if (this.crouching && this.grounded) {
        hips.position.y -= 0.36
        hips.rotation.x = 0.4
        for (const key of ['L', 'R']) {
          this.hero.legs[key].pivot.rotation.x = -1.15
          this.hero.legs[key].knee.rotation.x = 1.9
        }
      }
      if (this.blocking || this.blockstun > 0) {
        const jitter = this.blockstun > 0 ? Math.sin(this.hero.t * 55) * 0.06 : 0
        for (const [key, s] of [['L', -1], ['R', 1]]) {
          arms[key].pivot.rotation.x = -1.75 + jitter
          arms[key].pivot.rotation.z = s * 0.38
          arms[key].elbow.rotation.x = -1.85
        }
        hips.rotation.x = -0.06
      }
      if (this.staggerT > 0) {
        hips.rotation.x = -0.5
        this.hero.head.rotation.x = -0.5
        for (const [key, s] of [['L', -1], ['R', 1]]) {
          arms[key].pivot.rotation.x = 0.5 + Math.sin(this.hero.t * 9 + s) * 0.3
          arms[key].pivot.rotation.z = s * 0.7
        }
      }
      if (this.hitstun > 0 && this.grounded) {
        hips.rotation.x = -0.28
        this.hero.head.rotation.x = -0.3
      }
      if (this.dashT > 0) hips.rotation.x = this.backdash ? -0.3 : 0.45
      if (this.attack) this._attackPose()
      else {
        this.chargeS.material.opacity = 0
        this.chargeS.scale.setScalar(0.001)
      }
    }

    // ground blob (root carries pos.y, so counter it)
    this.blob.position.y = -this.pos.y / this.scaleMul + 0.025
    const hk = clamp(1 - this.pos.y / 5, 0, 1)
    this.blob.material.opacity = 0.5 * (0.3 + 0.7 * hk)
    this.blob.scale.setScalar(0.62 * (0.7 + 0.3 * hk))

    // hit flash
    this.flashT = Math.max(0, this.flashT - dt * 5)
    const e = this.flashT * 0.85
    this.hero.mats.primary.emissive.setRGB(e, e, e)
    this.hero.mats.secondary.emissive.setRGB(e * 0.6, e * 0.6, e * 0.6)

    // wraith shimmer / surge aura
    this.shimmer.material.opacity = this.ghostT > 0 ? 0.2 + 0.14 * Math.sin(this.hero.t * 11) : 0
    this.surgeS.material.opacity = this.meter >= 100 ? 0.16 + 0.1 * Math.sin(this.hero.t * 7) : 0
  }

  _attackPose() {
    const def = ATTACKS[this.attack.kind]
    const t = this.attack.t
    const arm = this.hero.arms[def.arm]
    const from = def.startup, to = def.startup + def.active
    let pose, elbow, w
    const heavy = def.kind === 'heavy' || def.kind === 'throw'
    if (t < from) {
      pose = heavy ? 1.0 : 0.5
      elbow = -0.9
      w = Math.min(1, t / (from * 0.55))
      if (def.kind === 'heavy' && !def.air) {
        const k = t / from
        this.chargeS.material.opacity = 0.25 + 0.4 * k
        this.chargeS.scale.setScalar(0.35 + 0.7 * k)
      }
    } else if (t < to) {
      pose = def.rise ? -2.9 : heavy ? -1.95 : -1.7
      elbow = -0.05
      w = 1
      this.chargeS.material.opacity = 0
      this.chargeS.scale.setScalar(0.001)
    } else {
      pose = def.rise ? -2.9 : heavy ? -1.95 : -1.7
      elbow = -0.4
      const total = def.startup + def.active + def.recover
      w = Math.max(0, 1 - (t - to) / Math.max(0.01, total - to))
      this.chargeS.material.opacity = 0
      this.chargeS.scale.setScalar(0.001)
    }
    if (def.kind === 'throw') {
      // both arms reach for the grab
      for (const key of ['L', 'R']) {
        this.hero.arms[key].pivot.rotation.x = lerp(this.hero.arms[key].pivot.rotation.x, -1.5, w)
        this.hero.arms[key].elbow.rotation.x = lerp(this.hero.arms[key].elbow.rotation.x, -0.25, w)
      }
      return
    }
    arm.pivot.rotation.x = lerp(arm.pivot.rotation.x, pose, w)
    arm.pivot.rotation.z = lerp(arm.pivot.rotation.z, (def.arm === 'R' ? 1 : -1) * 0.1, w)
    arm.elbow.rotation.x = lerp(arm.elbow.rotation.x, elbow, w)
    if (def.rise) this.hero.hips.rotation.x = lerp(this.hero.hips.rotation.x, -0.35, w)
    if (def.low) this.hero.hips.rotation.x = 0.55
  }

  dispose() { /* trails owned by scene/specials; GPU teardown via disposeObject3D */ }
}
