import * as THREE from 'three'
import { disposeObject3D } from '../../core/utils.js'

/** Scene-owned, simulation-clock boss spells. Targets lock when warnings appear. */
export class BossArts {
  constructor({ scene, vfx, audio, source, target, canCast, onCast, hit, announce, kind, radius = 28, edge = 10 }) {
    Object.assign(this, { scene, vfx, audio, source, target, canCast, onCast, hit, announce, kind, radius, edge })
    this.pending = []
    this.cooldown = 2.5
    this.lockT = 0
    this.sequence = 0
    this.casts = 0
  }

  get casting() { return this.lockT > 0 }

  update(dt, active) {
    if (!active) { this.reset(); return }
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.lockT = Math.max(0, this.lockT - dt)
    const target = this.target()
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const a = this.pending[i]
      const previousT = a.t
      a.t += dt
      a.warning.material.opacity = 0.22 + 0.16 * (1 + Math.sin(a.t * 12)) / 2
      if (a.t < a.delay) continue
      if (!a.fired) {
        a.fired = true
        a.warning.visible = false
        this.audio.play('explode', { vol: 0.35 })
        if (a.type === 'wave') a.wave.visible = true
        else {
          this.vfx.ring(a.pos, { color: a.color, radius: a.radius || 2, life: 0.4 })
          if (a.type === 'line') this.vfx.beam(a.pos.clone().setY(0.6), a.end.clone().setY(0.6), { color: a.color, width: a.width, life: 0.3 })
          else this.vfx.beam(a.pos.clone().setY(8), a.pos, { color: a.color, width: 0.7, life: 0.3 })
          this.vfx.burst(a.pos, { color: a.color, count: 16, speed: 5, up: 4, life: 0.4 })
        }
      }
      let inside = false
      if (a.type === 'wave') {
        const oldX = a.pos.x + a.dir * Math.max(0, previousT - a.delay) * a.speed
        const x = a.pos.x + a.dir * (a.t - a.delay) * a.speed
        a.wave.position.set(x, 0.45, 0)
        // Swept collision avoids skipping a defender at low frame rates.
        inside = target.x >= Math.min(oldX, x) - 0.4 && target.x <= Math.max(oldX, x) + 0.4 && target.y < 1.05
      } else if (a.type === 'line') {
        const dx = target.x - a.pos.x, dz = target.z - a.pos.z
        const along = dx * a.dir.x + dz * a.dir.z
        inside = along >= 0 && along <= a.length && Math.abs(dx * a.dir.z - dz * a.dir.x) < a.width / 2
      } else inside = Math.hypot(target.x - a.pos.x, (target.z || 0) - a.pos.z) < a.radius
      if (inside && !a.hit) {
        a.hit = true
        this.hit(a.damage, a.pos, a.color)
        // A lethal hit may synchronously end the match and clear this list.
        if (this.pending[i] !== a) return
      }
      if (a.type !== 'wave' || a.t >= a.delay + a.length / a.speed) this._remove(i)
    }
    if (!this.pending.length && this.cooldown <= 0 && this.canCast()) this.cast()
  }

  cast() {
    const from = this.source().clone().setY(0), at = this.target()
    const target = new THREE.Vector3(at.x, 0, at.z || 0)
    const alternate = this.sequence++ % 2
    const color = this.kind === 'duel1' ? '#c4d0cb' : this.kind === 'duel2' ? '#d5ab65' : '#ff8c3b'
    let label
    if (this.kind.startsWith('duel')) {
      if (this.kind === 'duel0' || this.kind === 'duel2' || (this.kind === 'duel3' && alternate === 0)) {
        label = this.kind === 'duel2' ? 'FAULT WAVE · JUMP' : 'CINDER WAVE · JUMP'
        this._add({ type: 'wave', pos: from, dir: target.x >= from.x ? 1 : -1, length: this.edge * 2 + 2, speed: 8, delay: 0.9, damage: 12, color })
      } else {
        label = this.kind === 'duel1' ? 'FROST SPIRES · LEAVE THE MARKS' : 'SKYFALL HEX · LEAVE THE MARKS'
        const xs = [target.x]
        if (this.kind === 'duel3') {
          const offset = from.x > target.x ? -3.5 : 3.5
          xs.push(Math.abs(target.x + offset) > this.edge ? target.x - offset : target.x + offset)
        }
        xs.forEach((x, i) => this._add({ type: 'circle', pos: new THREE.Vector3(Math.max(-this.edge, Math.min(this.edge, x)), 0, 0), radius: 1.5, delay: 1.1 + i * 0.45, damage: 14, color }))
      }
    } else if (alternate === 0) {
      label = this.kind === 'pit' ? 'CINDER LANCE · SIDESTEP' : 'SIEGEBREAKER · LEAVE THE LANES'
      const dir = target.clone().sub(from).normalize()
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1)
      const offsets = this.kind === 'pit' ? [0] : [-4, 0, 4]
      offsets.forEach(offset => {
        const pos = from.clone().add(new THREE.Vector3(dir.z * offset, 0, -dir.x * offset))
        const length = Math.min(55, Math.max(22, from.distanceTo(target) + 5))
        this._add({ type: 'line', pos, dir: dir.clone(), end: pos.clone().addScaledVector(dir, length), length, width: 2.2, delay: 1.15, damage: 18, color })
      })
    } else {
      label = this.kind === 'pit' ? 'ASHFALL · LEAVE THE MARKS' : 'WARFIRE SALVO · LEAVE THE MARKS'
      for (let i = 0; i < 3; i++) {
        const pos = target.clone()
        if (i) { pos.x += (i === 1 ? -1 : 1) * 4.5; pos.z += 2 }
        if (pos.length() > this.radius - 3) pos.setLength(this.radius - 3)
        this._add({ type: 'circle', pos, radius: 2.4, delay: 1.1 + i * 0.35, damage: 14, color })
      }
    }
    this.casts++
    this.cooldown = this.kind.startsWith('duel') ? 7 : 6
    this.lockT = Math.max(...this.pending.map(a => a.delay)) + 0.35
    this.onCast()
    this.announce(label)
    this.audio.play('cast', { vol: 0.65 })
  }

  _add(spec) {
    const a = { ...spec, t: 0, fired: false, hit: false }
    const material = new THREE.MeshBasicMaterial({ color: a.color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    a.root = new THREE.Group()
    if (a.type === 'circle') {
      a.warning = new THREE.Mesh(new THREE.CircleGeometry(a.radius, 40).rotateX(-Math.PI / 2), material)
      const rim = new THREE.Mesh(new THREE.RingGeometry(a.radius - 0.1, a.radius, 40), material.clone())
      rim.material.opacity = 0.8; rim.rotation.x = -Math.PI / 2; rim.position.copy(a.pos).setY(0.085); a.root.add(rim)
      a.warning.position.copy(a.pos).setY(0.07)
    } else {
      const dir = a.type === 'wave' ? new THREE.Vector3(a.dir, 0, 0) : a.dir
      a.warning = new THREE.Mesh(new THREE.PlaneGeometry(a.type === 'wave' ? 2 : a.width, a.length).rotateX(-Math.PI / 2), material)
      a.warning.position.copy(a.pos).addScaledVector(dir, a.length / 2).setY(0.07)
      a.warning.rotation.y = Math.atan2(dir.x, dir.z)
      if (a.type === 'wave') {
        a.wave = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.17, 6, 24), new THREE.MeshBasicMaterial({ color: a.color }))
        a.wave.rotation.y = Math.PI / 2; a.wave.scale.set(1, 0.7, 1.8); a.wave.visible = false; a.root.add(a.wave)
      }
    }
    a.root.add(a.warning); this.scene.add(a.root); this.pending.push(a)
  }

  _remove(i) { const a = this.pending[i]; this.scene.remove(a.root); disposeObject3D(a.root); this.pending.splice(i, 1) }
  reset() { while (this.pending.length) this._remove(this.pending.length - 1); this.cooldown = 2.5; this.lockT = 0 }
  dispose() { this.reset() }
}
