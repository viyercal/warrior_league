import * as THREE from 'three'
import '../../ui/hoops.css'
import { createHero } from '../../art/characterFactory.js'
import { VFX } from '../../art/vfx.js'
import { getSkill, WASD_KEY_LABELS } from '../../meta/skills.js'
import { clamp, damp, distXZ, lerp, rand, TAU, v3 } from '../../core/utils.js'
import { buildArena } from './court.js'
import { HoopsBall } from './ball.js'
import { HoopsHud } from './hoopsHud.js'
import { Abilities } from './abilities.js'
import { CpuBrain } from './ai.js'
import { COURT, RULES, isThree } from './constants.js'

const _tmp = new THREE.Vector3()
const _tmp2 = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _look = new THREE.Vector3()

const mkEntity = hero => ({
  hero,
  vel: new THREE.Vector3(),
  wish: new THREE.Vector3(),
  imp: new THREE.Vector3(),
  sprint: false, stamina: 100, staminaLock: false,
  jumpT: 0, jumpDur: 1, jumpH: 0,
  metering: false, meterT: 0, meterDir: 1,
  windup: null, stunT: 0, confuseT: 0,
  scaleCur: 1,
})

/** BLOOD COURT — NBA-Jam-soul 1v1 gladiator ball in a torchlit colosseum. */
export default class HoopsScene {
  constructor(ctx) {
    this.ctx = ctx
    // realism grade: bloom reserved for true fire/embers, neutral saturation,
    // filmic vignette + grain, slight exposure lift so torch pools carry
    this.postOpts = {
      bloom: 0.55, bloomThreshold: 0.92, bloomRadius: 0.45,
      vignette: 0.62, saturation: 1.0, grain: 0.032, exposure: 1.04,
    }
    this._timers = []
  }

  async init() {
    const { engine, profile, audio } = this.ctx
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#0e0a0f')
    this.scene.fog = new THREE.Fog('#151019', 17, 50)   // night haze: distant tiers desaturate + sink
    this.scene.environment = engine.envMap

    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 200)
    this.camera.position.set(0, 5, 13)
    this._camLook = v3(0, 1, -2)

    this.arena = buildArena(this.scene)
    this.vfx = new VFX(this.scene)

    // heroes
    const playerHero = createHero(profile.appearance)
    this.scene.add(playerHero.group)
    const aiHero = createHero({
      primary: '#a1252c', secondary: '#2a2621', glow: '#ff8c3b',
      head: 'classic', hair: 'horns', cape: false,
    })
    this.scene.add(aiHero.group)

    // shared game state
    this.game = {
      t: 0, phase: 'intro', offense: 'player',
      score: { you: 0, cpu: 0 },
      clock: RULES.SHOT_CLOCK,
      streak: 0, onFire: false,
      player: mkEntity(playerHero),
      ai: mkEntity(aiHero),
      ball: null, eff: null,
    }
    this.game.player.hero.group.position.copy(COURT.CHECK)
    this.game.ai.hero.group.position.set(0, 0, 2.4)

    this.ball = new HoopsBall(this.scene)
    this.game.ball = this.ball
    this.ball.bind({ audio, vfx: this.vfx, game: this.game })
    this.ball.give('player')

    // HUD + abilities
    this.hud = new HoopsHud(audio)
    const bar = this.hud.hud.abilityBar(profile.loadout.map(getSkill), { game: 'hoops', keys: WASD_KEY_LABELS })
    this.abilities = new Abilities({
      scene: this.scene, game: this.game, vfx: this.vfx, audio, engine,
      appearance: profile.appearance,
      helpers: {
        toast: m => this.hud.toast(m),
        banner: (t, o) => this.hud.announce(t, o),
        cometSlam: v => this._cometSlam(v),
      },
    }, profile, bar)

    this.brain = new CpuBrain({
      game: this.game,
      helpers: {
        aiStartShot: kind => this._aiStartShot(kind),
        aiStealAttempt: () => this._aiStealAttempt(),
        aiJump: () => this._startJump(this.game.ai, 0.55, 0.95),
        aiCrossover: dir => this._aiCrossover(dir),
      },
    })

    this._wireInput()
    this.hud.setScore(0, 0)
    this.hud.setPossession('player')
    this.arena.jumbo.set({ you: 0, cpu: 0, clock: RULES.SHOT_CLOCK, poss: 'player' })
    this._lastClockInt = RULES.SHOT_CLOCK

    audio.music('court')
    this._crowdAmbT = rand(10, 18)
    this._pendingShot = null
    this._aiPending = null
    this._dunk = null
    this._madeT = 0
    this._checkT = 0
    this._countdownStarted = false
    this._doubleTap = { KeyA: -9, KeyD: -9 }
    this._stealCd = 0
    this._starfireFlight = false

    profile.stats.plays.hoops = (profile.stats.plays.hoops || 0) + 1
    this.ctx.saveProfile()

    // QA hooks
    this.debug = {
      win: () => this._debugEnd(true),
      lose: () => this._debugEnd(false),
      score: (side = 'you', pts = 2) => this._score(side, pts, {}),
      give: side => { this.game.offense = side; this.ball.give(side); this.game.phase = 'live'; this.game.clock = RULES.SHOT_CLOCK },
      snapshot: () => ({
        phase: this.game.phase, offense: this.game.offense,
        score: { ...this.game.score }, clock: this.game.clock,
        onFire: this.game.onFire, ball: this.ball.state, holder: this.ball.holder,
      }),
    }
  }

  /* ------------------------------ input ------------------------------ */

  _wireInput() {
    const { input, audio } = this.ctx
    input.onKey((code, down) => {
      const g = this.game
      if (down && code === 'KeyH') this.hud.toggleHints()
      if (g.phase === 'end') return
      const ki = this.abilities.keyIndex(code)
      if (down && ki >= 0) this.abilities.cast(ki)

      if (code === 'Space') {
        if (down) this._onSpaceDown()
        else this._onSpaceUp()
      }
      if (down && code === 'KeyF') this._playerStealAttempt()
      if (down && (code === 'KeyA' || code === 'KeyD')) {
        const now = g.t
        if (now - this._doubleTap[code] < 0.28) this._crossover(code === 'KeyA' ? -1 : 1)
        this._doubleTap[code] = now
      }
      void audio
    })
  }

  _onSpaceDown() {
    const g = this.game
    const p = g.player
    if (g.phase !== 'live') return
    if (g.offense === 'player' && this.ball.holder === 'player') {
      const P = p.hero.group.position
      if (g.eff.novaArmed) return this._startDunk('nova')
      if (g.eff.titanT > 0 && !isThree(P)) return this._startDunk('titan')
      if (!p.metering) {
        p.metering = true
        p.meterT = 0
        p.meterDir = 1
        this.hud.meterShow()
      }
    } else if (g.offense === 'ai' && p.jumpT <= 0) {
      this._startJump(p, 0.6, 1.05)   // jump block
      this.ctx.audio.play('dash', { vol: 0.2 })
    }
  }

  _onSpaceUp() {
    const p = this.game.player
    if (p.metering) this._releaseShot()
  }

  _crossover(dir) {
    const g = this.game
    const p = g.player
    if (g.phase !== 'live' || p.metering) return
    this._camBasis()
    p.imp.addScaledVector(_tmp2, dir * 7.5)
    this.ctx.audio.play('dash', { vol: 0.4 })
    if (this.ball.holder === 'player') this.ball.hesitate = 0.28
    this.vfx.ring(p.hero.group.position, { color: this.ctx.profile.appearance.glow, radius: 1.2, life: 0.25 })
  }

  _playerStealAttempt() {
    const g = this.game
    if (g.phase !== 'live' || g.offense !== 'ai' || this.ball.holder !== 'ai') return
    if (this._stealCd > 0) return
    this._stealCd = 0.9
    const p = g.player
    p.hero.cast()
    this.ctx.audio.play('zap', { vol: 0.35 })
    const d = distXZ(p.hero.group.position, g.ai.hero.group.position)
    if (d < 1.75 && Math.random() < (g.ai.windup ? 0.2 : 0.55)) {
      this.vfx.impact(this.ball.pos, { color: '#ffb84d', size: 0.8 })
      this.hud.announce('STEAL!', { color: '#ffb84d', duration: 1.1 })
      this.ctx.audio.play('kill', { vol: 0.4 })
      g.ai.windup = null
      this._resetCheck('player', 'CLEAN PICK')
    }
  }

  /* ------------------------------ shooting ------------------------------ */

  _contest() {
    const g = this.game
    if (g.eff.ghostT > 0) return 0
    const d = distXZ(g.player.hero.group.position, g.ai.hero.group.position)
    if (d > 2.6) return 0
    let c = (2.6 - d) / 2.6
    if (g.ai.jumpT > 0) c *= 1.7
    return Math.min(c, 1.2)
  }

  _band() {
    const g = this.game
    const P = g.player.hero.group.position
    const dist = distXZ(P, COURT.RIM_FLOOR)
    let halfW = 0.115 - dist * 0.0065 - this._contest() * 0.06
    if (g.eff.starfire) halfW += 0.05
    if (g.onFire) halfW += 0.03
    return { center: 0.7, halfW: clamp(halfW, 0.025, 0.17), dist }
  }

  _releaseShot() {
    const g = this.game
    const p = g.player
    p.metering = false
    this.hud.meterHide()
    const { center, halfW, dist } = this._band()
    const contest = this._contest()
    const diff = Math.abs(p.meterT - center)
    const perfect = diff <= halfW
    const good = diff <= halfW * 2.2
    let acc = clamp(0.92 - dist * 0.05 - contest * 0.38, 0.05, 0.97)
    if (g.eff.starfire) acc = Math.min(0.98, acc + 0.4)
    if (g.onFire) acc += 0.12
    const make = perfect || (good && Math.random() < acc)
    const val = isThree(p.hero.group.position) ? 3 : 2
    const quality = perfect ? 'perfect' : good ? 'good' : 'bad'
    this.hud.meterResult(quality)
    if (g.onFire && val === 3 && dist > 7.6) this.hud.announce('HEAT CHECK', { color: '#ff8c3b', duration: 1.2 })
    this._starfireFlight = g.eff.starfire
    g.eff.starfire = false
    this._startJump(p, 0.62, 1.0)
    this._pendingShot = { t: 0.18, make, perfect, val, dist, quality, shooter: 'player' }
    p.hero.cast()
    // defender contests the release when close (outcome already locked — pure pressure)
    const ai = g.ai
    if (g.eff.ghostT <= 0 && ai.jumpT <= 0 && !ai.stunT &&
        distXZ(p.hero.group.position, ai.hero.group.position) < 2.8 && Math.random() < 0.65) {
      this._startJump(ai, 0.55, 0.95)
    }
  }

  _launchShot(shot) {
    const g = this.game
    const from = this.ball.pos.clone()
    let target, lateralError = 0
    if (shot.make) {
      target = COURT.RIM.clone().add(_tmp.set(0, 0.02, 0))
    } else {
      const a = rand(TAU)
      const r = shot.quality === 'bad' ? rand(0.24, 0.34) : rand(0.2, 0.27)
      target = COURT.RIM.clone().add(_tmp.set(Math.cos(a) * r, 0.05, Math.sin(a) * r))
      lateralError = 0.3
    }
    const T = clamp(0.8 + shot.dist * 0.052, 0.9, 1.5)
    if (this._starfireFlight && shot.shooter === 'player') this.ball.setFire(true)
    this.ball.shoot({ from, target, time: T, lateralError, onArrive: () => this._arrive(shot) })
    void g
  }

  _arrive(shot) {
    const g = this.game
    const starfire = this._starfireFlight && shot.shooter === 'player'
    this._starfireFlight = false
    if (shot.make) {
      this.arena.netFlare()
      if (starfire) {
        this.vfx.impact(COURT.RIM, { color: '#ffb454', size: 1.6 })
        this.vfx.shockwave(COURT.RIM_FLOOR, { color: '#ffb454', radius: 3.5 })
        this.ctx.audio.play('explode', { vol: 0.5 })
      }
      this.ball.dropThrough()
      if (!g.onFire) this.ball.setFire(false)
      this._score(shot.shooter === 'player' ? 'you' : 'cpu', shot.val, { perfect: shot.perfect })
    } else {
      this.ctx.audio.play('rim', { vol: 0.6 })
      this.vfx.impact(COURT.RIM, { color: '#ff8a3c', size: 0.7 })
      this.ball.bounceOut(shot.quality === 'bad' ? 1.35 : 1)
      if (!g.onFire) this.ball.setFire(false)
      if (shot.shooter === 'player') {
        g.streak = 0
        if (g.onFire) {
          g.onFire = false
          this.ball.setFire(false)
          this.hud.setFire(false)
          g.player.hero.ring.visible = false
          this.hud.toast('FIRE EXTINGUISHED')
        }
      }
    }
  }

  /* ------------------------------ AI actions ------------------------------ */

  _aiStartShot(kind) {
    const ai = this.game.ai
    if (ai.windup || this.ball.holder !== 'ai') return
    ai.windup = { t: kind === 'layup' ? 0.34 : 0.48, kind }
    ai.hero.cast()
  }

  _aiRelease(kind) {
    const g = this.game
    const ai = g.ai
    const p = g.player
    const A = ai.hero.group.position
    const dist = distXZ(A, COURT.RIM_FLOOR)
    const val = isThree(A) ? 3 : 2
    const dp = distXZ(A, p.hero.group.position)

    // player block window: mid-rise jump, close
    if (p.jumpT > 0 && dp < 2.35) {
      const k = 1 - p.jumpT / p.jumpDur
      if (k > 0.05 && k < 0.72) {
        this.hud.announce('DENIED!', { color: '#ffb84d', duration: 1.4 })
        this.ctx.audio.play('hit')
        this.ctx.audio.play('crowd', { vol: 0.4 })
        this.ctx.engine.shake(0.3, 0.3)
        _tmp.copy(A).sub(COURT.RIM_FLOOR).setY(0).normalize()
        this.ball.swat(_tmp.multiplyScalar(rand(4, 6)).setY(rand(2.5, 4)))
        this.vfx.impact(this.ball.pos, { color: '#ffb84d', size: 1.1 })
        return
      }
    }

    const rubber = clamp((g.score.you - g.score.cpu) * 0.022, 0, 0.13)
    let acc = kind === 'layup' ? 0.9 - dist * 0.02 : 0.86 - dist * 0.052
    acc += rubber
    if (dp < 2.2) acc -= p.jumpT > 0 ? 0.3 : 0.13
    const make = Math.random() < clamp(acc, 0.08, 0.95)
    this._startJump(ai, 0.58, kind === 'layup' ? 0.8 : 0.95)
    this._aiPending = { t: 0.14, make, perfect: false, val, dist, quality: make ? 'good' : 'bad', shooter: 'ai' }
  }

  _aiCrossover(dir) { // lateral burst when the CPU starts a drive
    const ai = this.game.ai
    const A = ai.hero.group.position
    _tmp.copy(COURT.RIM_FLOOR).sub(A).setY(0).normalize()
    ai.imp.addScaledVector(_tmp2.set(-_tmp.z, 0, _tmp.x), dir * 6.5)
    this.ctx.audio.play('dash', { vol: 0.25 })
    this.vfx.ring(A, { color: '#c23b2e', radius: 1.1, life: 0.22 })
  }

  _aiStealAttempt() {
    const g = this.game
    if (g.phase !== 'live' || this.ball.holder !== 'player' || g.player.metering) return
    if (g.eff.aegisT > 0 || g.eff.ghostT > 0) {
      this.vfx.flash(_tmp.copy(g.player.hero.group.position).setY(1.2), { color: '#8c939f', size: 1.6 })
      return // unstealable
    }
    g.ai.hero.cast()
    if (Math.random() < 0.42) {
      this.ctx.audio.play('zap', { vol: 0.4 })
      this.hud.announce('STOLEN!', { color: '#c23b2e', duration: 1.2 })
      this._resetCheck('ai', 'CPU BALL')
    }
  }

  /* ------------------------------ scoring / possession ------------------------------ */

  _score(side, val, { perfect = false, dunk = false, comet = false, banner = null } = {}) {
    const g = this.game
    if (g.phase === 'end') return
    g.score[side === 'you' ? 'you' : 'cpu'] += val
    const you = side === 'you'
    this.hud.setScore(g.score.you, g.score.cpu)
    this.arena.jumbo.set({ you: g.score.you, cpu: g.score.cpu, clock: g.clock, poss: g.offense })
    this.arena.crowd.hype(you ? 1 : 0.35)
    this.ctx.audio.play('swish', { vol: 0.7 })
    if (you) this.ctx.audio.play('crowd', { vol: 0.5, delay: 0.1 })

    const rimTop = COURT.RIM.clone().setY(COURT.RIM.y + 0.6)
    this.vfx.text(rimTop, `+${val}`, { color: you ? '#ffb84d' : '#c23b2e', size: 1.3 })
    if (banner) this.hud.announce(banner, { color: '#ffb84d', duration: 1.6 })
    else if (perfect) this.hud.announce('FLAWLESS!', { color: '#ffb84d', duration: 1.3 })
    if (dunk || comet) this.arena.netFlare()

    if (you) {
      g.streak++
      if (g.streak >= 3 && !g.onFire) {
        g.onFire = true
        this.hud.setFire(true)
        this.hud.announce('ON FIRE!', { color: '#ff8c3b', sub: 'THE FORGE BURNS IN YOU', duration: 2 })
        this.ctx.audio.play('levelup')
        this.ball.setFire(true)
        g.player.hero.ring.visible = true
      }
    }

    if (g.score.you >= RULES.TARGET || g.score.cpu >= RULES.TARGET) {
      return this._finish(g.score.you >= RULES.TARGET)
    }
    // make-it-take-it: scorer checks up again
    g.phase = 'made'
    this._madeT = 1.15
    this._nextOffense = you ? 'player' : 'ai'
  }

  _cometSlam(value) {
    const g = this.game
    if (g.phase !== 'live' || g.phase === 'end') return
    this.hud.announce('SKYFALL SLAM!', { color: '#ff8c3b', duration: 1.8 })
    this._confetti(COURT.RIM)
    this.ball.dropThrough()
    this._score('you', value, { comet: true })
  }

  _startDunk(kind) {
    const g = this.game
    const p = g.player
    g.eff.novaArmed = false
    p.metering = false
    this.hud.meterHide()
    g.phase = 'dunk'
    this._dunk = {
      t: 0, dur: 0.62, kind,
      from: p.hero.group.position.clone(),
      to: v3(COURT.RIM_FLOOR.x, 0, COURT.RIM_FLOOR.z + 0.5),
    }
    this.ctx.audio.play('dash')
    p.hero.cast()
  }

  _finishDunk() {
    const g = this.game
    const titan = this._dunk.kind === 'titan'
    this._dunk = null
    if (titan) g.eff.titanT = 0
    this.ctx.engine.shake(titan ? 0.85 : 0.5, 0.5)
    this.ctx.audio.play('explode', { vol: 0.7 })
    this.ctx.audio.play('crowd', { vol: 0.7, delay: 0.05 })
    this.arena.netFlare()
    this.arena.crowd.hype(1.4)
    this.vfx.shockwave(COURT.RIM_FLOOR, { color: titan ? '#ff5a26' : '#ffb84d', radius: 5.5 })
    this.vfx.impact(COURT.RIM, { color: '#ffb84d', size: 1.8 })
    this.ball.dropThrough()
    g.phase = 'live' // _score flips to 'made'
    this._score('you', 2, { dunk: true, banner: titan ? 'COLOSSUS SLAM!' : 'SLAM DUNK!' })
  }

  _turnover(newOffense, msg) {
    this.ctx.audio.play('whistle', { vol: 0.5 })
    this._resetCheck(newOffense, msg)
  }

  _resetCheck(offense, msg = null) {
    const g = this.game
    if (g.phase === 'end') return
    g.phase = 'check'
    this._checkT = 0.95
    g.offense = offense
    g.clock = RULES.SHOT_CLOCK
    g.eff.novaArmed = false
    g.player.metering = false
    g.player.windup = null
    g.ai.windup = null
    this._pendingShot = null
    this._aiPending = null
    this.hud.meterHide()
    this.brain.mode = 'idle'
    this.brain.decideT = 0

    const off = g[offense === 'player' ? 'player' : 'ai']
    const def = g[offense === 'player' ? 'ai' : 'player']
    off.hero.group.position.copy(COURT.CHECK)
    def.hero.group.position.set(0, 0, 2.5)
    off.vel.set(0, 0, 0); def.vel.set(0, 0, 0)
    off.imp.set(0, 0, 0); def.imp.set(0, 0, 0)
    this.ball.give(offense)
    this.hud.setPossession(offense)
    this.arena.jumbo.set({ you: g.score.you, cpu: g.score.cpu, clock: g.clock, poss: offense })
    this.hud.announce('CHECK', {
      color: offense === 'player' ? '#ffb84d' : '#c23b2e',
      sub: msg || (offense === 'player' ? 'YOUR BALL' : 'CPU BALL'), duration: 0.85,
    })
    this.ctx.audio.play('whistle', { vol: 0.35 })
  }

  /* ------------------------------ end states ------------------------------ */

  _debugEnd(won) {
    const g = this.game
    if (g.phase === 'end') return
    g.score[won ? 'you' : 'cpu'] = RULES.TARGET
    this.hud.setScore(g.score.you, g.score.cpu)
    this._finish(won)
  }

  _finish(won) {
    const g = this.game
    if (g.phase === 'end') return
    g.phase = 'end'
    const { profile, audio } = this.ctx
    if (won) profile.stats.wins.hoops = (profile.stats.wins.hoops || 0) + 1
    this.ctx.saveProfile()
    audio.play(won ? 'victory' : 'defeat')
    audio.play('crowd', { vol: won ? 0.8 : 0.25, delay: 0.15 })
    this.arena.crowd.hype(won ? 2 : 0.5)
    g.player.hero.setMoveSpeed(0)
    g.ai.hero.setMoveSpeed(0)
    g.player.hero.setState(won ? 'dance' : 'ko')
    g.ai.hero.setState(won ? 'ko' : 'dance')
    this.hud.endScreen(won, () => this.ctx.goTo('hub'))
    if (won) {
      for (let i = 0; i < 7; i++) {
        this._later(() => {
          this._confetti(v3(rand(-6, 6), rand(2, 5), rand(-5, 5)))
          this.arena.crowd.hype(1.5)
        }, i * 550)
      }
    }
    this._later(() => this.ctx.goTo('hub'), 8000)
  }

  _confetti(pos) { // ember sparks, not paper
    for (const c of ['#ffb84d', '#ff8c3b', '#c23b2e', '#e8dcc4']) {
      this.vfx.burst(pos, { color: c, count: 18, speed: 6, size: 0.28, life: 1.1, gravity: -6, up: 4 })
    }
  }

  _later(fn, ms) { this._timers.push(setTimeout(fn, ms)) }

  /* ------------------------------ per-frame ------------------------------ */

  update(dt, t) {
    const g = this.game
    g.t += dt

    if (!this._countdownStarted) {
      this._countdownStarted = true
      this.hud.hud.countdown(this.ctx.audio).then(() => {
        if (!this._disposed && g.phase === 'intro') this._resetCheck('player', 'FIRST TO 11')
      })
    }

    // ambience swells
    this._crowdAmbT -= dt
    if (this._crowdAmbT <= 0) {
      this._crowdAmbT = rand(16, 30)
      this.ctx.audio.play('crowd', { vol: 0.14 })
    }

    this._stealCd = Math.max(0, this._stealCd - dt)

    if (g.phase === 'check') {
      this._checkT -= dt
      if (this._checkT <= 0) {
        g.phase = 'live'
        this.ctx.audio.play('go', { vol: 0.25 })
      }
    } else if (g.phase === 'made') {
      this._madeT -= dt
      if (this._madeT <= 0) this._resetCheck(this._nextOffense)
    } else if (g.phase === 'dunk') {
      this._updateDunk(dt)
    }

    if (g.phase === 'live') this._updateLive(dt)

    // shared entity updates
    this._updatePlayerControl(dt)
    this.brain.update(dt)
    this._integrate(g.player, dt, 5.3, true)
    this._integrate(g.ai, dt, 5.0, false)
    this._collide(dt)
    this._facing(dt)

    g.player.hero.update(dt)
    g.ai.hero.update(dt)
    this.ball.update(dt)
    this.abilities.tick(dt)
    this.vfx.update(dt)
    this.arena.tick(dt)
    this._updateHudFrame(dt)
    this._updateCamera(dt)
    void t
  }

  _updateLive(dt) {
    const g = this.game
    // shot clock (a shot already released beats the buzzer)
    const shotUp = this._pendingShot || this._aiPending || g.ai.windup
    if (this.ball.state === 'held' && this.ball.holder === g.offense && !shotUp) {
      g.clock -= dt
      if (g.clock <= 0) {
        this.ctx.audio.play('buzzer')
        this.hud.announce('SHOT CLOCK!', { color: '#ff5c6e', duration: 1.3 })
        return this._turnover(g.offense === 'player' ? 'ai' : 'player', 'TURNOVER')
      }
    }

    // pending launches after jump wind
    if (this._pendingShot) {
      this._pendingShot.t -= dt
      if (this._pendingShot.t <= 0) { this._launchShot(this._pendingShot); this._pendingShot = null }
    }
    if (this._aiPending) {
      this._aiPending.t -= dt
      if (this._aiPending.t <= 0) { this._launchShot(this._aiPending); this._aiPending = null }
    }

    // AI windup countdown
    const ai = g.ai
    if (ai.windup) {
      ai.windup.t -= dt
      if (ai.windup.t <= 0) {
        const kind = ai.windup.kind
        ai.windup = null
        this._aiRelease(kind)
      }
    }

    // loose-ball pickup
    if (this.ball.state === 'loose' && this.ball.pos.y < 2.1) {
      for (const side of ['player', 'ai']) {
        const e = g[side]
        if (distXZ(e.hero.group.position, this.ball.pos) < 1.05) {
          if (side === g.offense) {
            this.ball.give(side)
            g.clock = RULES.SHOT_CLOCK
            this.hud.toast(side === 'player' ? 'OFFENSIVE BOARD!' : 'CPU BOARD')
          } else {
            this.ball.give(side)
            this._resetCheck(side, side === 'player' ? 'REBOUND — YOUR BALL' : 'CPU REBOUND')
          }
          break
        }
      }
    }

    // player shot meter progression
    const p = g.player
    if (p.metering) {
      p.meterT += p.meterDir * dt / 0.95
      if (p.meterT >= 1) { p.meterT = 1; p.meterDir = -1 }
      if (p.meterT <= 0 && p.meterDir < 0) this._releaseShot() // held too long: brick
    }
  }

  _updateDunk(dt) {
    const g = this.game
    const d = this._dunk
    if (!d) { g.phase = 'live'; return }
    d.t += dt
    const k = Math.min(1, d.t / d.dur)
    const e = k * k * (3 - 2 * k)
    const P = g.player.hero.group.position
    P.x = lerp(d.from.x, d.to.x, e)
    P.z = lerp(d.from.z, d.to.z, e)
    P.y = Math.sin(Math.PI * Math.min(k, 0.999)) * 2.0
    g.player.hero.setMoveSpeed(8)
    if (k >= 1) { P.y = 0; this._finishDunk() }
  }

  /* ------------------------------ movement ------------------------------ */

  _camBasis() {
    // out: _fwd = camera forward on XZ, _tmp2 = camera right on XZ
    _fwd.copy(this._camLook).sub(this.camera.position).setY(0).normalize()
    _tmp2.set(-_fwd.z, 0, _fwd.x) // right = fwd x up (y-up, screen-right)
  }

  _updatePlayerControl(dt) {
    const g = this.game
    const p = g.player
    const { input } = this.ctx
    p.wish.set(0, 0, 0)
    if (g.phase === 'live' || g.phase === 'check' || g.phase === 'made') {
      this._camBasis()
      if (input.isDown('KeyW')) p.wish.add(_fwd)
      if (input.isDown('KeyS')) p.wish.sub(_fwd)
      if (input.isDown('KeyD')) p.wish.add(_tmp2)
      if (input.isDown('KeyA')) p.wish.sub(_tmp2)
      if (p.wish.lengthSq() > 0) p.wish.normalize()
      const wantsSprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight')
      const frozen = g.eff?.turboT > 0
      p.sprint = wantsSprint && !p.staminaLock && p.wish.lengthSq() > 0
      if (p.sprint && !frozen) {
        p.stamina -= 21 * dt
        if (p.stamina <= 0) { p.stamina = 0; p.staminaLock = true }
      } else if (!p.sprint) {
        p.stamina = Math.min(100, p.stamina + 13 * dt)
        if (p.staminaLock && p.stamina > 18) p.staminaLock = false
      }
    }
    // sprint trail on the ball
    const sprintingWithBall = p.sprint && this.ball.holder === 'player' && p.vel.length() > 5.4
    this.ball.setSprintTrail(sprintingWithBall, this.ctx.profile.appearance.glow)
  }

  _integrate(e, dt, baseSpeed, isPlayer) {
    const g = this.game
    e.stunT = Math.max(0, e.stunT - dt)
    let speed = baseSpeed
    if (isPlayer) {
      if (e.metering) speed *= 0.4
      if (e.sprint) speed *= 1.45
      if (g.eff?.turboT > 0) speed *= 1.55
      if (g.eff?.titanT > 0) speed *= 1.02
    } else {
      if (e.sprint) speed *= 1.42
      if (e.windup) speed = 0
      // ice patch
      if (g.eff?.ice && distXZ(e.hero.group.position, g.eff.ice.pos) < 2.4) speed *= 0.45
      // simple AI stamina
      if (e.sprint) e.stamina = Math.max(0, e.stamina - 16 * dt)
      else e.stamina = Math.min(100, e.stamina + 11 * dt)
      if (e.stamina < 12) speed *= 0.75
    }
    if (e.stunT > 0) speed = 0

    _tmp.copy(e.wish).multiplyScalar(speed)
    e.vel.x = damp(e.vel.x, _tmp.x, 11, dt)
    e.vel.z = damp(e.vel.z, _tmp.z, 11, dt)
    const P = e.hero.group.position
    P.x += (e.vel.x + e.imp.x) * dt
    P.z += (e.vel.z + e.imp.z) * dt
    e.imp.multiplyScalar(Math.exp(-5.5 * dt))
    P.x = clamp(P.x, COURT.BOUND.minX, COURT.BOUND.maxX)
    P.z = clamp(P.z, COURT.BOUND.minZ, COURT.BOUND.maxZ)

    // jump arc
    if (e.jumpT > 0) {
      e.jumpT = Math.max(0, e.jumpT - dt)
      const k = 1 - e.jumpT / e.jumpDur
      P.y = 4 * e.jumpH * k * (1 - k)
    } else if (g.phase !== 'dunk' || !isPlayer) {
      P.y = 0
    }

    // titan scale
    if (isPlayer) {
      const target = g.eff?.titanT > 0 ? 1.75 : 1
      e.scaleCur = damp(e.scaleCur, target, 5, dt)
      const crouch = e.metering ? 0.9 : 1
      e.hero.group.scale.set(e.scaleCur, e.scaleCur * crouch, e.scaleCur)
    }

    e.hero.setMoveSpeed(Math.hypot(e.vel.x, e.vel.z))
  }

  _startJump(e, dur, h) {
    if (e.jumpT > 0) return
    e.jumpT = dur
    e.jumpDur = dur
    e.jumpH = h
  }

  _collide() {
    const g = this.game
    if (g.eff?.ghostT > 0 || g.phase === 'dunk') return
    const A = g.player.hero.group.position
    const B = g.ai.hero.group.position
    const d = distXZ(A, B)
    if (d < 0.95 && d > 0.001) {
      _tmp.copy(A).sub(B).setY(0).normalize().multiplyScalar((0.95 - d) * 0.5)
      A.add(_tmp)
      B.sub(_tmp)
    }
  }

  _facing(dt) {
    const g = this.game
    const p = g.player
    const ai = g.ai
    const P = p.hero.group.position
    const A = ai.hero.group.position
    if (this.ball.state === 'loose' || this.ball.state === 'drop') {
      p.hero.faceTowards(this.ball.pos, dt)
      ai.hero.faceTowards(this.ball.pos, dt)
    } else if (g.offense === 'player') {
      p.hero.faceTowards(p.metering || this.ball.holder === 'player' ? COURT.RIM_FLOOR : this.ball.pos, dt)
      ai.hero.faceTowards(P, dt)
    } else {
      ai.hero.faceTowards(COURT.RIM_FLOOR, dt, ai.windup ? 20 : 8)
      p.hero.faceTowards(A, dt)
    }
    void P
  }

  /* ------------------------------ camera & HUD ------------------------------ */

  _updateCamera(dt) {
    const g = this.game
    if (g.phase === 'end') {
      this._endCamA = (this._endCamA ?? 0.9) + dt * 0.12
      const a = this._endCamA
      _tmp.set(Math.sin(a) * 10, 4.5, Math.cos(a) * 10)
      this.camera.position.x = damp(this.camera.position.x, _tmp.x, 2, dt)
      this.camera.position.y = damp(this.camera.position.y, _tmp.y, 2, dt)
      this.camera.position.z = damp(this.camera.position.z, _tmp.z, 2, dt)
      this._camLook.x = damp(this._camLook.x, 0, 3, dt)
      this._camLook.y = damp(this._camLook.y, 1, 3, dt)
      this._camLook.z = damp(this._camLook.z, 0, 3, dt)
      this.camera.lookAt(this._camLook)
      return
    }
    const P = g.player.hero.group.position
    const bz = this.ball.pos.z
    const tx = P.x * 0.72
    const tz = clamp(Math.max(P.z, bz), -6, 8.5) + 6.8
    const ty = 4.6
    this.camera.position.x = damp(this.camera.position.x, tx, 3.2, dt)
    this.camera.position.y = damp(this.camera.position.y, ty, 3.2, dt)
    this.camera.position.z = damp(this.camera.position.z, tz, 3.2, dt)
    _look.set(
      P.x * 0.55 + COURT.RIM_FLOOR.x * 0.45,
      1.4,
      P.z * 0.5 + COURT.RIM_FLOOR.z * 0.5,
    )
    this._camLook.x = damp(this._camLook.x, _look.x, 4, dt)
    this._camLook.y = damp(this._camLook.y, _look.y, 4, dt)
    this._camLook.z = damp(this._camLook.z, _look.z, 4, dt)
    this.camera.lookAt(this._camLook)
  }

  _updateHudFrame(dt) {
    const g = this.game
    this.hud.setStamina(g.player.stamina / 100)
    this.hud.setClock(g.clock)
    const ci = Math.ceil(g.clock)
    if (ci !== this._lastClockInt) {
      this._lastClockInt = ci
      this.arena.jumbo.set({ you: g.score.you, cpu: g.score.cpu, clock: g.clock, poss: g.offense })
    }
    const p = g.player
    if (p.metering) {
      const { center, halfW } = this._band()
      _tmp.copy(p.hero.group.position).setY(p.hero.group.position.y + 2.1)
      this.hud.meterUpdate(this.camera, _tmp, p.meterT, center, halfW)
    }
    void dt
  }

  resize() {}

  dispose() {
    this._disposed = true
    for (const id of this._timers) clearTimeout(id)
    this._timers.length = 0
    this.abilities.dispose()
    this.vfx.dispose()
  }
}
