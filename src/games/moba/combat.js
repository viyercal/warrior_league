import * as THREE from 'three'
import { createHero } from '../../art/characterFactory.js'
import { rand, distXZ, clamp, disposeObject3D } from '../../core/utils.js'
import { BOUNDS } from './constants.js'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()

const clampMap = v => {
  v.x = clamp(v.x, -BOUNDS.x, BOUNDS.x)
  v.z = clamp(v.z, -BOUNDS.z, BOUNDS.z)
  return v
}

/**
 * Player skill casters — one per archetype, exactly per each skill's
 * inGame.moba promise. All operate on the scene instance `g`.
 */
export function makeCasters(g) {
  const audio = g.ctx.audio
  return {
    // Blink to cursor — flash at both ends.
    dash: def => {
      const pos = g.hero.group.position
      _v1.copy(g.aim).sub(pos)
      _v1.y = 0
      let d = _v1.length()
      if (d < 0.05) { _v1.set(Math.sin(g.hero.group.rotation.y), 0, Math.cos(g.hero.group.rotation.y)); d = 1 }
      _v1.normalize()
      const from = pos.clone().setY(1.1)
      _v2.copy(pos).addScaledVector(_v1, Math.min(def.params.range, d))
      clampMap(_v2)
      g.vfx.burst(from, { color: def.color, count: 16, speed: 6, size: 0.24 })
      g.vfx.beam(from, _v2.clone().setY(1.1), { color: def.color, width: 0.3, life: 0.2 })
      pos.x = _v2.x
      pos.z = _v2.z
      g.structures.pushOut(pos, 0.5)
      _v2.y = 1
      g.vfx.flash(_v2, { color: def.color, size: 2.2 })
      audio.play('dash')
      g.cancelOrders()
    },

    // Fast skillshot that bursts on the first enemy hit.
    projectile: def => {
      const from = g.hero.castPoint(_v1)
      _v2.copy(g.aim)
      _v2.y = from.y
      _v2.sub(from)
      if (_v2.lengthSq() < 0.01) _v2.set(1, 0, 0)
      const h = g.vfx.projectile({
        from, dir: _v2.normalize(), speed: def.params.speed,
        color: def.color, size: 0.85, life: 2.2, light: 2.2, trail: true,
      })
      g.skillBolts.push({ h, dmg: def.params.damage, radius: def.params.radius + 1.4, color: def.color })
      g.vfx.flash(from, { color: def.color, size: 1.5, life: 0.14 })
    },

    // Frost zone — 55% slow + tick damage.
    slowfield: def => {
      const c = clampMap(g.aim.clone())
      const r = def.params.radius
      const grp = new THREE.Group()
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(r, 40),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd8ff').multiplyScalar(0.8), transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      disc.rotation.x = -Math.PI / 2
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.24, r, 48),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfeaff').multiplyScalar(1.9), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      rim.rotation.x = -Math.PI / 2
      rim.position.y = 0.02
      grp.add(disc, rim)
      grp.position.set(c.x, 0.07, c.z)
      g.scene.add(grp)
      g.vfx.ring(c, { color: def.color, radius: r, life: 0.5 })
      g.frost.push({ x: c.x, z: c.z, r, slow: def.params.slow, dmg: def.params.damage, t: 0, dur: def.params.duration, hit: new Set(), group: grp, rim })
    },

    // Point-blank knockback blast.
    nova: def => {
      const pos = g.hero.group.position
      g.vfx.shockwave(pos, { color: def.color, radius: def.params.radius })
      g.ctx.engine.shake(0.42, 0.4)
      audio.play('explode', { vol: 0.7 })
      g.aoeEnemies(pos.x, pos.z, def.params.radius, def.params.damage, { color: def.color, knock: def.params.knock })
    },

    // Haste + spark trail.
    buff: def => {
      g.buffT = def.params.duration
      g.buffTrail?.stop()
      g.buffTrail = g.vfx.trail(g.hero.hips, { color: def.color, size: 0.7, rate: 42, life: 0.4 })
      _v1.copy(g.hero.group.position)
      _v1.y = 1
      g.vfx.flash(_v1, { color: def.color, size: 2.4 })
      audio.play('dash', { vol: 0.7 })
    },

    // Absorb bubble.
    shield: def => {
      g.shield = { hp: def.params.absorb, max: def.params.absorb, t: def.params.duration }
      g.bubble.visible = true
      audio.play('shield')
      g.vfx.ring(g.hero.group.position, { color: def.color, radius: 2, life: 0.4 })
    },

    // +45 HP + green swirl.
    heal: def => {
      g.healPlayer(def.params.amount)
      audio.play('heal')
      const pos = g.hero.group.position
      g.vfx.ring(pos, { color: def.color, radius: 2.4, life: 0.5 })
      _v1.copy(pos)
      _v1.y = 1.2
      g.vfx.burst(_v1, { color: def.color, count: 20, speed: 4.5, size: 0.28, gravity: 3, up: 3 })
    },

    // Translucent decoy clone — taunts minion / tower / champion aggro.
    summon: def => {
      if (g.decoy) removeDecoy(g, false)
      const c = clampMap(g.aim.clone())
      const hero = createHero(g.ctx.profile.appearance, { auraRing: true })
      hero.group.position.set(c.x, 0, c.z)
      hero.group.traverse(o => {
        if (o.material && !o.isSprite) {
          o.material = o.material.clone()
          o.material.transparent = true
          o.material.opacity = 0.42
        }
      })
      g.scene.add(hero.group)
      g.decoy = {
        hero,
        pos: hero.group.position,
        hp: def.params.hp,
        t: def.params.duration,
        damage: dmg => {
          if (!g.decoy) return
          g.decoy.hp -= dmg
          _v1.copy(g.decoy.pos)
          _v1.y = 1
          g.vfx.flash(_v1, { color: '#c58fff', size: 1, life: 0.12 })
        },
      }
      c.y = 1
      g.vfx.flash(c, { color: def.color, size: 2.6 })
      g.vfx.burst(c, { color: def.color, count: 18, speed: 5, size: 0.26 })
    },

    // Vortex at cursor — drags enemies to its center.
    pull: def => {
      const c = clampMap(g.aim.clone())
      const r = def.params.radius
      const grp = new THREE.Group()
      const mkRing = (ri, ro, op) => {
        const m = new THREE.Mesh(
          new THREE.RingGeometry(ri, ro, 40),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(1.7), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        )
        m.rotation.x = -Math.PI / 2
        return m
      }
      const r1 = mkRing(r * 0.5, r * 0.58, 0.75)
      const r2 = mkRing(r * 0.82, r * 0.88, 0.55)
      grp.add(r1, r2)
      grp.position.set(c.x, 0.09, c.z)
      g.scene.add(grp)
      g.vfx.flash(new THREE.Vector3(c.x, 0.8, c.z), { color: def.color, size: 2.6 })
      g.vortices.push({ x: c.x, z: c.z, r, pull: def.params.pull, dmg: def.params.damage, t: 0, dur: def.params.duration, hit: new Set(), group: grp, r1, r2 })
    },

    // Titan form — bigger, stronger, tougher.
    giant: def => {
      g.giantT = def.params.duration
      audio.play('levelup')
      const pos = g.hero.group.position
      g.vfx.ring(pos, { color: def.color, radius: 4, life: 0.5 })
      _v1.copy(pos)
      _v1.y = 1.4
      g.vfx.flash(_v1, { color: def.color, size: 3.2 })
    },

    // Untargetable phase — everything drops aggro.
    ghost: def => {
      g.ghostT = def.params.duration
      g.ghostMats = []
      g.hero.group.traverse(o => {
        // skip sprites: the floating health bars share materials across all units
        if (o.material && !o.isSprite && o !== g.bubble) {
          g.ghostMats.push([o.material, o.material.transparent, o.material.opacity])
          o.material.transparent = true
          o.material.opacity = Math.min(o.material.opacity ?? 1, 0.35)
        }
      })
      _v1.copy(g.hero.group.position)
      _v1.y = 1
      g.vfx.flash(_v1, { color: def.color, size: 2.4 })
      audio.play('dash', { vol: 0.5 })
    },

    // Delayed comet nuke at cursor.
    meteor: def => {
      const c = clampMap(g.aim.clone())
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.84, 1, 48),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(1.8), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.set(c.x, 0.08, c.z)
      ring.scale.setScalar(def.params.radius)
      g.scene.add(ring)
      _v1.set(c.x + 8, 34, c.z + 4)
      _v2.set(c.x, 0.4, c.z).sub(_v1)
      const dist = _v2.length()
      const h = g.vfx.projectile({ from: _v1, dir: _v2.normalize(), speed: dist / def.params.delay, color: def.color, size: 1.3, life: def.params.delay + 1, light: 3, trail: true })
      g.meteors.push({ x: c.x, z: c.z, h, t: 0, delay: def.params.delay, radius: def.params.radius, dmg: def.params.damage, ring, boomed: false, color: def.color })
    },
  }
}

export function removeDecoy(g, withVfx) {
  const d = g.decoy
  if (!d) return
  if (withVfx) {
    _v1.copy(d.pos)
    _v1.y = 1
    g.vfx.flash(_v1, { color: '#c58fff', size: 2.4 })
    g.vfx.burst(_v1, { color: '#c58fff', count: 22, speed: 6, size: 0.28 })
    g.ctx.audio.play('explode', { vol: 0.3 })
  }
  g.scene.remove(d.hero.group)
  disposeObject3D(d.hero.group)
  g.decoy = null
}

/** Per-frame upkeep for buffs, zones, decoy, and skillshot collisions. */
export function updateSkillEffects(g, dt) {
  // ---- buff timers ----
  if (g.buffT > 0) {
    g.buffT -= dt
    if (g.buffT <= 0) {
      g.buffTrail?.stop()
      g.buffTrail = null
    }
  }
  if (g.giantT > 0) g.giantT -= dt
  if (g.ghostT > 0) {
    g.ghostT -= dt
    if (g.ghostT <= 0 && g.ghostMats) {
      for (const [m, tr, op] of g.ghostMats) {
        m.transparent = tr
        m.opacity = op
      }
      g.ghostMats = null
      _v1.copy(g.hero.group.position)
      _v1.y = 1
      g.vfx.flash(_v1, { color: '#b8ecff', size: 1.8 })
    }
  }
  if (g.shield) {
    g.shield.t -= dt
    const k = g.shield.hp / g.shield.max
    g.bubble.material.opacity = 0.1 + 0.22 * k
    g.bubble.scale.setScalar(1 + 0.05 * Math.sin(g.hero.t * 6))
    if (g.shield.t <= 0) g.breakShield()
  }

  // ---- decoy ----
  if (g.decoy) {
    const d = g.decoy
    d.t -= dt
    if (d.t <= 0 || d.hp <= 0 || g.over) {
      removeDecoy(g, true)
    } else {
      // walk at the nearest red thing
      let tx = null, tz = 0, bd = Infinity
      for (const e of g.army.active) {
        if (!e.alive || e.team !== 'red') continue
        const dd = distXZ(d.pos, e.minion.group.position)
        if (dd < bd) { bd = dd; tx = e.minion.group.position.x; tz = e.minion.group.position.z }
      }
      if (g.enemy.alive) {
        const dd = distXZ(d.pos, g.enemy.group.position)
        if (dd < bd) { bd = dd; tx = g.enemy.group.position.x; tz = g.enemy.group.position.z }
      }
      if (tx === null) {
        const s = g.structures.nearestAttackable('red', d.pos, 80)
        if (s) { tx = s.pos.x; tz = s.pos.z; bd = distXZ(d.pos, s.pos) }
      }
      if (tx !== null && bd > 1.6) {
        const inv = 1 / (bd || 1)
        d.pos.x += (tx - d.pos.x) * inv * 4.5 * dt
        d.pos.z += (tz - d.pos.z) * inv * 4.5 * dt
        d.hero.setMoveSpeed(4.5)
        _v1.set(tx, 0, tz)
        d.hero.faceTowards(_v1, dt, 10)
      } else {
        d.hero.setMoveSpeed(0)
      }
      d.hero.update(dt)
    }
  }

  // ---- frost fields ----
  for (let i = g.frost.length - 1; i >= 0; i--) {
    const z = g.frost[i]
    z.t += dt
    z.rim.material.opacity = 0.6 + 0.3 * Math.sin(z.t * 5)
    if (z.t >= z.dur) {
      g.scene.remove(z.group)
      disposeObject3D(z.group)
      g.frost.splice(i, 1)
      continue
    }
    for (const e of g.army.active) {
      if (!e.alive || e.team !== 'red') continue
      const p = e.minion.group.position
      const dx = p.x - z.x, dz = p.z - z.z
      if (dx * dx + dz * dz > (z.r + 0.4) * (z.r + 0.4)) continue
      e.slowMul = Math.min(e.slowMul, 1 - z.slow)
      if (!z.hit.has(e)) {
        z.hit.add(e)
        g.hitMinion(e, z.dmg, { color: '#9fd8ff' })
      }
    }
    if (g.enemy.alive && distXZ(g.enemy.group.position, z) < z.r + 0.5) {
      g.enemy.slowMul = Math.min(g.enemy.slowMul, 1 - z.slow)
      if (!z.hit.has(g.enemy)) {
        z.hit.add(g.enemy)
        g.hitEnemyChamp(z.dmg, { color: '#9fd8ff' })
      }
    }
  }

  // ---- gravity vortices ----
  for (let i = g.vortices.length - 1; i >= 0; i--) {
    const v = g.vortices[i]
    v.t += dt
    v.r1.rotation.z += dt * 4.2
    v.r2.rotation.z -= dt * 2.6
    v.group.scale.setScalar(0.5 + 0.5 * (1 - v.t / v.dur))
    if (v.t >= v.dur) {
      g.vfx.burst(v.group.position, { color: '#7f7fff', count: 20, speed: 7, size: 0.28 })
      g.scene.remove(v.group)
      disposeObject3D(v.group)
      g.vortices.splice(i, 1)
      continue
    }
    const suck = (p, isChamp) => {
      const dx = v.x - p.x, dz = v.z - p.z
      const d2 = dx * dx + dz * dz
      if (d2 > v.r * v.r) return false
      const d = Math.sqrt(d2) || 1
      if (d > 0.5) {
        const pull = v.pull * dt * (isChamp ? 0.75 : 1)
        p.x += (dx / d) * pull
        p.z += (dz / d) * pull
      }
      return true
    }
    for (const e of g.army.active) {
      if (!e.alive || e.team !== 'red') continue
      if (suck(e.minion.group.position, false) && !v.hit.has(e)) {
        v.hit.add(e)
        g.hitMinion(e, v.dmg, { color: '#9f9fff' })
      }
    }
    if (g.enemy.alive && suck(g.enemy.group.position, true) && !v.hit.has(g.enemy)) {
      v.hit.add(g.enemy)
      g.hitEnemyChamp(v.dmg, { color: '#9f9fff' })
    }
  }

  // ---- meteors ----
  for (let i = g.meteors.length - 1; i >= 0; i--) {
    const m = g.meteors[i]
    m.t += dt
    m.ring.material.opacity = 0.35 + 0.35 * Math.sin(m.t * 16)
    m.ring.scale.setScalar(m.radius * (0.55 + 0.45 * Math.min(1, m.t / m.delay)))
    if (!m.boomed && (m.h.pos.y <= 0.55 || !m.h.alive || m.t >= m.delay + 0.4)) {
      m.boomed = true
      m.h.kill()
      _v1.set(m.x, 0, m.z)
      g.vfx.shockwave(_v1, { color: m.color, radius: m.radius + 1 })
      g.vfx.ring(_v1, { color: '#ffffff', radius: m.radius, life: 0.35 })
      g.ctx.engine.shake(0.65, 0.5)
      g.ctx.audio.play('explode', { vol: 0.85 })
      g.aoeEnemies(m.x, m.z, m.radius, m.dmg, { color: m.color, knock: 5 })
      g.scene.remove(m.ring)
      m.ring.geometry.dispose()
      m.ring.material.dispose()
      g.meteors.splice(i, 1)
    }
  }

  // ---- starfire skillshots: burst on first enemy hit ----
  for (let i = g.skillBolts.length - 1; i >= 0; i--) {
    const b = g.skillBolts[i]
    if (!b.h.alive) { g.skillBolts.splice(i, 1); continue }
    const bp = b.h.pos
    if (Math.abs(bp.x) > 56 || Math.abs(bp.z) > 25) { b.h.kill(); g.skillBolts.splice(i, 1); continue }
    let hit = false
    for (const e of g.army.active) {
      if (!e.alive || e.team !== 'red') continue
      const p = e.minion.group.position
      const dx = p.x - bp.x, dz = p.z - bp.z
      if (dx * dx + dz * dz < 0.85 && bp.y < 2.2) { hit = true; break }
    }
    if (!hit && g.enemy.alive && distXZ(bp, g.enemy.group.position) < 1.1 && bp.y < 2.6) hit = true
    if (hit) {
      g.vfx.shockwave(bp, { color: b.color, radius: b.radius })
      g.ctx.audio.play('explode', { vol: 0.5 })
      g.aoeEnemies(bp.x, bp.z, b.radius, b.dmg, { color: b.color, knock: 2.5 })
      b.h.kill()
      g.skillBolts.splice(i, 1)
    }
  }
}
