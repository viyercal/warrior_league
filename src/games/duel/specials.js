import * as THREE from 'three'
import { createHero } from '../../art/characterFactory.js'
import { glowSpriteMaterial } from '../../art/materials.js'
import { clamp, disposeObject3D } from '../../core/utils.js'
import { EDGE } from './fighters.js'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()

/**
 * The 12 skill archetypes, tuned for 1v1 tournament combat. Every cast goes
 * through cast(f, def) — surge state (meter 100) is consumed here for a
 * 1.5x-damage upgraded version. update(gdt) drives projectiles, fields,
 * meteors, heal ticks, the shadow twin and the chained harrow.
 */
export class DuelSpecials {
  constructor({ scene, vfx, audio, engine, fight }) {
    this.scene = scene
    this.vfx = vfx
    this.audio = audio
    this.engine = engine
    this.fight = fight
    this.bolts = []      // { h, caster, dmg, surge }
    this.fields = []     // { mesh, rim, x, r, t, dur, caster }
    this.meteors = []    // { ring, t, delay, radius, dmg, caster, surge, boomed }
    this.novas = []      // { f, t, hasHit, dmg, surge }
    this.pulls = []      // { f, t, hook, dmg, surge, hit }
    this.twins = []      // { hero, t, caster, dmg, surge, struck }
    this._twinCache = new Map() // caster -> shadow hero (built once)
    this._trails = new Map()    // caster -> frenzy trail handle
    this._wardS = new Map()     // caster -> ward sprite
  }

  /**
   * Cast `def` (a skill from the catalog) for fighter f. Returns true if the
   * cast started. Caller owns cooldowns; chain-cancels are the caller's call
   * (f.canCast() already allows attack-cancel inside an open chain window).
   */
  cast(f, def) {
    if (!f.canCast()) return false
    const foe = this.fight.foeOf(f)
    const surge = f.meter >= 100
    if (surge) {
      f.meter = 0
      _v1.set(f.pos.x, f.pos.y + 1.1, 0)
      this.vfx.ring(_v1, { color: f.glow, radius: 2.6, life: 0.45, y: 0.08 })
      this.vfx.text(_v1, 'SURGE', { color: f.glow, size: 0.8, life: 0.8, rise: 1.6 })
      this.engine.shake(0.22, 0.25)
    }
    // cancel an in-progress chain hit into the special — the combo engine
    f.attack = null
    f.chainT = 0
    f.hero.cast()
    f.hero.castPoint(_v1)
    this.vfx.flash(_v1, { color: def.color, size: surge ? 2 : 1.3, life: 0.18 })
    this.audio.play('cast', { vol: 0.5 })
    this[`_${def.archetype}`](f, foe, def, surge)
    return true
  }

  // ---------------- the 12 archetypes ----------------

  /** Shadow Step: vanish and reappear BEHIND your foe — the mixup. */
  _dash(f, foe, def, surge) {
    _v1.set(f.pos.x, f.pos.y + 1, 0)
    this.vfx.burst(_v1, { color: '#2c2630', count: 16, speed: 4, size: 0.3, life: 0.4, gravity: 1, up: 2 })
    this.vfx.flash(_v1, { color: def.color, size: 1.8 })
    const behind = foe.pos.x + (foe.pos.x >= f.pos.x ? 1 : -1) * 1.45
    f.pos.x = clamp(behind, -EDGE, EDGE)
    f.vel.x = 0
    f.iFrames = Math.max(f.iFrames, surge ? 0.4 : 0.25)
    f.facing = foe.pos.x >= f.pos.x ? 1 : -1
    _v2.set(f.pos.x, f.pos.y + 1, 0)
    this.vfx.burst(_v2, { color: '#2c2630', count: 14, speed: 4, size: 0.28, life: 0.35, gravity: 1, up: 2 })
    this.vfx.flash(_v2, { color: def.color, size: 2.2 })
    this.audio.play('dash', { vol: 0.6 })
  }

  /** Flaming Spear: the classic fireball across the pit. Blockable, chips. */
  _projectile(f, foe, def, surge) {
    f.hero.castPoint(_v1)
    _v1.z = 0
    _v1.y = Math.max(0.9, Math.min(_v1.y, 1.5))
    _v2.set(f.facing, 0, 0)
    const h = this.vfx.projectile({
      from: _v1, dir: _v2, speed: 15, color: def.color,
      size: surge ? 0.95 : 0.62, life: 2.4, light: 2, trail: true,
    })
    this.bolts.push({ h, caster: f, dmg: 10, surge })
    this.audio.play('zap', { vol: 0.5 })
  }

  /** Grave Chill: ice the ground at their feet — 45% slow for 3s. */
  _slowfield(f, foe, def, surge) {
    const x = clamp(foe.pos.x, -EDGE, EDGE)
    const r = surge ? 3.1 : 2.4
    const g = new THREE.Group()
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(r, 36),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#aebfc4').multiplyScalar(0.65), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    disc.rotation.x = -Math.PI / 2
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.2, r, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#dce8ea').multiplyScalar(1.6), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    rim.rotation.x = -Math.PI / 2
    rim.position.y = 0.015
    // jagged ice shards
    for (let i = 0; i < 5; i++) {
      const shard = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.45, 5),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfe0e4').multiplyScalar(1.1), transparent: true, opacity: 0.75 }),
      )
      shard.position.set((i / 4 - 0.5) * r * 1.5, 0.2, (i % 2 ? 0.3 : -0.25))
      shard.rotation.z = (i % 2 ? 0.3 : -0.25)
      g.add(shard)
    }
    g.add(disc, rim)
    g.position.set(x, 0.05, 0)
    this.scene.add(g)
    _v1.set(x, 0, 0)
    this.vfx.ring(_v1, { color: def.color, radius: r, life: 0.45, y: 0.08 })
    this.audio.play('zap', { vol: 0.35 })
    this.fields.push({ group: g, rim, x, r, t: 0, dur: 3, caster: f })
  }

  /** Earthbreaker: rising earthen uppercut — launcher, swats jumpers, whiff-punishable. */
  _nova(f, foe, def, surge) {
    this.novas.push({ f, t: 0, hasHit: false, dmg: 12, surge })
    // the caster commits: 0.4s whiff recovery baked into the attack lock
    f.attack = { kind: 'launcher', t: 0, hasHit: true, chained: false, lunged: true, armorUsed: false, unblockable: false }
    _v1.set(f.pos.x + f.facing * 0.7, 0.1, 0)
    this.vfx.burst(_v1, { color: def.color, count: 12, speed: 5, size: 0.26, life: 0.5, up: 5 })
  }

  /** Bloodrush: frenzy — chains stay open 50% longer, faster feet. */
  _buff(f, foe, def, surge) {
    f.frenzyT = surge ? 6 : 4
    this._trails.get(f)?.stop()
    this._trails.set(f, this.vfx.trail(f.hero.hips, { color: def.color, size: 0.6, rate: 36, life: 0.4 }))
    _v1.set(f.pos.x, f.pos.y + 1, 0)
    this.vfx.flash(_v1, { color: def.color, size: 2.2 })
    this.audio.play('dash', { vol: 0.6 })
  }

  /** Iron Bulwark: parry-ward — absorbs the NEXT hit within 2s, staggers the attacker. */
  _shield(f, foe, def, surge) {
    f.wardT = surge ? 3 : 2
    let s = this._wardS.get(f)
    if (!s) {
      s = new THREE.Sprite(glowSpriteMaterial('#d8c9a0', 0))
      s.scale.set(2.4, 2.9, 1)
      s.position.y = 1.05
      f.root.add(s)
      this._wardS.set(f, s)
    }
    this.audio.play('shield')
    _v1.set(f.pos.x, 0, 0)
    this.vfx.ring(_v1, { color: def.color, radius: 1.8, life: 0.4, y: 0.08 })
  }

  /** Warrior's Resolve: +16 HP over 2s — taking a hit cancels what's left. */
  _heal(f, foe, def, surge) {
    f.healT = 2
    f.healRate = (surge ? 24 : 16) / 2
    this.audio.play('heal')
    _v1.set(f.pos.x, f.pos.y + 1.2, 0)
    this.vfx.burst(_v1, { color: def.color, count: 16, speed: 3.6, size: 0.24, gravity: 3, up: 3, life: 0.7 })
    this.vfx.text(_v1, surge ? '+24' : '+16', { color: def.color, size: 0.7 })
  }

  /** Phantom Twin: a shadow twin lunges from behind you — 8 dmg + stagger. */
  _summon(f, foe, def, surge) {
    let hero = this._twinCache.get(f)
    if (!hero) {
      hero = createHero({ ...f.hero.appearance, cape: false })
      hero.group.traverse(o => {
        if (o.material && !o.material._twinned) {
          o.material._twinned = true
          o.material.transparent = true
          o.material.opacity = 0.4
          if (o.material.color) o.material.color.multiplyScalar(0.3)
        }
      })
      if (hero.shadowBlob) hero.shadowBlob.visible = false
      this.scene.add(hero.group)
      this._twinCache.set(f, hero)
    }
    hero.group.visible = true
    hero.group.position.set(clamp(f.pos.x - f.facing * 1.3, -EDGE, EDGE), 0, 0)
    hero.group.rotation.y = f.facing * 1.22
    this.twins.push({ hero, t: 0, caster: f, dmg: 8, surge, struck: false })
    _v1.copy(hero.group.position)
    _v1.y += 1
    this.vfx.flash(_v1, { color: def.color, size: 2 })
    this.audio.play('spawn', { vol: 0.4 })
  }

  /** Chained Harrow: the chain flies ~7u and drags them into your fists. Whiffs on jumpers. */
  _pull(f, foe, def, surge) {
    f.hero.castPoint(_v1)
    _v1.z = 0
    _v2.set(f.facing, 0, 0)
    const hook = this.vfx.projectile({
      from: _v1, dir: _v2, speed: 24, color: def.color, size: 0.4, life: 0.34, light: 1, trail: true,
    })
    this.pulls.push({ f, t: 0, hook, dmg: 6, surge, from: _v1.clone() })
    this.audio.play('zap', { vol: 0.55 })
  }

  /** Colossus Form: 5s stance — armored heavies, +30% reach, -20% walk. */
  _giant(f, foe, def, surge) {
    f.giantT = surge ? 7 : 5
    this.audio.play('levelup')
    _v1.set(f.pos.x, 0, 0)
    this.vfx.ring(_v1, { color: def.color, radius: 2.6, life: 0.5, y: 0.08 })
    _v1.y = 1.3
    this.vfx.flash(_v1, { color: def.color, size: 2.6 })
    this.engine.shake(0.2, 0.25)
  }

  /** Wraith Walk: 3s stance — your next single strike passes clean through block. */
  _ghost(f, foe, def, surge) {
    f.ghostT = surge ? 5 : 3
    _v1.set(f.pos.x, f.pos.y + 1, 0)
    this.vfx.flash(_v1, { color: def.color, size: 2.2 })
    this.audio.play('dash', { vol: 0.45 })
  }

  /** Skyfall Hammer: 0.9s telegraph at center pit, then the sky falls. */
  _meteor(f, foe, def, surge) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 44),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(1.8), transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(0, 0.06, 0)
    ring.scale.setScalar(2.6)
    this.scene.add(ring)
    this.meteors.push({ ring, t: 0, delay: 0.9, radius: 2.6, dmg: 24, caster: f, surge, boomed: false, color: def.color })
    this.audio.play('cast', { vol: 0.4 })
  }

  // ---------------- per-frame ----------------

  update(gdt) {
    const F = this.fight

    // fireballs
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      if (!b.h.alive) { this.bolts.splice(i, 1); continue }
      const bp = b.h.pos
      if (Math.abs(bp.x) > EDGE + 1.2) { b.h.kill(); this.bolts.splice(i, 1); continue }
      const d = F.foeOf(b.caster)
      if (d.iFrames > 0 || d.kdT > 0) continue
      const hitY = d.crouching ? 1.25 : 1.55
      if (Math.abs(bp.x - d.pos.x) > 0.8 || Math.abs(bp.y - (d.pos.y + 1.05)) > hitY) continue
      const res = F.applyHit(b.caster, d, {
        dmg: b.dmg, special: true, hitstun: 0.42, kb: 2.2, surge: b.surge, color: '#ff8c3b',
      })
      if (res !== 'miss') { this.vfx.impact(bp, { color: '#ffb454', size: 0.9 }); b.h.kill(); this.bolts.splice(i, 1) }
    }

    // ice fields
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const z = this.fields[i]
      z.t += gdt
      z.rim.material.opacity = 0.55 + 0.3 * Math.sin(z.t * 5)
      if (z.t >= z.dur) {
        this.scene.remove(z.group)
        disposeObject3D(z.group)
        this.fields.splice(i, 1)
        continue
      }
      const d = F.foeOf(z.caster)
      if (d.grounded && Math.abs(d.pos.x - z.x) < z.r) d.chillT = Math.max(d.chillT, 0.25)
    }

    // rising uppercuts (active frames 0.1 - 0.3 of the cast)
    for (let i = this.novas.length - 1; i >= 0; i--) {
      const n = this.novas[i]
      n.t += gdt
      const f = n.f
      if (n.t > 0.1 && n.t < 0.32 && !n.hasHit) {
        const d = F.foeOf(f)
        const dxf = (d.pos.x - f.pos.x) * f.facing
        // generous vertical reach: THE anti-air
        if (dxf > -0.4 && dxf < 2.1 * f.reachMul() && d.pos.y < 3.4 && d.iFrames <= 0 && d.kdT <= 0) {
          n.hasHit = true
          F.applyHit(f, d, { dmg: n.dmg, special: true, launch: 10.2, kb: 1, surge: n.surge, color: '#b0793a' })
          _v1.set(f.pos.x + f.facing * 0.8, 1.2, 0)
          this.vfx.shockwave(_v1, { color: '#b0793a', radius: 2.4 })
        }
      }
      if (n.t > 0.34) this.novas.splice(i, 1)
    }

    // chained harrow
    for (let i = this.pulls.length - 1; i >= 0; i--) {
      const p = this.pulls[i]
      p.t += gdt
      const f = p.f
      const d = F.foeOf(f)
      const hp = p.hook.pos
      let done = !p.hook.alive || p.t > 0.36
      if (!done && d.iFrames <= 0 && d.kdT <= 0 && Math.abs(hp.x - d.pos.x) < 0.85) {
        done = true
        p.hook.kill()
        if (!d.grounded) {
          // whiffs on jumpers
          _v1.set(hp.x, hp.y, 0)
          this.vfx.flash(_v1, { color: '#a1252c', size: 1, life: 0.15 })
        } else {
          const res = F.applyHit(f, d, {
            dmg: p.dmg, special: true, stun: 0.8, kb: 0.4, surge: p.surge, color: '#a1252c',
          })
          if (res === 'hit') {
            d.dragT = 0.18
            d.dragFrom = d.pos.x
            d.dragTo = clamp(f.pos.x + f.facing * 1.05, -EDGE, EDGE)
            f.hero.castPoint(_v1)
            _v2.set(d.pos.x, d.pos.y + 1.1, 0)
            this.vfx.beam(_v1, _v2, { color: '#c23b2e', width: 0.1, life: 0.25 })
            this.audio.play('zap', { vol: 0.5 })
          }
        }
      }
      if (done) { if (p.hook.alive) p.hook.kill(); this.pulls.splice(i, 1) }
    }

    // shadow twins: lunge from behind, strike, fade
    for (let i = this.twins.length - 1; i >= 0; i--) {
      const tw = this.twins[i]
      tw.t += gdt
      const f = tw.caster
      const d = F.foeOf(f)
      const g = tw.hero.group
      if (tw.t < 0.55) {
        g.position.x += f.facing * 15 * gdt
        tw.hero.setMoveSpeed(10)
        tw.hero.update(gdt)
        const dxf = (d.pos.x - g.position.x) * f.facing
        if (!tw.struck && dxf < 1.3 && dxf > -0.5 && d.pos.y < 1.6) {
          tw.struck = true
          tw.hero.cast()
          F.applyHit(f, d, { dmg: tw.dmg, special: true, stun: 0.55, kb: 1.4, surge: tw.surge, color: '#8f86a3' })
        }
      } else {
        g.visible = false
        _v1.copy(g.position)
        _v1.y += 1
        this.vfx.burst(_v1, { color: '#8f86a3', count: 10, speed: 3.5, size: 0.22, life: 0.35 })
        this.twins.splice(i, 1)
      }
    }

    // skyfall hammers
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i]
      m.t += gdt
      m.ring.material.opacity = 0.35 + 0.35 * Math.sin(m.t * 16)
      m.ring.scale.setScalar(m.radius * (1 - 0.25 * Math.min(1, m.t / m.delay)))
      if (m.t >= m.delay && !m.boomed) {
        m.boomed = true
        _v1.set(0, 0, 0)
        this.vfx.shockwave(_v1, { color: m.color, radius: m.radius + 1.4 })
        _v1.y = 2.2
        this.vfx.flash(_v1, { color: '#fff2c4', size: 5, life: 0.3 })
        this.vfx.burst(_v1, { color: '#8a7d6a', count: 22, speed: 9, size: 0.3, life: 0.7, up: 4, gravity: -14 })
        this.engine.shake(0.6, 0.5)
        this.audio.play('explode', { vol: 0.85 })
        const d = F.foeOf(m.caster)
        if (Math.abs(d.pos.x) < m.radius && d.pos.y < 2.6 && d.iFrames <= 0 && d.kdT <= 0) {
          // huge damage + corner carry: hurled away from center
          const dir = Math.sign(d.pos.x) || -d.facing || 1
          const res = F.applyHit(m.caster, d, {
            dmg: m.dmg, special: true, kb: 7, knockdown: true, surge: m.surge, color: m.color,
          })
          if (res === 'hit') { d.vel.x = dir * 8; d.vel.y = 6 }
        }
        this.scene.remove(m.ring)
        m.ring.geometry.dispose()
        m.ring.material.dispose()
        this.meteors.splice(i, 1)
      }
    }

    // status visuals: frenzy trails and ward sprites
    for (const [f, s] of this._wardS) {
      s.material.opacity = f.wardT > 0 ? 0.22 + 0.12 * Math.sin(f.hero.t * 9) : 0
    }
    for (const [f, tr] of this._trails) {
      if (f.frenzyT <= 0) { tr.stop(); this._trails.delete(f) }
    }
  }

  /** Clear all transient battlefield objects (round reset / new fight). */
  reset() {
    for (const b of this.bolts) b.h.kill()
    this.bolts.length = 0
    for (const z of this.fields) { this.scene.remove(z.group); disposeObject3D(z.group) }
    this.fields.length = 0
    for (const m of this.meteors) { this.scene.remove(m.ring); m.ring.geometry.dispose(); m.ring.material.dispose() }
    this.meteors.length = 0
    this.novas.length = 0
    for (const p of this.pulls) if (p.hook.alive) p.hook.kill()
    this.pulls.length = 0
    for (const tw of this.twins) tw.hero.group.visible = false
    this.twins.length = 0
    for (const [, tr] of this._trails) tr.stop()
    this._trails.clear()
  }

  /** Drop everything owned by a departing fighter (tower advance). */
  releaseFighter(f) {
    const hero = this._twinCache.get(f)
    if (hero) {
      this.scene.remove(hero.group)
      disposeObject3D(hero.group)
      this._twinCache.delete(f)
    }
    this._wardS.delete(f)
    this._trails.get(f)?.stop()
    this._trails.delete(f)
  }

  dispose() {
    this.reset()
    for (const [, hero] of this._twinCache) {
      this.scene.remove(hero.group)
      disposeObject3D(hero.group)
    }
    this._twinCache.clear()
  }
}
