import * as THREE from 'three'
import { buildChampion, buildRetainer } from './championSculpt.js'
import { buildRosterChampion, hasRosterModel } from './rosterModels.js'
import { buildUnifiedCharacter, hasUnifiedCharacter } from './unifiedCharacters.js'
import {
  pbrMaterial, bronzeMaterial, ironMaterial, leatherMaterial, boneMaterial,
  clothMaterial, woodMaterial, emberGlowMaterial, contactShadow,
} from './materials.js'
import { clamp, damp, lerp, rand, TAU, angleLerp } from '../core/utils.js'

const darken = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString()
const blend = (hexA, hexB, t) => '#' + new THREE.Color(hexA).lerp(new THREE.Color(hexB), t).getHexString()

function mesh(parent, geo, mat, [x, y, z] = [0, 0, 0], { shadow = true, scale = null, rot = null } = {}) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  if (scale) m.scale.set(...scale)
  if (rot) m.rotation.set(...rot)
  m.castShadow = shadow
  parent.add(m)
  return m
}

/**
 * The playable roster and legacy NPC rig share named animation anchors.
 * A championId selects its authored body, costume and signature equipment.
 * Origin at the feet; gameplay collision and reach are controlled by games.
 *
 * API: group, update(dt), setMoveSpeed(unitsPerSec), setState('normal'|'dance'|'ko'),
 *      cast(), faceTowards(Vector3, dt, rate), castPoint(out), ring, dispose()
 * Appearance ids kept verbatim: head visor|orb|classic, hair spikes|swept|horns|none.
 */
export class Hero {
  constructor(appearance = {}, { auraRing = false, equipmentPose = 'held' } = {}) {
    const a = this.appearance = {
      primary: '#b0793a', secondary: '#3a2a20', glow: '#ff8c3b',
      head: 'visor', hair: 'spikes', cape: true, ...appearance,
    }
    // PBR realism kit — worn bronze plate (tinted by profile primary), scratched
    // iron, grained leather, ragged cloth. Rim light gone; env map does the work.
    // material.color === exact profile hex (identity probe + game tint contract).
    const M = this.mats = {
      bronze: bronzeMaterial(a.primary),
      bronzeDark: bronzeMaterial(darken(a.primary, 0.55)),
      iron: ironMaterial('#53565d'),
      ironDark: ironMaterial('#383b42'),
      leather: leatherMaterial(a.secondary),
      leatherDark: leatherMaterial(darken(a.secondary, 0.6)),
      cloth: clothMaterial(darken(blend(a.secondary, '#551a18', 0.55), 0.6)),
      bone: boneMaterial('#a99c82'),
      paint: pbrMaterial({ color: '#701a1e', roughness: 0.9, envMapIntensity: 0.3 }),
      hair: pbrMaterial({ color: '#2c211a', roughness: 0.7, envMapIntensity: 0.3 }),
      glow: emberGlowMaterial(1.35, a.glow), // ember accent, not LED
      skin: pbrMaterial({ color: '#936448', roughness: 0.84, envMapIntensity: 0.22 }),
    }
    // Back-compat aliases — games poke mats.primary / mats.secondary (e.g. hit flashes)
    M.primary = M.bronze
    M.secondary = M.leather
    for (const material of [M.bronze, M.bronzeDark, M.iron, M.ironDark]) {
      material.roughness = .72
      material.normalScale.setScalar(.35)
    }

    this.group = new THREE.Group()
    const hips = this.hips = new THREE.Group()
    hips.position.y = 0.92
    this.group.add(hips)

    if (hasUnifiedCharacter(a)) buildUnifiedCharacter(this, a, M)
    else if (hasRosterModel(a)) buildRosterChampion(this, a, M)
    else buildChampion(this, a, M)
    this.setEquipmentPose(equipmentPose)

    // --- battle-torn cloak (cloth sim + ragged hem) ---
    if (a.cape && !this.unifiedMesh) {
      const style = this.capeStyle || { width:.76,length:.95,anchor:.62,back:-.26,flare:.78,ragged:true,material:M.fabric || M.cloth }
      this.capeLength = style.length
      const geo = new THREE.PlaneGeometry(style.width, style.length, 12, 18)
      geo.translate(0, -style.length / 2, 0)
      // taper toward the hem + ragged bottom edge via vertex jitter
      const pos = geo.attributes.position
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        const hang = clamp(-y / style.length, 0, 1)
        pos.setX(i, pos.getX(i) * (1 + (style.flare - 1) * hang))
        pos.setZ(i, -.035 * Math.cos(pos.getX(i) * 28) * hang)
        if (style.ragged && hang > .93) pos.setY(i, y + .055 * (1 + Math.sin(i * 7.37)))
      }
      this.capeBase = pos.array.slice()
      this.cape = new THREE.Mesh(geo, style.material)
      this.cape.name = 'Tailored animated cloak'
      this.cape.position.set(0, style.anchor, style.back)
      this.cape.rotation.x = 0.22
      this.cape.castShadow = true
      hips.add(this.cape)
      // bronze brooches pinning the cloak
      for (const s of [-1, 1]) mesh(hips, new THREE.SphereGeometry(0.018, 12, 8), M.bronze, [s*(this.anatomy?Math.abs(this.anatomy.joints[3][0])*.82:.24), style.anchor, style.back+.01], { shadow: false })
    }

    // --- ground aura ring (games toggle .visible) ---
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.6, 40),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(a.glow).multiplyScalar(1.6), transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.04
    this.ring.visible = auraRing
    this.group.add(this.ring)

    // --- soft contact-shadow blob (grounding; scales with the group, e.g. giant form) ---
    this.shadowBlob = contactShadow(0.6, 0.48)
    this.group.add(this.shadowBlob)

    // anim state
    this.t = rand(10)
    this.phase = 0
    this.speed = 0
    this.moveBlend = 0
    this.castT = 0
    this.castBlend = 0
    this.state = 'normal'
    this.koT = 0
    this._lookTarget = { yaw: 0, pitch: 0 }
    this._lookTimer = 0
  }

  setMoveSpeed(v) { this.speed = v }
  cast() { this.castT = 0.42 }
  setState(s) { this.state = s; if (s === 'ko') this.koT = 0 }

  /** Sports and unarmed combat retain equipment on a back/hip attachment. */
  setEquipmentPose(pose) {
    this.equipmentPose = pose === 'stowed' ? 'stowed' : 'held'
    for (const item of this.equipment || []) {
      if (this.equipmentPose === 'stowed') {
        this.hips.add(item.group)
        item.group.position.set(...item.stowPosition)
        item.group.rotation.set(...item.stowRotation)
      } else {
        item.hand.add(item.group)
        item.group.position.copy(item.heldPosition)
        item.group.rotation.copy(item.heldRotation)
      }
    }
    // Orren's shield remains a visible part of his silhouette on his back.
    if (this.shield) {
      if (this.equipmentPose === 'stowed') {
        this.hips.add(this.shield)
        this.shield.position.set(-.05,.38,-.33)
        this.shield.rotation.set(0,Math.PI,0)
      } else {
        this.arms.L.elbow.add(this.shield)
        this.shield.position.set(-.03,-.11,.19)
        this.shield.rotation.set(0,0,0)
      }
    }
  }

  /** Smoothly yaw the whole hero to face a world point. */
  faceTowards(target, dt, rate = 14) {
    const dx = target.x - this.group.position.x
    const dz = target.z - this.group.position.z
    if (dx * dx + dz * dz < 0.001) return
    const desired = Math.atan2(dx, dz)
    this.group.rotation.y = angleLerp(this.group.rotation.y, desired, 1 - Math.exp(-rate * dt))
  }

  /** World position of the casting hand (spawn projectiles here). */
  castPoint(out = new THREE.Vector3()) {
    return this.arms.R.glove.getWorldPosition(out)
  }

  update(dt) {
    this.t += dt
    const t = this.t
    const sn = clamp(this.speed / 5, 0, 1.2)
    this.moveBlend = damp(this.moveBlend, sn > 0.06 ? Math.min(sn, 1) : 0, 10, dt)
    const w = this.moveBlend
    this.phase += dt * (4 + 7 * Math.min(sn, 1.2)) * (this.stance === 'colossus' ? .78 : 1) * (w > 0.02 ? 1 : 0)
    const ph = this.phase

    if (this.state === 'ko') {
      this.koT += dt
      const k = Math.min(1, this.koT / 0.5)
      const e = 1 - Math.pow(1 - k, 3)
      this.hips.rotation.x = -1.42 * e
      this.hips.position.y = (this.hipHeight ?? .92) - 0.5 * e
      return
    }

    // hips: bob + lean
    const danceBob = this.state === 'dance' ? Math.abs(Math.sin(t * 6)) * 0.14 : 0
    this.hips.position.y = (this.hipHeight ?? .92) + Math.sin(t * 2) * 0.008 * (1 - w) + Math.abs(Math.cos(ph)) * 0.035 * w + danceBob + (this.idleCrouch || 0)*(1-w)
    this.hips.rotation.x = (this.bodyLean || 0)*(1-w) + 0.17 * w
    this.hips.rotation.y = this.state === 'dance' ? Math.sin(t * 3) * 0.45 : 0

    // breathing (torso is a group: plates rise and fall together)
    const br = 1 + Math.sin(t * 2.1) * 0.015 * (1 - w)
    this.torso.scale.set(br * (this.torsoWidth ?? (this.modelKind === 'mystic' ? .88 : this.modelKind === 'juggernaut' ? 1.12 : 1)), 1, br)
    this.gem.rotation.y += dt * 1.5

    // legs
    for (const [key, s] of [['L', -1], ['R', 1]]) {
      const leg = this.legs[key]
      const p = ph + (s === 1 ? Math.PI : 0)
      leg.pivot.rotation.x = Math.sin(p) * 0.9 * w
      leg.knee.rotation.x = (0.08 + Math.max(0, -Math.sin(p)) * 1.15) * w
      if (this.stance) leg.pivot.rotation.z = s * (this.legSpread ?? .045) * (1-w)
      if (this.idleKnee) { leg.pivot.rotation.x -= this.idleKnee*.48*(1-w); leg.knee.rotation.x += this.idleKnee*(1-w) }
    }

    // arms
    this.castT = Math.max(0, this.castT - dt)
    this.castBlend = damp(this.castBlend, this.castT > 0.14 ? 1 : 0, 26, dt)
    for (const [key, s] of [['L', -1], ['R', 1]]) {
      const arm = this.arms[key]
      const p = ph + (s === 1 ? 0 : Math.PI)
      let rx = Math.sin(t * 1.8 + s) * 0.05 * (1 - w) - Math.sin(p) * 0.72 * w
      let rz = s * (-0.1 - Math.sin(t * 1.7) * 0.035 * (1 - w))
      let elbowX = -0.25 * (1 - w) - (0.35 + Math.max(0, Math.sin(p)) * 0.55) * w
      if (this.stance) {
        rz = s * .11
        // Polearms stay balanced in the right hand; the free hand counter-swings.
        if (key === 'R' && this.equipmentPose === 'held' && ['sentinel','oracle'].includes(this.stance)) {
          rx = -.10 - Math.sin(p) * .24 * w
          elbowX = -.25 - .14 * w
          rz = .12
        }
        if (this.stance === 'hunter') { elbowX -= .10; rz = s * .17 }
        if (this.stance === 'colossus') { rx *= .65; rz = s * .13; elbowX *= .6 }
        if (this.stance === 'oracle' && key === 'L') { rx -= .48*(1-w); elbowX -= .50*(1-w); rz=-.27 }
      }
      if (this.state === 'dance') {
        rx = -2.6 - Math.sin(t * 6 + (s === 1 ? 0 : Math.PI)) * 0.5
        rz = s * -0.5
        elbowX = -0.6
      }
      if (key === 'R' && this.castBlend > 0.01) {
        rx = lerp(rx, -2.25, this.castBlend)
        rz = lerp(rz, 0.15, this.castBlend)
        elbowX = lerp(elbowX, -0.15, this.castBlend)
      }
      arm.pivot.rotation.x = rx
      arm.pivot.rotation.z = rz + (this.armRestOffset?.[key] || 0)
      arm.elbow.rotation.x = elbowX
    }

    // idle head wander
    this._lookTimer -= dt
    if (this._lookTimer <= 0) {
      this._lookTimer = rand(1.8, 3.6)
      this._lookTarget = { yaw: rand(-0.45, 0.45), pitch: rand(-0.12, 0.15) }
    }
    const lk = 1 - w
    this.head.rotation.y = damp(this.head.rotation.y, this._lookTarget.yaw * lk, 4, dt)
    this.head.rotation.x = damp(this.head.rotation.x, this._lookTarget.pitch * lk, 4, dt)

    // cloak flutter (ragged hem swings hardest)
    if (this.cape) {
      const pos = this.cape.geometry.attributes.position
      const base = this.capeBase
      const amp = 0.05 + 0.16 * w
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1]
        const hang = clamp(-by / (this.capeLength || .95), 0, 1)
        pos.setZ(i, base[i * 3 + 2] - Math.sin(t * 5 + by * 5 + bx * 3) * amp * hang - w * hang * 0.34)
      }
      pos.needsUpdate = true
      this.cape.geometry.computeVertexNormals()
      this.cape.rotation.x = 0.22 + w * 0.5
    }

    for (const item of this.secondaryMotion || []) {
      item.group.rotation[item.axis] = item.base + Math.sin(t * 2.1 + item.phase) * item.amount * .3 + Math.sin(ph + item.phase) * item.amount * w
    }
    for (const [index, item] of (this.drapes || []).entries()) {
      item.bone.rotation.x = (item.front ? -.35 : .32) * w + Math.sin(t * 2.1 + item.phase) * .025 + Math.sin(ph + item.phase) * .055 * w
      item.bone.rotation.z = Math.sin(t * 1.4 + index) * .02 + Math.sin(ph + index) * .045 * w
    }
    if (this.staffOrb) {
      this.staffOrb.rotation.y += dt * .7
      this.staffOrb.position.y = Math.sin(t * 2) * .009
    }

    // aura ring pulse
    if (this.ring.visible) {
      this.ring.material.opacity = 0.4 + Math.sin(t * 3.5) * 0.14
      this.ring.rotation.z += dt * 0.8
    }
  }

  dispose() { /* geometry/material teardown handled by disposeObject3D on scene */ }
}

/**
 * Small minion / creep. ≈0.75 units tall, origin at feet.
 * evil = skeletal orc raider (bone tint, crude iron helm, red rune eyes);
 * friendly = squire shield-bearer (kettle helm, round shield).
 * API: group, update(dt), setMoving(bool), hitFlash(), dispose()
 */
export class Minion {
  constructor({ color = '#c9b795', evil = false, scale = 1 } = {}) {
    this.group = new THREE.Group()
    const bodyColor = evil ? blend(color, '#cfc0a0', 0.35) : color
    this.bodyMat = leatherMaterial(bodyColor)
    const g = this.group
    buildRetainer(this, {
      cloth: this.bodyMat,
      iron: ironMaterial(evil ? '#494b4a' : '#727471'),
      skin: pbrMaterial({ color: evil ? '#817964' : '#997254', roughness: .9 }),
      eye: evil ? emberGlowMaterial(1.0, '#be633f') : pbrMaterial({ color: '#26271f' }),
      wood: woodMaterial('#79694c'),
      shield: bronzeMaterial('#917246'),
    }, evil)
    // contact-shadow blob (scales with the group)
    this.shadowBlob = contactShadow(0.4, 0.4)
    g.add(this.shadowBlob)
    g.scale.setScalar(scale)
    this.t = rand(10)
    this.moving = false
    this._flash = 0
  }

  setMoving(m) { this.moving = m }
  hitFlash() { this._flash = 1 }

  update(dt) {
    this.t += dt
    const t = this.t
    const w = this.moving ? 1 : 0
    this.body.position.y = 0.4 + Math.abs(Math.sin(t * (this.moving ? 9 : 2))) * (0.03 + 0.05 * w)
    this.group.rotation.z = Math.sin(t * 9) * 0.07 * w
    this.feet[0].position.y = 0.08 + Math.max(0, Math.sin(t * 9)) * 0.09 * w
    this.feet[1].position.y = 0.08 + Math.max(0, -Math.sin(t * 9)) * 0.09 * w
    if (this._flash > 0) {
      this._flash = Math.max(0, this._flash - dt * 6)
      this.bodyMat.emissive.setScalar(this._flash * 0.9)
    }
  }

  dispose() { /* handled by scene deep-dispose */ }
}

export const createHero = (appearance, opts) => new Hero(appearance, opts)
export const createMinion = opts => new Minion(opts)
