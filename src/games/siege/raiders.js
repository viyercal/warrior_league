import * as THREE from 'three'
import { createMinion, createHero } from '../../art/characterFactory.js'
import { glowMaterial, glowSpriteMaterial, toonMaterial } from '../../art/materials.js'
import { rand, TAU, distXZ } from '../../core/utils.js'
import { LANES, FIELD_R } from './siegeEnv.js'

export const WAVE_COUNT = 10
export const BOSS_WAVE = 10

/**
 * Horde raider archetypes — ember, bone, iron and blood-crimson warbands
 * (palettes distinct from arena's horde).
 * cdmg = damage per swing vs the bastion, dmg = vs player/decoy/turret.
 */
export const RAIDER_TYPES = {
  grunt:    { color: '#ff6a26', glow: '#ff8a3c', scale: 1.0,  hp: 22, speed: 3.1,  dmg: 6,  cdmg: 6,  reach: 1.15, aggroP: 0.7 },
  sprinter: { color: '#b9b3ae', glow: '#e8ddd0', scale: 0.8,  hp: 12, speed: 5.7,  dmg: 4,  cdmg: 5,  reach: 1.0,  aggroP: 0.4 },
  brute:    { color: '#3a2430', glow: '#c23b2e', scale: 1.9,  hp: 78, speed: 1.75, dmg: 14, cdmg: 13, reach: 1.85, aggroP: 0.95, knock: 6 },
  exploder: { color: '#ff3c14', glow: '#ffd166', scale: 1.05, hp: 16, speed: 4.6,  dmg: 16, cdmg: 22, reach: 1.5,  aggroP: 0.55 },
  shieldbearer: { color: '#6b6f78', glow: '#b8c8d8', scale: 1.3, hp: 48, speed: 1.7, dmg: 8, cdmg: 9, reach: 1.35, aggroP: 0.35 },
}

const MIXES = {
  1: { grunt: 10 },
  2: { grunt: 8, sprinter: 4 },
  3: { grunt: 8, sprinter: 4, exploder: 3 },
  4: { grunt: 8, sprinter: 5, exploder: 3, brute: 2 },
  5: { grunt: 6, sprinter: 4, exploder: 3, shieldbearer: 3 },
  6: { grunt: 8, sprinter: 6, exploder: 4, brute: 3, shieldbearer: 2 },
  7: { grunt: 8, sprinter: 8, exploder: 5, brute: 3, shieldbearer: 3 },
  8: { grunt: 10, sprinter: 8, exploder: 6, brute: 4, shieldbearer: 4 },
  9: { grunt: 10, sprinter: 10, exploder: 7, brute: 5, shieldbearer: 5 },
  10: { grunt: 6, shieldbearer: 2 }, // boss escort
}

/** Shuffled spawn queue for wave n. */
export function buildWaveQueue(n) {
  const mix = MIXES[Math.min(Math.max(n, 1), WAVE_COUNT)]
  const q = []
  for (const [type, c] of Object.entries(mix)) for (let i = 0; i < c; i++) q.push(type)
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[q[i], q[j]] = [q[j], q[i]]
  }
  return q
}

/**
 * Pooled raider army with lane pathing, mixed aggro, and citadel assault.
 * ctx per update: { heroPos, heroTargetable, decoyPos, turrets:[{x,z,alive,take(d,e)}],
 *   over, meleeHero(e), meleeDecoy(e), hitCitadel(e), detonate(e) }
 */
export class RaiderArmy {
  constructor(scene) {
    this.scene = scene
    this.pools = {}
    this.active = []
    for (const t of Object.keys(RAIDER_TYPES)) this.pools[t] = []
  }

  spawn(type, lane) {
    const def = RAIDER_TYPES[type]
    let e = this.pools[type].pop()
    if (!e) {
      e = { type, def, minion: createMinion({ color: def.color, evil: true, scale: def.scale }) }
      // molten crown gem + under-glow so raiders read from the top-down camera
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), glowMaterial(def.glow || def.color, 2.0))
      gem.position.y = 0.88
      e.minion.group.add(gem)
      const halo = new THREE.Sprite(glowSpriteMaterial(def.glow || def.color, 0.3))
      halo.scale.setScalar(1.5)
      halo.position.y = 0.22
      e.minion.group.add(halo)
      if (type === 'shieldbearer') {
        // iron tower shield held out front — 50% resist from the front arc
        const sh = new THREE.Group()
        const plate = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, 1.3, 0.08),
          toonMaterial({
            color: '#4a4e57', rim: '#d4dae4', rimStrength: 0.5,
            emissive: '#8fa5c0', emissiveIntensity: 0,
          }),
        )
        plate.position.y = 0.62
        plate.castShadow = true
        sh.add(plate)
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.08), plate.material)
        top.position.y = 1.36
        sh.add(top)
        // central boss + crimson warband sigil
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), plate.material)
        boss.scale.z = 0.6
        boss.position.set(0, 0.72, 0.07)
        sh.add(boss)
        const sigil = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.02), glowMaterial('#c23b2e', 1.5))
        sigil.position.set(0, 0.34, 0.055)
        sh.add(sigil)
        sh.position.z = 0.5
        e.minion.group.add(sh)
        e.shield = plate
      }
      this.scene.add(e.minion.group)
    }
    const wps = LANES[lane]
    e.lane = lane
    e.wps = wps
    e.wpIdx = 1
    e.ox = rand(-1.3, 1.3) // personal lane offset so columns feel loose
    e.oz = rand(-1.0, 1.0)
    e.hp = def.hp
    e.alive = true
    e.dying = 0
    e.attackCd = rand(0.4, 1.0)
    e.kx = 0
    e.kz = 0
    e.slowMul = 1
    e.exploded = false
    e.aggro = Math.random() < def.aggroP
    e.shieldFlash = 0
    const g = e.minion.group
    g.visible = true
    g.position.set(wps[0][0] + rand(-1.4, 1.4), 0, wps[0][1] + rand(-1.4, 1.4))
    g.scale.setScalar(def.scale)
    g.rotation.y = Math.atan2(-g.position.x, -g.position.z)
    e.minion.bodyMat.emissive.setScalar(0)
    e.minion._flash = 0
    this.active.push(e)
    return e
  }

  /** Apply damage; returns true if this hit killed the raider. */
  damage(e, dmg) {
    if (!e.alive) return false
    e.hp -= dmg
    e.minion.hitFlash()
    if (e.hp <= 0) { this.kill(e); return true }
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

  /** True if the strike direction hits a shieldbearer's front arc. */
  static frontBlocked(e, dirX, dirZ) {
    if (e.type !== 'shieldbearer') return false
    const fy = e.minion.group.rotation.y
    return Math.sin(fy) * dirX + Math.cos(fy) * dirZ < -0.15
  }

  update(dt, ctx) {
    const act = this.active
    for (let i = 0; i < act.length; i++) {
      const e = act[i]
      const g = e.minion.group
      const p = g.position

      if (!e.alive) {
        e.dying += dt
        const k = Math.min(1, e.dying / 0.26)
        const s = e.def.scale
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

      // ---------- pick target: decoy taunt > close aggro > lane march ----------
      let tx, tz, kind = 'lane'
      if (ctx.decoyPos && distXZ(ctx.decoyPos, p) < 10) {
        tx = ctx.decoyPos.x; tz = ctx.decoyPos.z; kind = 'decoy'
      } else {
        if (e.aggro && ctx.heroTargetable && distXZ(ctx.heroPos, p) < 6) {
          tx = ctx.heroPos.x; tz = ctx.heroPos.z; kind = 'hero'
        }
        if (kind === 'lane' && e.aggro) {
          for (const tur of ctx.turrets) {
            if (!tur.alive) continue
            const dxt = tur.x - p.x, dzt = tur.z - p.z
            if (dxt * dxt + dzt * dzt < 36) { tx = tur.x; tz = tur.z; kind = 'turret'; e.turTarget = tur; break }
          }
        }
        if (kind === 'lane') {
          const wp = e.wps[e.wpIdx]
          tx = wp[0] + e.ox; tz = wp[1] + e.oz
          if (e.wpIdx < e.wps.length - 1 && Math.hypot(tx - p.x, tz - p.z) < 2.2) {
            e.wpIdx++
          }
        }
      }

      const dx = tx - p.x, dz = tz - p.z
      const d = Math.hypot(dx, dz) || 0.001
      const def = e.def
      const atLaneEnd = kind === 'lane' && e.wpIdx === e.wps.length - 1

      if (e.type === 'exploder' && ((kind !== 'lane' && d < 1.7) || (atLaneEnd && d < 2.6))) {
        ctx.detonate(e)
        continue
      }

      const reach = kind === 'lane' ? (atLaneEnd ? 2.2 : 0.3) : def.reach
      let moving = false
      if (d > reach) {
        const sp = def.speed * e.slowMul
        p.x += (dx / d) * sp * dt
        p.z += (dz / d) * sp * dt
        moving = sp > 0.4
      } else if (kind !== 'lane' || atLaneEnd) {
        e.attackCd -= dt
        if (e.attackCd <= 0 && d < reach * 1.25) {
          e.attackCd = e.type === 'brute' ? 1.7 : 1.15
          if (kind === 'decoy') ctx.meleeDecoy(e)
          else if (kind === 'hero') ctx.meleeHero(e)
          else if (kind === 'turret') e.turTarget?.take(def.dmg, e)
          else ctx.hitCitadel(e)
        }
      }
      g.rotation.y = Math.atan2(dx, dz)

      // knockback decay
      p.x += e.kx * dt
      p.z += e.kz * dt
      const kd = Math.exp(-5.5 * dt)
      e.kx *= kd
      e.kz *= kd

      const rr = Math.hypot(p.x, p.z)
      if (rr > FIELD_R) { p.x *= FIELD_R / rr; p.z *= FIELD_R / rr }

      e.minion.setMoving(moving)
      e.minion.update(dt)

      // per-type menace tells
      if (e.type === 'exploder') {
        const pu = 0.5 + 0.5 * Math.sin(e.minion.t * 10)
        g.scale.setScalar(def.scale * (1 + 0.1 * pu))
        if (e.minion._flash <= 0) e.minion.bodyMat.emissive.setRGB(0.7 * pu, 0.16 * pu, 0.04 * pu)
      } else if (e.shield) {
        e.shieldFlash = Math.max(0, e.shieldFlash - dt * 4)
        e.shield.material.emissiveIntensity = 0.05 + 0.04 * Math.sin(e.minion.t * 7) + 1.3 * e.shieldFlash
      }
    }

    // pairwise separation
    for (let i = 0; i < act.length; i++) {
      const a = act[i]
      if (!a.alive) continue
      const pa = a.minion.group.position
      const ra = 0.42 * a.def.scale
      for (let j = i + 1; j < act.length; j++) {
        const b = act[j]
        if (!b.alive) continue
        const pb = b.minion.group.position
        const dx2 = pb.x - pa.x, dz2 = pb.z - pa.z
        const rr = ra + 0.42 * b.def.scale
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
 * SIEGE COLOSSUS — wave-10 boss. Marches the center between lanes,
 * telegraphed ground slams, burning mortars lobbed at the ballistas,
 * enrage < 30%.
 * hooks: { heroPos, anyTurretAlive(), slam(pos), mortarVolley(), hitCitadel(dmg) }
 */
export class Colossus {
  constructor(scene, hooks) {
    this.scene = scene
    this.hooks = hooks
    this.hero = createHero(
      { primary: '#33231d', secondary: '#120a0c', glow: '#ff5a26', head: 'orb', hair: 'horns', cape: true },
      { auraRing: true },
    )
    this.hero.group.scale.setScalar(2.8)
    this.hero.ring.material.color.setStyle('#ff5a1e').multiplyScalar(1.8)
    this.group = this.hero.group
    scene.add(this.group)

    this.maxHp = 700
    this.hp = 700
    this.alive = true
    this.deadT = 0
    this.enraged = false
    this.state = 'march'
    this.actT = 3.4
    this.teleT = 0
    this.hitCd = 0
    this.t = 0
    this.wps = LANES.center
    this.wpIdx = 1
    this.slamPos = new THREE.Vector3()

    this.tele = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 48),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ff5a1e').multiplyScalar(1.9),
        transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    this.tele.rotation.x = -Math.PI / 2
    this.tele.visible = false
    scene.add(this.tele)

    const p = this.wps[0]
    this.group.position.set(p[0], 0, p[1])
  }

  damage(d) {
    if (this.alive) this.hp = Math.max(0, this.hp - d)
  }

  update(dt, over) {
    this.t += dt
    const hero = this.hero
    if (!this.alive) {
      this.deadT += dt
      if (this.deadT > 0.9) this.group.position.y -= dt * 1.6
      hero.update(dt)
      return
    }

    if (!this.enraged && this.hp <= this.maxHp * 0.3) {
      this.enraged = true
      this.hooks.enrage?.()
    }
    const rage = this.enraged ? 1 : 0

    const hp = this.hooks.heroPos
    const p = this.group.position
    let moveAnim = 0

    if (this.state === 'march') {
      const atEnd = this.wpIdx >= this.wps.length - 1
        && Math.hypot(this.wps.at(-1)[0] - p.x, this.wps.at(-1)[1] - p.z) < 3.2
      if (!over && !atEnd) {
        const wp = this.wps[this.wpIdx]
        const dx = wp[0] - p.x, dz = wp[1] - p.z
        const d = Math.hypot(dx, dz) || 0.001
        if (d < 2.4 && this.wpIdx < this.wps.length - 1) this.wpIdx++
        const sp = 1.5 + rage * 0.75
        p.x += (dx / d) * sp * dt
        p.z += (dz / d) * sp * dt
        hero.faceTowards(new THREE.Vector3(wp[0], 0, wp[1]), dt, 5)
        moveAnim = 3
      } else if (atEnd && !over) {
        // pounding the citadel gate
        hero.faceTowards(new THREE.Vector3(0, 0, 22), dt, 5)
        this.hitCd -= dt
        if (this.hitCd <= 0) {
          this.hitCd = 2.2 - rage * 0.7
          hero.cast()
          this.hooks.hitCitadel(20)
        }
      }
      this.actT -= dt
      if (this.actT <= 0 && !over) {
        if (distXZ(p, hp) < 9 && Math.random() < 0.65) {
          this.state = 'slam'
          this.teleT = 1.0 - rage * 0.25
          this.slamPos.copy(hp)
          this.tele.visible = true
          this.tele.position.set(this.slamPos.x, 0.07, this.slamPos.z)
          this.tele.scale.setScalar(0.1)
          hero.cast()
        } else if (this.hooks.anyTurretAlive()) {
          this.state = 'mortar'
          this.teleT = 0.6
          hero.cast()
        } else {
          this.state = 'slam'
          this.teleT = 1.0 - rage * 0.25
          this.slamPos.copy(hp)
          this.tele.visible = true
          this.tele.position.set(this.slamPos.x, 0.07, this.slamPos.z)
          this.tele.scale.setScalar(0.1)
          hero.cast()
        }
      }
    } else if (this.state === 'slam') {
      this.teleT -= dt
      const dur = 1.0 - rage * 0.25
      const k = 1 - Math.max(0, this.teleT) / dur
      this.tele.scale.setScalar(6.6 * (0.25 + 0.75 * k))
      this.tele.material.opacity = 0.38 + 0.28 * Math.sin(this.t * 22)
      if (this.teleT <= 0) {
        this.tele.visible = false
        this.hooks.slam(this.slamPos)
        this.state = 'march'
        this.actT = rand(3.4, 4.6) - rage * 1.4
      }
    } else if (this.state === 'mortar') {
      this.teleT -= dt
      if (this.teleT <= 0) {
        this.hooks.mortarVolley()
        this.state = 'march'
        this.actT = rand(3.2, 4.4) - rage * 1.2
      }
    }

    const rr = Math.hypot(p.x, p.z)
    if (rr > FIELD_R) { p.x *= FIELD_R / rr; p.z *= FIELD_R / rr }

    // enrage tell: molten pulse
    if (this.enraged) {
      const pu = 1 + 0.04 * Math.sin(this.t * 12)
      this.group.scale.setScalar(2.8 * pu)
    }

    hero.setMoveSpeed(moveAnim)
    hero.update(dt)
  }

  disposeTele() {
    this.scene.remove(this.tele)
    this.tele.geometry.dispose()
    this.tele.material.dispose()
  }
}
