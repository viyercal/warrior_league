import * as THREE from 'three'
import { createMinion, createHero } from '../../art/characterFactory.js'
import { emberGlowMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { rand, TAU, distXZ } from '../../core/utils.js'

/**
 * Enemy archetypes — bone / ash / ember / magma raider tints.
 * Minion instances are pooled per-type (color/scale baked into the pooled
 * instance) so waves never re-create geometry.
 *
 * ELITE variant (spawn(type, x, z, true)): same archetype at 1.4x scale with
 * an ember crown + warm skin pulse, 2x HP. Purely additive — base defs and
 * all non-elite behavior are untouched.
 */
export const ENEMY_TYPES = {
  grunt:    { color: '#a3967d', scale: 1.0, hp: 20, speed: 3.4,  dmg: 5,  reach: 1.15 }, // bone
  sprinter: { color: '#a8703c', scale: 0.8, hp: 10, speed: 6.15, dmg: 4,  reach: 1.0 },  // ember
  brute:    { color: '#4e4238', scale: 1.9, hp: 60, speed: 1.85, dmg: 12, reach: 1.8 },  // ash
  exploder: { color: '#96311e', scale: 1.0, hp: 14, speed: 4.7,  dmg: 15, reach: 1.5 },  // magma
}

// ---------- elite ember crown (shared geo/mat; one group per pooled minion) ----------
let _crownGeo = null
let _crownMat = null
function makeCrown() {
  _crownGeo ??= new THREE.ConeGeometry(0.05, 0.17, 5)
  _crownMat ??= emberGlowMaterial(2.2, '#ff7a26')
  const g = new THREE.Group()
  for (let i = 0; i < 5; i++) {
    const a = (i * TAU) / 5
    const spike = new THREE.Mesh(_crownGeo, _crownMat)
    spike.position.set(Math.cos(a) * 0.2, 0.88, Math.sin(a) * 0.2)
    spike.rotation.set(Math.sin(a) * 0.42, 0, -Math.cos(a) * 0.42) // lean outward
    g.add(spike)
  }
  const halo = new THREE.Sprite(glowSpriteMaterial('#ff7a26', 0.3))
  halo.scale.setScalar(0.7)
  halo.position.y = 0.95
  g.add(halo)
  return g
}

export class Horde {
  constructor(scene, arenaR) {
    this.scene = scene
    this.arenaR = arenaR
    this.pools = { grunt: [], sprinter: [], brute: [], exploder: [] }
    this.active = []
  }

  spawn(type, x, z, elite = false) {
    const def = ENEMY_TYPES[type]
    let e = this.pools[type].pop()
    if (!e) {
      e = { type, def, minion: createMinion({ color: def.color, evil: true, scale: def.scale }) }
      this.scene.add(e.minion.group)
    }
    e.elite = elite
    e.scale = def.scale * (elite ? 1.4 : 1) // drives visuals + hit radii
    e.hp = def.hp * (elite ? 2 : 1)
    e.maxHp = e.hp
    e.alive = true
    e.dying = 0
    e.attackCd = rand(0.5, 1.1)
    e.kx = 0
    e.kz = 0
    e.slowMul = 1
    e.exploded = false
    const g = e.minion.group
    g.visible = true
    g.position.set(x, 0, z)
    g.scale.setScalar(e.scale)
    g.rotation.y = rand(TAU)
    e.minion.bodyMat.emissive.setScalar(0)
    e.minion._flash = 0
    if (elite) {
      if (!e.minion.crown) {
        e.minion.crown = makeCrown()
        g.add(e.minion.crown)
      }
      e.minion.crown.visible = true
    } else if (e.minion.crown) e.minion.crown.visible = false
    this.active.push(e)
    return e
  }

  /** Apply damage; returns true if this hit killed the enemy. */
  damage(e, dmg) {
    if (!e.alive) return false
    e.hp -= dmg
    e.minion.hitFlash()
    if (e.hp <= 0) {
      this.kill(e)
      return true
    }
    return false
  }

  kill(e) {
    if (!e.alive) return
    e.alive = false
    e.dying = 0.0001
    e.minion.setMoving(false)
  }

  aliveCount() {
    let n = 0
    for (const e of this.active) if (e.alive) n++
    return n
  }

  clearAll() {
    for (const e of this.active) {
      e.minion.group.visible = false
      this.pools[e.type].push(e)
    }
    this.active.length = 0
  }

  /**
   * ctx: { heroPos, decoyPos|null, over, meleeHero(e), meleeDecoy(e), detonate(e) }
   * All per-frame math uses locals — no allocation in this loop.
   */
  update(dt, ctx) {
    const R = this.arenaR - 0.9
    const act = this.active
    for (let i = 0; i < act.length; i++) {
      const e = act[i]
      const g = e.minion.group
      const p = g.position

      if (!e.alive) {
        // squash-out death anim, then release to pool
        e.dying += dt
        const k = Math.min(1, e.dying / 0.26)
        const s = e.scale
        g.scale.set(s * (1 + 0.8 * k), s * Math.max(0.04, 1 - 1.15 * k), s * (1 + 0.8 * k))
        if (e.dying >= 0.3) {
          g.visible = false
          this.pools[e.type].push(e)
          act.splice(i, 1)
          i--
        }
        continue
      }

      if (ctx.over) {
        e.minion.setMoving(false)
        e.minion.update(dt)
        continue
      }

      // pick target: decoy taunts everything within 18 units
      let tx = ctx.heroPos.x, tz = ctx.heroPos.z, onDecoy = false
      if (ctx.decoyPos) {
        const ddx = ctx.decoyPos.x - p.x, ddz = ctx.decoyPos.z - p.z
        if (ddx * ddx + ddz * ddz < 324) { tx = ctx.decoyPos.x; tz = ctx.decoyPos.z; onDecoy = true }
      }
      const dx = tx - p.x, dz = tz - p.z
      const d = Math.hypot(dx, dz) || 0.001
      const def = e.def

      if (e.type === 'exploder' && d < 1.6) {
        ctx.detonate(e)
        continue
      }

      let moving = false
      if (d > def.reach * 0.85) {
        const sp = def.speed * e.slowMul
        p.x += (dx / d) * sp * dt
        p.z += (dz / d) * sp * dt
        moving = sp > 0.4
      } else {
        e.attackCd -= dt
        if (e.attackCd <= 0 && d < def.reach * 1.2) {
          e.attackCd = e.type === 'brute' ? 1.6 : 1.0
          if (onDecoy) ctx.meleeDecoy(e)
          else ctx.meleeHero(e)
        }
      }
      g.rotation.y = Math.atan2(dx, dz)

      // knockback velocity
      p.x += e.kx * dt
      p.z += e.kz * dt
      const kd = Math.exp(-5.5 * dt)
      e.kx *= kd
      e.kz *= kd

      // stay on the disc
      const rr = Math.hypot(p.x, p.z)
      if (rr > R) { p.x *= R / rr; p.z *= R / rr }

      e.minion.setMoving(moving)
      e.minion.update(dt)

      // exploder menace pulse (scale + magma emissive)
      if (e.type === 'exploder') {
        const pu = 0.5 + 0.5 * Math.sin(e.minion.t * 9)
        g.scale.setScalar(e.scale * (1 + 0.09 * pu))
        if (e.minion._flash <= 0) e.minion.bodyMat.emissive.setRGB(0.7 * pu, 0.22 * pu, 0.04 * pu)
      } else if (e.elite && e.minion._flash <= 0) {
        // elite menace: warm ember skin pulse under the crown
        const pu = 0.55 + 0.45 * Math.sin(e.minion.t * 6)
        e.minion.bodyMat.emissive.setRGB(0.34 * pu, 0.12 * pu, 0.02 * pu)
      }
    }

    // cheap pairwise separation so the horde doesn't stack into one blob
    for (let i = 0; i < act.length; i++) {
      const a = act[i]
      if (!a.alive) continue
      const pa = a.minion.group.position
      const ra = 0.42 * a.scale
      for (let j = i + 1; j < act.length; j++) {
        const b = act[j]
        if (!b.alive) continue
        const pb = b.minion.group.position
        const dx2 = pb.x - pa.x, dz2 = pb.z - pa.z
        const rr = ra + 0.42 * b.scale
        const d2 = dx2 * dx2 + dz2 * dz2
        if (d2 > rr * rr || d2 < 1e-6) continue
        const d = Math.sqrt(d2)
        const push = ((rr - d) * 0.5) / d
        pa.x -= dx2 * push
        pa.z -= dz2 * push
        pb.x += dx2 * push
        pb.z += dz2 * push
      }
    }
  }
}

/**
 * PIT WARDEN — wave-5 boss. Giant blood-iron warlord that stalks, ground-slams
 * (telegraphed), fires radial bursts, and summons grunts at half HP.
 * hooks: { heroPos, arenaR, slam(pos), radialBurst(pos), summonMinions(pos) }
 */
export class Boss {
  constructor(scene, hooks) {
    this.scene = scene
    this.hooks = hooks
    this.hero = createHero(
      { primary: '#6e1a1c', secondary: '#26201c', glow: '#ff5a26', head: 'orb', hair: 'horns', cape: true },
      { auraRing: true },
    )
    this.hero.group.scale.setScalar(2.6)
    this.group = this.hero.group
    scene.add(this.group)

    this.maxHp = 400
    this.hp = 400
    this.alive = true
    this.deadT = 0
    this.state = 'stalk'
    this.actT = 3
    this.teleT = 0
    this.summoned = false
    this.t = 0
    this.slamPos = new THREE.Vector3()

    this.tele = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1, 48),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#c23b2e').multiplyScalar(1.45),
        transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    this.tele.rotation.x = -Math.PI / 2
    this.tele.visible = false
    scene.add(this.tele)
  }

  damage(d) {
    if (this.alive) this.hp = Math.max(0, this.hp - d)
  }

  update(dt, over) {
    this.t += dt
    const hero = this.hero
    if (!this.alive) {
      this.deadT += dt
      if (this.deadT > 0.9) this.group.position.y -= dt * 1.7
      hero.update(dt)
      return
    }

    const hp = this.hooks.heroPos
    const p = this.group.position
    const d = distXZ(p, hp)
    hero.faceTowards(hp, dt, 6)

    if (!this.summoned && this.hp <= this.maxHp / 2) {
      this.summoned = true
      this.hooks.summonMinions(p)
    }

    let moveAnim = 0
    if (this.state === 'stalk') {
      if (!over && d > 3.4) {
        const sp = 2.25
        p.x += ((hp.x - p.x) / d) * sp * dt
        p.z += ((hp.z - p.z) / d) * sp * dt
        moveAnim = 3.2
      }
      this.actT -= dt
      if (this.actT <= 0 && !over) {
        if (d < 10.5) {
          this.state = 'slam'
          this.teleT = 0.95
          this.slamPos.copy(hp)
          this.tele.visible = true
          this.tele.position.set(this.slamPos.x, 0.07, this.slamPos.z)
          this.tele.scale.setScalar(0.1)
          hero.cast()
        } else {
          this.state = 'burst'
          this.teleT = 0.45
          hero.cast()
        }
      }
    } else if (this.state === 'slam') {
      this.teleT -= dt
      const k = 1 - Math.max(0, this.teleT) / 0.95
      this.tele.scale.setScalar(6 * (0.25 + 0.75 * k))
      this.tele.material.opacity = 0.38 + 0.28 * Math.sin(this.t * 22)
      if (this.teleT <= 0) {
        this.tele.visible = false
        this.hooks.slam(this.slamPos)
        this.state = 'stalk'
        this.actT = rand(2.6, 3.6)
      }
    } else if (this.state === 'burst') {
      this.teleT -= dt
      if (this.teleT <= 0) {
        this.hooks.radialBurst(p)
        this.state = 'stalk'
        this.actT = rand(2.4, 3.4)
      }
    }

    const rr = Math.hypot(p.x, p.z)
    const R = this.hooks.arenaR - 2
    if (rr > R) { p.x *= R / rr; p.z *= R / rr }

    hero.setMoveSpeed(moveAnim)
    hero.update(dt)
  }

  disposeTele() {
    this.scene.remove(this.tele)
    this.tele.geometry.dispose()
    this.tele.material.dispose()
  }
}
