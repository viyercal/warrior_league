import * as THREE from 'three'
import { toonMaterial, glowMaterial, glowSpriteMaterial, energyMaterial } from '../../art/materials.js'
import { rand, TAU, clamp, disposeObject3D } from '../../core/utils.js'
import { PAD_POSITIONS } from './siegeEnv.js'

export const BUILD_COST = 100
export const REBUILD_COST = 50
export const UPGRADE_COST = [150, 250] // lvl 2, lvl 3
export const TURRET_HP = 60
export const TURRET_RANGE = 11

const TIER = [
  { interval: 1.0, dmg: 8, headY: 2.15, crystals: 1 }, // 8 dps
  { interval: 0.72, dmg: 11.5, headY: 2.7, crystals: 2 }, // 16 dps
  { interval: 0.5, dmg: 15, headY: 3.3, crystals: 3 }, // 30 dps
]

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()

/**
 * Six build sockets + player-built energy turrets.
 * scene hooks: { onFire(fromPos, target, dmg, level), onDestroyed(pad) }
 */
export class TurretManager {
  constructor(scene, vfx, audio, hooks) {
    this.scene = scene
    this.vfx = vfx
    this.audio = audio
    this.hooks = hooks
    this.stoneMat = toonMaterial({ color: '#3a3c4e', rim: '#7db9d8', rimStrength: 0.4 })
    this.darkMat = toonMaterial({ color: '#262838', rim: '#54e0ff', rimStrength: 0.3 })
    this.pads = PAD_POSITIONS.map(([x, z]) => this._makePad(x, z))
  }

  _makePad(x, z) {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    const ringMat = glowMaterial('#54e0ff', 1.0)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.06, 8, 36), ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.09
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.15, 0.14, 24),
      toonMaterial({ color: '#20222f', rim: '#54e0ff', rimStrength: 0.35 }),
    )
    plate.position.y = 0.07
    plate.receiveShadow = true
    const core = new THREE.Sprite(glowSpriteMaterial('#54e0ff', 0.3))
    core.scale.setScalar(1.1)
    core.position.y = 0.3
    group.add(plate, ring, core)
    // corner anchor stones
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.3), this.darkMat)
      st.position.set(Math.cos(a) * 1.32, 0.18, Math.sin(a) * 1.32)
      st.rotation.y = -a
      st.castShadow = true
      group.add(st)
    }
    this.scene.add(group)
    return { x, z, group, ringMat, core, turret: null, discount: false, t: rand(10) }
  }

  /** Pad the player is standing on (empty or upgradable), or null. */
  nearestPad(pos, maxD = 2.1) {
    let best = null, bd = maxD
    for (const pad of this.pads) {
      const d = Math.hypot(pad.x - pos.x, pad.z - pos.z)
      if (d < bd) { bd = d; best = pad }
    }
    return best
  }

  buildCost(pad) { return pad.discount ? REBUILD_COST : BUILD_COST }

  build(pad) {
    const t = {
      pad, level: 1, hp: TURRET_HP, maxHp: TURRET_HP,
      fireT: rand(0.3, 0.7), buildT: 0.55, hitFlash: 0, dead: false,
      group: null, head: null, yaw: rand(TAU), target: null,
    }
    this._buildMeshes(t)
    pad.turret = t
    pad.discount = false
    this.audio.play('levelup', { vol: 0.7 })
    _v1.set(pad.x, 0, pad.z)
    this.vfx.ring(_v1, { color: '#54e0ff', radius: 3, life: 0.5 })
    this.vfx.burst(_v1.clone().setY(1), { color: '#7df9ff', count: 20, speed: 6, size: 0.26 })
    return t
  }

  upgrade(t) {
    t.level++
    t.hp = t.maxHp
    t.buildT = 0.45
    this._buildMeshes(t)
    this.audio.play('levelup', { vol: 0.8 })
    _v1.set(t.pad.x, 0, t.pad.z)
    this.vfx.ring(_v1, { color: '#ffd166', radius: 3.4, life: 0.5 })
    this.vfx.burst(_v1.clone().setY(1.6), { color: '#ffd166', count: 24, speed: 7, size: 0.28 })
  }

  _buildMeshes(t) {
    if (t.group) {
      this.scene.remove(t.group)
      disposeObject3D(t.group)
    }
    const tier = TIER[t.level - 1]
    const g = t.group = new THREE.Group()
    g.position.set(t.pad.x, 0, t.pad.z)

    // stacked stone base — taller per tier
    const heights = [[1.05, 1.25, 1.1], [0.95, 1.15, 1.0], [0.8, 1.0, 0.85]].slice(0, t.level + 1)
    let y = 0.1
    for (let i = 0; i < t.level + 1 && i < 3; i++) {
      const [rt, rb, h] = heights[i]
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(rt * (1 - i * 0.18), rb * (1 - i * 0.18), h * 0.62, 8), i % 2 ? this.darkMat : this.stoneMat)
      seg.position.y = y + h * 0.31
      seg.castShadow = seg.receiveShadow = true
      g.add(seg)
      y += h * 0.62
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 8, 20), glowMaterial('#54e0ff', 1.8))
    collar.rotation.x = Math.PI / 2
    collar.position.y = y
    g.add(collar)

    // rotating energy head
    const head = t.head = new THREE.Group()
    head.position.y = tier.headY
    const coreMat = energyMaterial({ color1: '#0a4a5c', color2: '#54e0ff', speed: 1.6, intensity: 1.3 })
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), coreMat)
    core.scale.y = 1.5
    core.castShadow = true
    head.add(core)
    for (let i = 0; i < tier.crystals; i++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), glowMaterial('#7df9ff', 2.2))
      const a = (i / tier.crystals) * TAU
      c.position.set(Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55)
      head.add(c)
    }
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.85, 8), this.darkMat)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0, 0.55)
    head.add(barrel)
    const muzzle = t.muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), glowMaterial('#7df9ff', 2.4))
    muzzle.position.set(0, 0, 1.0)
    head.add(muzzle)
    const halo = new THREE.Sprite(glowSpriteMaterial('#54e0ff', 0.24))
    halo.scale.setScalar(1.05)
    head.add(halo)
    g.add(head)

    // floating hp pips
    const bar = t.hpBar = new THREE.Group()
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12), new THREE.MeshBasicMaterial({ color: '#10131f', transparent: true, opacity: 0.75, depthWrite: false }))
    const fill = t.hpFill = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5cff8a').multiplyScalar(1.4), depthWrite: false }))
    fill.position.z = 0.001
    bar.add(bg, fill)
    bar.position.y = tier.headY + 0.85
    bar.visible = false
    g.add(bar)

    g.position.y = -2.4 // construction rise
    this.scene.add(g)
  }

  take(t, dmg, cam) {
    if (t.dead) return
    t.hp -= dmg
    t.hitFlash = 1
    _v1.set(t.pad.x, 1.6, t.pad.z)
    this.vfx.flash(_v1, { color: '#ff8a5c', size: 1, life: 0.14 })
    if (t.hp <= 0) this._destroy(t)
  }

  _destroy(t) {
    t.dead = true
    const pad = t.pad
    _v1.set(pad.x, 1.2, pad.z)
    this.vfx.impact(_v1, { color: '#ff5a1e', size: 1.6 })
    this.vfx.ring(_v1, { color: '#ff5a1e', radius: 3, life: 0.45 })
    this.audio.play('explode', { vol: 0.55 })
    this.scene.remove(t.group)
    disposeObject3D(t.group)
    pad.turret = null
    pad.discount = true // rebuild half-price
    this.hooks.onDestroyed?.(pad)
  }

  anyAlive() {
    return this.pads.some(p => p.turret && !p.turret.dead)
  }

  /** targets: array of { pos, take(dmg) } — scene supplies raiders + boss. */
  update(dt, targets, camPos) {
    for (const pad of this.pads) {
      pad.t += dt
      const empty = !pad.turret
      pad.ringMat.color.setStyle(pad.discount ? '#ff8a5c' : '#54e0ff')
        .multiplyScalar(empty ? 0.75 + 0.35 * Math.sin(pad.t * 2.6) : 0.25)
      pad.core.material.opacity = empty ? 0.2 + 0.1 * Math.sin(pad.t * 2.6) : 0.04

      const t = pad.turret
      if (!t) continue

      // construction rise
      if (t.buildT > 0) {
        t.buildT -= dt
        const k = 1 - Math.max(0, t.buildT) / 0.55
        t.group.position.y = -2.4 * (1 - k * k)
        if (t.buildT <= 0) t.group.position.y = 0
        continue
      }

      t.hitFlash = Math.max(0, t.hitFlash - dt * 3)
      // hp bar faces camera
      const frac = clamp(t.hp / t.maxHp, 0, 1)
      t.hpBar.visible = frac < 0.999
      if (t.hpBar.visible) {
        t.hpFill.scale.x = Math.max(0.02, frac)
        t.hpFill.position.x = -0.53 * (1 - frac)
        t.hpFill.material.color.setStyle(frac > 0.5 ? '#5cff8a' : frac > 0.25 ? '#ffd166' : '#ff5c6e').multiplyScalar(1.4)
        if (camPos) t.hpBar.lookAt(camPos)
      }

      // acquire nearest target in range
      let best = null, bd = TURRET_RANGE
      for (const tg of targets) {
        const d = Math.hypot(tg.pos.x - pad.x, tg.pos.z - pad.z)
        if (d < bd) { bd = d; best = tg }
      }
      const tier = TIER[t.level - 1]
      if (best) {
        const wantYaw = Math.atan2(best.pos.x - pad.x, best.pos.z - pad.z)
        let dy = ((wantYaw - t.yaw + Math.PI * 3) % TAU) - Math.PI
        t.yaw += dy * Math.min(1, dt * 9)
        t.head.rotation.y = t.yaw
        t.fireT -= dt
        if (t.fireT <= 0 && Math.abs(dy) < 0.5) {
          t.fireT = tier.interval
          t.muzzle.getWorldPosition(_v1)
          _v2.set(best.pos.x, best.pos.y + 0.55, best.pos.z)
          this.vfx.beam(_v1, _v2, { color: '#54e0ff', width: 0.08 + 0.03 * t.level, life: 0.12 })
          this.vfx.flash(_v2, { color: '#7df9ff', size: 0.7, life: 0.12 })
          this.audio.play('zap', { vol: 0.1 })
          this.hooks.onFire(best, tier.dmg)
        }
      } else {
        t.yaw += dt * 0.5 // idle scan
        t.head.rotation.y = t.yaw
        t.fireT = Math.min(t.fireT, 0.15)
      }
      t.head.position.y = tier.headY + Math.sin(pad.t * 2.2) * 0.06
    }
  }
}
