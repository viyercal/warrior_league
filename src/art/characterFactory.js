import * as THREE from 'three'
import { toonMaterial, glowMaterial, glowSpriteMaterial } from './materials.js'
import { glowTexture } from '../core/assets.js'
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
 * The player hero — an armored warlord of the IMMORTAL WARLORDS LEAGUE.
 * Bronze/iron plate over dark leather, layered pauldrons, ragged war cloak,
 * a sheathed axe on the back, ember-rune accents. Stands ≈2 units tall,
 * origin at the feet.
 *
 * API: group, update(dt), setMoveSpeed(unitsPerSec), setState('normal'|'dance'|'ko'),
 *      cast(), faceTowards(Vector3, dt, rate), castPoint(out), ring, dispose()
 * Appearance ids kept verbatim: head visor|orb|classic, hair spikes|swept|horns|none.
 */
export class Hero {
  constructor(appearance = {}, { auraRing = false } = {}) {
    const a = this.appearance = {
      primary: '#b0793a', secondary: '#3a2a20', glow: '#ff8c3b',
      head: 'visor', hair: 'spikes', cape: true, ...appearance,
    }
    const M = this.mats = {
      bronze: toonMaterial({ color: a.primary, rim: '#ffdca8', rimStrength: 0.4 }),
      bronzeDark: toonMaterial({ color: darken(a.primary, 0.55), rim: '#e8c088', rimStrength: 0.28 }),
      iron: toonMaterial({ color: '#53565d', rim: '#d8c9a8', rimStrength: 0.26 }),
      ironDark: toonMaterial({ color: '#383b42', rim: '#a9a294', rimStrength: 0.2 }),
      leather: toonMaterial({ color: a.secondary, rim: '#c9a578', rimStrength: 0.32 }),
      leatherDark: toonMaterial({ color: darken(a.secondary, 0.6), rimStrength: 0.22 }),
      cloth: toonMaterial({ color: darken(blend(a.secondary, '#551a18', 0.55), 0.6), rim: '#8a5a30', rimStrength: 0.1, side: THREE.DoubleSide }),
      bone: toonMaterial({ color: '#e8dcc4', rim: '#fff2d8', rimStrength: 0.4 }),
      paint: toonMaterial({ color: '#701a1e', rimStrength: 0.1 }),
      hair: toonMaterial({ color: '#2c211a', rim: '#8a6a45', rimStrength: 0.35 }),
      glow: glowMaterial(a.glow, 2.2),
      skin: toonMaterial({ color: '#d9a679', rim: '#ffd9b0', rimStrength: 0.3 }),
    }
    // Back-compat aliases — games poke mats.primary / mats.secondary (e.g. hit flashes)
    M.primary = M.bronze
    M.secondary = M.leather

    this.group = new THREE.Group()
    const hips = this.hips = new THREE.Group()
    hips.position.y = 0.92
    this.group.add(hips)

    // shared small geometries
    const studGeo = new THREE.SphereGeometry(0.02, 6, 5)

    // --- pelvis: leather kilt + war belt ---
    mesh(hips, new THREE.BoxGeometry(0.42, 0.22, 0.28), M.leather, [0, 0.07, 0])
    mesh(hips, new THREE.BoxGeometry(0.47, 0.09, 0.33), M.leatherDark, [0, 0.17, 0])
    mesh(hips, new THREE.BoxGeometry(0.11, 0.08, 0.03), M.bronze, [0, 0.17, 0.17])
    // hanging tassets (front + sides)
    for (const [x, z, ry] of [[0.13, 0.16, 0], [-0.13, 0.16, 0], [0.22, 0.02, Math.PI / 2], [-0.22, 0.02, -Math.PI / 2]]) {
      const flap = mesh(hips, new THREE.BoxGeometry(0.13, 0.19, 0.028), M.leatherDark, [x, 0.03, z], { rot: [0.12, ry, 0] })
      mesh(flap, studGeo, M.iron, [0, -0.055, 0.02], { shadow: false })
    }

    // --- torso: bronze breastplate over leather, iron belly band (group so breathing scales all plates) ---
    const torso = this.torso = new THREE.Group()
    torso.position.set(0, 0.42, 0)
    hips.add(torso)
    mesh(torso, new THREE.SphereGeometry(0.3, 18, 14), M.leather, [0, 0, 0], { scale: [1.04, 1.28, 0.86] })
    // dominant upper breastplate + darker abdominal band
    mesh(torso, new THREE.SphereGeometry(0.3, 18, 12), M.bronze, [0, 0.1, 0.015], { scale: [1.1, 0.82, 0.9] })
    mesh(torso, new THREE.SphereGeometry(0.3, 18, 10), M.ironDark, [0, -0.15, 0], { scale: [1.0, 0.44, 0.82] })
    // central forged ridge
    mesh(torso, new THREE.BoxGeometry(0.04, 0.32, 0.045), M.bronzeDark, [0, 0.12, 0.265], { rot: [-0.1, 0, 0], shadow: false })
    // collar ring
    mesh(torso, new THREE.TorusGeometry(0.155, 0.035, 8, 20), M.ironDark, [0, 0.34, 0], { rot: [Math.PI / 2, 0, 0] })
    // baldric strap: right shoulder -> left hip (buckle rides the strap)
    const strap = mesh(torso, new THREE.BoxGeometry(0.085, 0.74, 0.028), M.leatherDark, [0.02, 0.02, 0.26], { rot: [0, 0, 0.62] })
    mesh(strap, new THREE.BoxGeometry(0.1, 0.07, 0.02), M.bronzeDark, [0, 0.16, 0.012], { shadow: false })

    // --- rune amulet at the chest (ember, subtle) ---
    mesh(hips, new THREE.CylinderGeometry(0.065, 0.065, 0.02, 8), M.bronzeDark, [0, 0.56, 0.265], { rot: [Math.PI / 2 - 0.12, 0, 0], shadow: false })
    this.gem = mesh(hips, new THREE.OctahedronGeometry(0.045, 0), M.glow, [0, 0.56, 0.285], { scale: [1, 1.3, 1], shadow: false })

    // --- shoulders + arms ---
    this.arms = {}
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group()
      pivot.position.set(0.44 * side, 0.58, 0)
      hips.add(pivot)
      // forged cone pauldron: two overlapped plates + short spike, tilted outward
      mesh(pivot, new THREE.ConeGeometry(0.165, 0.17, 12), M.bronze, [0.015 * side, 0.075, 0], { rot: [0, 0, -0.28 * side] })
      mesh(pivot, new THREE.ConeGeometry(0.145, 0.12, 12), M.bronzeDark, [0.045 * side, -0.02, 0], { rot: [0, 0, -0.34 * side] })
      mesh(pivot, new THREE.SphereGeometry(0.1, 12, 8), M.leatherDark, [0.06 * side, -0.09, 0], { scale: [1.1, 0.6, 1.1] })
      mesh(pivot, new THREE.ConeGeometry(0.03, 0.1, 7), M.iron, [0.03 * side, 0.19, 0], { rot: [0, 0, -0.3 * side] })
      // strap under the pauldron stack
      mesh(pivot, new THREE.TorusGeometry(0.11, 0.018, 6, 14), M.leatherDark, [0, 0.0, 0], { rot: [0, 0, Math.PI / 2], shadow: false })
      // upper arm: wrapped leather
      mesh(pivot, new THREE.CapsuleGeometry(0.08, 0.22, 4, 10), M.leather, [0, -0.16, 0])
      mesh(pivot, new THREE.TorusGeometry(0.085, 0.016, 6, 12), M.leatherDark, [0, -0.2, 0], { rot: [Math.PI / 2, 0, 0], shadow: false })
      const elbow = new THREE.Group()
      elbow.position.set(0, -0.32, 0)
      pivot.add(elbow)
      // forearm: leather + dark bronze bracer
      mesh(elbow, new THREE.CapsuleGeometry(0.075, 0.18, 4, 10), M.leather, [0, -0.1, 0])
      mesh(elbow, new THREE.CylinderGeometry(0.093, 0.082, 0.15, 12), M.bronzeDark, [0, -0.1, 0])
      // studded leather gauntlet (castPoint anchor — keep as .glove)
      const glove = mesh(elbow, new THREE.SphereGeometry(0.105, 12, 10), M.leatherDark, [0, -0.26, 0])
      mesh(glove, new THREE.BoxGeometry(0.1, 0.05, 0.08), M.ironDark, [0, 0.03, 0.05], { shadow: false })
      for (const gs of [-1, 0, 1]) mesh(glove, studGeo, M.iron, [0.035 * gs, 0.07, 0.05], { shadow: false })
      this.arms[side === -1 ? 'L' : 'R'] = { pivot, elbow, glove }
    }

    // --- legs ---
    this.legs = {}
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group()
      pivot.position.set(0.14 * side, 0, 0)
      hips.add(pivot)
      // thigh: leather wrap + strap
      mesh(pivot, new THREE.CapsuleGeometry(0.105, 0.24, 4, 10), M.leather, [0, -0.16, 0])
      mesh(pivot, new THREE.TorusGeometry(0.108, 0.017, 6, 12), M.leatherDark, [0, -0.14, 0], { rot: [Math.PI / 2, 0, 0], shadow: false })
      const knee = new THREE.Group()
      knee.position.set(0, -0.34, 0)
      pivot.add(knee)
      // shin + bronze greave front plate + knee cop
      mesh(knee, new THREE.CapsuleGeometry(0.08, 0.22, 4, 10), M.leatherDark, [0, -0.13, 0])
      mesh(knee, new THREE.CylinderGeometry(0.075, 0.088, 0.24, 10, 1, false, -0.9, 1.8), M.bronzeDark, [0, -0.13, 0.022])
      mesh(knee, new THREE.SphereGeometry(0.062, 10, 8), M.bronzeDark, [0, -0.005, 0.055])
      // boot + iron toe cap
      mesh(knee, new THREE.SphereGeometry(0.13, 12, 10), M.leatherDark, [0, -0.29, 0.05], { scale: [1, 0.68, 1.5] })
      mesh(knee, new THREE.SphereGeometry(0.075, 10, 8), M.ironDark, [0, -0.31, 0.17], { scale: [0.95, 0.55, 0.95] })
      this.legs[side === -1 ? 'L' : 'R'] = { pivot, knee }
    }

    // --- head ---
    const head = this.head = new THREE.Group()
    head.position.set(0, 0.93, 0)
    hips.add(head)
    mesh(head, new THREE.CylinderGeometry(0.07, 0.09, 0.14, 10), M.leather, [0, -0.16, 0])
    if (a.head === 'visor') {
      // crested war helm with a glowing visor slit
      mesh(head, new THREE.SphereGeometry(0.21, 20, 16), M.iron, [0, 0, 0])
      mesh(head, new THREE.TorusGeometry(0.205, 0.022, 8, 24), M.bronzeDark, [0, 0.02, 0], { rot: [Math.PI / 2, 0, 0], shadow: false })
      mesh(head, new THREE.BoxGeometry(0.26, 0.035, 0.06), M.glow, [0, -0.01, 0.185], { shadow: false })
      for (const s of [-1, 1]) mesh(head, new THREE.BoxGeometry(0.055, 0.13, 0.11), M.iron, [0.155 * s, -0.1, 0.08], { rot: [0.1, 0, 0] })
      mesh(head, new THREE.BoxGeometry(0.028, 0.05, 0.3), M.bronzeDark, [0, 0.2, -0.02])
    } else if (a.head === 'orb') {
      // bone war-mask with a single rune eye
      mesh(head, new THREE.SphereGeometry(0.21, 20, 16), M.leatherDark, [0, 0, 0])
      mesh(head, new THREE.SphereGeometry(0.175, 16, 12), M.bone, [0, -0.01, 0.12], { scale: [0.98, 1.02, 0.7] })
      mesh(head, new THREE.SphereGeometry(0.05, 10, 8), M.glow, [0, 0.03, 0.23], { shadow: false })
      for (const s of [-1, 1]) {
        mesh(head, new THREE.BoxGeometry(0.02, 0.07, 0.02), M.leatherDark, [0.06 * s, -0.11, 0.23], { rot: [0.2, 0, 0], shadow: false })
        mesh(head, new THREE.ConeGeometry(0.024, 0.08, 6), M.bone, [0.11 * s, -0.16, 0.17], { rot: [0.35, 0, 0] })
      }
    } else {
      // bare head: war-paint stripes, grim glowing eyes
      mesh(head, new THREE.SphereGeometry(0.19, 20, 16), M.skin, [0, 0, 0])
      mesh(head, new THREE.BoxGeometry(0.24, 0.03, 0.028), M.paint, [0, 0.085, 0.15], { rot: [-0.6, 0, 0], shadow: false })
      mesh(head, new THREE.BoxGeometry(0.032, 0.12, 0.026), M.paint, [-0.06, -0.035, 0.165], { rot: [0.12, 0, 0.06], shadow: false })
      for (const s of [-1, 1]) {
        mesh(head, new THREE.SphereGeometry(0.032, 8, 6), M.glow, [0.075 * s, 0.015, 0.17], { scale: [1.15, 0.5, 0.7], shadow: false })
        mesh(head, new THREE.BoxGeometry(0.07, 0.022, 0.03), M.hair, [0.075 * s, 0.065, 0.172], { rot: [0, 0, -0.28 * s], shadow: false })
      }
      mesh(head, new THREE.BoxGeometry(0.05, 0.02, 0.02), M.leatherDark, [0, -0.1, 0.185], { shadow: false })
    }
    if (a.hair === 'spikes') {
      // iron mohawk crest — fin-shaped blades raked back along the midline
      const crest = [[0.11, 0.2, 0.22, 0.2], [0.03, 0.24, 0.28, 0.4], [-0.06, 0.23, 0.26, 0.62], [-0.14, 0.19, 0.2, 0.88], [-0.2, 0.13, 0.15, 1.1]]
      for (const [z, y, h, rx] of crest) {
        mesh(head, new THREE.ConeGeometry(0.05, h, 6), M.iron, [0, y, z], { rot: [-rx, 0, 0], scale: [0.5, 1, 1.35] })
      }
    } else if (a.hair === 'swept') {
      // long warrior mane flowing down the back
      mesh(head, new THREE.SphereGeometry(0.2, 16, 12), M.hair, [0, 0.08, -0.04], { scale: [1.02, 0.62, 1.08] })
      mesh(head, new THREE.ConeGeometry(0.1, 0.5, 8), M.hair, [0, -0.1, -0.19], { rot: [-2.7, 0, 0] })
      mesh(head, new THREE.ConeGeometry(0.05, 0.3, 6), M.hair, [0.12, -0.02, -0.14], { rot: [-2.5, 0, 0.25] })
      mesh(head, new THREE.ConeGeometry(0.05, 0.3, 6), M.hair, [-0.12, -0.02, -0.14], { rot: [-2.5, 0, -0.25] })
    } else if (a.hair === 'horns') {
      // horned helm: iron band + curving bone horns
      mesh(head, new THREE.TorusGeometry(0.19, 0.03, 8, 22), M.ironDark, [0, 0.06, 0], { rot: [Math.PI / 2, 0, 0] })
      for (const s of [-1, 1]) {
        mesh(head, new THREE.ConeGeometry(0.05, 0.24, 7), M.bone, [0.19 * s, 0.13, 0], { rot: [0, 0, -0.85 * s] })
        mesh(head, new THREE.ConeGeometry(0.026, 0.14, 6), M.bone, [0.3 * s, 0.24, 0], { rot: [0, 0, -1.25 * s] })
      }
    } else if (a.head === 'classic') {
      // bald + scar
      mesh(head, new THREE.BoxGeometry(0.02, 0.12, 0.014), M.paint, [0.085, 0.115, 0.12], { rot: [-0.7, 0, 0.3], shadow: false })
    }

    // --- sheathed war axe on the back (pure decoration; head rides over the right shoulder) ---
    const weapon = new THREE.Group()
    weapon.position.set(0, 0.5, -0.24)
    weapon.rotation.z = -0.72
    hips.add(weapon)
    mesh(weapon, new THREE.CylinderGeometry(0.024, 0.028, 0.95, 8), M.leatherDark, [0, 0, 0])
    mesh(weapon, new THREE.SphereGeometry(0.038, 8, 6), M.bronzeDark, [0, -0.48, 0])
    mesh(weapon, new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), M.bronzeDark, [0, 0.38, 0])
    mesh(weapon, new THREE.BoxGeometry(0.11, 0.26, 0.04), M.ironDark, [0.075, 0.38, 0])
    mesh(weapon, new THREE.BoxGeometry(0.045, 0.32, 0.032), M.iron, [0.14, 0.38, 0])
    mesh(weapon, new THREE.ConeGeometry(0.035, 0.12, 7), M.ironDark, [0, 0.5, 0])

    // --- battle-torn cloak (cloth sim + ragged hem) ---
    if (a.cape) {
      const geo = new THREE.PlaneGeometry(0.62, 0.95, 6, 9)
      geo.translate(0, -0.475, 0)
      // taper toward the hem + ragged bottom edge via vertex jitter
      const pos = geo.attributes.position
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        const hang = clamp(-y / 0.95, 0, 1)
        pos.setX(i, pos.getX(i) * (1 - 0.22 * hang))
        if (y < -0.9) pos.setY(i, y + rand(-0.16, 0.01))
        else if (y < -0.78) pos.setY(i, y + rand(-0.06, 0.02))
      }
      this.capeBase = pos.array.slice()
      this.cape = new THREE.Mesh(geo, M.cloth)
      this.cape.position.set(0, 0.62, -0.26)
      this.cape.rotation.x = 0.22
      this.cape.castShadow = true
      hips.add(this.cape)
      // bronze brooches pinning the cloak
      for (const s of [-1, 1]) mesh(hips, new THREE.SphereGeometry(0.035, 8, 6), M.bronze, [0.3 * s, 0.62, -0.2], { shadow: false })
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
    this.phase += dt * (4 + 7 * Math.min(sn, 1.2)) * (w > 0.02 ? 1 : 0)
    const ph = this.phase

    if (this.state === 'ko') {
      this.koT += dt
      const k = Math.min(1, this.koT / 0.5)
      const e = 1 - Math.pow(1 - k, 3)
      this.hips.rotation.x = -1.42 * e
      this.hips.position.y = 0.92 - 0.5 * e
      return
    }

    // hips: bob + lean
    const danceBob = this.state === 'dance' ? Math.abs(Math.sin(t * 6)) * 0.14 : 0
    this.hips.position.y = 0.92 + Math.sin(t * 2) * 0.015 * (1 - w) + Math.abs(Math.cos(ph)) * 0.055 * w + danceBob
    this.hips.rotation.x = 0.17 * w
    this.hips.rotation.y = this.state === 'dance' ? Math.sin(t * 3) * 0.45 : 0

    // breathing (torso is a group: plates rise and fall together)
    const br = 1 + Math.sin(t * 2.1) * 0.015 * (1 - w)
    this.torso.scale.set(br, 1, br)
    this.gem.rotation.y += dt * 1.5

    // legs
    for (const [key, s] of [['L', -1], ['R', 1]]) {
      const leg = this.legs[key]
      const p = ph + (s === 1 ? Math.PI : 0)
      leg.pivot.rotation.x = Math.sin(p) * 0.9 * w
      leg.knee.rotation.x = (0.08 + Math.max(0, -Math.sin(p)) * 1.15) * w
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
      arm.pivot.rotation.z = rz
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
        const hang = clamp(-by / 0.95, 0, 1)
        pos.setZ(i, base[i * 3 + 2] - Math.sin(t * 5 + by * 5 + bx * 3) * amp * hang - w * hang * 0.34)
      }
      pos.needsUpdate = true
      this.cape.geometry.computeVertexNormals()
      this.cape.rotation.x = 0.22 + w * 0.5
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
    this.bodyMat = toonMaterial({
      color: bodyColor, rim: evil ? '#ff8a70' : '#ffe1b0', rimStrength: 0.45,
      emissive: '#000000',
    })
    const g = this.group
    const ironMat = toonMaterial({ color: '#4a4d55', rim: '#b9b2a2', rimStrength: 0.35 })
    this.body = mesh(g, new THREE.SphereGeometry(0.34, 16, 12), this.bodyMat, [0, 0.4, 0], { scale: [1, 0.85, 0.95] })

    if (evil) {
      // crude iron helm with a nose guard
      mesh(g, new THREE.SphereGeometry(0.3, 14, 10), ironMat, [0, 0.6, -0.01], { scale: [1.02, 0.55, 0.98] })
      mesh(g, new THREE.BoxGeometry(0.05, 0.15, 0.04), ironMat, [0, 0.5, 0.3])
      // red rune eyes
      for (const s of [-1, 1]) {
        mesh(g, new THREE.SphereGeometry(0.055, 8, 6), glowMaterial('#ff3524', 2.6), [0.12 * s, 0.47, 0.26], { scale: [1.1, 0.7, 0.7], shadow: false })
      }
      // bone tusks + iron shoulder spikes
      for (const s of [-1, 1]) {
        mesh(g, new THREE.ConeGeometry(0.028, 0.09, 6), toonMaterial({ color: '#e8dcc4', rimStrength: 0.3 }), [0.1 * s, 0.29, 0.28], { rot: [0.25, 0, 0] })
        mesh(g, new THREE.ConeGeometry(0.06, 0.16, 6), ironMat, [0.27 * s, 0.5, 0.02], { rot: [0, 0, -1.15 * s] })
      }
    } else {
      // squire: cute eyes under a bronze kettle helm, round shield at the side
      for (const s of [-1, 1]) {
        mesh(g, new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: '#f5ead2' }), [0.13 * s, 0.48, 0.26], { shadow: false })
        mesh(g, new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: '#241a12' }), [0.13 * s, 0.48, 0.325], { shadow: false })
      }
      mesh(g, new THREE.SphereGeometry(0.28, 14, 10), toonMaterial({ color: '#8a5f2e', rim: '#ffd9a0', rimStrength: 0.4 }), [0, 0.62, -0.01], { scale: [1.05, 0.5, 1.0] })
      mesh(g, new THREE.SphereGeometry(0.045, 8, 6), glowMaterial(color, 1.8), [0, 0.75, 0], { shadow: false })
      const shield = mesh(g, new THREE.CylinderGeometry(0.16, 0.16, 0.035, 14), toonMaterial({ color: '#4a352a', rim: '#c9a578', rimStrength: 0.35 }), [-0.34, 0.42, 0.04], { rot: [0, 0, Math.PI / 2] })
      mesh(shield, new THREE.SphereGeometry(0.05, 8, 6), toonMaterial({ color: '#8a5f2e', rimStrength: 0.3 }), [0, 0.03, 0], { shadow: false })
    }
    this.feet = []
    for (const s of [-1, 1]) {
      this.feet.push(mesh(g, new THREE.SphereGeometry(0.1, 8, 6), this.bodyMat, [0.13 * s, 0.08, 0.04], { scale: [1, 0.65, 1.3] }))
    }
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
