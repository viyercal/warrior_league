import * as THREE from 'three'
import { createMinion, createHero } from '../../art/characterFactory.js'
import { rand, distXZ, clamp } from '../../core/utils.js'
import { SPAWN_X, TEAMS, MINION, TOWER, NEXUS_HP, ENEMY } from './constants.js'

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

/*
 * All classes here operate on the scene instance `g` (the world interface):
 *   g.scene g.vfx g.audio g.hero g.enemy g.army g.structures g.decoy g.over
 *   g.playerTargetable() g.damagePlayer(dmg, srcPos) g.dmgNum(pos, str, opts)
 *   g.onMinionKilled(e, byPlayer) g.onStructureDestroyed(s, byTeam) g.onEnemySlain(byPlayer)
 *   g.playerVel (Vector3) g.ctx.engine.shake
 */

// ============================== floating health bars ==============================

const _barMats = new Map()
function barMat(color, opacity) {
  const key = `${color}|${opacity}`
  if (!_barMats.has(key)) {
    _barMats.set(key, new THREE.SpriteMaterial({ color, opacity, transparent: true, depthTest: false, depthWrite: false }))
  }
  return _barMats.get(key)
}

export class HealthBar {
  constructor(parent, { w = 0.9, y = 1.25, color = '#8fc25a', h = 0.11 } = {}) {
    this.w = w
    this.group = new THREE.Group()
    this.group.position.y = y
    this.bg = new THREE.Sprite(barMat('#14100b', 0.88))
    this.bg.scale.set(w + 0.09, h + 0.06, 1)
    this.bg.renderOrder = 800
    this.fill = new THREE.Sprite(barMat(color, 1))
    this.fill.center.set(0, 0.5)
    this.fill.position.x = -w / 2
    this.fill.scale.set(w, h, 1)
    this.fill.renderOrder = 801
    this.group.add(this.bg, this.fill)
    this.group.visible = false
    parent.add(this.group)
  }

  set(frac) {
    frac = clamp(frac, 0, 1)
    this.group.visible = frac > 0.0001 && frac < 0.999
    this.fill.scale.x = Math.max(0.02, this.w * frac)
  }

  hide() { this.group.visible = false }
}

// helpers shared by minions / bolts -------------------------------------------------

function targetAlive(t, g) {
  switch (t.kind) {
    case 'minion': return t.ref.alive
    case 'pchamp': return g.playerTargetable()
    case 'echamp': return g.enemy.alive
    case 'decoy': return !!g.decoy
    case 'structure': return t.ref.alive && g.structures.attackable(t.ref)
  }
  return false
}

function targetPos(t, g, out, lift = 0.55) {
  switch (t.kind) {
    case 'minion': out.copy(t.ref.minion.group.position); out.y += lift; return out
    case 'pchamp': out.copy(g.hero.group.position); out.y += 1.1; return out
    case 'echamp': out.copy(g.enemy.group.position); out.y += 1.1; return out
    case 'decoy': out.copy(g.decoy.pos); out.y += 1.1; return out
    case 'structure': out.copy(t.ref.pos); out.y += 2.2; return out
  }
  return out
}

function applyHit(t, g, dmg, srcPos) {
  switch (t.kind) {
    case 'minion': g.army.damage(t.ref, dmg, { byPlayer: false }); break
    case 'pchamp': g.damagePlayer(dmg, srcPos); break
    case 'echamp': g.enemy.damage(dmg, { byPlayer: false }); break
    case 'decoy': g.decoy.damage(dmg); break
    case 'structure': g.structures.damage(t.ref, dmg, t.byTeam || 'blue'); break
  }
}

// ============================== minion waves ==============================

export class MinionArmy {
  constructor(g) {
    this.g = g
    this.pools = { blue_melee: [], blue_caster: [], red_melee: [], red_caster: [] }
    this.active = []
    this.bolts = []
  }

  aliveCount() {
    let n = 0
    for (const e of this.active) if (e.alive) n++
    return n
  }

  spawnWave(team) {
    const T = TEAMS[team]
    const sx = T.sign * SPAWN_X
    const slots = [
      ['melee', sx, -1.9], ['melee', sx + T.sign * 1.2, 0], ['melee', sx, 1.9],
      ['caster', sx + T.sign * 2.6, 0],
    ]
    for (const [type, x, z] of slots) {
      if (this.aliveCount() >= MINION.cap) break
      this.spawn(team, type, x, z)
    }
    _a.set(sx, 1, 0)
    this.g.vfx.flash(_a, { color: T.color, size: 2.6, life: 0.3 })
  }

  spawn(team, type, x, z) {
    const key = `${team}_${type}`
    let e = this.pools[key].pop()
    if (!e) {
      const T = TEAMS[team]
      const minion = createMinion({
        color: type === 'caster' ? T.caster : T.minion,
        evil: team === 'red',
        scale: type === 'caster' ? 0.92 : 1,
      })
      const bar = new HealthBar(minion.group, { w: 0.85, y: 1.15, color: team === 'blue' ? '#8fc25a' : '#d84838' })
      e = { team, type, minion, bar, scale: type === 'caster' ? 0.92 : 1 }
      this.g.scene.add(minion.group)
    }
    e.hp = MINION.hp
    e.maxHp = MINION.hp
    e.alive = true
    e.dying = 0
    e.atkCd = rand(0.2, 0.7)
    e.laneZ = clamp(z + rand(-0.7, 0.7), -3.6, 3.6)
    e.kx = 0
    e.kz = 0
    e.slowMul = 1
    const grp = e.minion.group
    grp.visible = true
    grp.position.set(x, 0, z)
    grp.scale.setScalar(e.scale)
    grp.rotation.y = TEAMS[team].sign * -Math.PI / 2
    e.minion.bodyMat.emissive.setScalar(0)
    e.minion._flash = 0
    e.bar.hide()
    this.active.push(e)
    return e
  }

  /** Apply damage. Returns true if this hit killed the minion. */
  damage(e, dmg, { byPlayer = false } = {}) {
    if (!e.alive) return false
    e.hp -= dmg
    e.minion.hitFlash()
    e.bar.set(e.hp / e.maxHp)
    if (e.hp > 0) return false
    e.alive = false
    e.dying = 0.0001
    e.bar.hide()
    e.minion.setMoving(false)
    const p = e.minion.group.position
    this.g.vfx.impact(p, { color: TEAMS[e.team].color, size: 0.8 })
    this.g.onMinionKilled(e, byPlayer)
    return true
  }

  _pickTarget(e, g) {
    const p = e.minion.group.position
    // decoy taunts red minions
    if (e.team === 'red' && g.decoy && distXZ(p, g.decoy.pos) < 12) return { kind: 'decoy' }
    // nearest enemy minion in aggro range
    let best = null, bd = MINION.aggro
    for (const o of this.active) {
      if (!o.alive || o.team === e.team) continue
      const d = distXZ(p, o.minion.group.position)
      if (d < bd) { bd = d; best = o }
    }
    if (best) return { kind: 'minion', ref: best }
    // enemy champion
    if (e.team === 'red') {
      if (g.playerTargetable() && distXZ(p, g.hero.group.position) < MINION.aggro) return { kind: 'pchamp' }
    } else if (g.enemy.alive && distXZ(p, g.enemy.group.position) < MINION.aggro) {
      return { kind: 'echamp' }
    }
    // enemy structure
    const s = g.structures.nearestAttackable(e.team === 'blue' ? 'red' : 'blue', p, MINION.aggro + 3)
    if (s) return { kind: 'structure', ref: s, byTeam: e.team }
    return null
  }

  update(dt, g) {
    const act = this.active
    for (let i = 0; i < act.length; i++) {
      const e = act[i]
      const grp = e.minion.group
      const p = grp.position

      if (!e.alive) {
        e.dying += dt
        const k = Math.min(1, e.dying / 0.26)
        grp.scale.set(e.scale * (1 + 0.8 * k), e.scale * Math.max(0.04, 1 - 1.15 * k), e.scale * (1 + 0.8 * k))
        if (e.dying >= 0.3) {
          grp.visible = false
          this.pools[`${e.team}_${e.type}`].push(e)
          act.splice(i, 1)
          i--
        }
        continue
      }

      if (g.over) {
        e.minion.setMoving(false)
        e.minion.update(dt)
        continue
      }

      const sp = MINION.speed * e.slowMul
      e.slowMul = 1
      e.atkCd -= dt
      const tgt = this._pickTarget(e, g)
      let moving = false

      if (tgt) {
        targetPos(tgt, g, _a)
        const d = distXZ(p, _a)
        const isCaster = e.type === 'caster'
        const reach = tgt.kind === 'structure'
          ? tgt.ref.radius + (isCaster ? 5.2 : 1.1)
          : (isCaster ? MINION.casterRange : MINION.reach)
        if (d > reach) {
          p.x += ((_a.x - p.x) / d) * sp * dt
          p.z += ((_a.z - p.z) / d) * sp * dt
          moving = sp > 0.4
        } else if (e.atkCd <= 0) {
          if (isCaster) {
            e.atkCd = MINION.casterCd
            _b.set(p.x, 1.05, p.z)
            const h = this.g.vfx.projectile({
              from: _b, to: _a, speed: MINION.boltSpeed,
              color: TEAMS[e.team].caster, size: 0.26, life: 2.6, trail: true,
            })
            this.bolts.push({ h, dmg: MINION.casterDmg, tgt })
          } else {
            e.atkCd = MINION.meleeCd
            applyHit(tgt, g, MINION.meleeDmg, p)
          }
        }
        grp.rotation.y = Math.atan2(_a.x - p.x, _a.z - p.z)
      } else {
        // march down-lane toward the enemy nexus
        const dir = e.team === 'blue' ? 1 : -1
        p.x += dir * sp * dt
        p.z += (e.laneZ - p.z) * Math.min(1, dt * 1.4)
        grp.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2
        moving = true
      }

      // knockback
      p.x += e.kx * dt
      p.z += e.kz * dt
      const kd = Math.exp(-5.5 * dt)
      e.kx *= kd
      e.kz *= kd

      g.structures.pushOut(p, 0.35)
      e.minion.setMoving(moving)
      e.minion.update(dt)
    }

    // caster bolts (lightly homing)
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      if (!b.h.alive) { this.bolts.splice(i, 1); continue }
      if (!targetAlive(b.tgt, g)) { b.h.kill(); this.bolts.splice(i, 1); continue }
      targetPos(b.tgt, g, _a)
      _b.copy(_a).sub(b.h.pos)
      const d = _b.length()
      const hitR = b.tgt.kind === 'structure' ? b.tgt.ref.radius + 0.4 : 0.75
      if (d < hitR) {
        this.g.vfx.flash(b.h.pos, { color: '#ffffff', size: 0.6, life: 0.1 })
        applyHit(b.tgt, g, b.dmg, b.h.pos)
        b.h.kill()
        this.bolts.splice(i, 1)
        continue
      }
      b.h.vel.copy(_b.multiplyScalar(MINION.boltSpeed / d))
    }

    // pairwise separation so waves clash instead of stacking
    for (let i = 0; i < act.length; i++) {
      const a = act[i]
      if (!a.alive) continue
      const pa = a.minion.group.position
      for (let j = i + 1; j < act.length; j++) {
        const b2 = act[j]
        if (!b2.alive) continue
        const pb = b2.minion.group.position
        const dx = pb.x - pa.x, dz = pb.z - pa.z
        const rr = 0.75
        const d2 = dx * dx + dz * dz
        if (d2 > rr * rr || d2 < 1e-6) continue
        const d = Math.sqrt(d2)
        const push = ((rr - d) * 0.5) / d
        pa.x -= dx * push
        pa.z -= dz * push
        pb.x += dx * push
        pb.z += dz * push
      }
    }
  }
}

// ============================== towers + nexuses ==============================

export class Structures {
  constructor(g, towerDefs, nexusDefs) {
    this.g = g
    this.list = []
    for (const def of towerDefs) {
      const s = {
        kind: 'tower', team: def.team, tier: def.tier,
        pos: new THREE.Vector3(def.x, 0, def.z), radius: 2.1,
        hp: TOWER.hp, maxHp: TOWER.hp, alive: true,
        def, target: null, aimT: 0, cd: 0, flashT: 0,
        bar: new HealthBar(def.group, { w: 2.6, y: 7.6, color: def.team === 'blue' ? '#8fc25a' : '#d84838', h: 0.16 }),
      }
      s.trimBase = def.trimMesh.material.color.clone()
      this.list.push(s)
    }
    for (const team of ['blue', 'red']) {
      const def = nexusDefs[team]
      this.list.push({
        kind: 'nexus', team, tier: 2,
        pos: new THREE.Vector3(def.x, 0, 0), radius: 3.4,
        hp: NEXUS_HP, maxHp: NEXUS_HP, alive: true,
        def, target: null, aimT: 0, cd: 0, flashT: 0,
        bar: new HealthBar(def.group, { w: 3.4, y: 9.4, color: team === 'blue' ? '#8fc25a' : '#d84838', h: 0.2 }),
      })
    }
  }

  tower(team, tier) { return this.list.find(s => s.kind === 'tower' && s.team === team && s.tier === tier) }
  nexus(team) { return this.list.find(s => s.kind === 'nexus' && s.team === team) }

  /** Standard MOBA gating: outer tower first, then inner, then nexus. */
  attackable(s) {
    if (!s.alive) return false
    if (s.kind === 'tower') return s.tier === 0 || !this.tower(s.team, 0).alive
    return !this.tower(s.team, 0).alive && !this.tower(s.team, 1).alive
  }

  nearestAttackable(team, pos, maxDist) {
    let best = null, bd = maxDist
    for (const s of this.list) {
      if (s.team !== team || !this.attackable(s)) continue
      const d = distXZ(pos, s.pos) - s.radius
      if (d < bd) { bd = d; best = s }
    }
    return best
  }

  /** Foremost (mid-most) alive structure of a team — the safe anchor for its champion. */
  front(team) {
    let best = null, bd = Infinity
    for (const s of this.list) {
      if (s.team !== team || !s.alive) continue
      const d = Math.abs(s.pos.x)
      if (d < bd) { bd = d; best = s }
    }
    return best
  }

  /** Alive tower of `team` whose attack range covers pos (danger check). */
  towerCovering(pos, team) {
    for (const s of this.list) {
      if (s.kind !== 'tower' || s.team !== team || !s.alive) continue
      if (distXZ(pos, s.pos) < TOWER.range + 1.2) return s
    }
    return null
  }

  /** Keep units from walking through standing structures. */
  pushOut(p, margin = 0.4) {
    for (const s of this.list) {
      if (!s.alive || s.kind === 'nexus') continue
      const dx = p.x - s.pos.x, dz = p.z - s.pos.z
      const r = s.radius + margin
      const d2 = dx * dx + dz * dz
      if (d2 > r * r || d2 < 1e-6) continue
      const d = Math.sqrt(d2)
      p.x = s.pos.x + (dx / d) * r
      p.z = s.pos.z + (dz / d) * r
    }
  }

  damage(s, dmg, byTeam) {
    if (!s.alive || this.g.over) return
    if (!this.attackable(s)) {
      if (s.flashT <= 0) {
        s.flashT = 0.8
        _a.copy(s.pos)
        _a.y = 3
        this.g.dmgNum(_a, 'WARDED', { color: '#d8cfae', size: 0.7 })
      }
      return
    }
    s.hp -= dmg
    s.flashT = Math.max(s.flashT, 0.22)
    s.bar.set(s.hp / s.maxHp)
    if (s.hp <= 0) this._destroy(s, byTeam)
  }

  _destroy(s, byTeam) {
    s.alive = false
    s.bar.hide()
    const g = this.g
    _a.copy(s.pos)
    g.vfx.shockwave(_a, { color: TEAMS[s.team].color, radius: s.kind === 'nexus' ? 9 : 6 })
    _a.y = 3
    g.vfx.burst(_a, { color: '#c9cede', count: 30, speed: 9, size: 0.4, up: 5 })
    g.vfx.flash(_a, { color: TEAMS[s.team].color, size: 6, life: 0.4 })
    g.audio.play('tower', { vol: 0.9 })
    g.ctx.engine.shake(s.kind === 'nexus' ? 0.7 : 0.45, 0.55)

    const d = s.def
    if (s.kind === 'tower') {
      d.gem.visible = false
      d.halo.visible = false
      d.aimSpr.material.opacity = 0
      d.shield.visible = false
      d.trimMesh.visible = false
      // crumble the tower body
      d.group.traverse(o => {
        if (o.isMesh && o.visible) {
          o.scale.y *= 0.5
          o.position.y *= 0.42
          o.rotation.z += rand(-0.14, 0.14)
        }
      })
    } else {
      d.nexGroup.visible = false
      d.light.intensity = 6
    }
    g.onStructureDestroyed(s, byTeam)
  }

  _pickTowerTarget(s, g) {
    const enemyTeam = s.team === 'blue' ? 'red' : 'blue'
    // decoy taunts enemy (red) towers
    if (s.team === 'red' && g.decoy && distXZ(s.pos, g.decoy.pos) < TOWER.range) return { kind: 'decoy' }
    let best = null, bd = TOWER.range
    for (const e of g.army.active) {
      if (!e.alive || e.team !== enemyTeam) continue
      const d = distXZ(s.pos, e.minion.group.position)
      if (d < bd) { bd = d; best = e }
    }
    if (best) return { kind: 'minion', ref: best }
    if (s.team === 'red') {
      if (g.playerTargetable() && distXZ(s.pos, g.hero.group.position) < TOWER.range) return { kind: 'pchamp' }
    } else if (g.enemy.alive && distXZ(s.pos, g.enemy.group.position) < TOWER.range) {
      return { kind: 'echamp' }
    }
    return null
  }

  update(dt, g) {
    for (const s of this.list) {
      if (!s.alive) continue
      if (s.flashT > 0) {
        s.flashT -= dt
        if (s.kind === 'tower') {
          s.def.trimMesh.material.color.copy(s.trimBase).multiplyScalar(1 + 2.2 * Math.max(0, s.flashT))
        }
      }
      if (s.kind !== 'tower') continue
      s.def.shield.visible = !this.attackable(s)
      if (g.over) { s.def.aimSpr.material.opacity = 0; continue }

      s.cd -= dt
      const tgtValid = s.target && targetAlive(s.target, g)
        && distXZ(s.pos, targetPos(s.target, g, _a)) < TOWER.range + 0.8
      if (!tgtValid) {
        s.target = this._pickTowerTarget(s, g)
        s.aimT = s.target ? TOWER.aimTime : 0
      }
      if (!s.target) { s.def.aimSpr.material.opacity = Math.max(0, s.def.aimSpr.material.opacity - dt * 3); continue }

      s.aimT -= dt
      s.def.aimSpr.material.opacity = 0.35 + 0.4 * Math.abs(Math.sin(g.gameT * 14))
      if (s.aimT <= 0 && s.cd <= 0) {
        s.cd = TOWER.period
        targetPos(s.target, g, _a)
        const kind = s.target.kind
        const dmg = kind === 'minion' ? TOWER.dmgMinion : TOWER.dmgChamp
        g.vfx.beam(s.def.topPos, _a, { color: TEAMS[s.team].color, width: 0.2, life: 0.16, hdr: 2.4 })
        g.vfx.impact(_a, { color: TEAMS[s.team].color, size: 0.7 })
        g.audio.play('zap', { vol: 0.2 })
        applyHit(s.target, g, dmg, s.pos)
      }
    }
  }
}

// ============================== enemy champion ==============================

export class EnemyChampion {
  constructor(g) {
    this.g = g
    this.hero = createHero(
      { primary: '#8a1638', secondary: '#1c0b18', glow: '#ff5a26', head: 'orb', hair: 'horns', cape: true, trail: 'none' },
      { auraRing: true },
    )
    this.group = this.hero.group
    this.group.position.set(SPAWN_X, 0, 0)
    this.group.rotation.y = -Math.PI / 2
    g.scene.add(this.group)
    this.bar = new HealthBar(this.group, { w: 1.35, y: 2.45, color: '#ff5c5c', h: 0.13 })

    this.maxHp = ENEMY.hp
    this.hp = ENEMY.hp
    this.alive = true
    this.state = 'lane'
    this.respawnT = 0
    this.pokeT = 2
    this.atkT = 1
    this.allinCd = 6
    this.dashT = 0
    this.k = new THREE.Vector3()
    this.slowMul = 1
    this.bolts = []
    this.dashTrail = null
  }

  targetableBy() { return this.alive }

  damage(dmg, { byPlayer = true } = {}) {
    if (!this.alive || this.g.over) return false
    this.hp -= dmg
    this.bar.set(this.hp / this.maxHp)
    if (this.hp > 0) return false
    this.hp = 0
    this.alive = false
    this.state = 'dead'
    this.respawnT = ENEMY.respawn
    this.hero.setState('ko')
    this.hero.setMoveSpeed(0)
    this.bar.hide()
    this.dashTrail?.stop()
    this.dashTrail = null
    _a.copy(this.group.position)
    _a.y = 1
    this.g.vfx.impact(_a, { color: '#ff5a26', size: 1.6 })
    this.g.onEnemySlain(byPlayer)
    return true
  }

  _respawn() {
    this.alive = true
    this.state = 'lane'
    this.hp = this.maxHp
    this.bar.hide()
    this.hero.setState('normal')
    this.group.position.set(SPAWN_X, 0, 0)
    _a.set(SPAWN_X, 1, 0)
    this.g.vfx.flash(_a, { color: '#ff5a26', size: 3 })
    this.g.audio.play('spawn', { vol: 0.5 })
  }

  _castBolt(aimPos, dmg, tgt) {
    this.hero.cast()
    this.g.audio.play('cast', { vol: 0.25 })
    const from = this.hero.castPoint(_b)
    _a.copy(aimPos)
    _a.y = 1.2
    _a.sub(from)
    if (_a.lengthSq() < 0.01) _a.set(-1, 0, 0)
    const h = this.g.vfx.projectile({
      from, dir: _a.normalize(), speed: ENEMY.boltSpeed,
      color: '#ff8c3b', size: 0.5, life: 2.4, trail: true, light: 1.6,
    })
    this.bolts.push({ h, dmg, tgt })
  }

  _updateBolts(dt, g) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      if (!b.h.alive) { this.bolts.splice(i, 1); continue }
      if (Math.abs(b.h.pos.x) > 58 || Math.abs(b.h.pos.z) > 26) { b.h.kill(); this.bolts.splice(i, 1); continue }
      let hit = false
      if (b.tgt && b.tgt.kind === 'minion') {
        if (!b.tgt.ref.alive) { b.h.kill(); this.bolts.splice(i, 1); continue }
        targetPos(b.tgt, g, _a)
        _b.copy(_a).sub(b.h.pos)
        const d = _b.length()
        if (d < 0.7) {
          g.army.damage(b.tgt.ref, b.dmg, { byPlayer: false })
          hit = true
        } else {
          b.h.vel.copy(_b.multiplyScalar(ENEMY.boltSpeed / d))
        }
      } else if (g.decoy && distXZ(b.h.pos, g.decoy.pos) < 1 && b.h.pos.y < 2.4) {
        g.decoy.damage(b.dmg)
        hit = true
      } else if (g.playerTargetable() && distXZ(b.h.pos, g.hero.group.position) < 1 && b.h.pos.y < 2.4) {
        g.damagePlayer(b.dmg, b.h.pos)
        hit = true
      }
      if (hit) {
        g.vfx.impact(b.h.pos, { color: '#ff8c3b', size: 0.8 })
        b.h.kill()
        this.bolts.splice(i, 1)
      }
    }
  }

  update(dt, g) {
    this._updateBolts(dt, g)
    const hero = this.hero
    const p = this.group.position

    if (!this.alive) {
      this.respawnT -= dt
      if (this.respawnT <= 0 && !g.over) this._respawn()
      hero.update(dt)
      return
    }
    if (g.over) {
      hero.setMoveSpeed(0)
      hero.update(dt)
      return
    }

    // regen (boosted near own structures)
    const ownFront = g.structures.front('red')
    const nearHome = ownFront && distXZ(p, ownFront.pos) < 10
    this.hp = Math.min(this.maxHp, this.hp + (ENEMY.regen + (nearHome ? ENEMY.towerRegen : 0)) * dt)
    if (this.hp < this.maxHp) this.bar.set(this.hp / this.maxHp)

    const pp = g.hero.group.position
    const pTarget = g.playerTargetable()
    const dist = distXZ(p, pp)
    const sp = ENEMY.speed * this.slowMul
    this.slowMul = 1
    this.pokeT -= dt
    this.atkT -= dt
    this.allinCd -= dt

    // ---- state transitions ----
    if (this.state !== 'allin' && this.hp < this.maxHp * 0.3) this.state = 'retreat'
    if (this.state === 'retreat' && this.hp > this.maxHp * 0.6) this.state = 'lane'

    // wavefront: mid-most red minion
    let wf = null, wfx = Infinity
    for (const e of g.army.active) {
      if (e.alive && e.team === 'red' && e.minion.group.position.x < wfx) { wfx = e.minion.group.position.x; wf = e }
    }
    const playerDove = wf ? pp.x > wfx + 2.5 : pp.x > (ownFront ? ownFront.pos.x - 14 : 12)

    if (this.state === 'lane' && this.allinCd <= 0 && pTarget && dist < 15 && this.hp > this.maxHp * 0.35
      && (g.playerHpFrac() < 0.4 || playerDove)) {
      this.state = 'allin'
      this.dashT = 0.42
      this.hero.cast()
      g.audio.play('dash', { vol: 0.5 })
      this.dashTrail?.stop()
      this.dashTrail = g.vfx.trail(hero.hips, { color: '#ff5a26', size: 0.6, rate: 46, life: 0.35 })
    }

    // ---- movement / actions ----
    let mx = 0, mz = 0, speedMul = 1
    if (this.state === 'allin') {
      speedMul = 3.6
      mx = pp.x - p.x
      mz = pp.z - p.z
      this.dashT -= dt
      if (this.dashT <= 0 || dist < 2.2) {
        // nova slam finisher
        this.dashTrail?.stop()
        this.dashTrail = null
        g.vfx.shockwave(p, { color: '#ff5a26', radius: ENEMY.novaR })
        g.ctx.engine.shake(0.32, 0.35)
        g.audio.play('explode', { vol: 0.55 })
        if (pTarget && dist < ENEMY.novaR + 0.6) g.damagePlayer(ENEMY.novaDmg, p, { knock: 6 })
        this.state = 'lane'
        this.allinCd = 12
        this.pokeT = 0.8
      }
    } else if (this.state === 'retreat') {
      const hx = ownFront ? ownFront.pos.x + 3 : SPAWN_X
      const hz = ownFront ? ownFront.pos.z * 0.5 : 0
      mx = hx - p.x
      mz = hz - p.z
    } else {
      // lane: hug the wave, keep spacing from the player
      let ax, az
      if (wf) {
        ax = wfx + 3.4
        az = wf.minion.group.position.z * 0.6
      } else {
        ax = ownFront ? ownFront.pos.x + 2.5 : SPAWN_X
        az = ownFront ? ownFront.pos.z * 0.5 : 0
      }
      mx = ax - p.x
      mz = az - p.z
      if (pTarget && dist < 8.5) {
        // too close — back off away from the player
        mx = (p.x - pp.x) * 2
        mz = (p.z - pp.z) * 2
      }
      // never sit inside the blue tower's range
      const threat = g.structures.towerCovering(p, 'blue')
      if (threat) {
        mx += (p.x - threat.pos.x) * 3
        mz += (p.z - threat.pos.z) * 1.5
      }
      // poke
      if (this.pokeT <= 0) {
        if (g.decoy && distXZ(p, g.decoy.pos) < ENEMY.pokeRange) {
          this.pokeT = rand(2.2, 3.3)
          this._castBolt(g.decoy.pos, ENEMY.pokeDmg, null)
        } else if (pTarget && dist < ENEMY.pokeRange) {
          this.pokeT = rand(2.2, 3.3)
          // lead the shot so it is dodgeable but honest
          _a.copy(pp).addScaledVector(g.playerVel, (dist / ENEMY.boltSpeed) * 0.6)
          this._castBolt(_a, ENEMY.pokeDmg, null)
        } else if (this.atkT <= 0) {
          // shove the wave when the player is not available
          let bm = null, bd = 10
          for (const e of g.army.active) {
            if (!e.alive || e.team !== 'blue') continue
            const d = distXZ(p, e.minion.group.position)
            if (d < bd) { bd = d; bm = e }
          }
          if (bm) {
            this.atkT = 1.7
            this._castBolt(bm.minion.group.position, MINION.casterDmg, { kind: 'minion', ref: bm })
          }
        }
      }
    }

    const md = Math.hypot(mx, mz)
    if (md > 0.6) {
      p.x += (mx / md) * sp * speedMul * dt
      p.z += (mz / md) * sp * speedMul * dt
      hero.setMoveSpeed(sp * speedMul)
      _a.set(p.x + mx, 0, p.z + mz)
      hero.faceTowards(_a, dt, 10)
    } else {
      hero.setMoveSpeed(0)
    }
    if (pTarget && dist < 14 && this.state !== 'retreat' && md <= 0.6) hero.faceTowards(pp, dt, 8)

    // knockback + clamp
    p.addScaledVector(this.k, dt)
    this.k.multiplyScalar(Math.exp(-5 * dt))
    p.x = clamp(p.x, -50, 50)
    p.z = clamp(p.z, -21, 21)
    g.structures.pushOut(p, 0.4)

    hero.update(dt)
  }
}
