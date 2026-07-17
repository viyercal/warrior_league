import * as THREE from 'three'
import {
  pbrMaterial, ironMaterial, woodMaterial, clothMaterial,
  fireMaterial, emberGlowMaterial, glowSpriteMaterial, contactShadow,
} from '../../art/materials.js'
import { wornMetalTexture, dirtOverlay, cloudTexture } from '../../core/assets.js'
import { masonryTextureSet, scaleUV } from './masonry.js'
import { rand, TAU, clamp } from '../../core/utils.js'
import { CITADEL_POS } from './siegeEnv.js'

export const CITADEL_HP = 500

const _v = new THREE.Vector3()

/**
 * The bastion — a stone keep gate holding against the red horde: raised
 * masonry platform (block courses, mortar recesses, weather streaks),
 * battlemented wall arcs, rust-bitten iron portcullis in the north gate,
 * brazier-topped towers, and a great warning-beacon fire whose flame + smoke
 * column is the heart the raiders march on. Tracks HP, flickers when hit,
 * gutters + sparks below 25%, and the beacon dies on defeat.
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

    // ---------- materials: real masonry + rusty iron ----------
    const masonry = masonryTextureSet()
    const stone = pbrMaterial({
      color: '#a39c90', roughness: 1.0, metalness: 0,
      maps: masonry, normalScale: 1.15, envMapIntensity: 0.15,
    })
    const stoneDark = pbrMaterial({
      color: '#6e6a62', roughness: 1.0, metalness: 0,
      maps: masonry, normalScale: 1.15, envMapIntensity: 0.12,
    })
    // portcullis iron: own worn-metal copy with rust breakup composited in
    const rustSet = wornMetalTexture({ seed: 83 })
    dirtOverlay(rustSet.map, { amount: 0.6, edge: 0, speckle: 0.8, color: '#502a14', seed: 9 })
    const iron = pbrMaterial({
      color: '#5a5450', roughness: 0.72, metalness: 0.85,
      maps: rustSet, normalScale: 1.0, envMapIntensity: 0.7,
    })

    // cylinder UVs: ~1 tile per (4.5u around x 3.5u up); extrude walls per unit
    const cylUV = (geo, r, h) => scaleUV(geo, (TAU * r) / 4.5, h / 3.5)

    // ---------- raised platform ----------
    const baseGeo = cylUV(new THREE.CylinderGeometry(7.4, 8.4, 1.3, 24), 7.9, 1.3)
    const base = new THREE.Mesh(baseGeo, stone)
    base.position.y = 0.65
    base.castShadow = base.receiveShadow = true
    const tierGeo = cylUV(new THREE.CylinderGeometry(4.4, 5.2, 1.0, 20), 4.8, 1.0)
    const tier = new THREE.Mesh(tierGeo, stoneDark)
    tier.position.y = 1.75
    tier.castShadow = tier.receiveShadow = true
    g.add(base, tier)
    g.add(contactShadow(9.6, 0.42))
    // carved warding ring, lit by the beacon's embers
    const trim = new THREE.Mesh(new THREE.TorusGeometry(7.35, 0.06, 8, 48), emberGlowMaterial(0.9, '#ffb46a'))
    trim.rotation.x = Math.PI / 2
    trim.position.y = 1.33
    g.add(trim)
    this.trimMat = trim.material
    // engraved sigil rings on the platform top (dim carved grooves)
    for (const r of [5.9, 3.1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 48), emberGlowMaterial(0.5, '#e8a35c'))
      ring.rotation.x = Math.PI / 2
      ring.position.y = 1.325
      g.add(ring)
    }

    // steps toward the gate (north)
    const step = new THREE.Mesh(scaleUV(new THREE.BoxGeometry(4.6, 0.5, 2.6), 1.0, 0.35), stone)
    step.position.set(0, 0.25, -7.8)
    step.receiveShadow = true
    g.add(step)

    // ---------- great warning beacon (the heart of the bastion) ----------
    const plinth = new THREE.Mesh(cylUV(new THREE.CylinderGeometry(1.2, 1.7, 1.2, 8), 1.45, 1.2), stoneDark)
    plinth.position.y = 2.8
    plinth.castShadow = true
    g.add(plinth)
    // beacon tower shaft with iron bands
    const shaft = new THREE.Mesh(cylUV(new THREE.CylinderGeometry(0.72, 0.95, 2.6, 8), 0.84, 2.6), stone)
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
    const basinRim = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.07, 6, 20), iron)
    basinRim.rotation.x = Math.PI / 2
    basinRim.position.y = 6.45
    g.add(basinRim)
    // coal bed glowing in the basin mouth
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.1, 12), emberGlowMaterial(1.6, '#ff7a2c'))
    coals.position.y = 6.42
    g.add(coals)
    this.coalsMat = coals.material

    // the beacon flame: big real fire — layered blackbody cones, HDR core
    this.flameMat = fireMaterial({ intensity: 2.5, speed: 1.25 })
    this.brazierMat = fireMaterial({ intensity: 1.45, speed: 1.9 })
    const flameGeo = new THREE.ConeGeometry(1.0, 3.1, 12)
    flameGeo.translate(0, 1.55, 0)
    const coreGeo = new THREE.ConeGeometry(0.52, 2.0, 10)
    coreGeo.translate(0, 1.0, 0)
    const flame = this.flame = new THREE.Group()
    const outer = new THREE.Mesh(flameGeo, this.flameMat)
    const inner = new THREE.Mesh(coreGeo, this.flameMat)
    inner.position.y = 0.1
    inner.rotation.y = 2.1
    flame.add(outer, inner)
    flame.position.y = 6.35
    g.add(flame)
    this.halo = new THREE.Sprite(glowSpriteMaterial('#ffab5e', 0.14))
    this.halo.scale.setScalar(4.6)
    this.halo.position.y = 7.6
    g.add(this.halo)
    // whirling embers around the beacon head
    this.sparks = new THREE.Group()
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), emberGlowMaterial(1.9, '#ffb04a'))
      const a = (i / 5) * TAU
      s.position.set(Math.cos(a) * 1.7, rand(-0.3, 0.5), Math.sin(a) * 1.7)
      this.sparks.add(s)
    }
    this.sparks.position.y = 7.4
    g.add(this.sparks)
    // smoke column climbing off the fire
    this.smoke = new THREE.Group()
    this.smokePuffs = []
    const smokeTex = cloudTexture()
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, color: '#16120f', transparent: true, opacity: 0.3,
        depthWrite: false, rotation: rand(TAU),
      }))
      const k = i / 6
      this.smokePuffs.push({ s: p, k: k, drift: rand(-0.35, 0.35), vr: rand(-0.2, 0.2) })
      this.smoke.add(p)
    }
    g.add(this.smoke)
    this.light = new THREE.PointLight('#ff9a44', 26, 26, 2)
    this.light.position.set(0, 7.6, 0)
    g.add(this.light)

    // ---------- battlemented wall arcs facing north ----------
    // extruded ring sectors; gate gap faces north. Shape XY maps to world XZ
    // (z = -shape.y). A dim ember-rune strip runs the wall top (flares on hit).
    this.wallGlowMat = emberGlowMaterial(0.85, '#d89a5c')
    const R_IN = 8.55, R_OUT = 9.45, GATE = 0.17, SPAN = 1.12, H = 1.7
    const merlonGeo = scaleUV(new THREE.BoxGeometry(0.52, 0.5, 0.92), 0.22, 0.16)
    for (const side of [-1, 1]) {
      const t0 = Math.PI / 2 + side * GATE
      const t1 = Math.PI / 2 + side * (GATE + SPAN)
      const shape = new THREE.Shape()
      shape.absarc(0, 0, R_OUT, t0, t1, side < 0)
      shape.absarc(0, 0, R_IN, t1, t0, side > 0)
      const geo = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false, curveSegments: 20 })
      scaleUV(geo, 1 / 4.5, 1 / 3.5)
      const wall = new THREE.Mesh(geo, stone)
      wall.rotation.x = -Math.PI / 2
      wall.position.y = H
      wall.castShadow = wall.receiveShadow = true
      g.add(wall)
      // rune strip along the wall top
      const railStart = side < 0 ? t0 - SPAN : t0
      const rail = new THREE.Mesh(new THREE.TorusGeometry((R_IN + R_OUT) / 2, 0.04, 6, 30, SPAN), this.wallGlowMat)
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
      // gate + end towers with crenellated caps and warm braziers
      for (const [ti, t] of [t0, t1].entries()) {
        const wx = Math.cos(t) * (R_IN + R_OUT) / 2, wz = -Math.sin(t) * (R_IN + R_OUT) / 2
        const gateTower = ti === 0
        const th = gateTower ? H + 1.6 : H + 1.1
        const tr = gateTower ? 0.78 : 0.62
        const tower = new THREE.Mesh(
          cylUV(new THREE.CylinderGeometry(tr, tr + 0.17, th, 10), tr + 0.08, th), stoneDark)
        tower.position.set(wx, th / 2, wz)
        tower.castShadow = true
        g.add(tower)
        const cap = new THREE.Mesh(cylUV(new THREE.CylinderGeometry(tr + 0.14, tr + 0.14, 0.22, 10), tr + 0.14, 0.22), stone)
        cap.position.set(wx, th + 0.05, wz)
        g.add(cap)
        for (let m = 0; m < 5; m++) {
          const a = (m / 5) * TAU
          const crenel = new THREE.Mesh(scaleUV(new THREE.BoxGeometry(0.22, 0.26, 0.22), 0.1, 0.08), stone)
          crenel.position.set(wx + Math.cos(a) * tr, th + 0.28, wz + Math.sin(a) * tr)
          g.add(crenel)
        }
        // brazier: iron bowl + small real flame (own dimmer fire material)
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.26, 8), iron)
        bowl.position.set(wx, th + 0.42, wz)
        g.add(bowl)
        const bGeo = new THREE.ConeGeometry(0.16, 0.72, 7)
        bGeo.translate(0, 0.36, 0)
        const bFlame = new THREE.Mesh(bGeo, this.brazierMat)
        bFlame.position.set(wx, th + 0.5, wz)
        g.add(bFlame)
      }
    }

    // ---------- rust-bitten iron portcullis in the gate gap ----------
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
    const lintel = new THREE.Mesh(scaleUV(new THREE.BoxGeometry(3.4, 0.6, 1.0), 0.75, 0.4), stone)
    lintel.position.set(0, 2.95, 0)
    lintel.castShadow = true
    port.add(lintel)
    const lintelRune = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.12), this.wallGlowMat)
    lintelRune.position.set(0, 2.95, -0.52)
    port.add(lintelRune)
    g.add(port)

    // ---------- gate banners: poles with hanging war drapes ----------
    this.flags = []
    const poleMat = woodMaterial('#4a3c30')
    const flagMat = clothMaterial('#262b34')
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 6), poleMat)
      pole.position.set(s * 4.6, 2.2, -10.6)
      pole.castShadow = true
      g.add(pole)
      const cs = contactShadow(0.35, 0.34)
      cs.position.set(s * 4.6, 0.021, -10.6)
      g.add(cs)
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), emberGlowMaterial(1.0, '#ffb84d'))
      tip.position.set(s * 4.6, 4.55, -10.6)
      g.add(tip)
      const flagGeo = new THREE.PlaneGeometry(0.85, 1.6, 4, 6)
      flagGeo.translate(0, -0.8, 0)
      const flag = new THREE.Mesh(flagGeo, flagMat)
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

  _tickSmoke(dt, dying) {
    for (const p of this.smokePuffs) {
      p.k += dt * 0.11
      if (p.k >= 1) p.k -= 1
      const k = p.k
      p.s.position.set(p.drift * k * 9, 8.4 + k * 13.5, p.drift * k * 5)
      const sc = 1.6 + k * 6.5
      p.s.scale.set(sc, sc * 0.8, 1)
      p.s.material.rotation += p.vr * dt
      p.s.material.opacity = (dying ? 0.12 : 0.3) * Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k * 0.8)
    }
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
      this.flame.position.y = 6.35 - 1.4 * k * k
      this.halo.material.opacity = 0.3 * (1 - k)
      this.light.intensity = 40 * (1 - k)
      this.coalsMat.color.setStyle('#3a1c0c').multiplyScalar(1 - 0.6 * k)
      this.sparks.visible = false
      this._tickSmoke(dt, true) // the last smoke climbs off the dead pyre
      return
    }

    // beacon life: tall + steady when healthy, guttering when low
    this.flame.rotation.y += dt * 0.9
    const gutter = 1 + Math.sin(t * 6.2) * 0.05 + Math.sin(t * 11.7) * 0.03
    this.flame.scale.set(1, (0.55 + 0.45 * f) * gutter, 1)
    this.flame.position.y = 6.35 + Math.sin(t * 1.3) * 0.08
    this.sparks.rotation.y -= dt * 1.1
    this.sparks.position.y = 7.4 + Math.sin(t * 1.7) * 0.3
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.2)
    this._tickSmoke(dt, false)

    const low = f < 0.25
    let inten = 0.85 + 0.95 * f
    if (low) inten *= 0.72 + 0.28 * Math.abs(Math.sin(t * 9) * Math.sin(t * 2.3)) // dying stutter
    inten += this.hitFlash * 1.4
    this.flameMat.uniforms.uIntensity.value = inten
    this.halo.material.opacity = (0.07 + 0.1 * f) * (low ? 0.6 + 0.4 * Math.sin(t * 11) ** 2 : 1)
    this.light.intensity = 10 + 20 * f + this.hitFlash * 22
    this.coalsMat.color.setStyle('#ff7a2c').multiplyScalar(0.7 + 0.9 * f + this.hitFlash)
    this.trimMat.color.setStyle('#ffb46a').multiplyScalar(0.35 + 0.5 * f + this.hitFlash)
    this.wallGlowMat.color.setStyle(this.hitFlash > 0.4 ? '#ff6a3c' : '#d89a5c')
      .multiplyScalar(0.4 + 0.4 * f + this.hitFlash * 1.3)

    if (low) {
      this.sparkT -= dt
      if (this.sparkT <= 0) {
        this.sparkT = rand(0.5, 1.3)
        _v.copy(this.group.position)
        _v.y = 7.4
        const to = _v.clone().add(new THREE.Vector3(rand(-4, 4), rand(-5, -2), rand(-4, 4)))
        this.vfx.lightning(_v, to, { color: '#ffca7a', width: 0.05, life: 0.16 })
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
