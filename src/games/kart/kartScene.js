import * as THREE from 'three'
import { getSkill, wasdKeyIndex } from '../../meta/skills.js'
import { HUD } from '../../ui/hud.js'
import { VFX } from '../../art/vfx.js'
import { clamp, damp, rand, TAU, distXZ, pick, disposeObject3D } from '../../core/utils.js'
import { buildTrack, TRACK_HALF_W, WALL_DIST } from './track.js'
import { createKartFactory } from './kart.js'
import { AI_ROSTER, initBrain, updateAI } from './racers.js'
import { Items } from './items.js'
import { buildKartHud, fmtTime, ordinal } from './kartHud.js'
import { KartIntro } from './intro.js'
import { RaceDrama } from './drama.js'
import { PodiumCeremony } from './podium.js'
import '../../ui/kart.css'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()

const LAPS = 3
const BASE_MAX = 26
const KART_R = 1.05

/**
 * WAR CHARIOTS — 3-lap death race across the scorched badlands.
 * W/S throttle, A/D steer, SPACE drift, SHIFT boost, 1-4 skills, 3 laps vs 5 AI.
 */
export default class KartScene {
  constructor(ctx) {
    this.ctx = ctx
    // realism grade: only true fire crosses the bloom threshold, natural saturation
    // SSAO benchmarked at -13fps mid-race → left OFF (contact blobs + painted AO instead)
    this.postOpts = { bloom: 0.55, bloomThreshold: 0.92, bloomRadius: 0.42, vignette: 0.52, saturation: 1.02, grain: 0.032, exposure: 1.0 }
  }

  async init() {
    const { engine, input, audio, profile } = this.ctx
    this.scene = new THREE.Scene()
    this.scene.environment = engine.envMap
    this.track = buildTrack(this.scene)
    this.vfx = new VFX(this.scene)
    this.items = new Items(this.scene, this.vfx, audio)

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1000)
    this._look = new THREE.Vector3()
    this._fov = 62

    this._buildKarts()
    this._buildSkills()

    // ---------- race state ----------
    this.state = 'intro'
    this.t = 0
    this.clock = 0
    this.over = null
    this.standings = [...this.karts]
    this.finCount = 0
    this.aiShellT = rand(7, 10)
    this.wrongWayT = 0
    this.sparkT = 0
    this.smokeT = 0
    this.dustT = 0
    this.hitSfxT = 0
    this._timeouts = []
    // presentation flow state (drama systems never touch physics/AI/rules)
    this.timeScale = 1
    this.freezeT = 0
    this.finishCamT = 0
    this._countPending = false
    this._finishHandled = false
    this._lapStart = 0

    // ---------- HUD ----------
    const hud = this.hud = new HUD()
    this.ui = buildKartHud(hud, { skillDefs: this.skillDefs, minimapPts: this.track.minimapPts, audio })
    this.hintBox = hud.hints([
      ['W / ↑', 'Accelerate'], ['A / D', 'Steer'], ['SPACE', 'Hold to drift'],
      ['SHIFT', 'Spend boost'], ['1-4', 'Skills'], ['R', 'Restart (post-race)'],
    ])
    this.ui.registerChrome(this.hintBox)

    // ---------- drama / cinematics ----------
    this.drama = new RaceDrama({
      scene: this.scene, ui: this.ui, audio, track: this.track, player: this.player,
    })
    this.podium = new PodiumCeremony({ scene: this.scene, track: this.track, vfx: this.vfx, audio })
    this.intro = new KartIntro({
      camera: this.camera, track: this.track, karts: this.karts, player: this.player,
      hud, ui: this.ui, audio,
    })
    this.intro.start()

    input.onKey((code, down) => {
      if (!down) {
        if (code === 'Space') this._releaseDrift()
        return
      }
      // ANY key skips the intro flyover straight to the countdown
      if (this.state === 'intro') { this._skipIntro(); return }
      // R restarts once the race is decided (or pre-GO); mid-race it stays the slot-4 skill alias.
      if (code === 'KeyR' && (this.over || this.state !== 'race')) { audio.play('click'); this.ctx.goTo('kart'); return }
      const i = wasdKeyIndex(code)
      if (i >= 0) this._castSkill(i)
      else if (code === 'KeyH') this.hintBox.style.display = this.hintBox.style.display === 'none' ? '' : 'none'
    })

    audio.music('race')
    audio.ambience('race')
    profile.stats.plays.kart = (profile.stats.plays.kart || 0) + 1
    this.ctx.saveProfile()

    this.debug = {
      win: () => this._forceEnd(true),
      lose: () => this._forceEnd(false),
    }
  }

  // ============================== setup ==============================

  _buildKarts() {
    const { profile } = this.ctx
    const factory = createKartFactory()
    const ap = profile.appearance
    this.karts = []

    const mkEntity = (visual, isPlayer, name, mapColor, rowColor) => {
      const k = {
        isPlayer, name, mapColor, color: rowColor,
        visual, group: visual.group,
        heading: 0, speed: 0, steerVis: 0, lean: 0,
        idx: 0, lastS: 0, sCont: 0, progress: 0,
        spinT: 0, spinDir: 1, slickT: 0, damage: 0,
        boostT: 0, boostPower: 10, padCd: 0, ghostT: 0, giantT: 0,
        kv: new THREE.Vector3(),
        finished: false, finishTime: 0,
      }
      this.scene.add(visual.group)
      this.karts.push(k)
      return k
    }

    // player
    const pv = factory.buildKart({
      primary: ap.primary, secondary: ap.secondary, glow: ap.glow,
      driver: 'hero', appearance: ap,
    })
    this.player = mkEntity(pv, true, profile.name || 'YOU', '#ffffff', ap.primary)
    if (ap.trail && ap.trail !== 'none') {
      this.vfx.trail(pv.body, { color: ap.glow, size: 0.34, rate: 10, life: 0.5, jitter: 0.15 })
    }

    // AI
    for (let i = 0; i < 5; i++) {
      const r = AI_ROSTER[i]
      const v = factory.buildKart({ primary: r.primary, secondary: r.secondary, glow: r.glow, minionColor: r.minion })
      const k = mkEntity(v, false, r.name, r.glow, r.primary)
      initBrain(k, i)
    }

    // grid: AI slots 0-4, player slot 5 (back of the grid)
    const slot = (k, i) => {
      const row = Math.floor(i / 2)
      const lat = (i % 2 ? 1 : -1) * 2.3
      const s = -(7 + row * 4.4) / this.track.length
      this.track.posAt(s, _v1)
      this.track.leftAt(s, _v2)
      _v1.addScaledVector(_v2, lat)
      k.group.position.copy(_v1)
      this.track.tanAt(s, _v3)
      k.heading = Math.atan2(_v3.x, _v3.z)
      k.group.rotation.y = k.heading
      k.sCont = s
      k.lastS = ((s % 1) + 1) % 1
      k.idx = Math.floor(k.lastS * this.track.N)
      k.progress = s
    }
    for (let i = 0; i < 5; i++) slot(this.karts[i + 1], i)
    slot(this.player, 5)

    // player driving extras
    Object.assign(this.player, {
      steer: 0, throttle: 0, meter: 0,
      drifting: false, driftDir: 1, driftT: 0, driftOff: 0,
      buffT: 0, pullT: 0, shieldOn: false, shieldT: 0,
    })
    this.decoy = null
    this.flames = null

    // rune-ward shield bubble — faint heat-shimmer dome, not a neon orb
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 22, 16),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffb84d').multiplyScalar(0.95), transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    this.bubble.position.y = 0.8
    this.bubble.visible = false
    this.player.group.add(this.bubble)

    // camera starts facing the grid
    const p = this.player.group.position
    this.camera.position.set(p.x + Math.sin(this.player.heading) * 9, 3.2, p.z + Math.cos(this.player.heading) * 9)
    this._look.set(p.x, 1, p.z)
    this.camera.lookAt(this._look)
  }

  _buildSkills() {
    this.skillDefs = this.ctx.profile.loadout.map(getSkill)
    this.cds = [0, 0, 0, 0]
    this._casters = {
      dash: def => {
        const p = this.player
        _v1.set(Math.sin(p.heading), 0, Math.cos(p.heading))
        _v2.copy(p.group.position).setY(0.7)
        p.group.position.addScaledVector(_v1, def.params.range)
        _v3.copy(p.group.position).setY(0.7)
        this.vfx.beam(_v2, _v3, { color: def.color, width: 0.4, life: 0.25 })
        this.vfx.flash(_v3, { color: def.color, size: 2.6 })
        this.vfx.burst(_v2, { color: def.color, count: 14, speed: 5, size: 0.24 })
        this.ctx.audio.play('dash')
      },
      projectile: def => {
        const p = this.player
        const target = this._kartAhead(p)
        _v1.set(Math.sin(p.heading), 0, Math.cos(p.heading))
        _v2.copy(p.group.position).addScaledVector(_v1, 2).setY(0.7)
        this.items.fireShell({
          from: _v2, dir: _v1.clone(), owner: p, target, homing: true,
          color: def.color, speed: Math.max(def.params.speed, 34),
        })
      },
      slowfield: def => {
        const p = this.player
        _v1.set(Math.sin(p.heading), 0, Math.cos(p.heading))
        _v2.copy(p.group.position).addScaledVector(_v1, -3.4)
        this.items.dropSlick(_v2, { radius: def.params.radius, duration: def.params.duration, owner: p })
      },
      nova: def => {
        const p = this.player.group.position
        this.vfx.shockwave(p, { color: def.color, radius: def.params.radius + 2 })
        this.ctx.engine.shake(0.4, 0.35)
        this.ctx.audio.play('explode', { vol: 0.65 })
        for (const k of this.karts) {
          if (k === this.player) continue
          const d = distXZ(k.group.position, p)
          if (d > def.params.radius + 2.5) continue
          _v1.copy(k.group.position).sub(p).setY(0)
          if (_v1.lengthSq() < 0.01) _v1.set(0, 0, 1)
          _v1.normalize()
          k.kv.addScaledVector(_v1, def.params.knock * 1.7)
          k.slickT = Math.max(k.slickT, 0.7)
          this._damageKart(k, 0.03)
          this.vfx.impact(k.group.position, { color: def.color, size: 0.7 })
        }
      },
      buff: def => {
        this.player.buffT = def.params.duration
        this._startFlames(def.color)
        this.ctx.audio.play('dash', { vol: 0.8 })
        _v1.copy(this.player.group.position).setY(0.8)
        this.vfx.flash(_v1, { color: def.color, size: 2.4 })
      },
      shield: def => {
        this.player.shieldOn = true
        this.player.shieldT = def.params.duration
        this.bubble.visible = true
        this.ctx.audio.play('shield')
        this.vfx.ring(this.player.group.position, { color: def.color, radius: 2.4, life: 0.4 })
      },
      heal: def => {
        const p = this.player
        p.damage = 0
        p.meter = Math.min(100, p.meter + 25)
        this.ctx.audio.play('heal')
        _v1.copy(p.group.position).setY(0.9)
        this.vfx.burst(_v1, { color: def.color, count: 18, speed: 4, size: 0.26, gravity: 3, up: 3 })
        this.vfx.ring(p.group.position, { color: def.color, radius: 2.6, life: 0.5 })
        _v1.y = 2
        this.vfx.text(_v1, 'MENDED!', { color: def.color, size: 0.8 })
      },
      summon: def => {
        this._removeDecoy()
        const factory = createKartFactory()
        const ap = this.ctx.profile.appearance
        const v = factory.buildKart({ primary: ap.primary, secondary: ap.secondary, glow: '#b9d6b2', driver: 'minion', minionColor: '#b9d6b2' })
        v.setGhost(true)
        this.scene.add(v.group)
        this.decoy = { visual: v, group: v.group, sCont: this.player.sCont + 16 / this.track.length, t: def.params.duration }
        this.track.posAt(this.decoy.sCont, v.group.position)
        this.vfx.flash(v.group.position, { color: def.color, size: 2.4 })
        this.ctx.audio.play('spawn', { vol: 0.6 })
      },
      pull: def => {
        this.player.pullT = def.params.duration
        this.vfx.ring(this.player.group.position, { color: def.color, radius: 6, life: 0.55 })
        _v1.copy(this.player.group.position).setY(1)
        this.vfx.flash(_v1, { color: def.color, size: 2.6 })
      },
      giant: def => {
        this.player.giantT = def.params.duration
        this.ctx.audio.play('levelup')
        this.vfx.ring(this.player.group.position, { color: def.color, radius: 4, life: 0.5 })
        this.ctx.engine.shake(0.25, 0.3)
      },
      ghost: def => {
        this.player.ghostT = def.params.duration
        this.player.visual.setGhost(true)
        _v1.copy(this.player.group.position).setY(0.9)
        this.vfx.flash(_v1, { color: def.color, size: 2.2 })
        this.ctx.audio.play('dash', { vol: 0.5 })
      },
      meteor: def => {
        const target = this._kartAhead(this.player) || this._kartBehind(this.player)
        if (!target) return
        this.ctx.audio.play('cast', { vol: 0.7 })
        this.items.castComet(target, { radius: def.params.radius, delay: def.params.delay, color: def.color }, pos => {
          this.vfx.shockwave(pos, { color: def.color, radius: def.params.radius + 1.5 })
          this.ctx.engine.shake(0.55, 0.5)
          this.ctx.audio.play('explode', { vol: 0.85 })
          for (const k of this.karts) {
            if (distXZ(k.group.position, pos) > def.params.radius + 1.2) continue
            if (k.isPlayer && (k.ghostT > 0 || this._consumeShield())) continue
            this._spinOut(k, 1.2, 'comet')
            this._damageKart(k, 0.08)
            _v1.copy(k.group.position).sub(pos).setY(0)
            if (_v1.lengthSq() > 0.01) k.kv.addScaledVector(_v1.normalize(), 7)
          }
        })
      },
    }
  }

  // ============================== helpers ==============================

  _kartAhead(k) {
    const i = this.standings.indexOf(k)
    return i > 0 ? this.standings[i - 1] : null
  }

  _kartBehind(k) {
    const i = this.standings.indexOf(k)
    return i >= 0 && i < this.standings.length - 1 ? this.standings[i + 1] : null
  }

  _damageKart(k, amt) {
    k.damage = clamp(k.damage + amt, 0, 0.3)
  }

  _spinOut(k, dur = 1.2, cause = null) {
    if (k.giantT > 0 || k.ghostT > 0) return
    k.spinT = dur
    k.spinDur = dur
    k.spinDir = Math.random() > 0.5 ? 1 : -1
    if (k.isPlayer) {
      this.ctx.engine.shake(0.35, 0.4)
      this._cancelDrift()
      // wreck cam: an ordnance hit on YOU reads as an event, then you recover
      if (cause === 'shell' || cause === 'comet') this.drama.wreck()
    }
  }

  /** Returns true if the player's shield ate the hit. */
  _consumeShield() {
    const p = this.player
    if (!p.shieldOn) return false
    p.shieldOn = false
    this.bubble.visible = false
    _v1.copy(p.group.position).setY(0.9)
    this.vfx.flash(_v1, { color: '#ffb84d', size: 2.8, life: 0.25 })
    this.vfx.burst(_v1, { color: '#ffb84d', count: 22, speed: 7, size: 0.28 })
    this.ctx.audio.play('shield', { vol: 0.7 })
    return true
  }

  _castSkill(i) {
    if (this.over || this.state !== 'race' || this.cds[i] > 0.001) return
    const def = this.skillDefs[i]
    const fn = this._casters[def.archetype]
    if (!fn) return
    this.cds[i] = def.cd
    this.drama.stats.casts[i]++
    this.ui.ability.flash(i)
    this.player.visual.hero?.cast()
    this.ctx.audio.play('cast', { vol: 0.5 })
    fn(def)
  }

  // ============================== main loop ==============================

  _skipIntro() {
    if (this.state !== 'intro') return
    this.intro.end()
    this._sweep = 1 // count camera holds the settled behind-the-player pose
    this.state = 'count'
    this._countPending = true
  }

  update(dt, t) {
    this.t += dt
    for (const tk of this.track.tickables) tk.tick(dt)
    this.vfx.update(dt)

    // photo-finish freeze-frame: the world holds at the line (fire keeps burning)
    if (this.freezeT > 0) {
      this.freezeT -= dt
      this._updateHud(dt)
      return
    }

    // money-moment slow-mo envelope (1 everywhere outside drama beats)
    this.timeScale = this.drama.tick(dt)
    const gdt = dt * this.timeScale

    // state machine
    if (this.state === 'intro') {
      if (!this.intro.update(dt)) {
        this._sweep = 1
        this.state = 'count'
        this._countPending = true
      }
    }
    if (this._countPending) {
      // deferred one frame so an Escape-to-hub during the intro never leaks a countdown
      this._countPending = false
      this.hud.countdown(this.ctx.audio).then(() => {
        if (this.disposed) return
        this.state = 'race'
        this.ctx.audio.startEngine()
        for (const k of this.karts) if (!k.isPlayer) k.boostT = rand(0.3, 0.7)
      })
    }
    const racing = this.state === 'race'
    if (racing && !this.over) this.clock += gdt

    // driving
    this._updatePlayer(gdt, racing && !this.over)
    this.ctx.audio.setEngine(clamp(this.player.speed / BASE_MAX, 0, 1), this.boosting && racing ? 1 : 0)
    for (const k of this.karts) {
      if (k.onPodium) { this._updateKartVisual(k, dt); continue }
      if (!k.isPlayer && (racing || this.over)) updateAI(k, gdt, this.track, this.player.progress)
      this._integrate(k, gdt)
      this._updateKartVisual(k, gdt)
    }
    if (racing || this.over) this._collide(gdt)
    this._updatePadsRings(gdt)

    // items
    this.items.update(gdt, {
      karts: this.karts,
      decoy: this.decoy,
      t,
      onShellHit: (k, shell) => this._onShellHit(k, shell),
      onSlick: (k, sl) => this._onSlick(k, sl),
    })
    this._updateDecoy(gdt)
    this._updateSkillTimers(gdt)
    if (racing && !this.over) {
      this._updateRace(gdt)
      this.drama.raceTick(dt, this.standings)
    }
    this.podium.update(dt)

    this._updateHud(dt)
    this._updateCamera(dt)

    // shadow sun follows the action (player / flyover camera / podium)
    const anchor = this.state === 'intro' ? this.camera.position
      : this.podium.active ? this.podium.center : this.player.group.position
    this.track.sun.position.copy(anchor).addScaledVector(this.track.sunDir, 130)
    this.track.sun.target.position.copy(anchor)
  }

  // ============================== player driving ==============================

  _updatePlayer(dt, live) {
    const p = this.player
    const input = this.ctx.input

    const throttle = live && (input.isDown('KeyW') || input.isDown('ArrowUp'))
    const brake = live && (input.isDown('KeyS') || input.isDown('ArrowDown'))
    const steerIn = live ? (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) - (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0) : 0
    const driftKey = live && input.isDown('Space')
    const boostKey = live && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'))

    p.steer = damp(p.steer, steerIn, 9, dt)

    // lateral distance to centerline → offroad
    const c = this.track.pos[p.idx]
    const latD = distXZ(p.group.position, c)
    const offroad = latD > TRACK_HALF_W + 0.7
    p.offroad = offroad

    // top speed: damage + offroad + boosts
    const contBoost = p.buffT > 0 || (boostKey && p.meter > 0.5)
    if (boostKey && p.meter > 0.5 && p.buffT <= 0) p.meter = Math.max(0, p.meter - 30 * dt)
    const burst = p.boostT > 0
    let maxV = BASE_MAX * (1 - p.damage) * (offroad ? 0.42 : 1)
    if (contBoost) maxV += 9.5
    if (burst) maxV += p.boostPower
    if (p.pullT > 0) maxV += 6
    if (p.slickT > 0) maxV = Math.min(maxV, 11)
    this.boosting = contBoost || burst

    if (p.spinT > 0) {
      p.speed *= Math.exp(-2.6 * dt)
    } else if (throttle) {
      const acc = this.boosting ? 26 : p.speed < maxV * 0.55 ? 24 : 13
      if (p.speed < maxV) p.speed = Math.min(maxV, p.speed + acc * dt)
      else p.speed = Math.max(maxV, p.speed - 10 * dt)
    } else if (brake) {
      p.speed = Math.max(p.speed - 34 * dt, -8)
    } else {
      p.speed = damp(p.speed, 0, 0.55, dt)
    }
    if (offroad && this.dustT <= 0 && Math.abs(p.speed) > 5) {
      this.dustT = 0.12
      _v1.copy(p.group.position).setY(0.3)
      this.vfx.burst(_v1, { color: '#9c7c5e', count: 5, speed: 2.5, size: 0.3, gravity: 1.5, up: 2 })
    } else if (!offroad && this.dustT <= 0 && p.speed > 17) {
      // packed-earth dust rolling off the rear wheels at pace
      this.dustT = 0.16
      for (const wi of [2, 3]) {
        p.visual.wheelSpins[wi].getWorldPosition(_v1)
        _v1.y = 0.2
        this.vfx.burst(_v1, { color: '#8a7258', count: 2, speed: 1.6, size: 0.26, life: 0.55, gravity: 1.2, up: 1.4 })
      }
    }
    this.dustT -= dt

    // ---------- drift ----------
    if (!p.drifting && driftKey && Math.abs(p.steer) > 0.3 && p.speed > 13 && p.spinT <= 0) {
      p.drifting = true
      p.driftDir = Math.sign(p.steer)
      p.driftT = 0
    }
    if (p.drifting && (!driftKey || p.speed < 7 || p.spinT > 0)) this._releaseDrift()

    const speedK = clamp(Math.abs(p.speed) / 30, 0, 1)
    if (p.spinT <= 0) {
      if (p.drifting) {
        p.driftT += dt
        p.heading += (p.driftDir * 1.3 + p.steer * 1.15) * dt
        p.speed = Math.max(p.speed - 2.4 * dt, 12)
        this.sparkT -= dt
        if (this.sparkT <= 0) {
          this.sparkT = 0.05
          const col = p.driftT > 2.2 ? '#ff5a26' : p.driftT > 1 ? '#ffb84d' : '#e8dcc4'
          for (const wi of [2, 3]) {
            p.visual.wheelSpins[wi].getWorldPosition(_v1)
            _v1.y = 0.12
            this.vfx.burst(_v1, { color: col, count: 3, speed: 3.2, size: 0.17, life: 0.35, gravity: -4, up: 1.6 })
          }
        }
      } else {
        const turnRate = (2.8 - 1.55 * speedK) * p.steer
        p.heading += turnRate * dt * clamp(Math.abs(p.speed) / 5, 0, 1) * (p.speed < 0 ? -1 : 1)
      }
      if (p.slickT > 0) p.heading += Math.sin(this.t * 16) * 1.2 * dt
    }
    p.driftOff = damp(p.driftOff, p.drifting ? p.driftDir * 0.5 : 0, p.drifting ? 5 : 9, dt)

    // pull skill: slipstream toward the kart ahead
    if (p.pullT > 0) {
      const ahead = this._kartAhead(p)
      if (ahead) {
        _v1.copy(ahead.group.position).sub(p.group.position).setY(0)
        if (_v1.lengthSq() > 1) p.kv.addScaledVector(_v1.normalize(), 5 * dt)
      }
    }

    // exhaust flames + smoke while boosting
    if (this.boosting && !this.flames) this._startFlames('#ff8c3b')
    else if (!this.boosting && this.flames && p.buffT <= 0) this._stopFlames()
    if (this.boosting) {
      this.smokeT -= dt
      if (this.smokeT <= 0) {
        this.smokeT = 0.08
        for (const ex of p.visual.exhausts) {
          ex.getWorldPosition(_v1)
          this.vfx.burst(_v1, { color: '#7e7268', count: 2, speed: 1.4, size: 0.26, life: 0.5, gravity: 2.2, up: 0.8 })
        }
      }
    }

    // wrong-way detection
    this.track.tanAt(p.lastS, _v1)
    _v2.set(Math.sin(p.heading), 0, Math.cos(p.heading))
    if (p.speed > 4 && _v1.dot(_v2) < -0.35) this.wrongWayT += dt
    else this.wrongWayT = Math.max(0, this.wrongWayT - dt * 2)
  }

  _releaseDrift() {
    const p = this.player
    if (!p || !p.drifting) return
    p.drifting = false
    const tier = p.driftT > 2.2 ? 2 : p.driftT > 1 ? 1 : 0
    p.driftT = 0
    if (tier === 0 || this.over) return
    p.boostT = Math.max(p.boostT, tier === 2 ? 1.4 : 0.9)
    p.boostPower = tier === 2 ? 12 : 8
    p.meter = Math.min(100, p.meter + (tier === 2 ? 18 : 10))
    this.drama.stats.driftBoosts++
    this.ui.driftFlash(tier === 2 ? 'SUPER BOOST!' : 'BOOST!', tier === 2 ? 'super' : '')
    this.ctx.audio.play('dash', { vol: 0.8 })
    _v1.copy(p.group.position).setY(0.5)
    this.vfx.flash(_v1, { color: tier === 2 ? '#ff5a26' : '#ffb84d', size: 2 })
  }

  _cancelDrift() {
    if (this.player.drifting) {
      this.player.drifting = false
      this.player.driftT = 0
    }
  }

  _startFlames(color) {
    this._stopFlames()
    const ex = this.player.visual.exhausts
    this.flames = [
      this.vfx.trail(ex[0], { color, size: 0.5, rate: 46, life: 0.22, jitter: 0.05 }),
      this.vfx.trail(ex[1], { color, size: 0.5, rate: 46, life: 0.22, jitter: 0.05 }),
    ]
  }

  _stopFlames() {
    if (!this.flames) return
    for (const f of this.flames) f.stop()
    this.flames = null
  }

  // ============================== shared kart integration ==============================

  _integrate(k, dt) {
    const pos = k.group.position
    _v1.set(Math.sin(k.heading), 0, Math.cos(k.heading))
    pos.addScaledVector(_v1, k.speed * dt)
    pos.addScaledVector(k.kv, dt)
    k.kv.multiplyScalar(Math.exp(-3.4 * dt))
    pos.y = 0

    // progress along curve
    k.idx = this.track.nearestIdx(pos, k.idx, k.isPlayer ? 70 : 40)
    const s = k.idx / this.track.N
    let d = s - k.lastS
    if (d > 0.5) d -= 1
    else if (d < -0.5) d += 1
    k.sCont += d
    k.lastS = s
    k.s = s
    k.progress = k.sCont

    // soft wall: clamp lateral distance from centerline
    const c = this.track.pos[k.idx]
    const dx = pos.x - c.x, dz = pos.z - c.z
    const latD = Math.hypot(dx, dz)
    if (latD > WALL_DIST) {
      pos.x = c.x + (dx / latD) * WALL_DIST
      pos.z = c.z + (dz / latD) * WALL_DIST
      k.kv.multiplyScalar(0.3)
      if (k.isPlayer) {
        k.speed *= 0.94
        _v2.copy(pos).setY(0.6)
        this.vfx.flash(_v2, { color: '#ffb84d', size: 1.2, life: 0.15 })
      }
    }

    // AI offroad drag
    if (!k.isPlayer) {
      k.padCd -= dt
      if (latD > TRACK_HALF_W + 0.7) k.speed = Math.min(k.speed, 12)
    } else {
      k.padCd -= dt
    }

    // timers
    if (k.spinT > 0) k.spinT = Math.max(0, k.spinT - dt)
    if (k.slickT > 0) k.slickT = Math.max(0, k.slickT - dt)
    if (k.boostT > 0) k.boostT = Math.max(0, k.boostT - dt)
  }

  _updateKartVisual(k, dt) {
    const v = k.visual
    // spin-out yaw
    let yaw = k.heading
    if (k.spinT > 0) yaw += (1 - k.spinT / (k.spinDur || 1.2)) * TAU * 2 * k.spinDir
    if (k.isPlayer) yaw += k.driftOff
    k.group.rotation.y = yaw

    // lean/roll into corners + drift
    const steer = k.isPlayer ? k.steer : k.steerVis
    const targetLean = steer * 0.13 + (k.isPlayer ? k.driftOff * 0.42 : 0)
    k.lean = damp(k.lean, targetLean, 7, dt)
    v.body.rotation.z = -k.lean
    v.body.rotation.x = clamp((k.isPlayer && this.boosting ? -0.05 : 0) - k.speed * 0.0008, -0.08, 0.02)

    // wheels
    const spin = k.speed / 0.45 * dt
    for (const w of v.wheelSpins) w.rotation.x += spin
    for (const f of v.frontSteer) f.rotation.y = steer * 0.42

    // giant scale
    if (k.isPlayer) {
      const sc = damp(k.group.scale.x, k.giantT > 0 ? 1.75 : 1, 8, dt)
      k.group.scale.setScalar(sc)
    }

    v.poseDriver(dt, { speed: k.speed, steer, dance: !!k.podiumDance })
    if (v.minion) v.minion.setMoving(k.speed > 4)
    // contact shadow eases off slightly at speed (dust lift under the wheels)
    v.under.material.opacity = 0.42 - clamp(k.speed / 45, 0, 1) * 0.1
  }

  // ============================== collisions / pickups ==============================

  _collide(dt) {
    this.hitSfxT -= dt
    for (let i = 0; i < this.karts.length; i++) {
      const a = this.karts[i]
      if (a.ghostT > 0 || a.onPodium) continue
      for (let j = i + 1; j < this.karts.length; j++) {
        const b = this.karts[j]
        if (b.ghostT > 0 || b.onPodium) continue
        const ra = a.isPlayer && a.giantT > 0 ? KART_R * 1.75 : KART_R
        const rb = b.isPlayer && b.giantT > 0 ? KART_R * 1.75 : KART_R
        const pa = a.group.position, pb = b.group.position
        const dx = pb.x - pa.x, dz = pb.z - pa.z
        const d = Math.hypot(dx, dz)
        const min = ra + rb
        if (d >= min || d < 0.001) continue
        const nx = dx / d, nz = dz / d
        const push = (min - d) / 2
        pa.x -= nx * push; pa.z -= nz * push
        pb.x += nx * push; pb.z += nz * push
        // relative approach speed → elastic shunt
        _v1.set(Math.sin(a.heading), 0, Math.cos(a.heading)).multiplyScalar(a.speed).add(a.kv)
        _v2.set(Math.sin(b.heading), 0, Math.cos(b.heading)).multiplyScalar(b.speed).add(b.kv)
        const rel = (_v1.x - _v2.x) * nx + (_v1.z - _v2.z) * nz
        if (rel > 0.5) {
          const imp = Math.min(rel * 0.6, 8)
          a.kv.x -= nx * imp; a.kv.z -= nz * imp
          b.kv.x += nx * imp; b.kv.z += nz * imp
          _v3.set((pa.x + pb.x) / 2, 0.5, (pa.z + pb.z) / 2)
          this.vfx.burst(_v3, { color: '#ffb84d', count: 8, speed: 4, size: 0.2, life: 0.3 })
          if (this.hitSfxT <= 0 && (a.isPlayer || b.isPlayer)) {
            this.hitSfxT = 0.22
            this.ctx.audio.play('hit', { vol: 0.4 })
            if (rel > 6) {
              const pk = a.isPlayer ? a : b
              if (!this._consumeShieldForShunt()) this._damageKart(pk, 0.02)
              this.ctx.engine.shake(0.12, 0.2)
            }
          }
        }
        // giant crushes on contact
        const giant = a.isPlayer && a.giantT > 0 ? a : b.isPlayer && b.giantT > 0 ? b : null
        if (giant) {
          const other = giant === a ? b : a
          if (other.spinT <= 0) {
            this._spinOut(other, 1.2)
            this.ctx.audio.play('explode', { vol: 0.4 })
            this.vfx.impact(other.group.position, { color: '#ff7a45', size: 1 })
          }
        } else {
          // ramming a spun-out kart = brief spin + damage
          for (const [me, them] of [[a, b], [b, a]]) {
            if (me.spinT <= 0 && them.spinT > 0.35 && rel > 4) {
              if (me.isPlayer && this._consumeShield()) continue
              this._spinOut(me, 0.55)
              this._damageKart(me, 0.03)
            }
          }
        }
      }
    }
  }

  /** Big shunts can be eaten by the shield too. */
  _consumeShieldForShunt() {
    return this.player.shieldOn ? this._consumeShield() : false
  }

  _updatePadsRings(dt) {
    // boost pads: everyone can use them
    for (const pad of this.track.pads) {
      for (const k of this.karts) {
        if (k.padCd > 0) continue
        const dx = k.group.position.x - pad.x, dz = k.group.position.z - pad.z
        if (dx * dx + dz * dz < 6.8) {
          k.padCd = 1.3
          k.boostT = Math.max(k.boostT, 1.1)
          k.boostPower = 10
          if (k.isPlayer) {
            this.ctx.audio.play('dash', { vol: 0.9 })
            this.ui.driftFlash('RUNE SURGE!', '')
          }
          _v1.copy(k.group.position).setY(0.4)
          this.vfx.flash(_v1, { color: '#ff8c3b', size: 1.8, life: 0.2 })
        }
      }
    }
    // boost rings: player collects
    const p = this.player
    for (const ring of this.track.rings) {
      if (!ring.active) {
        ring.respawnT -= dt
        if (ring.respawnT <= 0) {
          ring.active = true
          ring.group.visible = true
          ring.group.position.copy(ring.home)
          this.vfx.flash(ring.home, { color: '#ffb84d', size: 1.6, life: 0.25 })
        }
        continue
      }
      // gravity well: rings drift to the player
      if (p.pullT > 0) {
        const d = distXZ(ring.group.position, p.group.position)
        if (d < 14 && d > 1) {
          _v1.copy(p.group.position).setY(1.1).sub(ring.group.position)
          ring.group.position.addScaledVector(_v1.normalize(), 10 * dt)
        }
      }
      if (distXZ(ring.group.position, p.group.position) < 1.9) {
        ring.active = false
        ring.group.visible = false
        ring.respawnT = 6
        p.meter = Math.min(100, p.meter + 18)
        this.ctx.audio.play('coin', { vol: 0.7 })
        this.vfx.burst(ring.group.position, { color: '#ff8c3b', count: 16, speed: 5, size: 0.24, life: 0.5 })
        _v1.copy(ring.group.position).setY(2.2)
        this.vfx.text(_v1, '+18', { color: '#ffb84d', size: 0.7 })
      }
    }
  }

  // ============================== item resolution ==============================

  _onShellHit(k, shell) {
    if (k.ghostT > 0 || k.onPodium) return // phased/ceremony — treat as fizzle
    _v1.copy(k.group.position).setY(0.7)
    if (k.isPlayer && k.giantT > 0) {
      this.vfx.flash(_v1, { color: '#ff7a45', size: 1.6, life: 0.2 })
      return
    }
    if (k.isPlayer && this._consumeShield()) return
    this.vfx.impact(_v1, { color: '#ff5a26', size: 1.2 })
    this.ctx.audio.play('explode', { vol: 0.55 })
    this._spinOut(k, 1.2, 'shell')
    this._damageKart(k, 0.08)
    if (k.isPlayer) this.ctx.engine.shake(0.4, 0.4)
    if (shell.owner === this.player && !k.isPlayer) {
      this.drama.stats.shellsLanded++
      // money moment: your bolt lands square on the RIVAL
      if (k === this.drama.rival && !this.over) this.drama.rivalStruck()
      _v1.y = 2
      this.vfx.text(_v1, 'HIT!', { color: '#ffb84d', size: 0.9 })
    }
  }

  _onSlick(k, sl) {
    if (k.ghostT > 0) return
    if (k.isPlayer && this._consumeShield()) return
    k.slickT = 1.5
    _v1.copy(k.group.position).setY(0.4)
    this.vfx.burst(_v1, { color: '#c8552e', count: 10, speed: 3, size: 0.22, life: 0.4 })
    this.ctx.audio.play('bounce', { vol: 0.3 })
  }

  _updateDecoy(dt) {
    const d = this.decoy
    if (!d) return
    d.t -= dt
    if (d.t <= 0) { this._removeDecoy(true); return }
    // holo-kart drives the racing line ahead of the player
    const speed = Math.max(this.player.speed + 2, 18)
    d.sCont += speed * dt / this.track.length
    if (d.sCont < this.player.sCont + 8 / this.track.length) d.sCont = this.player.sCont + 8 / this.track.length
    this.track.posAt(d.sCont, d.group.position)
    this.track.tanAt(d.sCont, _v1)
    d.group.rotation.y = Math.atan2(_v1.x, _v1.z)
    const spin = speed / 0.45 * dt
    for (const w of d.visual.wheelSpins) w.rotation.x += spin
    d.visual.poseDriver(dt, { speed, steer: 0 })
  }

  _removeDecoy(withVfx = false) {
    const d = this.decoy
    if (!d) return
    if (withVfx) {
      this.vfx.flash(d.group.position, { color: '#b9d6b2', size: 2.2 })
      this.vfx.burst(d.group.position, { color: '#b9d6b2', count: 16, speed: 5, size: 0.24 })
    }
    this.scene.remove(d.group)
    disposeObject3D(d.group)
    this.decoy = null
  }

  _updateSkillTimers(dt) {
    const p = this.player
    for (let i = 0; i < 4; i++) {
      this.cds[i] = Math.max(0, this.cds[i] - dt)
      this.ui.ability.setCooldown(i, this.cds[i] / this.skillDefs[i].cd, this.cds[i])
      const a = this.skillDefs[i].archetype
      const on = (a === 'buff' && p.buffT > 0) || (a === 'shield' && p.shieldOn)
        || (a === 'ghost' && p.ghostT > 0) || (a === 'giant' && p.giantT > 0)
        || (a === 'summon' && !!this.decoy) || (a === 'pull' && p.pullT > 0)
      this.ui.ability.setActive(i, on)
    }
    if (p.buffT > 0) {
      p.buffT -= dt
      if (p.buffT <= 0 && !this.boosting) this._stopFlames()
    }
    if (p.pullT > 0) p.pullT -= dt
    if (p.giantT > 0) p.giantT -= dt
    if (p.ghostT > 0) {
      p.ghostT -= dt
      if (p.ghostT <= 0) {
        p.visual.setGhost(false)
        _v1.copy(p.group.position).setY(0.9)
        this.vfx.flash(_v1, { color: '#d8d2c0', size: 1.8 })
      }
    }
    if (p.shieldOn) {
      p.shieldT -= dt
      this.bubble.material.opacity = 0.14 + 0.08 * Math.sin(this.t * 5)
      if (p.shieldT <= 0) {
        p.shieldOn = false
        this.bubble.visible = false
      }
    }
  }

  // ============================== race logic ==============================

  _updateRace(dt) {
    // standings
    this.standings.sort((a, b) => b.progress - a.progress)
    const pos = this.standings.indexOf(this.player) + 1
    this.ui.posChanged(pos)
    this.playerPos = pos

    // lap milestones
    const lap = Math.floor(Math.max(0, this.player.sCont))
    if (lap !== this._lastLap) {
      // best-lap bookkeeping (ignore sub-realistic laps from debug warps)
      if (this._lastLap !== undefined && lap === this._lastLap + 1) {
        const lt = this.clock - this._lapStart
        if (lt > 15) this.drama.noteLap(lt)
      }
      this._lapStart = this.clock
      if (lap === LAPS - 1 && this._lastLap !== undefined) {
        this.hud.banner('FINAL LAP!', { color: '#ff5a26', duration: 1.6 })
        this.ctx.audio.play('whistle', { vol: 0.7 })
        this.drama.finalLap() // war-horn + drums + torches flare
      } else if (lap > 0 && lap < LAPS) {
        this.ctx.audio.play('go', { vol: 0.4 })
      }
      this._lastLap = lap
    }

    // finishes
    for (const k of this.karts) {
      if (!k.finished && k.sCont >= LAPS) {
        k.finished = true
        k.finishTime = this.clock
        k.finishOrder = ++this.finCount
        if (!k.isPlayer) this.ctx.audio.play('swish', { vol: 0.3 })
      }
    }
    if (this.player.finished) {
      if (this._finishHandled) return
      this._finishHandled = true
      const margin = this._photoMargin()
      if (margin < 0.35) {
        // PHOTO FINISH: freeze the frame at the line before the verdict
        this._photoFired = true
        this.freezeT = 1.1
        for (const b of this.hud.root.querySelectorAll('.big-banner')) b.remove()
        this.hud.banner('PHOTO FINISH', {
          sub: `MARGIN ${Math.max(margin, 0.01).toFixed(2)}s`, color: '#e8dcc4', duration: 1.4,
        })
        this.ctx.audio.play('zap', { vol: 0.35 })
        this.ctx.audio.play('crowd', { vol: 0.75 })
        this._timeout(() => { if (!this.disposed) this._endRace(this.player.finishOrder) }, 1150)
      } else {
        this._endRace(this.player.finishOrder)
      }
      return
    }

    // AI shells: mid-pack fires at the kart ahead every 7-12s
    this.aiShellT -= dt
    if (this.aiShellT <= 0) {
      this.aiShellT = rand(7, 12)
      const cands = this.standings.filter((k, i) => !k.isPlayer && i >= 1 && i <= 4 && k.spinT <= 0 && !k.finished)
      const firer = cands.length ? pick(cands) : null
      const target = firer ? this._kartAhead(firer) : null
      if (firer && target) {
        _v1.copy(target.group.position).sub(firer.group.position).setY(0).normalize()
        _v2.copy(firer.group.position).addScaledVector(_v1, 2).setY(0.7)
        this.items.fireShell({ from: _v2, dir: _v1.clone(), owner: firer, target, homing: false, color: '#ff5a26', speed: 32 })
      }
    }
  }

  /** Seconds separating the player from the nearest other racer at the line. */
  _photoMargin() {
    let m = Infinity
    for (const k of this.karts) {
      if (k.isPlayer) continue
      m = Math.min(m, k.finished
        ? Math.abs(this.player.finishTime - k.finishTime)
        : ((LAPS - k.sCont) * this.track.length) / Math.max(k.speed, 8))
    }
    return m
  }

  _endRace(playerPos) {
    this.ctx.audio.stopEngine()
    if (this.over) return
    this.over = playerPos === 1 ? 'won' : 'done'
    this._finishHandled = true
    this._stopFlames()
    this._cancelDrift()
    this.drama.setRaceOver()
    // money moment: savor the line — slow-mo + a side-profile camera swing
    if (!this._photoFired) this.drama.finishMoment()
    this.finishCamT = 2.6
    const { profile, audio } = this.ctx

    // final rows: finished karts by order, rest by progress with estimated times
    const done = this.karts.filter(k => k.finished).sort((a, b) => a.finishTime - b.finishTime)
    const rest = this.karts.filter(k => !k.finished).sort((a, b) => b.progress - a.progress)
    const order = [...done, ...rest]
    const rows = order.map(k => ({
      name: k.isPlayer ? `${k.name} (YOU)` : k.name,
      color: k.color,
      isPlayer: k.isPlayer,
      time: k.finished
        ? fmtTime(k.finishTime)
        : `+${(((LAPS - k.progress) * this.track.length) / Math.max(k.speed, 10)).toFixed(1)}s`,
    }))

    if (playerPos === 1) {
      profile.stats.wins.kart = (profile.stats.wins.kart || 0) + 1
      audio.play('victory')
      this.hud.banner('VICTORY!', { color: '#ffb84d', sub: 'CHAMPION OF THE WAR CHARIOTS', duration: 3 })
      for (let i = 0; i < 7; i++) {
        this._timeout(() => {
          _v1.copy(this.player.group.position)
          _v1.x += rand(-8, 8); _v1.z += rand(-8, 8); _v1.y = rand(2, 7)
          this.vfx.burst(_v1, { color: pick(['#ffb84d', '#ff8c3b', '#ff5a26', '#e8dcc4']), count: 26, speed: 7, size: 0.3, life: 0.9 })
          this.ctx.audio.play('coin', { vol: 0.35 })
        }, 300 + i * 550)
      }
    } else {
      audio.play(playerPos <= 3 ? 'crowd' : 'defeat', { vol: 0.8 })
      this.hud.banner(`FINISHED ${ordinal(playerPos)}/6`, {
        color: playerPos <= 3 ? '#e8dcc4' : '#c23b2e', sub: 'RISE AGAIN, WARRIOR', duration: 3,
      })
    }
    this.ctx.saveProfile()

    this._timeout(() => {
      if (this.disposed) return
      // PODIUM CEREMONY: cut to the stone podium beside the arch, then the tablet
      this.finishCamT = 0
      this.ui.hideChrome(true) // ceremony frame: standings tablet only
      this.podium.begin({
        top3: order.slice(0, 3), player: this.player,
        camera: this.camera, look: this._look,
      })
      this.ui.finishPanel(rows, {
        playerPos,
        side: true, // ceremony framing: tablet clears the podium blocks
        stats: this.drama.finalStats(this.skillDefs),
        onHub: () => { this.ctx.audio.play('click'); this.ctx.goTo('hub') },
        onRetry: () => { this.ctx.audio.play('click'); this.ctx.goTo('kart') },
      })
    }, 1400)
    this._timeout(() => this.ctx.goTo('hub'), 8000)
  }

  _forceEnd(win) {
    if (this.over) return
    if (this.state === 'intro') this.intro.end() // QA can force-end mid-cinematic
    this._countPending = false
    this.freezeT = 0
    if (this.state !== 'race') this.state = 'race'
    this.standings.sort((a, b) => b.progress - a.progress)
    const p = this.player
    p.finished = true
    p.finishTime = this.clock || 184.2
    if (win) {
      p.finishOrder = 1
      this.finCount = Math.max(this.finCount, 1)
      this._endRace(1)
    } else {
      // fabricate three finishers ahead
      let t = Math.max(this.clock - 6, 20)
      for (const k of this.standings.filter(k => !k.isPlayer).slice(0, 3)) {
        if (!k.finished) { k.finished = true; k.finishTime = t += 1.8; k.finishOrder = ++this.finCount }
      }
      p.finishTime = t + 2.5
      p.finishOrder = ++this.finCount
      this._endRace(p.finishOrder)
    }
  }

  // ============================== hud / camera ==============================

  _updateHud(dt) {
    const p = this.player
    if (!this.over) this.standings.sort((a, b) => b.progress - a.progress)
    const pos = this.standings.indexOf(p) + 1
    this.ui.setPos(pos, 6)
    this.ui.setLap(Math.floor(Math.max(0, p.sCont)) + 1, LAPS)
    this.ui.setClock(this.clock)
    this.ui.setSpeed(p.speed)
    this.ui.setBoost(p.meter / 100)
    this.ui.setDamage(p.damage / 0.3)
    this.ui.wrongWay(this.wrongWayT > 0.7 && !this.over)
    this.ui.speedLines(!!this.boosting && !this.over)
    this.ui.drawMap(this.karts, this.over ? null : this.drama.rival)
  }

  _updateCamera(dt) {
    if (this.state === 'intro') return // the flyover module owns the camera
    const p = this.player
    const pp = p.group.position
    let fovT = 62

    if (this.state === 'count') {
      // slow sweep from head-on to chase during the countdown
      this._sweep = Math.min(1, (this._sweep ?? 0) + dt / 4.4)
      const az = p.heading + Math.PI * (1 - this._sweep) * 0.9
      _v1.set(pp.x - Math.sin(az) * 7.5, 2.6 + (1 - this._sweep) * 1.4, pp.z - Math.cos(az) * 7.5)
      this.camera.position.lerp(_v1, 1 - Math.exp(-4 * dt))
      _v2.set(pp.x, 1.1, pp.z)
      this._look.lerp(_v2, 1 - Math.exp(-6 * dt))
      this.camera.lookAt(this._look)
      return
    }

    if (this.podium.active) {
      // ceremony frame behind the results tablet
      this.podium.updateCamera(this.camera, this._look, dt)
      fovT = 50
    } else if (this.over && this.finishCamT > 0) {
      // finish-line money moment: swing out to a side profile of the chariot
      this.finishCamT -= dt
      _v3.set(Math.sin(p.heading), 0, Math.cos(p.heading))
      _v1.set(pp.x + _v3.z * 8.2, 2.0, pp.z - _v3.x * 8.2) // left of the chariot
      this.camera.position.lerp(_v1, 1 - Math.exp(-4.2 * dt))
      _v2.copy(pp).addScaledVector(_v3, 1.4)
      _v2.y = 1.0
      this._look.lerp(_v2, 1 - Math.exp(-7 * dt))
      this.camera.lookAt(this._look)
      fovT = 55
    } else {
      const speedK = clamp(p.speed / 32, 0, 1)
      const punch = this.drama.punch // money-moment punch-in
      const back = (7.2 + (this.boosting ? 1.3 : 0) + speedK * 0.6) * (1 - punch * 0.3)
      _v3.set(Math.sin(p.heading), 0, Math.cos(p.heading))
      _v1.copy(pp).addScaledVector(_v3, -back)
      _v1.y = 3.4 - punch * 0.9
      this.camera.position.lerp(_v1, 1 - Math.exp(-6.5 * dt))
      _v2.copy(pp).addScaledVector(_v3, 5.5)
      _v2.y = 1.3
      this._look.lerp(_v2, 1 - Math.exp(-9 * dt))
      this.camera.lookAt(this._look)
      // drift roll
      this._roll = damp(this._roll ?? 0, -p.driftOff * 0.3 - p.steer * 0.04, 6, dt)
      this.camera.rotateZ(this._roll)
      // speed/boost FOV kick, tightened by the punch-in
      fovT = 62 + speedK * 9 + (this.boosting ? 6 : 0) - punch * 10
    }
    this._fov = damp(this._fov, fovT, 5, dt)
    this.camera.fov = this._fov
    this.camera.updateProjectionMatrix()
  }

  _timeout(fn, ms) {
    const id = setTimeout(() => { if (!this.disposed) fn() }, ms)
    this._timeouts.push(id)
    return id
  }

  dispose() {
    this.disposed = true
    for (const id of this._timeouts) clearTimeout(id)
    this.ctx.audio.stopEngine()
    this.intro?.end()
    this._stopFlames()
    this.items.dispose()
    this.vfx.dispose()
  }
}
