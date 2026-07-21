import * as THREE from 'three'
import { getSkill, WASD_KEY_LABELS, wasdKeyIndex } from '../../meta/skills.js'
import { VFX } from '../../art/vfx.js'
import { createHero } from '../../art/characterFactory.js'
import { glowSpriteMaterial } from '../../art/materials.js'
import { clamp, damp, lerp, rand, TAU, distXZ, disposeObject3D } from '../../core/utils.js'
import { buildSiegeWorld, FIELD_R, CITADEL_POS } from './siegeEnv.js'
import { Citadel } from './citadel.js'
import { RaiderArmy, Colossus, buildWaveQueue, waveComposition, WAVE_COUNT, BOSS_WAVE } from './raiders.js'
import { TurretManager, UPGRADE_COST } from './turrets.js'
import { SiegeHud } from './siegeHud.js'
import { IntroCinematic, BossEntrance, GateSmolder } from './siegeCinematics.js'
import '../../ui/siege.css'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()

const HERO_SPEED = 9
const BLASTER_INTERVAL = 0.16
const SPAWN_POINT = { x: 0, z: 7.5 }
const RAIDER_CAP = 45
const KILL_GOLD = 8
const WAVE_BONUS = 60

/**
 * LAST BASTION — hold-the-gate action tower defense.
 * WASD move, aim with cursor, hold LMB to fire, 1-4 skills, F builds/upgrades
 * ballistas on platforms. 10 waves down two lanes; wave 10 is the SIEGE
 * COLOSSUS. (Scene key, stats keys and state names keep the "siege"/"citadel"
 * ids — display text only is rethemed.)
 */
export default class SiegeScene {
  constructor(ctx) {
    this.ctx = ctx
    // realism grade: only true fire clears the bloom threshold, neutral
    // saturation, filmic vignette + grain
    // (SSAO benchmarked: 100fps -> 62fps at the 45-raider gate on an M-series
    // integrated GPU — too thin for the fleet's slowest target, so it stays off;
    // grounding comes from contact shadows + painted AO instead.)
    this.postOpts = { bloom: 0.55, bloomThreshold: 0.92, bloomRadius: 0.45, vignette: 0.58, saturation: 1.02, grain: 0.032, exposure: 1.04 }
  }

  async init() {
    const { engine, input, audio, profile } = this.ctx
    this.scene = new THREE.Scene()
    this.scene.environment = engine.envMap
    this.env = buildSiegeWorld(this.scene)

    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 700)
    this.camOffset = new THREE.Vector3(0, 17.5, 9)
    this._look = new THREE.Vector3(SPAWN_POINT.x, 0.6, SPAWN_POINT.z)
    this.camera.position.set(SPAWN_POINT.x, this.camOffset.y, SPAWN_POINT.z + this.camOffset.z)
    this.camera.lookAt(this._look)

    this.vfx = new VFX(this.scene)
    this.citadel = new Citadel(this.scene, this.vfx, audio)
    this.army = new RaiderArmy(this.scene)
    this.turrets = new TurretManager(this.scene, this.vfx, audio, {
      onFire: (target, dmg) => target.take(dmg),
      onDestroyed: () => this.hud.hud.toast('BALLISTA DESTROYED — rebuild half price'),
    })
    this._padAdapters = this.turrets.pads.map(pad => ({
      x: pad.x, z: pad.z, alive: false,
      take: dmg => { if (pad.turret) this.turrets.take(pad.turret, dmg) },
    }))

    // ---------- hero ----------
    this.hero = createHero(profile.appearance, { auraRing: true })
    this.hero.group.position.set(SPAWN_POINT.x, 0, SPAWN_POINT.z)
    this.scene.add(this.hero.group)
    if (profile.appearance.trail !== 'none') {
      this.heroTrail = this.vfx.trail(this.hero.hips, { color: profile.appearance.glow, size: 0.38, rate: 14, life: 0.5 })
    }
    // personal torchlight pool — keeps the hero readable against the night mud
    // (always warm firelight; profile glow stays on trail/VFX where it belongs)
    this.heroLight = new THREE.PointLight('#ffb37a', 5.5, 8.5, 2)
    this.heroLight.position.y = 2.3
    this.hero.group.add(this.heroLight)
    this.hp = 100
    this.deadT = 0
    this.iFrames = 0
    this.heroK = new THREE.Vector3()
    this.heroScale = 1
    this.aim = new THREE.Vector3(0, 0, -4)
    this.fireT = 0

    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 24, 18),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#aebcd0').multiplyScalar(1.5), transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    this.bubble.position.y = 1
    this.bubble.visible = false
    this.hero.group.add(this.bubble)

    // ---------- skills ----------
    this.skillDefs = profile.loadout.map(getSkill)
    this.cds = [0, 0, 0, 0]
    this.buffT = 0
    this.giantT = 0
    this.ghostT = 0
    this.stompT = 0
    this.shield = null
    this.decoy = null
    this.frost = []
    this.vortices = []
    this.meteors = []
    this.bolts = []
    this.mortars = []
    this._ghostMats = null
    this._buildCasters()

    // ---------- game state ----------
    this.gold = 120
    this.goldEarned = 0
    this.score = 0
    this.kills = 0
    this.wave = 0
    this.waveState = 'break'
    this.breakT = 3
    this.spawnQueue = []
    this.spawnT = 0
    this.portalIdx = 0
    this.boss = null
    this.slowmoT = 0
    this.timeScale = 1
    this.over = null
    this._timeouts = []
    this._txt = 12
    this._targets = []

    // ---------- battle honors (stats panel) ----------
    this.killsByType = {}
    this.goldSpent = 0
    this.turretsBuilt = 0
    this.topTier = 0
    this.perfectWaves = 0
    this.gateDamage = 0
    this.castCounts = [0, 0, 0, 0]
    this._waveCitHp0 = this.citadel.hp
    this._bleedWave = 0

    // ---------- presentation: cinematics, exposure grade, gate smolder ----------
    this.exposure = 1.12
    this.exposureT = 1.12
    this.dawnT = null
    this.smolder = new GateSmolder(this.scene)
    this._titleRemove = null
    this._bossCardRemove = null

    this._armyCtx = {
      heroPos: this.hero.group.position,
      heroTargetable: true,
      decoyPos: null,
      turrets: this._padAdapters,
      over: false,
      meleeHero: e => this._raiderMeleeHero(e),
      meleeDecoy: e => this._raiderMeleeDecoy(e),
      hitCitadel: e => this._raiderHitCitadel(e),
      detonate: e => this._explode(e),
    }

    // ---------- HUD ----------
    this.hud = new SiegeHud(this.skillDefs, { game: 'siege', keys: WASD_KEY_LABELS })

    input.onKey((code, down) => {
      if (!down) return
      if (this.phase !== 'play') { this._skipCine(); return } // ANY key skips a cinematic
      const i = wasdKeyIndex(code)
      if (i >= 0) this._castSkill(i)
      else if (code === 'KeyF') this._padAction()
      else if (code === 'KeyH') this.hud.toggleHints()
    })
    input.onMouse((btn, down) => {
      if (down && this.phase !== 'play') this._skipCine()
    })

    audio.music('siege')
    audio.ambience('gate')
    profile.stats.plays.siege = (profile.stats.plays.siege || 0) + 1
    this.ctx.saveProfile()

    // seed the HUD readouts (they only refresh once gameplay starts)
    this.hud.setGold(this.gold)
    this.hud.setHp(1, '100 / 100')
    this.hud.setCitadel(1, this.citadel.hp, this.citadel.maxHp)

    // ---------- opening cinematic: the war camps burn, the road, the gate ----------
    // World state is FROZEN while it plays; any key (or click) skips it.
    this.phase = 'intro'
    this.cine = new IntroCinematic(this.camera)
    this.hud.setCine(true)

    this.debug = {
      win: () => this._victory(),
      lose: () => this._citadelDown(),
      wave: n => this._jumpWave(n),
      gold: n => { this.gold += n },
    }
  }

  // ============================== main loop ==============================

  update(dt, t) {
    if (this.slowmoT > 0) {
      this.slowmoT -= dt
      this.timeScale = this.slowmoT > 0.55 ? 0.22 : lerp(0.22, 1, 1 - Math.max(0, this.slowmoT) / 0.55)
    } else this.timeScale = 1
    const gdt = dt * this.timeScale
    this._txt = 12

    // exposure grade (boss-entrance dip, victory dawn swell)
    this.exposure = damp(this.exposure, this.exposureT, 3, dt)
    this.ctx.engine.setExposure(this.exposure)
    if (this.dawnT != null && this.dawnT < 1) {
      this.dawnT = Math.min(1, this.dawnT + dt / 3)
      const k = this.dawnT
      this.env.dawn.set(k * k * (3 - 2 * k))
    }

    for (const tk of this.env.tickables) tk.tick(dt)
    for (const p of this.env.portals) {
      if (p.flash > 0) {
        p.flash = Math.max(0, p.flash - dt * 2)
        p.archMat.color.copy(p.baseColor).multiplyScalar(1 + 2.2 * p.flash)
        p.portalMat.uniforms.uIntensity.value = 2.1 + 2.6 * p.flash
      }
    }

    this.vfx.update(dt)
    this.citadel.update(dt)
    this.smolder.setActive(!this.over && !this.citadel.dead && this.citadel.frac() > 0 && this.citadel.frac() < 0.25)
    this.smolder.tick(dt)

    // cinematic phases: the world holds its breath while the camera works
    if (this.phase !== 'play') { this._updateCine(dt); return }

    if (!this.over) this._updatePlayer(gdt, dt)
    else this.hero.update(dt)

    this._updateSkills(gdt, dt)
    this._updateZones(gdt, dt)
    this._updateDecoy(gdt, dt)
    this._updateWaves(gdt)

    this._armyCtx.decoyPos = this.decoy ? this.decoy.hero.group.position : null
    this._armyCtx.heroTargetable = this.ghostT <= 0 && this.deadT <= 0
    this._armyCtx.over = !!this.over
    for (let i = 0; i < this._padAdapters.length; i++) {
      const pad = this.turrets.pads[i]
      this._padAdapters[i].alive = !!pad.turret && !pad.turret.dead
    }
    this.army.update(gdt, this._armyCtx)

    if (this.boss) this._updateBoss(gdt)
    this._updateBolts(gdt)
    this._updateMortars(gdt)
    this._updateTurrets(gdt)

    this._updateHud(dt)
    this._updateCamera(dt)
  }

  // ============================== cinematics ==============================

  _updateCine(dt) {
    this.hero.update(dt)
    if (this.phase === 'intro' && !this._titleRemove && this.cine.t >= 3.15) {
      // the bastion revealed: title slam
      this._titleRemove = this.hud.showTitle()
      this.ctx.audio.play('tower', { vol: 0.65 })
      this.ctx.engine.shake(0.22, 0.4)
    }
    if (this.phase === 'bossin' && this.boss) {
      this._updateBoss(dt) // the Colossus marches through its own entrance
      if (!this._bossCardRemove && this.cine.t >= 1.1) {
        this._bossCardRemove = this.hud.bossCard()
        this.ctx.audio.play('kill', { vol: 0.8 })
        this.ctx.engine.shake(0.35, 0.5)
      }
    }
    if (this.cine && this.cine.update(dt)) this._endCine()
  }

  _skipCine() {
    if (!this.cine) return
    this.cine.skip()
    this._endCine()
  }

  _endCine() {
    if (this.phase === 'play') return
    const wasIntro = this.phase === 'intro'
    this.phase = 'play'
    this.cine = null
    this.hud.setCine(false)
    this._titleRemove?.()
    this._titleRemove = null
    this._bossCardRemove?.()
    this._bossCardRemove = null
    if (wasIntro) {
      // hard snap to the gameplay frame, then sound the first war horn
      const hp = this.hero.group.position
      this.camera.position.set(hp.x + this.camOffset.x, this.camOffset.y, hp.z + this.camOffset.z)
      this._look.set(hp.x, 0.6, hp.z)
      this.camera.lookAt(this._look)
      if (!this.over && this.wave === 0) this._announceWave(1)
    } else {
      this.exposureT = 1.12 // lights back up after the boss entrance
    }
  }

  /** War-horn sting + banner with a composition preview of what marches. */
  _announceWave(n) {
    if (this.over) return
    this.ctx.audio.play('tower', { vol: 0.6 })  // war horn: deep bellow…
    this.ctx.audio.play('kill', { vol: 0.22 })  // …with a brass snarl over it
    const sub = n === BOSS_WAVE ? 'THE SIEGE COLOSSUS AWAKENS'
      : n === 5 ? 'SHIELDBEARERS — FLANK THEM OR PIERCE WITH SKILLS'
        : n === 1 ? 'THEY MARCH FROM BOTH WAR CAMPS' : ''
    this.hud.waveBanner(n, waveComposition(n), { boss: n === BOSS_WAVE, sub })
  }

  // ============================== player ==============================

  _updatePlayer(gdt, dt) {
    const input = this.ctx.input
    const pos = this.hero.group.position

    // downed: wait out the respawn timer while the siege continues
    if (this.deadT > 0) {
      this.deadT -= gdt
      if (this.deadT <= 0) this._respawn()
      this.hero.update(dt)
      return
    }

    if (input.groundPoint(this.camera, 0, _v1)) this.aim.copy(_v1)
    this.hero.faceTowards(this.aim, dt, 16)

    const mx = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0)
    const mz = (input.isDown('KeyS') ? 1 : 0) - (input.isDown('KeyW') ? 1 : 0)
    const speed = HERO_SPEED * (this.buffT > 0 ? 1.6 : 1)
    if (mx || mz) {
      const il = 1 / Math.hypot(mx, mz)
      pos.x += mx * il * speed * gdt
      pos.z += mz * il * speed * gdt
      this.hero.setMoveSpeed(speed)
    } else this.hero.setMoveSpeed(0)

    pos.x += this.heroK.x * gdt
    pos.z += this.heroK.z * gdt
    this.heroK.multiplyScalar(Math.exp(-5 * gdt))
    this._clampToField(pos, 0.8)

    this.iFrames = Math.max(0, this.iFrames - gdt)

    this.fireT -= gdt
    if (input.buttonDown(0) && this.fireT <= 0) {
      this.fireT = BLASTER_INTERVAL
      this._fireBlaster()
    }

    // titan form: scale + stomp shockwaves per step
    this.heroScale = damp(this.heroScale, this.giantT > 0 ? 1.75 : 1, 9, dt)
    this.hero.group.scale.setScalar(this.heroScale)
    if (this.giantT > 0 && (mx || mz)) {
      this.stompT -= gdt
      if (this.stompT <= 0) {
        this.stompT = 0.42
        this.vfx.ring(pos, { color: '#d8b98a', radius: 3, life: 0.4 })
        this.ctx.audio.play('explode', { vol: 0.2 })
        this._aoeRaiders(pos.x, pos.z, 3, 8, { color: '#d8b98a', knock: 3.5, hitBoss: false })
      }
    }

    // contextual build prompt
    this._updatePadPrompt(pos)

    this.hero.update(dt)
  }

  _clampToField(v, margin = 0.8) {
    const r = Math.hypot(v.x, v.z)
    const maxR = FIELD_R - margin
    if (r > maxR) { v.x *= maxR / r; v.z *= maxR / r }
    // keep bodies off the citadel platform
    const dx = v.x - CITADEL_POS.x, dz = v.z - CITADEL_POS.z
    const d = Math.hypot(dx, dz)
    if (d < 8.6 && d > 0.001) {
      v.x = CITADEL_POS.x + (dx / d) * 8.6
      v.z = CITADEL_POS.z + (dz / d) * 8.6
    }
    return v
  }

  _fireBlaster() {
    const from = this.hero.castPoint(_v1)
    _v2.copy(this.aim)
    _v2.y = from.y
    _v3.copy(_v2).sub(from)
    if (_v3.lengthSq() < 0.01) _v3.set(0, 0, 1)
    _v3.normalize()
    const glow = this.ctx.profile.appearance.glow || '#ff8c3b'
    const h = this.vfx.projectile({ from, dir: _v3, speed: 34, color: glow, size: 0.26, life: 1.05, trail: true })
    this.bolts.push({ h, dmg: this.giantT > 0 ? 12 : 8, r: 0.42, big: null, blaster: true })
    this.hero.cast()
    this.ctx.audio.play('zap', { vol: 0.26 })
    this.vfx.flash(from, { color: glow, size: 0.8, life: 0.1 })
    this.hero.group.position.addScaledVector(_v3, -0.045)
  }

  _damageHero(dmg, fromPos, { knock = 2.4 } = {}) {
    if (this.over || this.deadT > 0 || this.ghostT > 0 || this.iFrames > 0) return
    const pos = this.hero.group.position
    if (this.shield) {
      this.shield.hp -= dmg
      _v1.copy(pos)
      _v1.y = 1.1
      this.vfx.flash(_v1, { color: '#aebcd0', size: 2, life: 0.18 })
      this.ctx.audio.play('shield', { vol: 0.5 })
      if (this.shield.hp <= 0) this._breakShield()
      this.iFrames = 0.25
      return
    }
    this.hp -= dmg
    this.iFrames = 0.5
    this.ctx.audio.play('hit', { vol: 0.7 })
    this.hud.damageFlash()
    if (fromPos) {
      _v3.copy(pos).sub(fromPos)
      _v3.y = 0
      if (_v3.lengthSq() < 0.01) _v3.set(0, 0, 1)
      _v3.normalize()
      this.heroK.addScaledVector(_v3, knock)
    }
    _v1.copy(pos)
    _v1.y = 1
    this.vfx.burst(_v1, { color: '#ff5c6e', count: 12, speed: 5, size: 0.22 })
    if (this.hp <= 0) this._playerDown()
  }

  _playerDown() {
    this.hp = 0
    this.deadT = 5
    this.hero.setState('ko')
    this.hero.setMoveSpeed(0)
    this.hud.setPrompt(null)
    this.ctx.audio.play('defeat', { vol: 0.35 })
    _v1.copy(this.hero.group.position)
    _v1.y = 1
    this.vfx.burst(_v1, { color: '#ff5c6e', count: 26, speed: 7, size: 0.3 })
  }

  _respawn() {
    this.deadT = 0
    this.hp = 100
    this.iFrames = 2
    this.hero.setState('normal')
    this.hero.group.position.set(SPAWN_POINT.x, 0, SPAWN_POINT.z)
    this.heroK.set(0, 0, 0)
    _v1.set(SPAWN_POINT.x, 1, SPAWN_POINT.z)
    this.vfx.flash(_v1, { color: '#ffb84d', size: 3 })
    this.vfx.ring(this.hero.group.position, { color: '#ffb84d', radius: 3, life: 0.5 })
    this.ctx.audio.play('spawn', { vol: 0.6 })
  }

  _raiderMeleeHero(e) {
    this._damageHero(e.def.dmg, e.minion.group.position, { knock: e.def.knock || 2.4 })
  }

  _raiderMeleeDecoy(e) {
    if (!this.decoy) return
    this.decoy.hp -= e.def.dmg
    _v1.copy(this.decoy.hero.group.position)
    _v1.y = 1
    this.vfx.flash(_v1, { color: '#b9aed2', size: 1, life: 0.12 })
  }

  _raiderHitCitadel(e) {
    this.ctx.audio.play('hit', { vol: 0.22 })
    this._damageCitadel(e.def.cdmg, e.minion.group.position)
  }

  /**
   * Every wound the bastion takes routes through here (same damage values —
   * this only adds the drama): first blood each wave = THE GATE BLEEDS.
   */
  _damageCitadel(dmg, fromPos) {
    if (this.over) return
    const before = this.citadel.hp
    const fell = this.citadel.damage(dmg, fromPos)
    this.gateDamage += before - this.citadel.hp
    this.hud.citadelHit()
    if (!fell && this._bleedWave !== this.wave) {
      this._bleedWave = this.wave
      this.hud.bleedPulse()
      this.hud.hud.banner('THE GATE BLEEDS', { color: '#ff5c6e', duration: 1.5, sub: 'THE HORDE IS AT THE WALLS' })
      this.ctx.engine.shake(0.4, 0.5)
      this.ctx.audio.play('tower', { vol: 0.55 })
    }
    if (fell) this._citadelDown()
  }

  // ============================== combat ==============================

  _hitRaider(e, dmg, { color = '#ffe6c4', size = 0.55, kx = 0, kz = 0 } = {}) {
    if (!e.alive) return
    if (kx || kz) { e.kx += kx; e.kz += kz }
    const killed = this.army.damage(e, dmg)
    if (this._txt > 0) {
      this._txt--
      _v1.copy(e.minion.group.position)
      _v1.y += 1.4 * e.def.scale
      this.vfx.text(_v1, String(Math.round(dmg)), { color, size, life: 0.7, rise: 2.1 })
    }
    if (killed) this._onKill(e)
  }

  _onKill(e) {
    const pos = e.minion.group.position
    this.vfx.impact(pos, { color: e.def.color, size: 0.9 * e.def.scale })
    this.kills++
    this.killsByType[e.type] = (this.killsByType[e.type] || 0) + 1
    this.score += 10
    this._earnGold(KILL_GOLD, pos)
    if (e.type === 'exploder') this._explode(e)
  }

  /** A single blast erased 5+ raiders: brief slow-mo + popup. */
  _annihilation() {
    this.slowmoT = Math.max(this.slowmoT, 0.7)
    this.hud.annihilate()
    this.ctx.audio.play('kill', { vol: 0.9 })
    this.ctx.engine.shake(0.5, 0.5)
  }

  _earnGold(g, pos = null) {
    this.gold += g
    this.goldEarned += g
    if (pos && this._txt > 0) {
      this._txt--
      _v1.copy(pos)
      _v1.y += 1.1
      this.vfx.text(_v1, `+${g}g`, { color: '#ffd166', size: 0.62, life: 0.8 })
    }
  }

  _explode(e) {
    if (e.exploded) return
    e.exploded = true
    const p = e.minion.group.position
    this.vfx.ring(p, { color: '#ff5a1e', radius: 3.2, life: 0.4 })
    this.vfx.burst(p, { color: '#ff8a3c', count: 24, speed: 8, size: 0.32 })
    _v1.copy(p)
    _v1.y = 0.8
    this.vfx.flash(_v1, { color: '#ff5a1e', size: 3 })
    this.ctx.audio.play('explode', { vol: 0.5 })
    if (!this.over) {
      if (distXZ(this.hero.group.position, p) < 3) this._damageHero(e.def.dmg, p, { knock: 4 })
      if (this.decoy && distXZ(this.decoy.hero.group.position, p) < 3) this.decoy.hp -= e.def.dmg
      // the blast scorches the bastion walls when it pops at the gate
      if (distXZ(this.citadel.group.position, p) < 13) this._damageCitadel(e.def.cdmg, p)
      for (const pad of this.turrets.pads) {
        if (pad.turret && Math.hypot(pad.x - p.x, pad.z - p.z) < 3) this.turrets.take(pad.turret, 15)
      }
    }
    this._aoeRaiders(p.x, p.z, 3, 15, { color: '#ff8a3c', knock: 3, exclude: e, hitBoss: false })
    this.army.kill(e)
  }

  /** AoE vs raiders (+boss). Skills pierce shieldbearer barriers. */
  _aoeRaiders(x, z, r, dmg, { color = '#ffd166', knock = 0, exclude = null, hitBoss = true } = {}) {
    for (const e of this.army.active) {
      if (!e.alive || e === exclude) continue
      const p = e.minion.group.position
      const dx = p.x - x, dz = p.z - z
      const rr = r + 0.45 * e.def.scale
      if (dx * dx + dz * dz > rr * rr) continue
      let kx = 0, kz = 0
      if (knock) {
        const d = Math.hypot(dx, dz) || 1
        kx = (dx / d) * knock
        kz = (dz / d) * knock
      }
      this._hitRaider(e, dmg, { color, kx, kz })
    }
    if (hitBoss && this.boss && this.boss.alive) {
      const bp = this.boss.group.position
      const dx = bp.x - x, dz = bp.z - z
      if (dx * dx + dz * dz < (r + 1.7) * (r + 1.7)) this._hitBoss(dmg, color)
    }
  }

  _hitBoss(dmg, color = '#ffe6c4') {
    const boss = this.boss
    if (!boss || !boss.alive) return
    boss.damage(dmg)
    if (this._txt > 0) {
      this._txt--
      _v1.copy(boss.group.position)
      _v1.y += 6
      this.vfx.text(_v1, String(Math.round(dmg)), { color, size: 0.75, life: 0.7, rise: 2.2 })
    }
    if (boss.hp <= 0) this._bossDeath()
  }

  // ============================== turrets ==============================

  _updatePadPrompt(pos) {
    if (this.over) { this.hud.setPrompt(null); return }
    const pad = this.turrets.nearestPad(pos)
    if (!pad) { this.hud.setPrompt(null); return }
    if (!pad.turret) {
      const cost = this.turrets.buildCost(pad)
      this.hud.setPrompt(`— BUILD BALLISTA (${cost}g)`, this.gold >= cost)
    } else if (!pad.turret.dead && pad.turret.buildT <= 0 && pad.turret.level < 3) {
      const cost = UPGRADE_COST[pad.turret.level - 1]
      this.hud.setPrompt(`— UPGRADE Lv${pad.turret.level + 1} (${cost}g)`, this.gold >= cost)
    } else this.hud.setPrompt(null)
  }

  _padAction() {
    if (this.over || this.deadT > 0) return
    const pad = this.turrets.nearestPad(this.hero.group.position)
    if (!pad) return
    if (!pad.turret) {
      const cost = this.turrets.buildCost(pad)
      if (this.gold < cost) return this._deny()
      this.gold -= cost
      this.goldSpent += cost
      this.turrets.build(pad)
      this.turretsBuilt++
      this.topTier = Math.max(this.topTier, 1)
    } else if (pad.turret.buildT <= 0 && pad.turret.level < 3) {
      const cost = UPGRADE_COST[pad.turret.level - 1]
      if (this.gold < cost) return this._deny()
      this.gold -= cost
      this.goldSpent += cost
      this.turrets.upgrade(pad.turret)
      this.topTier = Math.max(this.topTier, pad.turret.level)
    }
  }

  _deny() {
    this.ctx.audio.play('buzzer', { vol: 0.3 })
    this.hud.hud.toast('NOT ENOUGH GOLD')
  }

  _updateTurrets(gdt) {
    this._targets.length = 0
    for (const e of this.army.active) {
      if (!e.alive) continue
      // one adapter per pooled raider object — identity is stable across reuse
      if (!e.adapter) e.adapter = { pos: e.minion.group.position, take: dmg => this._hitRaider(e, dmg, { color: '#ffd9a0', size: 0.45 }) }
      this._targets.push(e.adapter)
    }
    if (this.boss && this.boss.alive) {
      if (!this._bossAdapter) this._bossAdapter = { pos: this.boss.group.position, take: dmg => this._hitBoss(dmg, '#ffd9a0') }
      this._bossAdapter.pos = this.boss.group.position
      this._targets.push(this._bossAdapter)
    }
    this.turrets.update(gdt, this._targets, this.camera.position)
  }

  // ============================== skills ==============================

  _castSkill(i) {
    if (this.over || this.deadT > 0 || this.cds[i] > 0.001) return
    const def = this.skillDefs[i]
    const fn = this._casters[def.archetype]
    if (!fn) return
    this.cds[i] = def.cd
    this.castCounts[i]++
    this.hud.ability.flash(i)
    this.hero.cast()
    this.ctx.audio.play('cast', { vol: 0.5 })
    fn(def)
  }

  _buildCasters() {
    const audio = this.ctx.audio
    this._casters = {
      dash: def => {
        const pos = this.hero.group.position
        _v1.copy(this.aim).sub(pos)
        _v1.y = 0
        let dist = Math.min(def.params.range, _v1.length())
        if (_v1.lengthSq() < 0.01) {
          _v1.set(Math.sin(this.hero.group.rotation.y), 0, Math.cos(this.hero.group.rotation.y))
          dist = def.params.range
        }
        _v1.normalize()
        const from = pos.clone().setY(1.1)
        _v2.copy(pos).addScaledVector(_v1, dist)
        this._clampToField(_v2, 1.2)
        this.vfx.burst(from, { color: def.color, count: 16, speed: 6, size: 0.24 })
        this.vfx.beam(from, _v2.clone().setY(1.1), { color: def.color, width: 0.32, life: 0.22 })
        pos.x = _v2.x
        pos.z = _v2.z
        _v2.y = 1
        this.vfx.flash(_v2, { color: def.color, size: 2.2 })
        this.iFrames = Math.max(this.iFrames, 0.3)
        audio.play('dash')
      },

      projectile: def => {
        const from = this.hero.castPoint(_v1)
        _v2.copy(this.aim)
        _v2.y = from.y
        _v2.sub(from)
        if (_v2.lengthSq() < 0.01) _v2.set(0, 0, 1)
        _v2.normalize()
        const h = this.vfx.projectile({ from, dir: _v2, speed: def.params.speed, color: def.color, size: 0.9, life: 2.4, light: 2.2, trail: true })
        this.bolts.push({ h, dmg: def.params.damage, r: 0.8, big: { radius: def.params.radius + 1.6, color: def.color }, blaster: false })
        this.vfx.flash(from, { color: def.color, size: 1.6, life: 0.15 })
      },

      slowfield: def => {
        const c = this._clampToField(this.aim.clone(), 1.6)
        const r = def.params.radius
        const g = new THREE.Group()
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(r, 40),
          new THREE.MeshBasicMaterial({ color: new THREE.Color('#c8d4da').multiplyScalar(0.8), transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
        )
        disc.rotation.x = -Math.PI / 2
        const rim = new THREE.Mesh(
          new THREE.RingGeometry(r - 0.24, r, 48),
          new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8f0f4').multiplyScalar(1.9), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
        )
        rim.rotation.x = -Math.PI / 2
        rim.position.y = 0.02
        g.add(disc, rim)
        g.position.set(c.x, 0.05, c.z)
        this.scene.add(g)
        this.vfx.ring(c, { color: def.color, radius: r, life: 0.5 })
        this.frost.push({ x: c.x, z: c.z, r, slow: def.params.slow, dmg: def.params.damage, t: 0, dur: def.params.duration, hit: new Set(), group: g, rim })
      },

      nova: def => {
        const pos = this.hero.group.position
        this.vfx.shockwave(pos, { color: def.color, radius: def.params.radius })
        this.ctx.engine.shake(0.45, 0.4)
        audio.play('explode', { vol: 0.7 })
        const k0 = this.kills
        this._aoeRaiders(pos.x, pos.z, def.params.radius, def.params.damage, { color: def.color, knock: def.params.knock })
        if (this.kills - k0 >= 5) this._annihilation()
      },

      buff: def => {
        this.buffT = def.params.duration
        this.buffTrail?.stop()
        this.buffTrail = this.vfx.trail(this.hero.hips, { color: def.color, size: 0.7, rate: 42, life: 0.4 })
        _v1.copy(this.hero.group.position)
        _v1.y = 1
        this.vfx.flash(_v1, { color: def.color, size: 2.4 })
        audio.play('dash', { vol: 0.7 })
      },

      shield: def => {
        this.shield = { hp: def.params.absorb, max: def.params.absorb, t: def.params.duration }
        this.bubble.visible = true
        audio.play('shield')
        this.vfx.ring(this.hero.group.position, { color: def.color, radius: 2, life: 0.4 })
      },

      heal: def => {
        this.hp = Math.min(100, this.hp + def.params.amount)
        audio.play('heal')
        const pos = this.hero.group.position
        this.vfx.ring(pos, { color: def.color, radius: 2.4, life: 0.5 })
        _v1.copy(pos)
        _v1.y = 1.2
        this.vfx.burst(_v1, { color: def.color, count: 20, speed: 4.5, size: 0.28, gravity: 3, up: 3 })
        _v1.y = 2.2
        this.vfx.text(_v1, `+${def.params.amount}`, { color: def.color, size: 0.9 })
      },

      summon: def => {
        if (this.decoy) this._removeDecoy(false)
        const c = this._clampToField(this.aim.clone(), 1.6)
        const hero = createHero(this.ctx.profile.appearance, { auraRing: true })
        hero.group.position.set(c.x, 0, c.z)
        hero.setState('dance')
        this.scene.add(hero.group)
        this.decoy = { hero, hp: def.params.hp, t: def.params.duration }
        c.y = 1
        this.vfx.flash(c, { color: def.color, size: 2.6 })
        this.vfx.burst(c, { color: def.color, count: 18, speed: 5, size: 0.26 })
      },

      pull: def => {
        const c = this._clampToField(this.aim.clone(), 1.6)
        const r = def.params.radius
        const g = new THREE.Group()
        const mkRing = (ri, ro, op) => {
          const m = new THREE.Mesh(
            new THREE.RingGeometry(ri, ro, 40),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(1.7), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
          )
          m.rotation.x = -Math.PI / 2
          return m
        }
        const r1 = mkRing(r * 0.5, r * 0.58, 0.75)
        const r2 = mkRing(r * 0.82, r * 0.88, 0.55)
        const core = new THREE.Sprite(glowSpriteMaterial(def.color, 0.85))
        core.scale.setScalar(3.2)
        core.position.y = 0.6
        g.add(r1, r2, core)
        g.position.set(c.x, 0.08, c.z)
        this.scene.add(g)
        this.vortices.push({ x: c.x, z: c.z, r, pull: def.params.pull, dmg: def.params.damage, t: 0, dur: def.params.duration, hit: new Set(), group: g, r1, r2 })
      },

      giant: def => {
        this.giantT = def.params.duration
        audio.play('levelup')
        const pos = this.hero.group.position
        this.vfx.ring(pos, { color: def.color, radius: 4, life: 0.5 })
        _v1.copy(pos)
        _v1.y = 1.4
        this.vfx.flash(_v1, { color: def.color, size: 3.2 })
      },

      ghost: def => {
        this.ghostT = def.params.duration
        if (!this._ghostMats) {
          const saved = new Map()
          this.hero.group.traverse(o => {
            if (o.material && o !== this.bubble && !saved.has(o.material)) {
              saved.set(o.material, [o.material.transparent, o.material.opacity])
              o.material.transparent = true
              o.material.opacity = Math.min(o.material.opacity ?? 1, 0.32)
            }
          })
          this._ghostMats = saved
        }
        _v1.copy(this.hero.group.position)
        _v1.y = 1
        this.vfx.flash(_v1, { color: def.color, size: 2.4 })
        audio.play('dash', { vol: 0.5 })
      },

      meteor: def => {
        const c = this._clampToField(this.aim.clone(), 1.6)
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.84, 1, 48),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(1.8), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.set(c.x, 0.06, c.z)
        ring.scale.setScalar(def.params.radius)
        this.scene.add(ring)
        _v1.set(c.x + 7, 32, c.z + 3.5)
        _v2.set(c.x, 0.4, c.z).sub(_v1)
        const dist = _v2.length()
        const h = this.vfx.projectile({ from: _v1, dir: _v2.normalize(), speed: dist / def.params.delay, color: def.color, size: 1.25, life: def.params.delay + 1, light: 3, trail: true })
        this.meteors.push({ x: c.x, z: c.z, h, t: 0, delay: def.params.delay, radius: def.params.radius, dmg: def.params.damage, ring, boomed: false, color: def.color })
      },
    }
  }

  _updateSkills(gdt, dt) {
    for (let i = 0; i < 4; i++) {
      this.cds[i] = Math.max(0, this.cds[i] - gdt)
      this.hud.ability.setCooldown(i, this.cds[i] / this.skillDefs[i].cd, this.cds[i])
      const a = this.skillDefs[i].archetype
      const on = (a === 'buff' && this.buffT > 0) || (a === 'giant' && this.giantT > 0)
        || (a === 'ghost' && this.ghostT > 0) || (a === 'shield' && !!this.shield)
        || (a === 'summon' && !!this.decoy)
      this.hud.ability.setActive(i, on)
    }

    if (this.buffT > 0) {
      this.buffT -= gdt
      if (this.buffT <= 0) {
        this.buffTrail?.stop()
        this.buffTrail = null
      }
    }
    if (this.giantT > 0) this.giantT -= gdt
    if (this.ghostT > 0) {
      this.ghostT -= gdt
      if (this.ghostT <= 0 && this._ghostMats) {
        for (const [m, [tr, op]] of this._ghostMats) {
          m.transparent = tr
          m.opacity = op
        }
        this._ghostMats = null
        _v1.copy(this.hero.group.position)
        _v1.y = 1
        this.vfx.flash(_v1, { color: '#b8ecff', size: 1.8 })
      }
    }
    if (this.shield) {
      this.shield.t -= gdt
      const k = this.shield.hp / this.shield.max
      this.bubble.material.opacity = 0.1 + 0.22 * k
      this.bubble.scale.setScalar(1 + 0.05 * Math.sin(this.hero.t * 6))
      if (this.shield.t <= 0) this._breakShield()
    }
  }

  _breakShield() {
    this.shield = null
    this.bubble.visible = false
    _v1.copy(this.hero.group.position)
    _v1.y = 1
    this.vfx.burst(_v1, { color: '#8ea9ff', count: 20, speed: 6, size: 0.26 })
    this.ctx.audio.play('shield', { vol: 0.4 })
  }

  _updateZones(gdt, dt) {
    // slow multipliers rebuilt every frame from live zones
    for (const e of this.army.active) e.slowMul = 1

    for (let i = this.frost.length - 1; i >= 0; i--) {
      const z = this.frost[i]
      z.t += gdt
      z.rim.material.opacity = 0.6 + 0.3 * Math.sin(z.t * 5)
      if (z.t >= z.dur) {
        this.scene.remove(z.group)
        disposeObject3D(z.group)
        this.frost.splice(i, 1)
        continue
      }
      for (const e of this.army.active) {
        if (!e.alive) continue
        const p = e.minion.group.position
        const dx = p.x - z.x, dz = p.z - z.z
        if (dx * dx + dz * dz > (z.r + 0.4) * (z.r + 0.4)) continue
        e.slowMul = Math.min(e.slowMul, 1 - z.slow)
        if (!z.hit.has(e)) {
          z.hit.add(e)
          this._hitRaider(e, z.dmg, { color: '#cfd8dc' })
        }
      }
    }

    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i]
      v.t += gdt
      v.r1.rotation.z += dt * 4.2
      v.r2.rotation.z -= dt * 2.6
      const k = 1 - v.t / v.dur
      v.group.scale.setScalar(0.5 + 0.5 * k)
      if (v.t >= v.dur) {
        this.vfx.burst(v.group.position, { color: '#c23b2e', count: 20, speed: 7, size: 0.28 })
        this.scene.remove(v.group)
        disposeObject3D(v.group)
        this.vortices.splice(i, 1)
        continue
      }
      for (const e of this.army.active) {
        if (!e.alive) continue
        const p = e.minion.group.position
        const dx = v.x - p.x, dz = v.z - p.z
        const d2 = dx * dx + dz * dz
        if (d2 > v.r * v.r) continue
        const d = Math.sqrt(d2) || 1
        if (d > 0.5) {
          const pull = v.pull * gdt
          p.x += (dx / d) * pull
          p.z += (dz / d) * pull
        }
        if (!v.hit.has(e)) {
          v.hit.add(e)
          this._hitRaider(e, v.dmg, { color: '#d88a8a' })
        }
      }
    }

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i]
      m.t += gdt
      m.ring.material.opacity = 0.35 + 0.35 * Math.sin(m.t * 16)
      m.ring.scale.setScalar(m.radius * (0.55 + 0.45 * Math.min(1, m.t / m.delay)))
      if (!m.boomed && (m.h.pos.y <= 0.55 || !m.h.alive || m.t >= m.delay + 0.4)) {
        m.boomed = true
        m.h.kill()
        _v1.set(m.x, 0, m.z)
        this.vfx.shockwave(_v1, { color: m.color, radius: m.radius + 1 })
        this.vfx.ring(_v1, { color: '#ffffff', radius: m.radius, life: 0.35 })
        this.ctx.engine.shake(0.6, 0.5)
        this.ctx.audio.play('explode', { vol: 0.85 })
        const k0 = this.kills
        this._aoeRaiders(m.x, m.z, m.radius, m.dmg, { color: m.color, knock: 5 })
        if (this.kills - k0 >= 5) this._annihilation()
        this.scene.remove(m.ring)
        m.ring.geometry.dispose()
        m.ring.material.dispose()
        this.meteors.splice(i, 1)
      }
    }
  }

  _updateDecoy(gdt, dt) {
    const d = this.decoy
    if (!d) return
    d.t -= gdt
    d.hero.update(dt)
    if (d.t <= 0 || d.hp <= 0) this._removeDecoy(true)
  }

  _removeDecoy(withVfx) {
    const d = this.decoy
    if (!d) return
    if (withVfx) {
      _v1.copy(d.hero.group.position)
      _v1.y = 1
      this.vfx.flash(_v1, { color: '#b9aed2', size: 2.4 })
      this.vfx.burst(_v1, { color: '#b9aed2', count: 22, speed: 6, size: 0.28 })
      this.ctx.audio.play('explode', { vol: 0.3 })
    }
    this.scene.remove(d.hero.group)
    disposeObject3D(d.hero.group)
    this.decoy = null
  }

  // ============================== waves ==============================

  _updateWaves(gdt) {
    if (this.over) return
    if (this.waveState === 'break') {
      this.breakT -= gdt
      if (this.breakT <= 0) this._startWave(this.wave + 1)
      return
    }
    if (this.spawnQueue.length && this.army.aliveCount() < RAIDER_CAP) {
      this.spawnT -= gdt
      if (this.spawnT <= 0) {
        this.spawnT = 0.55
        const n = Math.min(2, this.spawnQueue.length)
        for (let i = 0; i < n; i++) this._spawnOne(this.spawnQueue.pop())
        this.ctx.audio.play('spawn', { vol: 0.28 })
      }
    }
    if (!this.spawnQueue.length && this.army.active.length === 0 && (!this.boss || !this.boss.alive)) {
      if (this.wave >= WAVE_COUNT) {
        if (!this._winQueued) this._victory()
      } else {
        this.waveState = 'break'
        this.breakT = 3
        this._earnGold(WAVE_BONUS)
        _v1.copy(this.hero.group.position)
        _v1.y = 2.4
        this.vfx.text(_v1, `+${WAVE_BONUS}g`, { color: '#ffd166', size: 1, life: 1.1 })
        this.ctx.audio.play('coin', { vol: 0.6 })
        const perfect = this.wave > 0 && this.citadel.hp >= this._waveCitHp0
        if (perfect) this._perfectWave()
        const next = this.wave + 1
        if (perfect) this._timeout(() => { if (this.waveState === 'break') this._announceWave(next) }, 1250)
        else this._announceWave(next)
      }
    }
  }

  /** The walls took nothing this wave: banner + mild gold + beacon flare. */
  _perfectWave() {
    this.perfectWaves++
    _v1.set(CITADEL_POS.x, 8.6, CITADEL_POS.z)
    this._earnGold(40, _v1) // additive bonus on top of the wave bonus
    this.citadel.beaconFlare()
    this.ctx.audio.play('levelup', { vol: 0.8 })
    this.hud.hud.banner('PERFECT WAVE', { color: '#ffd166', duration: 1.15, sub: '+40g — NOT ONE STONE LOST' })
  }

  _startWave(n) {
    this.wave = n
    this.waveState = 'active'
    this.spawnQueue = buildWaveQueue(n)
    this.spawnT = 0.2
    this._waveCitHp0 = this.citadel.hp
    if (n === BOSS_WAVE) this._spawnBoss()
  }

  _spawnOne(type) {
    this.portalIdx = 1 - this.portalIdx
    const portal = this.env.portals[this.portalIdx]
    portal.flash = 1
    this.army.spawn(type, this.portalIdx === 0 ? 'west' : 'east')
    _v1.set(portal.x, 2, portal.z)
    this.vfx.flash(_v1, { color: '#ff6a2e', size: 2.6, life: 0.3 })
  }

  // ============================== boss ==============================

  _spawnBoss() {
    this.boss = new Colossus(this.scene, {
      heroPos: this.hero.group.position,
      anyTurretAlive: () => this.turrets.anyAlive(),
      slam: pos => this._bossSlam(pos),
      mortarVolley: () => this._mortarVolley(),
      hitCitadel: dmg => {
        this.ctx.engine.shake(0.3, 0.35)
        this.ctx.audio.play('tower', { vol: 0.5 })
        this._damageCitadel(dmg, this.boss.group.position)
      },
      enrage: () => {
        this.hud.hud.banner('ENRAGED', { color: '#c23b2e', duration: 1.6, cls: 'siege-streak' })
        this.ctx.audio.play('kill', { vol: 0.8 })
        this.vfx.ring(this.boss.group.position, { color: '#c23b2e', radius: 6, life: 0.6 })
      },
    })
    const p = this.boss.group.position
    _v1.set(p.x, 4, p.z)
    this.vfx.flash(_v1, { color: '#c23b2e', size: 7, life: 0.5 })
    this.ctx.engine.shake(0.4, 0.6)
    this.ctx.audio.play('spawn', { vol: 0.9 })
    this.hud.showBoss()

    // full entrance cinematic: lights dim, war drums, horizon-march framing,
    // letterboxed name slam. Skippable; world frozen except the boss's march.
    this._clearBanners() // stale wave banners bow out of the shot
    this.phase = 'bossin'
    this.cine = new BossEntrance(this.camera, this.boss)
    this.hud.setCine(true)
    this.exposureT = 0.5
    this.ctx.audio.play('crowd', { vol: 0.6 })
    for (let i = 0; i < 5; i++) {
      this._timeout(() => {
        if (this.phase !== 'bossin') return
        this.ctx.audio.play('tower', { vol: 0.45 + i * 0.07 }) // war drums build
        this.ctx.engine.shake(0.15, 0.22)
      }, 220 + i * 520)
    }
  }

  _bossSlam(pos) {
    this.vfx.shockwave(pos, { color: '#ff5a1e', radius: 6.5 })
    this.ctx.engine.shake(0.5, 0.45)
    this.ctx.audio.play('explode', { vol: 0.65 })
    if (!this.over && this.deadT <= 0 && distXZ(this.hero.group.position, pos) < 6.7) this._damageHero(22, pos, { knock: 7 })
    if (this.decoy && distXZ(this.decoy.hero.group.position, pos) < 6.7) this.decoy.hp -= 22
  }

  _mortarVolley() {
    const alive = this.turrets.pads.filter(p => p.turret && !p.turret.dead)
    if (!alive.length) return
    this.ctx.audio.play('cast', { vol: 0.6 })
    const n = Math.min(this.boss.enraged ? 3 : 2, alive.length)
    for (let i = 0; i < n; i++) {
      const pad = alive[Math.floor(rand(alive.length))]
      const from = this.boss.hero.castPoint(_v1).clone()
      const T = 1.35
      const g = -22
      _v2.set(pad.x + rand(-0.8, 0.8), 0.3, pad.z + rand(-0.8, 0.8)).sub(from).divideScalar(T)
      _v2.y -= 0.5 * g * T
      const speed = _v2.length()
      const h = this.vfx.projectile({ from, dir: _v2.normalize(), speed, color: '#ff5a1e', size: 0.7, life: T + 0.8, gravity: g, trail: true, light: 1.6 })
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 1, 32),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a1e').multiplyScalar(1.7), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.set(pad.x, 0.06, pad.z)
      ring.scale.setScalar(2.4)
      this.scene.add(ring)
      this.mortars.push({ h, ring, t: 0 })
    }
  }

  _updateMortars(gdt) {
    for (let i = this.mortars.length - 1; i >= 0; i--) {
      const m = this.mortars[i]
      m.t += gdt
      m.ring.material.opacity = 0.3 + 0.3 * Math.sin(m.t * 14)
      if (m.h.pos.y <= 0.35 || !m.h.alive || m.t > 2.4) {
        const p = m.h.pos
        m.h.kill()
        this.vfx.ring(p, { color: '#ff5a1e', radius: 2.6, life: 0.4 })
        this.vfx.burst(p, { color: '#ff8a3c', count: 20, speed: 7, size: 0.3 })
        this.ctx.audio.play('explode', { vol: 0.45 })
        for (const pad of this.turrets.pads) {
          if (pad.turret && Math.hypot(pad.x - p.x, pad.z - p.z) < 2.5) this.turrets.take(pad.turret, 32)
        }
        if (!this.over && this.deadT <= 0 && distXZ(this.hero.group.position, p) < 2.6) this._damageHero(10, p, { knock: 3 })
        this.scene.remove(m.ring)
        m.ring.geometry.dispose()
        m.ring.material.dispose()
        this.mortars.splice(i, 1)
      }
    }
  }

  _bossDeath() {
    const boss = this.boss
    if (!boss || !boss.alive) return
    boss.alive = false
    boss.hero.setState('ko')
    boss.tele.visible = false
    this.slowmoT = 1.5
    this.score += 250
    this.kills++
    this.killsByType.colossus = (this.killsByType.colossus || 0) + 1
    this._earnGold(100, boss.group.position)
    const pos = boss.group.position.clone()
    this.ctx.audio.play('kill', { vol: 1 })
    const chain = (delay, r, color) => this._timeout(() => {
      this.vfx.shockwave(pos, { color, radius: r })
      this.ctx.engine.shake(0.55, 0.5)
      this.ctx.audio.play('explode', { vol: 0.7 })
      this._aoeRaiders(pos.x, pos.z, r + 30, 400, { color, knock: 8, hitBoss: false })
    }, delay)
    chain(0, 7, '#c23b2e')
    chain(320, 11, '#ff8c3b')
    chain(640, 16, '#ffd166')
    this.hud.hud.banner('COLOSSUS FELLED', { color: '#ffd166', duration: 2.2 })
    this._timeout(() => {
      this.hud.hideBoss()
      if (this.boss) {
        this.boss.disposeTele()
        this.scene.remove(this.boss.group)
        disposeObject3D(this.boss.group)
        this.boss = null
      }
    }, 2400)
    this._winQueued = true
    this._timeout(() => this._victory(), 2800)
  }

  _updateBoss(gdt) {
    this.boss.update(gdt, !!this.over)
    this.hud.setBoss(Math.max(0, this.boss.hp) / this.boss.maxHp, this.boss.enraged)
  }

  // ============================== projectiles ==============================

  _updateBolts() {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      if (!b.h.alive) { this.bolts.splice(i, 1); continue }
      const bp = b.h.pos
      if (Math.hypot(bp.x, bp.z) > FIELD_R + 10) {
        b.h.kill()
        this.bolts.splice(i, 1)
        continue
      }
      let hit = false
      for (const e of this.army.active) {
        if (!e.alive) continue
        const p = e.minion.group.position
        const rr = b.r + 0.5 * e.def.scale
        const dx = p.x - bp.x, dz = p.z - bp.z
        if (dx * dx + dz * dz > rr * rr || bp.y > 2.4 * e.def.scale) continue
        hit = true
        if (b.big) {
          this.vfx.shockwave(bp, { color: b.big.color, radius: b.big.radius })
          this.ctx.audio.play('explode', { vol: 0.5 })
          this._aoeRaiders(bp.x, bp.z, b.big.radius, b.dmg, { color: b.big.color, knock: 2.5 })
        } else {
          // shieldbearer barrier soaks half of frontal blaster fire
          let dmg = b.dmg
          const vel = b.h.vel
          const vl = Math.hypot(vel.x, vel.z) || 1
          if (b.blaster && RaiderArmy.frontBlocked(e, vel.x / vl, vel.z / vl)) {
            dmg *= 0.5
            e.shieldFlash = 1
            this.vfx.flash(bp, { color: '#c9d4e0', size: 1.1, life: 0.14 })
            this.ctx.audio.play('shield', { vol: 0.16 })
          } else {
            this.vfx.flash(bp, { color: '#ffffff', size: 0.6, life: 0.1 })
          }
          this._hitRaider(e, dmg)
        }
        break
      }
      if (!hit && this.boss && this.boss.alive) {
        const p = this.boss.group.position
        const dx = p.x - bp.x, dz = p.z - bp.z
        if (dx * dx + dz * dz < (b.r + 1.8) * (b.r + 1.8) && bp.y < 7) {
          hit = true
          if (b.big) {
            this.vfx.shockwave(bp, { color: b.big.color, radius: b.big.radius })
            this.ctx.audio.play('explode', { vol: 0.5 })
            this._aoeRaiders(bp.x, bp.z, b.big.radius, b.dmg, { color: b.big.color, knock: 2.5 })
          } else {
            this.vfx.flash(bp, { color: '#ffffff', size: 0.8, life: 0.1 })
            this._hitBoss(b.dmg)
          }
        }
      }
      if (hit) {
        b.h.kill()
        this.bolts.splice(i, 1)
      }
    }
  }

  // ============================== end states ==============================

  _clearBanners() {
    for (const b of this.hud.hud.root.querySelectorAll('.big-banner')) b.remove()
  }

  _victory() {
    if (this.over) return
    this.over = 'won'
    if (this.phase !== 'play') this._endCine()
    this._clearBanners()
    this.hud.setPrompt(null)
    this.hud.setRespawn(null)
    this.hud.setPrepare(null)
    this.ctx.audio.play('victory')
    this.hero.setState('dance')
    this.hero.setMoveSpeed(0)
    const profile = this.ctx.profile
    profile.stats.wins.siege = (profile.stats.wins.siege || 0) + 1
    this.ctx.saveProfile()
    // wave-10 perfect check (the boss path never reaches the wave-clear block)
    if (this.wave >= WAVE_COUNT && this.citadel.hp >= this._waveCitHp0) this.perfectWaves++

    // ---------- the ceremony: dawn breaks, the beacon burns gold ----------
    this.dawnT = 0
    this.exposureT = 1.22
    this.citadel.setVictory()
    this.hud.hud.banner('THE BASTION STANDS', {
      color: '#ffd166', duration: 0, sub: 'DAWN BREAKS OVER THE BURNED CAMPS',
    })
    this._endStatsPanel(true)
    const cit = this.citadel.group.position
    for (let i = 0; i < 6; i++) {
      this._timeout(() => {
        _v1.set(cit.x + rand(-9, 9), rand(2, 9), cit.z + rand(-11, 2))
        this.vfx.burst(_v1, { color: ['#ffd166', '#ff8c3b', '#e8dcc4'][i % 3], count: 26, speed: 7, size: 0.3 })
        this.ctx.audio.play('coin', { vol: 0.4 })
      }, 500 + i * 700)
    }
    this._timeout(() => this.ctx.goTo('hub'), 8000)
  }

  /** Duel-style battle-honors tablet shared by victory + defeat. */
  _endStatsPanel(won) {
    const rows = [
      ['KILLS', `${this.kills} ${this.hud.compHTML(this.killsByType)}`],
      ['GOLD', `${this.goldEarned}g EARNED — ${this.goldSpent}g SPENT`],
      ['BALLISTAS', this.turretsBuilt ? `${this.turretsBuilt} RAISED — TOP LV${this.topTier}` : 'NONE RAISED'],
      ['PERFECT WAVES', String(this.perfectWaves)],
      ['GATE DAMAGE TAKEN', String(Math.round(this.gateDamage))],
      ['FAVORITE ART', this._favoriteArt()],
    ]
    const buttons = won
      ? [{ text: 'RETURN TO HUB', onClick: () => { this.ctx.audio.play('click'); this.ctx.goTo('hub') } }]
      : [
          { text: 'RETRY', onClick: () => { this.ctx.audio.play('click'); this.ctx.goTo('siege') } },
          { text: 'HUB', ghost: true, onClick: () => { this.ctx.audio.play('back'); this.ctx.goTo('hub') } },
        ]
    this.hud.endPanel({
      title: 'BATTLE HONORS',
      sub: won ? `SCORE ${this.score} — 10 WAVES HELD` : `SCORE ${this.score} — FELL ON WAVE ${this.wave}`,
      lose: !won, rows, buttons,
      note: won ? 'returning to the halls shortly…' : '',
    })
  }

  _favoriteArt() {
    let best = 0, idx = -1
    for (let i = 0; i < 4; i++) {
      if (this.castCounts[i] > best) { best = this.castCounts[i]; idx = i }
    }
    if (idx < 0) return '—'
    const def = this.skillDefs[idx]
    return `${def.icon} ${def.name.toUpperCase()} ×${best}`
  }

  _citadelDown() {
    if (this.over) return
    this.over = 'fallen'
    if (this.phase !== 'play') this._endCine()
    this.citadel.hp = 0
    this._clearBanners()
    this.hud.setPrompt(null)
    this.hud.setRespawn(null)
    this.hud.setPrepare(null)
    this.hud.hideBoss()
    this.ctx.audio.play('defeat')
    this.hero.setMoveSpeed(0)
    this.citadel.shatter()

    // the beacon dies: burst chain + shake + fade to ash
    const cp = this.citadel.group.position
    const spire = () => _v1.set(cp.x + rand(-1.5, 1.5), rand(4.5, 8), cp.z + rand(-1.5, 1.5))
    const chain = (delay, size, color) => this._timeout(() => {
      this.vfx.burst(spire(), { color, count: 30, speed: 9, size: 0.34 })
      this.vfx.flash(_v1, { color, size: size * 2.4 })
      this.ctx.engine.shake(0.5, 0.4)
      this.ctx.audio.play('explode', { vol: 0.7 })
    }, delay)
    chain(0, 1.4, '#ffd9a0')
    chain(300, 1.6, '#ff9a4c')
    chain(650, 2, '#fff2d8')
    this._timeout(() => {
      this.vfx.shockwave(cp, { color: '#ff8c3b', radius: 13 })
      this.ctx.engine.shake(0.7, 0.6)
      this.ctx.audio.play('explode', { vol: 0.9 })
      this.hud.fadeOut()
    }, 1000)

    this.hud.hud.banner('CITADEL FALLEN', {
      color: '#ff5c6e', duration: 0,
      sub: `WAVE ${this.wave} — SCORE ${this.score} — ${this.kills} KILLS`,
    })
    this._endStatsPanel(false)
  }

  _jumpWave(n) {
    if (this.over) return
    if (this.phase !== 'play') this._endCine()
    this.spawnQueue.length = 0
    this.army.clearAll()
    if (this.boss) {
      this.boss.disposeTele()
      this.scene.remove(this.boss.group)
      disposeObject3D(this.boss.group)
      this.boss = null
      this.hud.hideBoss()
    }
    this.wave = clamp(n - 1, 0, WAVE_COUNT)
    this.waveState = 'break'
    this.breakT = 0.5
  }

  // ============================== hud / camera ==============================

  _updateHud(dt) {
    this.hud.setCitadel(this.citadel.frac(), this.citadel.hp, this.citadel.maxHp)
    this.hud.setHp(this.hp / 100, this.deadT > 0 ? 'DOWN' : `${Math.ceil(this.hp)} / 100`)
    this.hud.setGold(this.gold)
    this.hud.setCitadelDanger(!this.over && this.citadel.frac() < 0.25)
    this.hud.setRespawn(!this.over && this.deadT > 0 ? this.deadT : null)

    let label, sub
    if (this.over === 'won') { label = 'SIEGE REPELLED'; sub = '' }
    else if (this.over === 'fallen') { label = `WAVE ${this.wave}`; sub = '' }
    else if (this.waveState === 'break') {
      label = `WAVE ${this.wave + 1} / ${WAVE_COUNT}`
      sub = '' // the PREPARE chip carries the countdown
    } else {
      label = `WAVE ${this.wave} / ${WAVE_COUNT}`
      const left = this.spawnQueue.length + this.army.aliveCount() + (this.boss && this.boss.alive ? 1 : 0)
      sub = left > 0 ? `${left} RAIDERS LEFT` : ''
    }
    this.hud.setWave(label, sub)

    // between waves: PREPARE — 3/2/1 chip instead of a bare pause
    const prep = !this.over && this.waveState === 'break' ? Math.max(1, Math.ceil(this.breakT)) : null
    if (this.hud.setPrepare(prep) != null) this.ctx.audio.play('countdown', { vol: 0.16 })
  }

  _updateCamera(dt) {
    const hp = this.hero.group.position
    const m = this.ctx.input.mouse
    _v1.set(hp.x + this.camOffset.x + m.x * 2.6, this.camOffset.y, hp.z + this.camOffset.z - m.y * 2)
    const k = 1 - Math.exp(-7 * dt)
    this.camera.position.lerp(_v1, k)
    _v2.set(hp.x + m.x * 1.9, 0.6, hp.z - m.y * 1.5)
    this._look.lerp(_v2, k)
    this.camera.lookAt(this._look)
  }

  _timeout(fn, ms) {
    const id = setTimeout(() => { if (!this.disposed) fn() }, ms)
    this._timeouts.push(id)
    return id
  }

  dispose() {
    this.disposed = true
    for (const id of this._timeouts) clearTimeout(id)
    this.ctx.engine.setExposure(1.12) // undo boss-dip / dawn grade
    this.hud.setCine(false) // don't leak the cinema class on #ui to the next scene
    this.buffTrail?.stop()
    this.heroTrail?.stop()
    this.vfx.dispose()
  }
}
