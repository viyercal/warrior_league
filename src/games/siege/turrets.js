import * as THREE from 'three'
import {
  woodMaterial, ironMaterial, leatherMaterial, clothMaterial,
  fireMaterial, emberGlowMaterial, glowSpriteMaterial, contactShadow,
} from '../../art/materials.js'
import { rand, TAU, clamp } from '../../core/utils.js'
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
 * Six timber siege platforms + player-built ballista towers — grained wood,
 * iron banding, rope lashings, fire-lit payloads. Tiers stack the timber
 * higher and add bow-arms — same targeting/dps/HP per tier.
 * scene hooks: { onFire(fromPos, target, dmg, level), onDestroyed(pad) }
 */
export class TurretManager {
  constructor(scene, vfx, audio, hooks) {
    this.scene = scene
    this.vfx = vfx
    this.audio = audio
    this.hooks = hooks
    // shared PBR kit — protected from per-turret teardown
    this.woodMat = woodMaterial('#948374')
    this.woodDark = woodMaterial('#544a3f')
    this.ironMat = ironMaterial('#565a62')
    this.ropeMat = leatherMaterial('#6e5a3a')
    this.payloadFire = fireMaterial({ intensity: 1.55, speed: 1.9 })
    // tier pennants (presentation): bronze -> gold -> war crimson
    this.flagMats = ['#a1682e', '#e0aa46', '#a1252c'].map(c => clothMaterial(c))
    this._shared = new Set([this.woodMat, this.woodDark, this.ironMat, this.ropeMat, this.payloadFire, ...this.flagMats])
    this._flameGeo = new THREE.ConeGeometry(0.13, 0.42, 7)
    this._flameGeo.translate(0, 0.21, 0)
    this.pads = PAD_POSITIONS.map(([x, z]) => this._makePad(x, z))
  }

  _makePad(x, z) {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    // ember build-marker ring (pulses while the platform is empty)
    const ringMat = emberGlowMaterial(1.0, '#ffb84d')
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.05, 8, 36), ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.12
    // plank deck
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 0.16, 12), this.woodDark)
    deck.position.y = 0.08
    deck.receiveShadow = true
    group.add(deck)
    const plankGeo = new THREE.BoxGeometry(0.3, 0.05, 2.0)
    for (let i = -1; i <= 1; i++) {
      const plank = new THREE.Mesh(plankGeo, this.woodMat)
      plank.position.set(i * 0.34, 0.18, 0)
      plank.rotation.y = (i * 7 + 3) * 0.012 // planks never sit perfectly true
      plank.scale.z = 1 - Math.abs(i) * 0.24
      plank.receiveShadow = true
      group.add(plank)
    }
    const core = new THREE.Sprite(glowSpriteMaterial('#ffb84d', 0.16))
    core.scale.setScalar(1.0)
    core.position.y = 0.3
    group.add(ring, core, contactShadow(1.55, 0.36))
    // corner stumps lashed with rope
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.4, 6), this.woodMat)
      st.position.set(Math.cos(a) * 1.32, 0.2, Math.sin(a) * 1.32)
      st.rotation.y = rand(TAU)
      st.castShadow = true
      group.add(st)
      const rope = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.028, 5, 10), this.ropeMat)
      rope.rotation.x = Math.PI / 2
      rope.position.set(Math.cos(a) * 1.32, 0.3, Math.sin(a) * 1.32)
      group.add(rope)
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
    this.vfx.shockwave(_v1, { color: '#ffb84d', radius: 3.4 })
    this.vfx.burst(_v1.clone().setY(1), { color: '#ffd9a0', count: 20, speed: 6, size: 0.26 })
    this.vfx.text(_v1.clone().setY(3.1), 'BALLISTA RAISED', { color: '#ffd166', size: 0.62, life: 1.0, rise: 1.6 })
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
    this.vfx.text(_v1.clone().setY(3.6), `WAR STANDARD LV${t.level}`, { color: '#ffd166', size: 0.66, life: 1.0, rise: 1.6 })
  }

  /** Dispose per-turret geometries + fresh materials; never the shared kit. */
  _disposeGroup(g) {
    this.scene.remove(g)
    g.traverse(o => {
      if (o.geometry && o.geometry !== this._flameGeo) o.geometry.dispose()
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of mats) if (!this._shared.has(m)) m.dispose()
    })
  }

  _buildMeshes(t) {
    if (t.group) this._disposeGroup(t.group)
    const tier = TIER[t.level - 1]
    const g = t.group = new THREE.Group()
    g.position.set(t.pad.x, 0, t.pad.z)

    // stacked timber-framed tower — taller per tier, iron-banded, rope-lashed
    const heights = [[1.05, 1.25, 1.1], [0.95, 1.15, 1.0], [0.8, 1.0, 0.85]].slice(0, t.level + 1)
    let y = 0.1
    for (let i = 0; i < t.level + 1 && i < 3; i++) {
      const [rt, rb, h] = heights[i]
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(rt * (1 - i * 0.18), rb * (1 - i * 0.18), h * 0.62, 8), i % 2 ? this.woodDark : this.woodMat)
      seg.position.y = y + h * 0.31
      seg.rotation.y = i * 0.4 // stagger the facets so the stack reads hand-built
      seg.castShadow = seg.receiveShadow = true
      g.add(seg)
      // iron banding on each timber tier
      const band = new THREE.Mesh(new THREE.TorusGeometry(rt * (1 - i * 0.18) * 0.98, 0.045, 6, 12), this.ironMat)
      band.rotation.x = Math.PI / 2
      band.position.y = y + h * 0.55
      g.add(band)
      // rope lashing under the band
      const rope = new THREE.Mesh(new THREE.TorusGeometry(rt * (1 - i * 0.18) * 1.0, 0.03, 5, 12), this.ropeMat)
      rope.rotation.x = Math.PI / 2
      rope.position.y = y + h * 0.4
      g.add(rope)
      y += h * 0.62
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.045, 8, 20), this.ironMat)
    collar.rotation.x = Math.PI / 2
    collar.position.y = y
    g.add(collar)

    // war-standard banner pole (presentation): one pennant per tier, so the
    // tower's rank reads from across the field; rises with the construction
    const poleH = tier.headY + 1.3
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, poleH, 5), this.woodDark)
    flagPole.position.set(0.68, poleH / 2, -0.44)
    flagPole.castShadow = true
    g.add(flagPole)
    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), emberGlowMaterial(1.4, '#ffd166'))
    finial.position.set(0.68, poleH + 0.08, -0.44)
    g.add(finial)
    t.flags = []
    for (let i = 0; i < t.level; i++) {
      const penGeo = new THREE.PlaneGeometry(0.66, 0.21, 3, 1)
      penGeo.translate(0.35, 0, 0) // pivot on the pole so the sway reads as wind
      const pen = new THREE.Mesh(penGeo, this.flagMats[i])
      pen.position.set(0.68, poleH - 0.16 - i * 0.3, -0.44)
      t.flags.push(pen)
      g.add(pen)
    }

    // rotating ballista head (fires along +z)
    const head = t.head = new THREE.Group()
    head.position.y = tier.headY
    // stock beam with rope whipping
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 1.25), this.woodMat)
    stock.position.z = 0.28
    stock.castShadow = true
    head.add(stock)
    const whip = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 5, 10), this.ropeMat)
    whip.rotation.x = Math.PI / 2
    whip.position.set(0, 0.0, -0.2)
    whip.scale.y = 1.4
    head.add(whip)
    // iron payload-brazier under the stock — bolts are lit here
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.22, 8), this.ironMat)
    basket.position.set(0, -0.2, 0)
    basket.castShadow = true
    head.add(basket)
    const coal = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), emberGlowMaterial(1.5, '#ff8c3b'))
    coal.position.set(0, -0.08, 0)
    head.add(coal)
    const brazierFlame = new THREE.Mesh(this._flameGeo, this.payloadFire)
    brazierFlame.position.set(0, -0.08, 0)
    head.add(brazierFlame)
    // bow-arm pairs — one per tier
    const armGeo = new THREE.BoxGeometry(0.09, 0.09, 0.72)
    const stringGeo = new THREE.BoxGeometry(0.02, 0.02, 0.68)
    for (let i = 0; i < tier.crystals; i++) {
      const ay = 0.02 + i * 0.14
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(armGeo, this.woodDark)
        arm.position.set(0.3 * s, ay, 0.68)
        arm.rotation.y = 1.05 * s
        arm.castShadow = true
        head.add(arm)
        const tipEmber = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), emberGlowMaterial(1.5, '#ff8c3b'))
        tipEmber.position.set(0.58 * s, ay, 0.46)
        head.add(tipEmber)
        const str = new THREE.Mesh(stringGeo, this.ropeMat)
        str.position.set(0.31 * s, ay, 0.28)
        str.rotation.y = -0.42 * s
        head.add(str)
      }
    }
    // loaded bolt: iron shaft with a burning tip
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.8, 6), this.ironMat)
    bolt.rotation.x = Math.PI / 2
    bolt.position.set(0, 0.05, 0.62)
    head.add(bolt)
    const muzzle = t.muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 6), emberGlowMaterial(1.9, '#ffd166'))
    muzzle.rotation.x = Math.PI / 2
    muzzle.position.set(0, 0.05, 1.06)
    head.add(muzzle)
    const halo = new THREE.Sprite(glowSpriteMaterial('#ffb84d', 0.1))
    halo.scale.setScalar(0.9)
    head.add(halo)
    g.add(head)

    // floating hp pips
    const bar = t.hpBar = new THREE.Group()
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12), new THREE.MeshBasicMaterial({ color: '#171310', transparent: true, opacity: 0.75, depthWrite: false }))
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
    this._disposeGroup(t.group)
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
      pad.ringMat.color.setStyle(pad.discount ? '#ff8a5c' : '#ffb84d')
        .multiplyScalar(empty ? 0.38 + 0.2 * Math.sin(pad.t * 2.6) : 0.16)
      pad.core.material.opacity = empty ? 0.1 + 0.06 * Math.sin(pad.t * 2.6) : 0.02

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
      // pennants luff in the night wind (cheap: yaw sway around the pole)
      for (let i = 0; i < t.flags.length; i++) {
        t.flags[i].rotation.y = -0.35 + Math.sin(pad.t * 2.6 + i * 1.7) * 0.3
      }
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
          this.vfx.beam(_v1, _v2, { color: '#ffd9a0', width: 0.08 + 0.03 * t.level, life: 0.12 })
          this.vfx.flash(_v2, { color: '#ffd166', size: 0.7, life: 0.12 })
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
