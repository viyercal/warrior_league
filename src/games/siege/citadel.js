import * as THREE from 'three'
import { toonMaterial, glowMaterial, energyMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { rand, TAU, clamp } from '../../core/utils.js'
import { CITADEL_POS } from './siegeEnv.js'

export const CITADEL_HP = 500

const _v = new THREE.Vector3()

/**
 * The cyan heart of the red world: raised stone platform, curved wall arc
 * facing north, energy crystal spire, banners. Tracks HP, flickers when hit,
 * dims + sparks below 25%, shatters on defeat.
 */
export class Citadel {
  constructor(scene, vfx, audio) {
    this.scene = scene
    this.vfx = vfx
    this.audio = audio
    this.hp = CITADEL_HP
    this.maxHp = CITADEL_HP
    this.hitFlash = 0
    this.sparkT = 1
    this.dead = false
    this.deadT = 0
    this.t = rand(10)

    const g = this.group = new THREE.Group()
    g.position.set(CITADEL_POS.x, 0, CITADEL_POS.z)
    scene.add(g)

    const stone = toonMaterial({ color: '#4a4c60', rim: '#8fc4de', rimStrength: 0.4 })
    const stoneDark = toonMaterial({ color: '#31334a', rim: '#54e0ff', rimStrength: 0.3 })

    // ---------- raised platform ----------
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 8.4, 1.3, 24), stone)
    base.position.y = 0.65
    base.castShadow = base.receiveShadow = true
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.2, 1.0, 20), stoneDark)
    tier.position.y = 1.75
    tier.castShadow = tier.receiveShadow = true
    g.add(base, tier)
    const trim = new THREE.Mesh(new THREE.TorusGeometry(7.35, 0.08, 8, 48), glowMaterial('#54e0ff', 1.2))
    trim.rotation.x = Math.PI / 2
    trim.position.y = 1.32
    g.add(trim)
    this.trimMat = trim.material
    // engraved sigil rings on the platform top
    for (const [r, tube, hdr] of [[5.9, 0.045, 0.9], [3.1, 0.035, 0.7]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 48), glowMaterial('#54e0ff', hdr))
      ring.rotation.x = Math.PI / 2
      ring.position.y = 1.325
      g.add(ring)
    }

    // steps toward the gate (north)
    const step = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 2.6), stone)
    step.position.set(0, 0.25, -7.8)
    step.receiveShadow = true
    g.add(step)

    // ---------- crystal spire ----------
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.7, 1.2, 8), stoneDark)
    plinth.position.y = 2.8
    plinth.castShadow = true
    g.add(plinth)
    this.crystalMat = energyMaterial({ color1: '#0e6a84', color2: '#7df3ff', speed: 1.2, intensity: 1.35 })
    const crystal = this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), this.crystalMat)
    crystal.scale.set(1, 2.3, 1)
    crystal.position.y = 6.6
    crystal.castShadow = true
    g.add(crystal)
    this.halo = new THREE.Sprite(glowSpriteMaterial('#54e0ff', 0.38))
    this.halo.scale.setScalar(6.5)
    this.halo.position.y = 6.6
    g.add(this.halo)
    // orbiting shard ring
    this.shards = new THREE.Group()
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glowMaterial('#54e0ff', 2))
      const a = (i / 5) * TAU
      s.position.set(Math.cos(a) * 2.3, 0, Math.sin(a) * 2.3)
      this.shards.add(s)
    }
    this.shards.position.y = 6.4
    g.add(this.shards)
    this.light = new THREE.PointLight('#54e0ff', 40, 28, 2)
    this.light.position.set(0, 7, 0)
    g.add(this.light)

    // ---------- curved wall arc facing north ----------
    // smooth rampart arcs (extruded ring sectors) with a cyan rail on top;
    // gate gap faces north. Shape XY maps to world XZ (z = -shape.y).
    this.wallGlowMat = glowMaterial('#54e0ff', 1.15)
    const R_IN = 8.55, R_OUT = 9.45, GATE = 0.17, SPAN = 1.12, H = 1.7
    for (const side of [-1, 1]) {
      const t0 = Math.PI / 2 + side * GATE
      const t1 = Math.PI / 2 + side * (GATE + SPAN)
      const shape = new THREE.Shape()
      shape.absarc(0, 0, R_OUT, t0, t1, side < 0)
      shape.absarc(0, 0, R_IN, t1, t0, side > 0)
      const geo = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false, curveSegments: 20 })
      const wall = new THREE.Mesh(geo, stone)
      wall.rotation.x = -Math.PI / 2
      wall.position.y = H
      wall.castShadow = wall.receiveShadow = true
      g.add(wall)
      // glow rail along the wall top
      const railStart = side < 0 ? t0 - SPAN : t0
      const rail = new THREE.Mesh(new THREE.TorusGeometry((R_IN + R_OUT) / 2, 0.055, 6, 30, SPAN), this.wallGlowMat)
      rail.rotation.set(-Math.PI / 2, 0, railStart)
      rail.position.y = H + 0.04
      g.add(rail)
      // gate + end towers
      for (const t of [t0, t1]) {
        const wx = Math.cos(t) * (R_IN + R_OUT) / 2, wz = -Math.sin(t) * (R_IN + R_OUT) / 2
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, H + 1.1, 10), stoneDark)
        tower.position.set(wx, (H + 1.1) / 2, wz)
        tower.castShadow = true
        g.add(tower)
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.22, 10), stone)
        cap.position.set(wx, H + 1.15, wz)
        g.add(cap)
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), this.wallGlowMat)
        gem.position.set(wx, H + 1.5, wz)
        g.add(gem)
      }
    }

    // ---------- gate banners: poles with hanging drapes ----------
    this.flags = []
    const poleMat = toonMaterial({ color: '#2a2c3c', rimStrength: 0.2 })
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 6), poleMat)
      pole.position.set(s * 4.6, 2.2, -10.6)
      pole.castShadow = true
      g.add(pole)
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glowMaterial('#54e0ff', 1.5))
      tip.position.set(s * 4.6, 4.55, -10.6)
      g.add(tip)
      const flagGeo = new THREE.PlaneGeometry(0.85, 1.6, 4, 6)
      flagGeo.translate(0, -0.8, 0)
      const flag = new THREE.Mesh(flagGeo, toonMaterial({
        color: '#0a4a60', rim: '#7df9ff', rimStrength: 0.5, side: THREE.DoubleSide, emissive: '#0a4152', emissiveIntensity: 0.9,
      }))
      flag.position.set(s * 4.6, 4.25, -10.6)
      flag.castShadow = true
      g.add(flag)
      this.flags.push({ mesh: flag, base: flagGeo.attributes.position.array.slice(), phase: rand(TAU) })
    }
  }

  frac() { return clamp(this.hp / this.maxHp, 0, 1) }

  /** Raider strike on the walls. Returns true if the citadel just fell. */
  damage(d, fromPos = null) {
    if (this.dead) return false
    this.hp = Math.max(0, this.hp - d)
    this.hitFlash = 1
    if (fromPos) {
      _v.set(fromPos.x, 1.6, fromPos.z)
      _v.lerp(new THREE.Vector3(this.group.position.x, 1.6, this.group.position.z), 0.35)
      this.vfx.flash(_v, { color: '#ff6a3c', size: 1.6, life: 0.18 })
    }
    return this.hp <= 0
  }

  /** Defeat: the crystal dies. Scene layers bursts/shake on top. */
  shatter() {
    this.dead = true
    this.deadT = 0
  }

  update(dt) {
    this.t += dt
    const t = this.t
    const f = this.frac()

    if (this.dead) {
      this.deadT += dt
      const k = Math.min(1, this.deadT / 1.6)
      this.crystal.scale.set(1 - 0.9 * k, 2.3 * (1 - 0.85 * k), 1 - 0.9 * k)
      this.crystal.rotation.y += dt * (2 + 26 * k)
      this.crystal.position.y = 6.6 - 2.6 * k * k
      this.halo.material.opacity = 0.5 * (1 - k)
      this.light.intensity = 55 * (1 - k)
      this.shards.visible = false
      return
    }

    // crystal life: bright + steady when healthy, dim + stuttering when low
    this.crystal.rotation.y += dt * 0.7
    this.crystal.position.y = 6.6 + Math.sin(t * 1.3) * 0.22
    this.shards.rotation.y -= dt * 1.1
    this.shards.position.y = 6.4 + Math.sin(t * 1.7) * 0.3
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.2)

    const low = f < 0.25
    let inten = 0.55 + 0.8 * f
    if (low) inten *= 0.72 + 0.28 * Math.abs(Math.sin(t * 9) * Math.sin(t * 2.3)) // dying stutter
    inten += this.hitFlash * 0.9
    this.crystalMat.uniforms.uIntensity.value = inten
    this.halo.material.opacity = (0.2 + 0.24 * f) * (low ? 0.6 + 0.4 * Math.sin(t * 11) ** 2 : 1)
    this.light.intensity = 12 + 28 * f + this.hitFlash * 26
    this.trimMat.color.setStyle('#54e0ff').multiplyScalar(0.6 + 0.7 * f + this.hitFlash)
    this.wallGlowMat.color.setStyle(this.hitFlash > 0.4 ? '#ff8a5c' : '#54e0ff')
      .multiplyScalar(0.75 + 0.45 * f + this.hitFlash * 1.4)

    if (low) {
      this.sparkT -= dt
      if (this.sparkT <= 0) {
        this.sparkT = rand(0.5, 1.3)
        _v.copy(this.group.position)
        _v.y = 6.6
        const to = _v.clone().add(new THREE.Vector3(rand(-4, 4), rand(-5, -2), rand(-4, 4)))
        this.vfx.lightning(_v, to, { color: '#7df9ff', width: 0.05, life: 0.16 })
        if (Math.random() < 0.4) this.audio.play('zap', { vol: 0.14 })
      }
    }

    // banner drape flutter (free-hanging bottom sways most)
    for (const fl of this.flags) {
      const pos = fl.mesh.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) {
        const by = fl.base[i * 3 + 1]
        const hang = Math.min(1, -by / 1.6)
        pos.setZ(i, Math.sin(t * 3.4 + fl.phase + by * 3) * 0.18 * hang)
      }
      pos.needsUpdate = true
    }
  }
}
