import * as THREE from 'three'
import { getSkill, wasdKeyIndex } from '../../meta/skills.js'
import { createHero } from '../../art/characterFactory.js'
import { clamp, distXZ, v3 } from '../../core/utils.js'
import { COURT, isThree } from './constants.js'

const _tmp = new THREE.Vector3()
const _tmp2 = new THREE.Vector3()

/**
 * Q/W/E/R skill layer. Owns cooldowns, active-effect timers and their
 * visuals. Gameplay flags live in game.eff and are read by scene + AI.
 */
export class Abilities {
  /**
   * env: { scene(THREE), game, vfx, audio, hud, engine, helpers:
   *        { startDunk(kind), cometSlam(value), banner, toast } }
   */
  constructor(env, profile, abilityBar) {
    this.env = env
    this.bar = abilityBar
    this.slots = profile.loadout.map(getSkill)
    this.cds = [0, 0, 0, 0]
    const g = env.game
    g.eff = {
      starfire: false,
      turboT: 0, aegisT: 0, ghostT: 0, titanT: 0, pullT: 0,
      novaArmed: false,
      ice: null,       // { pos, t, mesh }
      decoy: null,     // { pos, t, hero }
      comet: null,     // { handle, value }
    }
    this._bubble = null
    this._heroMats = null
  }

  keyIndex(code) { return wasdKeyIndex(code) }

  cast(i) {
    const { game, audio, vfx, hud } = this.env
    if (game.phase === 'end' || game.phase === 'intro') return
    if (this.cds[i] > 0.001) return
    const s = this.slots[i]
    this.cds[i] = s.cd
    this.bar.flash(i)
    game.player.hero.cast()
    audio.play('cast')
    const P = game.player.hero.group.position
    vfx.flash(_tmp.copy(P).setY(P.y + 1.2), { color: s.color, size: 2.4 })

    this['_' + s.archetype]?.(s)
    void hud
  }

  /* ------------------------- archetypes ------------------------- */

  _dash(s) { // Blink: warp past the defender, ball comes along
    const { game, vfx, audio } = this.env
    const p = game.player
    const P = p.hero.group.position
    vfx.ring(P, { color: s.color, radius: 1.6, life: 0.3 })
    _tmp.copy(p.vel)
    if (_tmp.lengthSq() < 0.2) _tmp.copy(COURT.RIM_FLOOR).sub(P) // idle: toward hoop
    _tmp.setY(0).normalize()
    const range = Math.min(s.params.range ?? 12, 9)
    P.addScaledVector(_tmp, range * 0.75)
    P.x = clamp(P.x, COURT.BOUND.minX, COURT.BOUND.maxX)
    P.z = clamp(P.z, COURT.BOUND.minZ, COURT.BOUND.maxZ)
    audio.play('dash')
    vfx.flash(_tmp2.copy(P).setY(1.1), { color: s.color, size: 3 })
    vfx.ring(P, { color: s.color, radius: 2, life: 0.35 })
    this.env.helpers.toast('ANKLES: BROKEN')
  }

  _projectile(s) { // Starfire: ignite next shot, +40% accuracy
    const { game, vfx } = this.env
    game.eff.starfire = true
    const P = game.player.hero.group.position
    vfx.burst(_tmp.copy(P).setY(1.4), { color: s.color, count: 22, speed: 5 })
    this.env.helpers.toast('NEXT SHOT IGNITED  +40% ACC')
  }

  _slowfield(s) { // Frost Ring: ice patch under the defender
    const { game, vfx, scene, audio } = this.env
    const aiP = game.ai.hero.group.position
    this._clearIce()
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(2.3, 28),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#9fd8ff').multiplyScalar(1.3), transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(aiP.x, 0.05, aiP.z)
    scene.add(mesh)
    game.eff.ice = { pos: v3(aiP.x, 0, aiP.z), t: s.params.duration ?? 3.5, mesh }
    vfx.ring(mesh.position, { color: '#9fd8ff', radius: 2.6, life: 0.5 })
    audio.play('zap', { vol: 0.4 })
    this.env.helpers.toast('DEFENDER ICED')
  }

  _nova(s) { // Seismic Slam: knock defender back; near rim -> dunk armed
    const { game, vfx, audio, engine } = this.env
    const P = game.player.hero.group.position
    vfx.shockwave(P, { color: s.color, radius: s.params.radius ?? 5 })
    audio.play('explode', { vol: 0.6 })
    engine.shake(0.3, 0.3)
    const ai = game.ai
    if (distXZ(P, ai.hero.group.position) < (s.params.radius ?? 5) + 1) {
      _tmp.copy(ai.hero.group.position).sub(P).setY(0).normalize()
      ai.imp.addScaledVector(_tmp, s.params.knock ?? 7)
      ai.stunT = Math.max(ai.stunT, 0.5)
      ai.hero.hitFlash?.()
    }
    if (distXZ(P, COURT.RIM_FLOOR) < 3 && game.offense === 'player') {
      game.eff.novaArmed = true
      this.env.helpers.toast('DUNK ARMED — PRESS SPACE')
    }
  }

  _buff(s) { // Overdrive: turbo + stamina freeze
    const { game, vfx } = this.env
    game.eff.turboT = s.params.duration ?? 4
    vfx.ring(game.player.hero.group.position, { color: s.color, radius: 2.2, life: 0.4 })
    this.env.helpers.toast('TURBO!')
  }

  _shield(s) { // Aegis: unstealable handle
    const { game, audio, scene } = this.env
    game.eff.aegisT = s.params.duration ?? 5
    audio.play('shield')
    if (!this._bubble) {
      this._bubble = new THREE.Mesh(
        new THREE.SphereGeometry(1.05, 24, 16),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color('#8ea9ff').multiplyScalar(1.5), transparent: true, opacity: 0.16,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
      )
      scene.add(this._bubble)
    }
    this._bubble.visible = true
  }

  _heal(s) { // Vital Surge: full stamina + green swirl
    const { game, vfx, audio } = this.env
    game.player.stamina = 100
    audio.play('heal')
    const P = game.player.hero.group.position
    vfx.burst(_tmp.copy(P).setY(1), { color: s.color, count: 30, speed: 4, gravity: 2, up: 4 })
    vfx.ring(P, { color: s.color, radius: 1.8, life: 0.5 })
    this.env.helpers.toast('SECOND WIND')
  }

  _summon(s) { // Mirror Decoy: holo screener the AI has to path around
    const { game, scene, audio } = this.env
    this._clearDecoy()
    const P = game.player.hero.group.position
    const aiP = game.ai.hero.group.position
    _tmp.copy(aiP).sub(P).setY(0)
    if (_tmp.lengthSq() < 0.1) _tmp.set(0, 0, -1)
    _tmp.normalize()
    const hero = createHero({ ...this.env.appearance, cape: false }, { auraRing: true })
    hero.group.position.copy(P).addScaledVector(_tmp, 1.7)
    hero.group.position.y = 0
    hero.faceTowards(aiP, 1, 100)
    hero.group.traverse(o => {
      if (o.material) { o.material.transparent = true; o.material.opacity = 0.42; o.castShadow = false }
    })
    scene.add(hero.group)
    game.eff.decoy = { pos: hero.group.position, t: s.params.duration ?? 6, hero }
    game.ai.confuseT = 0.8
    audio.play('spawn')
    this.env.helpers.toast('HOLO SCREEN SET')
  }

  _pull(s) { // Gravity Well: rebounds curve to you
    const { game, vfx } = this.env
    game.eff.pullT = 10
    vfx.ring(game.player.hero.group.position, { color: s.color, radius: 3, life: 0.6 })
    this.env.helpers.toast('GRAVITY REBOUNDS — 10s')
    void s
  }

  _giant(s) { // Titan: grow; next drive is an unstoppable dunk inside the arc
    const { game } = this.env
    game.eff.titanT = s.params.duration ?? 5
    this.env.helpers.toast('TITAN FORM — DUNK FROM ANYWHERE INSIDE')
  }

  _ghost(s) { // Phase Cloak: walk through the defender, uncontestable
    const { game, audio } = this.env
    game.eff.ghostT = s.params.duration ?? 3
    audio.play('zap', { vol: 0.3 })
    if (!this._heroMats) {
      // snapshot original transparency so restore doesn't corrupt sprites/rings
      this._heroMats = []
      game.player.hero.group.traverse(o => {
        if (o.material) this._heroMats.push({ m: o.material, t: o.material.transparent, o: o.material.opacity })
      })
    }
    for (const { m } of this._heroMats) { m.transparent = true; m.opacity = 0.35 }
  }

  _meteor(s) { // Comet Crash: comet slams the rim; holding = thunder-dunk
    const { game, vfx, audio } = this.env
    const P = game.player.hero.group.position
    const value = game.ball.holder === 'player' && isThree(P) ? 3 : 2
    const from = _tmp.copy(COURT.RIM).add(_tmp2.set(3.5, 15, 4))
    const dist = from.distanceTo(COURT.RIM)
    const handle = vfx.projectile({
      from, to: COURT.RIM, speed: dist / (s.params.delay ?? 0.9),
      color: s.color, size: 0.9, life: 2.5, trail: true, light: 220,
    })
    game.eff.comet = { handle, value }
    audio.play('cast', { vol: 0.5 })
    this.env.helpers.toast('COMET INBOUND...')
  }

  /* ------------------------- per-frame ------------------------- */

  tick(dt) {
    const { game, vfx, audio, engine, helpers } = this.env
    const eff = game.eff
    for (let i = 0; i < 4; i++) {
      if (this.cds[i] > 0) this.cds[i] = Math.max(0, this.cds[i] - dt)
      this.bar.setCooldown(i, this.cds[i] / this.slots[i].cd, this.cds[i])
      this.bar.setActive(i, this._isActive(this.slots[i].archetype))
    }

    eff.turboT = Math.max(0, eff.turboT - dt)
    eff.pullT = Math.max(0, eff.pullT - dt)
    eff.titanT = Math.max(0, eff.titanT - dt)

    if (eff.aegisT > 0) {
      eff.aegisT -= dt
      if (this._bubble) {
        this._bubble.position.copy(game.player.hero.group.position).setY(game.player.hero.group.position.y + 1)
        this._bubble.material.opacity = 0.12 + Math.sin(game.t * 6) * 0.05
        this._bubble.scale.setScalar(1 + Math.sin(game.t * 4) * 0.05)
        if (eff.aegisT <= 0) this._bubble.visible = false
      }
    }

    if (eff.ghostT > 0) {
      eff.ghostT -= dt
      if (eff.ghostT <= 0 && this._heroMats) {
        for (const { m, t, o } of this._heroMats) { m.transparent = t; m.opacity = o }
      }
    }

    if (eff.ice) {
      eff.ice.t -= dt
      eff.ice.mesh.material.opacity = 0.22 + Math.sin(game.t * 5) * 0.08
      if (eff.ice.t <= 0) this._clearIce()
    }

    if (eff.decoy) {
      eff.decoy.t -= dt
      eff.decoy.hero.update(dt)
      if (eff.decoy.t <= 0) this._clearDecoy()
    }

    if (eff.comet) {
      const { handle, value } = eff.comet
      if (!handle.alive || handle.pos.y <= COURT.RIM.y + 0.25) {
        handle.kill()
        eff.comet = null
        vfx.impact(COURT.RIM, { color: '#ff9de2', size: 2.4 })
        vfx.shockwave(COURT.RIM_FLOOR, { color: '#ff9de2', radius: 5 })
        audio.play('explode')
        engine.shake(0.7, 0.55)
        if (game.ball.holder === 'player' && game.phase === 'live') helpers.cometSlam(value)
      }
    }
  }

  _isActive(arch) {
    const eff = this.env.game.eff
    return (arch === 'buff' && eff.turboT > 0) || (arch === 'shield' && eff.aegisT > 0) ||
      (arch === 'ghost' && eff.ghostT > 0) || (arch === 'giant' && eff.titanT > 0) ||
      (arch === 'pull' && eff.pullT > 0) || (arch === 'projectile' && eff.starfire) ||
      (arch === 'nova' && eff.novaArmed)
  }

  _clearIce() {
    const eff = this.env.game.eff
    if (!eff.ice) return
    this.env.scene.remove(eff.ice.mesh)
    eff.ice.mesh.geometry.dispose()
    eff.ice.mesh.material.dispose()
    eff.ice = null
  }

  _clearDecoy() {
    const eff = this.env.game.eff
    if (!eff.decoy) return
    this.env.scene.remove(eff.decoy.hero.group)
    eff.decoy = null
  }

  dispose() {
    this._clearIce()
    this._clearDecoy()
    if (this.env.game.eff.comet) this.env.game.eff.comet.handle.kill()
  }
}
