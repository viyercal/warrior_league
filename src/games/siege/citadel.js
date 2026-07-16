import * as THREE from 'three'
import { toonMaterial, glowMaterial, energyMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { rand, TAU, clamp } from '../../core/utils.js'
import { CITADEL_POS } from './siegeEnv.js'

export const CITADEL_HP = 500

const _v = new THREE.Vector3()

/**
 * The bastion — a stone keep gate holding against the red horde: raised
 * flagstone platform, battlemented wall arcs, iron portcullis in the north
 * gate, wall braziers, and a great warning-beacon whose cold blue-white flame
 * is the heart the raiders march on. Tracks HP, flickers when hit, gutters +
 * sparks below 25%, and the beacon dies on defeat.
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

    const stone = toonMaterial({ color: '#4f4438', rim: '#d8b988', rimStrength: 0.32 })
    const stoneDark = toonMaterial({ color: '#332c24', rim: '#a08a64', rimStrength: 0.26 })
    const iron = toonMaterial({ color: '#3f434c', rim: '#b9c4d4', rimStrength: 0.3 })

    // ---------- raised platform ----------
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 8.4, 1.3, 24), stone)
    base.position.y = 0.65
    base.castShadow = base.receiveShadow = true
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.2, 1.0, 20), stoneDark)
    tier.position.y = 1.75
    tier.castShadow = tier.receiveShadow = true
    g.add(base, tier)
    // carved warding ring, lit cold blue-white
    const trim = new THREE.Mesh(new THREE.TorusGeometry(7.35, 0.08, 8, 48), glowMaterial('#cfe4ff', 1.0))
    trim.rotation.x = Math.PI / 2
    trim.position.y = 1.32
    g.add(trim)
    this.trimMat = trim.material
    // engraved sigil rings on the platform top
    for (const [r, tube, hdr] of [[5.9, 0.045, 0.7], [3.1, 0.035, 0.55]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 48), glowMaterial('#cfe4ff', hdr))
      ring.rotation.x = Math.PI / 2
      ring.position.y = 1.325
      g.add(ring)
    }

    // steps toward the gate (north)
    const step = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 2.6), stone)
    step.position.set(0, 0.25, -7.8)
    step.receiveShadow = true
    g.add(step)

    // ---------- great warning beacon (the heart of the bastion) ----------
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.7, 1.2, 8), stoneDark)
    plinth.position.y = 2.8
    plinth.castShadow = true
    g.add(plinth)
    // beacon tower shaft with iron bands
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.95, 2.6, 8), stone)
    shaft.position.y = 4.6
    shaft.castShadow = true
    g.add(shaft)
    for (const by of [3.7, 5.5]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.06, 6, 16), iron)
      band.rotation.x = Math.PI / 2
      band.position.y = by
      g.add(band)
    }
    // iron fire-basin
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 0.85, 0.7, 10), iron)
    basin.position.y = 6.1
    basin.castShadow = true
    g.add(basin)
    const basinRim = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.07, 6, 20), glowMaterial('#cfe4ff', 0.9))
    basinRim.rotation.x = Math.PI / 2
    basinRim.position.y = 6.45
    g.add(basinRim)
    // the flame: cold blue-white, animated, HDR — feeds bloom
    this.flameMat = energyMaterial({ color1: '#1d3a5c', color2: '#dceeff', speed: 1.6, intensity: 1.35 })
    const flame = this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.9, 10), this.flameMat)
    flame.position.y = 7.6
    g.add(flame)
    const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.8, 8), glowMaterial('#eef6ff', 1.25))
    flameCore.position.y = -0.3
    flame.add(flameCore)
    this.halo = new THREE.Sprite(glowSpriteMaterial('#bfe0ff', 0.3))
    this.halo.scale.setScalar(6.5)
    this.halo.position.y = 7.4
    g.add(this.halo)
    // swirling white-hot sparks around the beacon head
    this.sparks = new THREE.Group()
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), glowMaterial('#dceeff', 2))
      const a = (i / 5) * TAU
      s.position.set(Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9)
      this.sparks.add(s)
    }
    this.sparks.position.y = 7.2
    g.add(this.sparks)
    this.light = new THREE.PointLight('#bfe0ff', 30, 26, 2)
    this.light.position.set(0, 7.6, 0)
    g.add(this.light)

    // ---------- battlemented wall arcs facing north ----------
    // extruded ring sectors; gate gap faces north. Shape XY maps to world XZ
    // (z = -shape.y). A cold ember-rune strip runs the wall top (flashes on hit).
    this.wallGlowMat = glowMaterial('#cfe4ff', 1.0)
    const R_IN = 8.55, R_OUT = 9.45, GATE = 0.17, SPAN = 1.12, H = 1.7
    const merlonGeo = new THREE.BoxGeometry(0.52, 0.5, 0.92)
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
      // rune strip along the wall top
      const railStart = side < 0 ? t0 - SPAN : t0
      const rail = new THREE.Mesh(new THREE.TorusGeometry((R_IN + R_OUT) / 2, 0.045, 6, 30, SPAN), this.wallGlowMat)
      rail.rotation.set(-Math.PI / 2, 0, railStart)
      rail.position.y = H + 0.03
      g.add(rail)
      // battlement merlons marching along the parapet
      for (let i = 0; i < 7; i++) {
        const t = t0 + side * SPAN * ((i + 0.5) / 7)
        const mx = Math.cos(t) * (R_IN + R_OUT) / 2, mz = -Math.sin(t) * (R_IN + R_OUT) / 2
        const merlon = new THREE.Mesh(merlonGeo, stoneDark)
        merlon.position.set(mx, H + 0.25, mz)
        merlon.rotation.y = Math.atan2(mx, mz)
        merlon.castShadow = true
        g.add(merlon)
      }
      // gate + end towers with crenellated caps and cold braziers
      for (const [ti, t] of [t0, t1].entries()) {
        const wx = Math.cos(t) * (R_IN + R_OUT) / 2, wz = -Math.sin(t) * (R_IN + R_OUT) / 2
        const gateTower = ti === 0
        const th = gateTower ? H + 1.6 : H + 1.1
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(gateTower ? 0.78 : 0.62, gateTower ? 0.95 : 0.78, th, 10), stoneDark)
        tower.position.set(wx, th / 2, wz)
        tower.castShadow = true
        g.add(tower)
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(gateTower ? 0.92 : 0.74, gateTower ? 0.92 : 0.74, 0.22, 10), stone)
        cap.position.set(wx, th + 0.05, wz)
        g.add(cap)
        for (let m = 0; m < 5; m++) {
          const a = (m / 5) * TAU
          const crenel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), stone)
          crenel.position.set(wx + Math.cos(a) * (gateTower ? 0.78 : 0.62), th + 0.28, wz + Math.sin(a) * (gateTower ? 0.78 : 0.62))
          g.add(crenel)
        }
        // brazier: iron bowl + cold flame
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.26, 8), iron)
        bowl.position.set(wx, th + 0.42, wz)
        g.add(bowl)
        const bFlame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 7), this.wallGlowMat)
        bFlame.position.set(wx, th + 0.8, wz)
        g.add(bFlame)
        const bHalo = new THREE.Sprite(glowSpriteMaterial('#bfe0ff', 0.22))
        bHalo.scale.setScalar(1.2)
        bHalo.position.set(wx, th + 0.85, wz)
        g.add(bHalo)
      }
    }

    // ---------- iron portcullis in the gate gap ----------
    const gateR = (R_IN + R_OUT) / 2
    const port = new THREE.Group()
    port.position.set(0, 0, -gateR)
    const barGeo = new THREE.BoxGeometry(0.09, 2.7, 0.09)
    for (let i = -2; i <= 2; i++) {
      const bar = new THREE.Mesh(barGeo, iron)
      bar.position.set(i * 0.6, 1.35, 0)
      bar.castShadow = true
      port.add(bar)
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), iron)
      tip.position.set(i * 0.6, 0.08, 0)
      tip.rotation.x = Math.PI
      port.add(tip)
    }
    const crossGeo = new THREE.BoxGeometry(2.9, 0.09, 0.11)
    for (const cy of [0.7, 1.6, 2.5]) {
      const cross = new THREE.Mesh(crossGeo, iron)
      cross.position.set(0, cy, 0)
      port.add(cross)
    }
    // stone lintel over the gate
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 1.0), stone)
    lintel.position.set(0, 2.95, 0)
    lintel.castShadow = true
    port.add(lintel)
    const lintelRune = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.12), this.wallGlowMat)
    lintelRune.position.set(0, 2.95, -0.52)
    port.add(lintelRune)
    g.add(port)

    // ---------- gate banners: poles with hanging war drapes ----------
    this.flags = []
    const poleMat = toonMaterial({ color: '#2e211a', rim: '#a08a64', rimStrength: 0.2 })
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 6), poleMat)
      pole.position.set(s * 4.6, 2.2, -10.6)
      pole.castShadow = true
      g.add(pole)
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), glowMaterial('#9fc4e8', 0.9))
      tip.position.set(s * 4.6, 4.55, -10.6)
      g.add(tip)
      const flagGeo = new THREE.PlaneGeometry(0.85, 1.6, 4, 6)
      flagGeo.translate(0, -0.8, 0)
      const flag = new THREE.Mesh(flagGeo, toonMaterial({
        color: '#1d2738', rim: '#8aa0c8', rimStrength: 0.28, side: THREE.DoubleSide, emissive: '#0e1420', emissiveIntensity: 0.9,
      }))
      flag.position.set(s * 4.6, 4.25, -10.6)
      flag.castShadow = true
      g.add(flag)
      this.flags.push({ mesh: flag, base: flagGeo.attributes.position.array.slice(), phase: rand(TAU) })
    }
  }

  frac() { return clamp(this.hp / this.maxHp, 0, 1) }

  /** Raider strike on the walls. Returns true if the bastion just fell. */
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

  /** Defeat: the beacon dies. Scene layers bursts/shake on top. */
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
      this.flame.scale.set(1 - 0.9 * k, 1 - 0.85 * k, 1 - 0.9 * k)
      this.flame.rotation.y += dt * (2 + 26 * k)
      this.flame.position.y = 7.6 - 1.9 * k * k
      this.halo.material.opacity = 0.5 * (1 - k)
      this.light.intensity = 55 * (1 - k)
      this.sparks.visible = false
      return
    }

    // beacon life: tall + steady when healthy, guttering when low
    this.flame.rotation.y += dt * 0.9
    const gutter = 1 + Math.sin(t * 6.2) * 0.05 + Math.sin(t * 11.7) * 0.03
    this.flame.scale.set(1, (0.55 + 0.45 * f) * gutter, 1)
    this.flame.position.y = 7.6 + Math.sin(t * 1.3) * 0.12
    this.sparks.rotation.y -= dt * 1.1
    this.sparks.position.y = 7.2 + Math.sin(t * 1.7) * 0.3
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.2)

    const low = f < 0.25
    let inten = 0.55 + 0.8 * f
    if (low) inten *= 0.72 + 0.28 * Math.abs(Math.sin(t * 9) * Math.sin(t * 2.3)) // dying stutter
    inten += this.hitFlash * 0.9
    this.flameMat.uniforms.uIntensity.value = inten
    this.halo.material.opacity = (0.2 + 0.24 * f) * (low ? 0.6 + 0.4 * Math.sin(t * 11) ** 2 : 1)
    this.light.intensity = 10 + 20 * f + this.hitFlash * 26
    this.trimMat.color.setStyle('#cfe4ff').multiplyScalar(0.4 + 0.5 * f + this.hitFlash)
    this.wallGlowMat.color.setStyle(this.hitFlash > 0.4 ? '#ff8a5c' : '#a9c8e8')
      .multiplyScalar(0.5 + 0.38 * f + this.hitFlash * 1.4)

    if (low) {
      this.sparkT -= dt
      if (this.sparkT <= 0) {
        this.sparkT = rand(0.5, 1.3)
        _v.copy(this.group.position)
        _v.y = 7.4
        const to = _v.clone().add(new THREE.Vector3(rand(-4, 4), rand(-5, -2), rand(-4, 4)))
        this.vfx.lightning(_v, to, { color: '#bfe0ff', width: 0.05, life: 0.16 })
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
