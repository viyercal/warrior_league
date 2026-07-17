import * as THREE from 'three'
import { canvasTexture } from '../../core/assets.js'
import { stoneMaterial, woodMaterial, ironMaterial, bronzeMaterial, clothMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { rand, pick } from '../../core/utils.js'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const TIERS = [
  { h: 1.9, off: 0, num: 'I' },
  { h: 1.1, off: 3.7, num: 'II' },
  { h: 0.65, off: -3.7, num: 'III' },
]
// ceremony camera cut, relative to the podium center (out / tangent / height):
// straight-on frame panned so all three tiers clear the sidelined tablet
const CAM_OUT = 12.5
const CAM_TN = 4.5
const LOOK_TN = 4.5
const CAM_Y = 3.3

function numeralTexture(num) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.font = '900 74px Palatino, "Book Antiqua", Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 3
    ctx.fillStyle = '#d8b478'
    ctx.fillText(num, w / 2, h / 2)
  })
}

/**
 * Post-race PODIUM CEREMONY (presentation only): a tiered stone podium beside
 * the start arch, the top-3 chariots hoisted onto the blocks, the winner's
 * banner-pole flag waving, brazier fire, and ember confetti when the player
 * placed. The camera cuts here behind the results tablet.
 */
export class PodiumCeremony {
  constructor({ scene, track, vfx, audio }) {
    Object.assign(this, { scene, track, vfx, audio })
    this.active = false
    this.camT = 0
    this._confT = 0
    this._tickers = []
    this.center = new THREE.Vector3()
    this.out = new THREE.Vector3()
    this.tn = new THREE.Vector3()
  }

  /** Cut to the ceremony. `top3` = kart entities in finish order. */
  begin({ top3, player, camera, look }) {
    if (this.active) return
    this.active = true
    const p0 = this.track.pos[0], l0 = this.track.left[0], tn0 = this.track.tan[0]
    this.out.copy(l0)
    this.tn.copy(tn0)
    this.center.copy(p0).addScaledVector(l0, this.track.halfW + 10.5)
    this._clearStage(camera)

    const g = this.group = new THREE.Group()
    const stone = stoneMaterial('#8a8175')
    const stoneDark = stoneMaterial('#6b645a')
    const face = Math.atan2(l0.x, l0.z) // blocks + chariots face outward

    TIERS.forEach((t, i) => {
      _v1.copy(this.center).addScaledVector(tn0, t.off)
      const block = new THREE.Mesh(new THREE.BoxGeometry(3.3, t.h, 3.1), i === 0 ? stone : stoneDark)
      block.position.set(_v1.x, t.h / 2, _v1.z)
      block.rotation.y = face
      block.castShadow = block.receiveShadow = true
      g.add(block)
      const cap = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 3.4), stoneDark)
      cap.position.set(_v1.x, t.h + 0.07, _v1.z)
      cap.rotation.y = face
      cap.receiveShadow = true
      g.add(cap)
      // carved placing numeral on the outward face
      const plaque = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({ map: numeralTexture(t.num), transparent: true, roughness: 0.95, metalness: 0 }),
      )
      plaque.position.set(_v1.x + l0.x * 1.62, t.h * 0.55, _v1.z + l0.z * 1.62)
      plaque.rotation.y = face
      g.add(plaque)

      // hoist the finisher onto the tier
      const k = top3[i]
      if (!k) return
      k.onPodium = true
      k.speed = 0
      k.spinT = 0
      k.slickT = 0
      k.boostT = 0
      k.kv.set(0, 0, 0)
      k.giantT = 0
      if (k.ghostT > 0) { k.ghostT = 0; k.visual.setGhost(false) }
      k.group.scale.setScalar(1)
      k.heading = face
      k.group.position.set(_v1.x, t.h + 0.14, _v1.z)
      if (i === 0 && k === player) k.podiumDance = true
    })

    // winner's banner pole behind the top block
    const winner = top3[0]
    _v1.copy(this.center).addScaledVector(l0, -1.9)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 6.2, 6), woodMaterial('#4c3826'))
    pole.position.set(_v1.x, 3.1, _v1.z)
    pole.castShadow = true
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 6), bronzeMaterial())
    finial.position.set(_v1.x, 6.4, _v1.z)
    g.add(pole, finial)
    const flagGeo = new THREE.PlaneGeometry(2.2, 1.5, 6, 3)
    const flag = new THREE.Mesh(flagGeo, clothMaterial(winner ? winner.color : '#8e2a2c'))
    flag.position.set(_v1.x + tn0.x * 1.14, 5.5, _v1.z + tn0.z * 1.14)
    flag.rotation.y = face + Math.PI / 2
    flag.castShadow = true
    g.add(flag)
    const base = flagGeo.attributes.position.array.slice()
    let ft = rand(10)
    this._tickers.push(dt => {
      ft += dt
      const attr = flagGeo.attributes.position
      for (let vi = 0; vi < attr.count; vi++) {
        const bx = base[vi * 3]
        attr.setZ(vi, Math.sin(ft * 4.2 + bx * 2.6) * 0.16 * (bx + 1.15))
      }
      attr.needsUpdate = true
    })

    // flanking braziers with real fire (shared auto-ticked track materials)
    const iron = ironMaterial('#3f4148')
    for (const side of [1, -1]) {
      _v1.copy(this.center).addScaledVector(tn0, 6.6 * side).addScaledVector(l0, 1.4)
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.5, 7), iron)
      stand.position.set(_v1.x, 0.75, _v1.z)
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.5, 8), iron)
      bowl.position.set(_v1.x, 1.65, _v1.z)
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.44, 1.35, 10), this.track.fireMats[side > 0 ? 1 : 2])
      flame.position.set(_v1.x, 2.4, _v1.z)
      const halo = new THREE.Sprite(glowSpriteMaterial('#ff8c3b', 0.2))
      halo.scale.setScalar(2.6)
      halo.position.set(_v1.x, 2.35, _v1.z)
      g.add(stand, bowl, flame, halo)
    }
    const light = new THREE.PointLight('#ff8a48', 11, 18, 2)
    light.position.copy(this.center).addScaledVector(l0, 3)
    light.position.y = 3.4
    g.add(light)
    this.scene.add(g)

    this.playerOnPodium = top3.includes(player)
    this.audio.play('crowd', { vol: 0.8 })

    // hard cut: classic 3/4 podium diagonal — the arch tucks behind the
    // sidelined tablet, the winner's raised tier holds frame center
    _v2.copy(this.center).addScaledVector(l0, CAM_OUT).addScaledVector(tn0, CAM_TN)
    _v2.y = CAM_Y
    camera.position.copy(_v2)
    look.copy(this.center).addScaledVector(tn0, LOOK_TN)
    look.y = 1.8
    camera.lookAt(look)
  }

  /** Hide badlands scatter squatting on the stage or blocking the camera line. */
  _clearStage() {
    const C = this.center
    for (const c of this.track.clutter) {
      if (Math.hypot(c.x - C.x, c.z - C.z) < 9 + c.r) c.mesh.visible = false
    }
    // camera sightline: center -> the diagonal cut position
    const ax = C.x, az = C.z
    const bx = C.x + this.out.x * (CAM_OUT + 1) + this.tn.x * (CAM_TN + 1)
    const bz = C.z + this.out.z * (CAM_OUT + 1) + this.tn.z * (CAM_TN + 1)
    const dx = bx - ax, dz = bz - az
    const len2 = dx * dx + dz * dz
    for (const m of this.track.mesas) {
      const t = Math.max(0, Math.min(1, ((m.x - ax) * dx + (m.z - az) * dz) / len2))
      const d = Math.hypot(m.x - (ax + dx * t), m.z - (az + dz * t))
      if (d < m.r + 3.5) m.mesh.visible = false
    }
  }

  update(dt) {
    if (!this.active) return
    for (const t of this._tickers) t(dt)
    if (this.playerOnPodium) {
      this._confT -= dt
      if (this._confT <= 0) {
        this._confT = 0.34
        _v1.copy(this.center)
        _v1.x += rand(-5, 5)
        _v1.z += rand(-2.5, 2.5)
        _v1.y = rand(4, 6.5)
        this.vfx.burst(_v1, {
          color: pick(['#ffb84d', '#ff8c3b', '#e8dcc4', '#c23b2e']),
          count: 16, speed: 2.6, size: 0.21, life: 1.6, gravity: 2.4, up: 1,
        })
      }
    }
  }

  /** Gentle drift around the ceremony; call every frame while active. */
  updateCamera(camera, look, dt) {
    this.camT += dt
    _v1.copy(this.center)
      .addScaledVector(this.out, CAM_OUT + Math.sin(this.camT * 0.16) * 0.4)
      .addScaledVector(this.tn, CAM_TN + Math.sin(this.camT * 0.24) * 0.9)
    _v1.y = CAM_Y + Math.sin(this.camT * 0.3) * 0.2
    camera.position.lerp(_v1, 1 - Math.exp(-2.5 * dt))
    _v2.copy(this.center).addScaledVector(this.tn, LOOK_TN)
    _v2.y = 1.8
    look.lerp(_v2, 1 - Math.exp(-4 * dt))
    camera.lookAt(look)
  }
}
