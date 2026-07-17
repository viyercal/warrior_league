import * as THREE from 'three'
import { distXZ, clamp } from '../../core/utils.js'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()

/**
 * Track hazards: flaming ballista bolts (homing + straight), smoldering
 * ash-slicks, falling star-hammers. Same logic as ever — only the fire changed.
 * The scene resolves hits via the onHit callback (shield/ghost/giant rules).
 */
export class Items {
  constructor(scene, vfx, audio) {
    this.scene = scene
    this.vfx = vfx
    this.audio = audio
    this.shells = []
    this.slicks = []
    this.comets = []
    this._slickGeo = new THREE.CircleGeometry(1, 26)
  }

  /** Fire a flaming bolt. target may be null (flies straight along dir). */
  fireShell({ from, dir, owner, target, homing = false, color = '#ff5a26', speed = 34 }) {
    const h = this.vfx.projectile({ from, dir, speed, color, size: 0.58, life: 5, light: 1.6, trail: true })
    this.shells.push({ h, owner, target, homing, speed })
    this.audio.play('zap', { vol: 0.45 })
  }

  dropSlick(pos, { radius = 4, duration = 3.5, owner = null } = {}) {
    // smoldering ash slick: dark char pool with a dull ember tint (no neon disc)
    const mesh = new THREE.Mesh(this._slickGeo, new THREE.MeshBasicMaterial({
      color: '#c24d30', transparent: true, opacity: 0.5,
      blending: THREE.MultiplyBlending, depthWrite: false,
    }))
    mesh.rotation.x = -Math.PI / 2
    mesh.scale.setScalar(radius)
    mesh.position.set(pos.x, 0.045, pos.z)
    this.scene.add(mesh)
    this.vfx.ring(pos, { color: '#c23b2e', radius, life: 0.4 })
    this.slicks.push({ mesh, x: pos.x, z: pos.z, r: radius, t: duration, owner, hit: new Set() })
  }

  /** Delayed falling-star strike homing on `target` kart. */
  castComet(target, { radius = 4.5, delay = 0.9, color = '#ff8c3b' } = {}, onImpact) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 40),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(1.2), transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.scale.setScalar(radius)
    ring.position.set(target.group.position.x, 0.07, target.group.position.z)
    this.scene.add(ring)
    _v1.copy(target.group.position).add(_v2.set(10, 40, 6))
    const h = this.vfx.projectile({
      from: _v1.clone(), to: target.group.position.clone(), speed: 46,
      color, size: 1.4, life: delay + 1.2, light: 3, trail: true,
    })
    this.comets.push({ h, ring, target, t: delay, radius, color, onImpact })
  }

  /**
   * ctx: { karts, decoy, onShellHit(kart, shell), onSlick(kart, slick), t }
   */
  update(dt, ctx) {
    this._updateShells(dt, ctx)
    this._updateSlicks(dt, ctx)
    this._updateComets(dt, ctx)
  }

  _updateShells(dt, ctx) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i]
      if (!s.h.alive) { this.shells.splice(i, 1); continue }
      // decoy bait: shells hunting the player retarget the hologram
      let tgt = s.target
      if (ctx.decoy && tgt && tgt.isPlayer) tgt = ctx.decoy
      if (tgt) {
        _v1.copy(tgt.group ? tgt.group.position : tgt.pos)
        _v1.y = 0.55
        _v2.copy(_v1).sub(s.h.pos)
        const d = _v2.length()
        // homing shells get distance-scaled terminal guidance — without it the
        // fixed gain gives a ~10u turn radius and the shell orbits its target
        const gain = s.homing ? 3.4 + 26 / Math.max(1.5, d) : 1.6
        s.h.vel.lerp(_v2.normalize().multiplyScalar(s.speed), Math.min(1, dt * gain)).setLength(s.speed)
      }
      // decoy interception
      if (ctx.decoy && distXZ(s.h.pos, ctx.decoy.group.position) < 1.5) {
        this.vfx.impact(s.h.pos, { color: '#b9d6b2', size: 1.1 })
        this.audio.play('hit', { vol: 0.4 })
        s.h.kill()
        this.shells.splice(i, 1)
        continue
      }
      let dead = false
      for (const k of ctx.karts) {
        if (k === s.owner || k.finished || k.ghostT > 0) continue
        if (distXZ(s.h.pos, k.group.position) < (k.giantT > 0 ? 1.9 : 1.35)) {
          ctx.onShellHit(k, s)
          s.h.kill()
          dead = true
          break
        }
      }
      if (dead) this.shells.splice(i, 1)
    }
  }

  _updateSlicks(dt, ctx) {
    for (let i = this.slicks.length - 1; i >= 0; i--) {
      const sl = this.slicks[i]
      sl.t -= dt
      sl.mesh.material.opacity = clamp(sl.t * 1.4, 0, 0.5)
      if (sl.t <= 0) {
        this.scene.remove(sl.mesh)
        sl.mesh.material.dispose()
        this.slicks.splice(i, 1)
        continue
      }
      for (const k of ctx.karts) {
        if (k === sl.owner || sl.hit.has(k)) continue
        const dx = k.group.position.x - sl.x, dz = k.group.position.z - sl.z
        if (dx * dx + dz * dz < sl.r * sl.r) {
          sl.hit.add(k)
          ctx.onSlick(k, sl)
        }
      }
    }
  }

  _updateComets(dt, ctx) {
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i]
      c.t -= dt
      // target ring tracks the doomed rival
      const tp = c.target.group.position
      c.ring.position.x += (tp.x - c.ring.position.x) * Math.min(1, dt * 6)
      c.ring.position.z += (tp.z - c.ring.position.z) * Math.min(1, dt * 6)
      c.ring.material.opacity = 0.4 + 0.35 * Math.sin(ctx.t * 18)
      // steer the falling rock towards the ring
      _v1.set(c.ring.position.x, 0.3, c.ring.position.z).sub(c.h.pos)
      const dist = _v1.length()
      const fallSpeed = Math.max(20, dist / Math.max(c.t, 0.05))
      c.h.vel.copy(_v1.normalize().multiplyScalar(fallSpeed))
      if (c.t <= 0 || c.h.pos.y <= 0.5 || !c.h.alive) {
        c.h.kill()
        _v1.set(c.ring.position.x, 0, c.ring.position.z)
        c.onImpact(_v1, c)
        this.scene.remove(c.ring)
        c.ring.material.dispose()
        this.comets.splice(i, 1)
      }
    }
  }

  dispose() {
    for (const s of this.shells) s.h.kill()
    for (const sl of this.slicks) { this.scene.remove(sl.mesh); sl.mesh.material.dispose() }
    for (const c of this.comets) { c.h.kill(); this.scene.remove(c.ring); c.ring.material.dispose() }
    this.shells.length = this.slicks.length = this.comets.length = 0
  }
}
