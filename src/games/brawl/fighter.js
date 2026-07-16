import * as THREE from 'three'
import { createHero } from '../../art/characterFactory.js'
import { toonMaterial, glowMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { clamp, damp, lerp, TAU } from '../../core/utils.js'

export const GRAV = 36
export const RUN_SPEED = 8.4
const JUMP_V = 16.6
const AIR_JUMP_V = 15
const MAX_FALL = 19
const FAST_FALL = 27
const AIR_ACCEL = 30
const DODGE_TIME = 0.35
const DODGE_SPEED = 13

/** Attack data: timings in seconds, `from`/`to` = active hitbox window. */
export const ATTACKS = {
  jab1: { dur: 0.24, from: 0.05, to: 0.13, dmg: 4, base: 2.6, scale: 0.018, up: 0.4, reach: 1.75, next: 'jab2', arm: 'R' },
  jab2: { dur: 0.24, from: 0.05, to: 0.13, dmg: 4, base: 2.8, scale: 0.02, up: 0.42, reach: 1.75, next: 'jab3', arm: 'L' },
  jab3: { dur: 0.36, from: 0.08, to: 0.17, dmg: 6, base: 4.6, scale: 0.05, up: 0.62, reach: 1.9, next: null, arm: 'R' },
  smash: { dur: 0.82, from: 0.45, to: 0.6, dmgMin: 14, dmgMax: 19, base: 7.6, scale: 0.15, up: 0.62, reach: 2.35, heavy: true, arm: 'R' },
}

const _v1 = new THREE.Vector3()

/**
 * One platform fighter: physics body + hero rig + attack/respawn state.
 * The scene resolves hits between fighters; the fighter owns its own
 * movement feel and per-body feedback (dust, flips, tumble, shimmer).
 */
export class Fighter {
  constructor({ scene, vfx, audio, appearance, name, color, team, isPlayer = false, isClone = false, spawnX = 0 }) {
    this.scene = scene
    this.vfx = vfx
    this.audio = audio
    this.name = name
    this.color = color
    this.glow = appearance.glow || color
    this.team = team
    this.isPlayer = isPlayer
    this.isClone = isClone

    this.hero = createHero(appearance)
    this.root = new THREE.Group()
    this.root.add(this.hero.group)
    scene.add(this.root)
    this.pos = this.root.position
    this.pos.set(spawnX, 0, 0)
    this.spawnX = spawnX
    this.vel = new THREE.Vector2(0, 0)
    this.facing = spawnX <= 0 ? 1 : -1
    this.root.rotation.y = this.facing * 1.25

    // combat state
    this.state = 'fight' // fight | dead | respawn | out
    this.dmg = 0
    this.stocks = isClone ? 1 : 3
    this.hp = 40 // clones only
    this.kos = 0
    this.falls = 0
    this.attack = null
    this.hitstun = 0
    this.iFrames = 0
    this.invulnT = 0
    this.tumble = false
    this.spinV = 0
    this.flashT = 0
    this.lastHitBy = null
    this.lastHitT = 0
    this.jabsOnly = isClone

    // movement state
    this.grounded = false
    this.platform = null
    this.airJumps = 1
    this.dropT = 0
    this.flipT = 0
    this.fastFalling = false
    this.dodgeT = 0
    this.dodgeCd = 0
    this.dodgeDir = 1
    this.koT = 0
    this.moveInput = 0

    // skill-driven modifiers (set by the scene, consumed here)
    this.buffT = 0
    this.giantT = 0
    this.ghostT = 0
    this.chillT = 0
    this.shield = null
    this.scaleMul = 1
    this.kbTakenMul = 1
    this.kbDealtMul = 1

    this._dodgeTrail = null
    this._launchTrail = null

    // smash charge glow on the striking glove — gathering forge-fire
    this.chargeS = new THREE.Sprite(glowSpriteMaterial('#ffb84d', 0))
    this.chargeS.scale.setScalar(0.001)
    this.hero.arms.R.glove.add(this.chargeS)

    // invulnerability shimmer — warded torchlight
    this.shimmer = new THREE.Sprite(glowSpriteMaterial('#ffe0b0', 0))
    this.shimmer.scale.set(2.6, 3.4, 1)
    this.shimmer.position.y = 1
    this.root.add(this.shimmer)

    // descending respawn pad — a rune-lit stone disc lowered from above
    const pad = this.pad = new THREE.Group()
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.6, 0.16, 18),
      toonMaterial({ color: '#6a5d4a', rim: '#ffd9a0', rimStrength: 0.5 }),
    )
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 8, 28), glowMaterial(this.glow, 1.8))
    ring.rotation.x = Math.PI / 2
    const padHalo = new THREE.Sprite(glowSpriteMaterial(this.glow, 0.4))
    padHalo.scale.set(4.4, 1.6, 1)
    pad.add(disc, ring, padHalo)
    pad.visible = false
    scene.add(pad)
  }

  moveMul() { return (this.buffT > 0 ? 1.5 : 1) * (this.chillT > 0 ? 0.45 : 1) }
  atkSpeed() { return this.buffT > 0 ? 1.5 : 1 }
  untouchable() { return this.iFrames > 0 || this.ghostT > 0 }

  /** gdt = game-time dt (slow-mo aware), dt = real dt for animation. */
  update(gdt, dt, intent, platforms) {
    this.iFrames = Math.max(0, this.iFrames - gdt)
    this.chillT = Math.max(0, this.chillT - gdt)
    if (this.lastHitT > 0) {
      this.lastHitT -= gdt
      if (this.lastHitT <= 0) this.lastHitBy = null
    }
    this.scaleMul = damp(this.scaleMul, this.giantT > 0 ? 1.75 : 1, 8, dt)
    this.root.scale.setScalar(this.scaleMul)
    this.kbTakenMul = this.giantT > 0 ? 0.6 : 1
    this.kbDealtMul = this.giantT > 0 ? 1.5 : 1

    if (this.state === 'out') return
    if (this.state === 'dead') {
      this.koT -= gdt
      if (this.koT <= 0 && this.stocks > 0) this._startRespawn()
      return
    }
    if (this.state === 'respawn') {
      this._respawnUpdate(gdt, intent)
      this._visuals(dt)
      return
    }
    this._control(gdt, intent)
    this._physics(gdt, platforms)
    this._visuals(dt)
  }

  // -------------------- control --------------------

  _control(dt, intent) {
    // attack timeline
    if (this.attack) {
      const def = ATTACKS[this.attack.kind]
      this.attack.t += dt * this.atkSpeed()
      if (intent.jab && def.next) this.attack.buffered = true
      if (def.heavy && !this.attack.lunged && this.attack.t >= def.from - 0.04) {
        this.attack.lunged = true
        this.vel.x += this.facing * 6.5
      }
      if (this.attack.t >= def.dur) {
        const next = this.attack.buffered && def.next
        this.attack = null
        if (next) this._beginAttack(next)
      }
    }
    const stunned = this.hitstun > 0
    if (stunned) this.hitstun -= dt

    // dodge roll
    if (this.dodgeCd > 0) this.dodgeCd -= dt
    if (this.dodgeT > 0) {
      this.dodgeT -= dt
      this.vel.x = this.dodgeDir * DODGE_SPEED * this.moveMul()
      if (this.dodgeT <= 0) {
        this._dodgeTrail?.stop()
        this._dodgeTrail = null
      }
    } else if (intent.dodge && this.grounded && this.dodgeCd <= 0 && !stunned && !this.attack) {
      this.dodgeT = DODGE_TIME
      this.dodgeCd = 0.9
      this.dodgeDir = intent.dodge
      this.iFrames = Math.max(this.iFrames, 0.38)
      this._dodgeTrail?.stop()
      this._dodgeTrail = this.vfx.trail(this.hero.hips, { color: this.glow, size: 0.55, rate: 55, life: 0.35 })
      this.audio.play('dash', { vol: 0.3 })
    }

    // horizontal movement
    let mv = stunned || this.dodgeT > 0 ? 0 : intent.move
    if (this.attack && this.grounded) mv *= 0.15
    const top = RUN_SPEED * this.moveMul()
    if (this.grounded) {
      if (!stunned && this.dodgeT <= 0) this.vel.x = damp(this.vel.x, mv * top, 12, dt)
      else if (stunned) this.vel.x *= Math.exp(-2.5 * dt)
    } else {
      if (!stunned && mv) {
        const cap = Math.max(top, Math.abs(this.vel.x))
        this.vel.x = clamp(this.vel.x + mv * AIR_ACCEL * dt, -cap, cap)
      }
      this.vel.x *= Math.exp(-0.35 * dt)
    }
    this.moveInput = mv
    if (!stunned && !this.attack) {
      if (mv > 0.15) this.facing = 1
      else if (mv < -0.15) this.facing = -1
    }

    // jumps
    if (intent.jump && !stunned && this.dodgeT <= 0) {
      if (this.grounded) {
        this.vel.y = JUMP_V
        this.grounded = false
        _v1.set(this.pos.x, this.pos.y + 0.05, 0)
        this.vfx.burst(_v1, { color: '#c9b89a', count: 7, speed: 2.6, size: 0.16, life: 0.4, gravity: -4, up: 1 })
      } else if (this.airJumps > 0) {
        this.airJumps--
        this.vel.y = AIR_JUMP_V
        // Smash-style momentum redirect: holding a direction steers the jump
        if (mv) this.vel.x = lerp(this.vel.x, mv * RUN_SPEED, 0.8)
        this.flipT = 0.48
        _v1.set(this.pos.x, this.pos.y + 0.4, 0)
        this.vfx.ring(_v1, { color: this.glow, radius: 1.3, life: 0.3, y: this.pos.y + 0.4 })
        this.audio.play('dash', { vol: 0.2 })
      }
    }
    // drop through pass-through platforms
    if (intent.drop && this.grounded && this.platform && !this.platform.solid) {
      this.dropT = 0.24
      this.grounded = false
      this.pos.y -= 0.08
      this.vel.y = -3
    }
    // fast fall
    if (intent.fastFall && !this.grounded && this.vel.y < 6) {
      this.vel.y = Math.max(this.vel.y - 70 * dt, -FAST_FALL)
      this.fastFalling = true
    } else this.fastFalling = false

    // start attacks
    if (!stunned && !this.attack && this.dodgeT <= 0) {
      if (intent.smash && !this.jabsOnly) this._beginAttack('smash')
      else if (intent.jab) this._beginAttack('jab1')
    }
  }

  _beginAttack(kind) {
    this.attack = { kind, t: 0, hasHit: false, buffered: false, lunged: false }
    if (ATTACKS[kind].heavy) this.audio.play('cast', { vol: 0.3 })
  }

  // -------------------- physics --------------------

  _physics(dt, platforms) {
    this.vel.y -= GRAV * dt
    const fallCap = this.fastFalling ? FAST_FALL : MAX_FALL
    if (this.vel.y < -fallCap) this.vel.y = -fallCap

    const prevY = this.pos.y
    this.pos.x += this.vel.x * dt
    this.pos.y += this.vel.y * dt
    if (this.dropT > 0) this.dropT -= dt

    const wasAir = !this.grounded
    this.grounded = false
    this.platform = null
    if (this.vel.y <= 0.001) {
      for (const p of platforms) {
        if (!p.solid && this.dropT > 0) continue
        if (Math.abs(this.pos.x - p.x) > p.halfW + 0.25) continue
        if (prevY < p.y - 0.02 || this.pos.y > p.y + 0.02) continue
        const impact = -this.vel.y
        this.pos.y = p.y
        this.vel.y = 0
        this.grounded = true
        this.platform = p
        this.airJumps = 1
        this.flipT = 0
        if (this.tumble) {
          this.tumble = false
          this.hitstun = Math.min(this.hitstun, 0.12)
        }
        if (wasAir && impact > 7) {
          _v1.set(this.pos.x, p.y + 0.05, 0)
          this.vfx.burst(_v1, {
            color: '#bfae8e', count: impact > 14 ? 14 : 8, speed: 3.4, size: 0.2,
            life: 0.5, gravity: -5, up: 2,
          })
          if (impact > 14) this.audio.play('bounce', { vol: 0.14 })
        }
        break
      }
    }
  }

  // -------------------- KO / respawn --------------------

  startKO() {
    this.state = 'dead'
    this.koT = 1.6
    this.root.visible = false
    this.attack = null
    this.hitstun = 0
    this.tumble = false
    this.dmg = 0
    this.vel.set(0, 0)
    this._dodgeTrail?.stop()
    this._dodgeTrail = null
  }

  _startRespawn() {
    this.state = 'respawn'
    this.pos.set(clamp(this.spawnX, -8, 8), 16.5, 0)
    this.vel.set(0, 0)
    this.airJumps = 1
    this.hero.group.rotation.x = 0
    this.root.visible = true
    this.pad.visible = true
    this.audio.play('spawn', { vol: 0.4 })
  }

  _respawnUpdate(gdt, intent) {
    this.pos.y -= 5.8 * gdt
    this.pad.position.set(this.pos.x, this.pos.y - 0.08, 0)
    this.pad.rotation.y += gdt * 1.2
    const wantsOff = this.isPlayer && (intent.jump || intent.jab || intent.smash)
    if (this.pos.y <= 8.2 || wantsOff) this._releaseFromPad(wantsOff)
  }

  _releaseFromPad(jumped) {
    this.state = 'fight'
    this.invulnT = 2
    this.iFrames = Math.max(this.iFrames, 2)
    this.pad.visible = false
    this.grounded = false
    if (jumped) this.vel.y = 4
    _v1.set(this.pos.x, this.pos.y + 1, 0)
    this.vfx.flash(_v1, { color: this.glow, size: 2.2, life: 0.25 })
  }

  // -------------------- visuals --------------------

  _visuals(dt) {
    this.root.rotation.y = damp(this.root.rotation.y, this.facing * 1.25, 12, dt)
    this.hero.setMoveSpeed(this.grounded ? Math.abs(this.vel.x) : Math.abs(this.vel.x) * 0.4)
    this.hero.update(dt)

    // air-jump flip: spin the hips group
    if (this.flipT > 0) {
      this.flipT -= dt
      const k = 1 - Math.max(0, this.flipT) / 0.48
      this.hero.hips.rotation.x -= TAU * k
    }

    // tumble / dodge spin on the body
    if (this.dodgeT > 0) {
      const k = 1 - this.dodgeT / DODGE_TIME
      this.hero.group.rotation.x = -this.dodgeDir * this.facing * TAU * k
    } else if (this.tumble && this.hitstun > 0) {
      this.hero.group.rotation.x += this.spinV * dt
    } else {
      let r = this.hero.group.rotation.x % TAU
      if (r > Math.PI) r -= TAU
      if (r < -Math.PI) r += TAU
      this.hero.group.rotation.x = damp(r, 0, 14, dt)
    }

    if (this.attack) this._attackPose()
    else {
      this.chargeS.material.opacity = 0
      this.chargeS.scale.setScalar(0.001)
    }

    // hit flash
    this.flashT = Math.max(0, this.flashT - dt * 5)
    const e = this.flashT * 0.85
    this.hero.mats.primary.emissive.setRGB(e, e, e)
    this.hero.mats.secondary.emissive.setRGB(e * 0.6, e * 0.6, e * 0.6)

    // respawn shimmer
    if (this.invulnT > 0) {
      this.invulnT -= dt
      this.shimmer.material.opacity = 0.22 + 0.16 * Math.sin(this.hero.t * 14)
    } else this.shimmer.material.opacity = 0
  }

  _attackPose() {
    const def = ATTACKS[this.attack.kind]
    const t = this.attack.t
    const arm = this.hero.arms[def.arm]
    let pose, elbow, w
    if (t < def.from) {
      pose = def.heavy ? 1.05 : 0.55
      elbow = -0.85
      w = Math.min(1, t / (def.from * 0.55))
      if (def.heavy) {
        const k = t / def.from
        this.chargeS.material.opacity = 0.35 + 0.55 * k
        this.chargeS.scale.setScalar(0.5 + 1.5 * k)
      }
    } else if (t < def.to) {
      pose = def.heavy ? -1.95 : -1.7
      elbow = -0.06
      w = 1
      this.chargeS.material.opacity = def.heavy ? 0.9 : 0
      this.chargeS.scale.setScalar(def.heavy ? 1.6 : 0.001)
    } else {
      pose = def.heavy ? -1.95 : -1.7
      elbow = -0.4
      w = Math.max(0, 1 - (t - def.to) / (def.dur - def.to))
      this.chargeS.material.opacity = 0
      this.chargeS.scale.setScalar(0.001)
    }
    arm.pivot.rotation.x = lerp(arm.pivot.rotation.x, pose, w)
    arm.pivot.rotation.z = lerp(arm.pivot.rotation.z, (def.arm === 'R' ? 1 : -1) * 0.08, w)
    arm.elbow.rotation.x = lerp(arm.elbow.rotation.x, elbow, w)
  }

  dispose() {
    this._dodgeTrail?.stop()
    this._launchTrail?.stop()
  }
}
