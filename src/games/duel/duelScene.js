import * as THREE from 'three'
import { BossArts } from '../shared/bossArts.js'
import { getSkill, KEY_CODES } from '../../meta/skills.js'
import { HUD } from '../../ui/hud.js'
import { VFX } from '../../art/vfx.js'
import { clamp, lerp, damp, rand, pick, disposeObject3D } from '../../core/utils.js'
import { buildArena } from './arena.js'
import { DuelFighter, EDGE } from './fighters.js'
import { FightSystem } from './fightSystem.js'
import { DuelSpecials } from './specials.js'
import { DuelAI } from './duelAi.js'
import { SingleDuelAI } from './singleDuelAi.js'
import { DuelHud } from './duelHud.js'
import { TOWER } from './tower.js'
import '../../ui/duel.css'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const P_MARK = -4.2
const F_MARK = 4.2
const ROUND_TIME = 60
const ATTACK_KEYS = ['KeyJ', 'KeyK', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyF']
const smooth = k => k * k * (3 - 2 * k)

/**
 * THE CRUCIBLE — a Mortal-Kombat-style 1v1 tournament fighter. Climb a
 * 4-fight tower of named opponents, best-of-3 rounds, 60s timer. Deep kit:
 * chains, special cancels, juggles with scaling, throws, parry-wards, meter
 * surges, and an over-the-top match-point OBLITERATION finisher.
 */
export default class DuelScene {
  constructor(ctx) {
    this.ctx = ctx
    this.mode = ctx.params.mode
    this.singleOpponent = this.mode === 'single'
      ? { ...TOWER[0], title: `CPU LEVEL ${ctx.cpuDifficulty.level} · ${ctx.cpuDifficulty.label.toUpperCase()}` } : null
    // dark-and-moody grade: bloom for true fire only, filmic grain, deep blacks
    this.postOpts = { bloom: 0.85, bloomThreshold: 0.9, bloomRadius: 0.55, vignette: 0.55, saturation: 1.0, grain: 0.006, exposure: 1.02 }
  }

  async init() {
    const { engine, input, audio, profile } = this.ctx
    this.scene = new THREE.Scene()
    this.scene.environment = engine.envMap
    this.arena = buildArena(this.scene)

    this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 700)
    this.camera.position.set(0, 3.4, 11.5)
    this._look = new THREE.Vector3(0, 1.7, 0)
    this.camera.lookAt(this._look)

    this.vfx = new VFX(this.scene)

    // ---------- fighters ----------
    this.playerName = (profile.name || 'WARLORD').toUpperCase()
    this.player = new DuelFighter({
      scene: this.scene, vfx: this.vfx, audio,
      appearance: profile.appearance, name: this.playerName,
      color: profile.appearance.glow || '#ffb84d', isPlayer: true, spawnX: P_MARK,
    })
    this.foe = null
    this.ai = null

    // ---------- systems ----------
    this.fight = new FightSystem({
      vfx: this.vfx, audio, engine,
      events: {
        onHit: (a, d, info) => this._onHit(a, d, info),
        onComboEnd: (d, hits, dmg, reason) => this._onComboEnd(d, hits, dmg, reason),
        onParry: (d, a) => this._onParry(d, a),
        onKO: (a, d) => this._onKO(a, d),
      },
    })
    this.specials = new DuelSpecials({ scene: this.scene, vfx: this.vfx, audio, engine, fight: this.fight })

    // ---------- player skills ----------
    this.skillDefs = profile.loadout.map(getSkill)
    this.cds = [0, 0, 0, 0]

    // ---------- flow state ----------
    this.phase = 'cine'
    this.gen = 0             // flow generation guard for timeouts
    this.stage = 0
    this.roundIdx = 0
    this.playerWins = 0
    this.foeWins = 0
    this.roundT = ROUND_TIME
    this.slowmoT = 0
    this.slowmoScale = 0.25
    this.timeScale = 1
    this.cineT = 0
    this.promptT = 0
    this.orbit = 0
    this.orbitTarget = 0
    this.punch = 0
    this._camY = 0           // damped vertical midpoint — falls can't yank the camera
    this.exposure = 1.12
    this.exposureT = 1.12
    this._timeouts = []
    this._crowdCombo = false
    this._vsRemove = null
    this._oblitRemove = null
    this._panel = null
    this.over = null

    // ---------- input ----------
    this._buf = { jump: false, light: false, heavy: false, throw: false, dash: 0 }
    this._pIntent = { move: 0, crouch: false, block: false, jump: false, light: false, heavy: false, throw: false, dash: 0 }
    this._zero = { move: 0, crouch: false, block: false, jump: false, light: false, heavy: false, throw: false, dash: 0 }
    this._tapA = -9
    this._tapD = -9
    this.moveTargetX = null
    this._moveRay = new THREE.Raycaster()
    this._movePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    this.moveMarker = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), new THREE.MeshBasicMaterial({ color: '#dfbf87', depthWrite: false, side: THREE.DoubleSide }))
    this.moveMarker.rotation.x = -Math.PI / 2
    this.moveMarker.visible = false
    this.scene.add(this.moveMarker)
    input.onReset(() => {
      this._cancelMouseMove()
      this._tapA = this._tapD = -Infinity
      Object.assign(this._buf, { jump: false, light: false, heavy: false, throw: false, dash: 0 })
    })
    input.onKey((code, down) => {
      if (!down) return
      if (this.phase === 'cine' || this.phase === 'bossin') { this.cineT = 99; return } // skippable
      if (this.phase === 'oblitPrompt' && ATTACK_KEYS.includes(code)) { this._runFinisher(); return }
      if (this.phase !== 'fight') return
      if (['KeyA', 'KeyD', 'KeyS', 'Space', 'ShiftLeft', 'ShiftRight', ...ATTACK_KEYS].includes(code)) this._cancelMouseMove()
      const now = this.ctx.engine.elapsedTime
      if (code === 'Space') this._buf.jump = true
      else if (code === 'KeyJ') this._buf.light = true
      else if (code === 'KeyK') this._buf.heavy = true
      else if (code === 'KeyF') this._buf.throw = true
      else if (code === 'KeyA') { if (now - this._tapA < 0.27) this._buf.dash = -1; this._tapA = now }
      else if (code === 'KeyD') { if (now - this._tapD < 0.27) this._buf.dash = 1; this._tapD = now }
      else if (code === 'KeyH') this.hud.toggleHints()
      else {
        const i = KEY_CODES.indexOf(code)
        if (i >= 0) this._castSkill(i)
      }
    })
    input.onMouse((button, down) => {
      if (button !== 2 || !down) return
      if (this.phase === 'cine' || this.phase === 'bossin') { this.cineT = 99; return }
      if (this.phase !== 'fight' || this.player.hp <= 0) return
      // Intersect the fighting lane, not the floor, so clicks at any height
      // map to the intended horizontal position in this side-on camera.
      this._moveRay.setFromCamera(input.mouse, this.camera)
      if (!this._moveRay.ray.intersectPlane(this._movePlane, _v1)) return
      this.moveTargetX = clamp(_v1.x, -EDGE, EDGE)
      const p = this.player, f = this.foe
      if (f?.grounded && p.grounded && (f.pos.x - p.pos.x) * (this.moveTargetX - f.pos.x) >= 0) {
        const side = Math.sign(f.pos.x - p.pos.x) || p.facing
        this.moveTargetX = clamp(f.pos.x - side * 0.95, -EDGE, EDGE)
      }
      this.moveMarker.position.set(this.moveTargetX, 0.06, 0)
      this.moveMarker.visible = true
    })

    // ---------- HUD ----------
    const hud = this.hud = new HUD()
    this.dHud = new DuelHud(hud)
    this.dHud.setFighter('L', { name: this.playerName, color: this.player.glow })
    if (this.mode === 'single') this.dHud.buildSingle(this.ctx.cpuDifficulty.level)
    else this.dHud.buildTower(TOWER, 0)
    this.abilityUi = hud.abilityBar(this.skillDefs, { game: 'duel' })
    this.hintBox = hud.hints([
      ['← → / A D', 'Move; double-tap to dash'], ['RMB', 'Click to move'], ['↑ / SPACE', 'Jump'], ['↓ / S', 'Crouch'],
      ['SHIFT', 'Block (chip from arts only)'], ['J', 'Light — chains J·J·K'], ['K', 'Heavy — K·K corner splat'],
      ['F', 'Throw (beats block)'], ['Q W E R', 'Arts — cancel any hit into them'], ['H', 'Toggle help'],
    ])

    audio.music('duel')
    audio.ambience('crucible')
    const statsKey = this.mode === 'single' ? 'duelSingle' : 'duel'
    profile.stats.plays[statsKey] = (profile.stats.plays[statsKey] || 0) + 1
    this.ctx.saveProfile()

    this._setupFight(0, { retry: false })

    // ---------- QA hooks ----------
    this.debug = {
      win: () => { this._cleanupFlow(); this.mode === 'single' ? this._singleResult(true) : this._champion() },
      lose: () => { this._cleanupFlow(); this.mode === 'single' ? this._singleResult(false) : this._defeated() },
      winRound: () => {
        if (this.phase !== 'fight') return
        this.foe.hp = 0
        this._endRound(this.player, true)
      },
      winFight: () => {
        this._cleanupFlow()
        if (this.mode === 'single') this._singleResult(true)
        else if (this.stage >= 3) this._champion()
        else this._advanceTower()
      },
    }
  }

  // ============================== tower flow ==============================

  _setupFight(stage, { retry = false } = {}) {
    this.bossArts?.dispose()
    this.stage = stage
    const spec = this.singleOpponent || TOWER[stage]
    // replace the previous opponent
    if (this.foe) {
      this.specials.releaseFighter(this.foe)
      this.scene.remove(this.foe.root)
      disposeObject3D(this.foe.root)
      this.foe.dispose()
    }
    this.foe = new DuelFighter({
      scene: this.scene, vfx: this.vfx, audio: this.ctx.audio,
      appearance: spec.appearance, name: spec.name, color: spec.color,
      spawnX: retry ? F_MARK : 8.9,
    })
    const Brain = this.mode === 'single' ? SingleDuelAI : DuelAI
    const tuning = this.mode === 'single' ? this.ctx.cpuDifficulty.duel : spec.ai
    this.ai = new Brain(this.foe, { ...tuning, specials: spec.specials }, { specials: this.specials, fight: this.fight })
    this.bossArts = this.mode === 'single' ? null : new BossArts({
      scene: this.scene, vfx: this.vfx, audio: this.ctx.audio, kind: `duel${stage}`, edge: EDGE,
      source: () => this.foe.pos, target: () => this.player.pos,
      canCast: () => this.foe.canAct() && this.foe.grounded && !this.foe.attack && this.player.hitstun <= 0 && this.player.kdT <= 0,
      onCast: () => { this.foe.hero.cast(); this.foe.vel.x = 0 },
      hit: (damage, pos, color) => this.fight.applyHit(this.foe, this.player, { dmg: damage, special: true, kind: 'special', hitstun: 0.3, kb: 2, color }),
      announce: label => this.hud.toast(label, { cls: 'boss-art-cue' }),
    })
    this.fight.setFighters(this.player, this.foe)
    this.bossArts?.reset()
    this.specials.reset()
    this.fight.reset()

    this.playerWins = 0
    this.foeWins = 0
    this.roundIdx = 0
    this.player.resetRound(P_MARK)
    this.player.meter = 0
    if (retry) this.foe.resetRound(F_MARK)
    this.roundT = ROUND_TIME

    this.dHud.setFighter('R', { name: spec.name, color: spec.color })
    this.dHud.setRounds('L', 0)
    this.dHud.setRounds('R', 0)
    this.dHud.setTowerStage(stage)
    this.dHud.setTimer(ROUND_TIME)
    this.arena.setBossMode(!!spec.boss)

    if (retry) { this._showPlates(true); return }
    if (spec.boss) this._bossEntrance()
    else { this.phase = 'cine'; this.cineT = 0; this.dHud.setCine(true) }
  }

  /** THE ETERNAL: lights die, embers surge, the name slams in. */
  _bossEntrance() {
    this.phase = 'bossin'
    this.cineT = 0
    this.dHud.setCine(true)
    this.exposureT = 0.45
    this.ctx.audio.play('crowd', { vol: 0.7 })
    this.ctx.audio.play('tower', { vol: 0.6 })
    this.hud.banner('THE ETERNAL', { sub: 'CHAMPION OF A THOUSAND CRUCIBLES', color: '#ff3524', duration: 2.2 })
    this.ctx.engine.shake(0.3, 0.8)
    // ember surge off every brazier
    this.arena.brazierPositions.forEach((p, i) => {
      this._timeout(() => {
        _v1.set(p.x, 1.8, p.z)
        this.vfx.burst(_v1, { color: '#ff3524', count: 18, speed: 4, size: 0.3, life: 0.8, up: 6, gravity: 2 })
      }, i * 90)
    })
  }

  _showPlates(short = false) {
    this.phase = 'plates'
    this.dHud.setCine(false)
    const spec = this.singleOpponent || TOWER[this.stage]
    this._vsRemove?.()
    this._vsRemove = this.dHud.showVs(this.playerName, this.mode === 'single' ? 'SINGLE DUEL' : 'CHALLENGER OF THE CRUCIBLE', spec)
    this.ctx.audio.play('cast', { vol: 0.6 })
    const gen = this.gen
    this._timeout(() => {
      if (gen !== this.gen) return
      this._vsRemove?.()
      this._vsRemove = null
      this._startRound()
    }, short ? 1250 : 1750)
  }

  _startRound() {
    this._cancelMouseMove()
    this.phase = 'prefight'
    this.bossArts?.reset()
    this.specials.reset()
    this.fight.reset()
    this.player.resetRound(P_MARK)
    this.foe.resetRound(F_MARK)
    this.ai.resetReads?.()
    this.player.hero.setState('normal')
    this.foe.hero.setState('normal')
    this.roundT = ROUND_TIME
    this.dHud.setTimer(ROUND_TIME)
    this.dHud.hideCombos()
    this.hud.banner(`ROUND ${this.roundIdx + 1}`, { color: '#ffb84d', duration: 1.0 })
    const gen = this.gen
    this._timeout(() => {
      if (gen !== this.gen) return
      this.hud.banner('FIGHT!', { color: '#c23b2e', duration: 0.9 })
      this.ctx.audio.play('go')
      this.phase = 'fight'
    }, 1100)
  }

  // ============================== round / match end ==============================

  _onKO(a) {
    if (this.phase !== 'fight') return
    this._endRound(a === this.player ? this.player : this.foe, true)
  }

  _timeUp() {
    const winner = this.player.hp >= this.foe.hp ? this.player : this.foe
    this.hud.banner('TIME!', { color: '#b8c4c8', duration: 1.2 })
    this._endRound(winner, false)
  }

  _endRound(winner, byKO) {
    this.bossArts?.reset()
    if (this.phase !== 'fight') return
    this._cancelMouseMove()
    const loser = winner === this.player ? this.foe : this.player
    const flawless = winner.hp >= 100
    if (winner === this.player) this.playerWins++
    else this.foeWins++
    this.dHud.setRounds('L', this.playerWins)
    this.dHud.setRounds('R', this.foeWins)
    this.dHud.hideCombos()
    const matchOver = this.playerWins >= 2 || this.foeWins >= 2

    if (matchOver && winner === this.player && byKO) { this._oblitPrompt(loser); return }

    this.phase = 'roundEnd'
    this.ctx.audio.play('kill', { vol: 0.7 })
    this.ctx.audio.play('crowd', { vol: 0.6 })
    // match-winning blow: deeper slow-mo + a 30-degree orbit
    if (matchOver && byKO) { this.slowmoT = 1.6; this.slowmoScale = 0.12; this.orbitTarget = 0.52; this.punch = 0.5 }
    else if (byKO) { this.slowmoT = 1.05; this.slowmoScale = 0.25; this.punch = 0.35 }
    const gen = this.gen
    this._timeout(() => { if (gen === this.gen) loser.hero.setState('ko') }, 350)
    this._timeout(() => {
      if (gen !== this.gen) return
      winner.hero.setState('dance')
      this.hud.banner(`${winner.name} WINS ROUND ${this.roundIdx + 1}`, {
        color: winner === this.player ? '#ffb84d' : '#c23b2e',
        sub: flawless ? 'FLAWLESS!' : '', duration: 1.8,
      })
      if (flawless) this.ctx.audio.play('crowd', { vol: 0.7 })
    }, 800)
    this._timeout(() => {
      if (gen !== this.gen) return
      if (matchOver) this._endMatch(winner === this.player)
      else { this.roundIdx++; this._showPlateslessRound() }
    }, 3000)
  }

  _showPlateslessRound() {
    this.player.hero.setState('normal')
    this.foe.hero.setState('normal')
    this._startRound()
  }

  // ---------- OBLITERATION ----------

  _oblitPrompt(loser) {
    this.phase = 'oblitPrompt'
    this.promptT = 1.2
    this._oblitLoser = loser
    this.dHud.setDark(true)
    this._oblitRemove = this.dHud.showOblitPrompt()
    this.ctx.audio.play('zap', { vol: 0.5 })
    this.ctx.audio.play('crowd', { vol: 0.8 })
  }

  _oblitTimeout() {
    // no press: a normal — still cinematic — match KO
    this._oblitRemove?.()
    this._oblitRemove = null
    this.dHud.setDark(false)
    this.phase = 'roundEnd'
    this.slowmoT = 1.6
    this.slowmoScale = 0.12
    this.orbitTarget = 0.52
    this.punch = 0.5
    this.ctx.audio.play('kill', { vol: 0.7 })
    const gen = this.gen
    this._timeout(() => { if (gen === this.gen) this._oblitLoser.hero.setState('ko') }, 300)
    this._timeout(() => {
      if (gen !== this.gen) return
      this.player.hero.setState('dance')
      this.hud.banner(`${this.player.name} WINS`, { color: '#ffb84d', duration: 1.8 })
    }, 800)
    this._timeout(() => { if (gen === this.gen) this._endMatch(true) }, 3000)
  }

  _runFinisher() {
    if (this.phase !== 'oblitPrompt') return
    this.phase = 'finisher'
    this._oblitRemove?.()
    this._oblitRemove = null
    const foe = this._oblitLoser
    const def = this.skillDefs[3] // the R-slot art, erupting oversized
    this.slowmoT = 2.4
    this.slowmoScale = 0.2
    this.orbitTarget = -0.35
    this.punch = 0.75
    const gen = this.gen
    this.ctx.audio.play('cast', { vol: 0.8 })
    _v1.set(this.player.pos.x, 1.2, 0)
    this.vfx.flash(_v1, { color: def.color, size: 3, life: 0.3 })
    this.player.hero.cast()

    this._timeout(() => {
      if (gen !== this.gen) return
      // the eruption: oversized art + stone-shatter + ember plume, NO gore
      _v2.set(foe.pos.x, 1.1, 0)
      this.vfx.shockwave(_v2, { color: def.color, radius: 6 })
      this.vfx.flash(_v2, { color: '#fff2c4', size: 7, life: 0.4 })
      this.vfx.burst(_v2, { color: '#8a7d6a', count: 34, speed: 11, size: 0.34, life: 0.9, up: 5, gravity: -16 })
      this.vfx.burst(_v2, { color: '#ff8c3b', count: 40, speed: 8, size: 0.3, life: 1.2, up: 10, gravity: 3 })
      this.vfx.burst(_v2, { color: def.color, count: 26, speed: 12, size: 0.36, life: 0.7, up: 4 })
      this.vfx.lightning(_v1.set(foe.pos.x - 2, 5, 0), _v2, { color: def.color, life: 0.3 })
      this.ctx.engine.shake(0.9, 0.7)
      this.ctx.engine.aberrPulse(0.014)
      this.ctx.audio.play('explode', { vol: 1 })
      this.ctx.audio.play('kill', { vol: 0.8 })
      this.ctx.audio.play('crowd', { vol: 0.9 })
      // the fallen champion drops in silhouette
      foe.hero.group.traverse(o => {
        const m = o.material
        if (m && m.color) { m.color.multiplyScalar(0.1); if (m.emissive) m.emissive.setScalar(0) }
      })
      foe.juggleFall = true
      foe.grounded = false
      foe.pos.y += 0.05
      foe.vel.y = 6.5
      foe.vel.x = (foe.pos.x >= this.player.pos.x ? 1 : -1) * 2.5
      foe.spinV = 7
    }, 420)
    this._timeout(() => {
      if (gen !== this.gen) return
      this.hud.banner('OBLITERATION', { color: '#ff5a26', sub: 'THE CROWD SCREAMS FOR MORE', duration: 2 })
      this.player.hero.setState('dance')
    }, 1250)
    this._timeout(() => {
      if (gen !== this.gen) return
      this.dHud.setDark(false)
      this._endMatch(true)
    }, 3100)
  }

  // ---------- match resolution ----------

  _endMatch(won) {
    this.bossArts?.reset()
    this.specials.reset()
    this.orbitTarget = 0
    if (this.mode === 'single') { this._singleResult(won); return }
    if (!won) { this._defeated(); return }
    if (this.stage >= 3) { this._champion(); return }
    this._advanceTower()
  }

  _singleResult(won) {
    if (this.over) return
    this._cleanupFlow()
    this.over = won ? 'won' : 'lost'
    this.phase = won ? 'champion' : 'defeated'
    this.player.hero.setState(won ? 'dance' : 'ko')
    this.foe.hero.setState(won ? 'ko' : 'dance')
    if (won) {
      const stats = this.ctx.profile.stats
      stats.wins.duelSingle = (stats.wins.duelSingle || 0) + 1
      this.ctx.saveProfile()
    }
    this.ctx.audio.play(won ? 'victory' : 'defeat')
    this._panel = this.dHud.singleResultPanel({
      won, foeName: this.foe.name, level: this.ctx.cpuDifficulty.level,
      onRematch: () => { this.ctx.audio.play('click'); this.ctx.goTo('duel', { mode: 'single' }) },
      onHub: () => { this.ctx.audio.play('click'); this.ctx.goTo('hub') },
    })
  }

  _advanceTower() {
    this.phase = 'towerUp'
    const beaten = TOWER[this.stage]
    this.dHud.setTowerStage(this.stage + 1)
    this.hud.banner(`${beaten.name} FALLS`, { sub: 'THE TOWER RISES', color: '#ffb84d', duration: 2 })
    this.ctx.audio.play('victory')
    const gen = this.gen
    this._timeout(() => {
      if (gen !== this.gen) return
      this.player.hero.setState('normal')
      this._setupFight(this.stage + 1)
    }, 2400)
  }

  _champion() {
    if (this.over) return
    this.over = 'won'
    this.phase = 'champion'
    this._clearBanners()
    this.dHud.setDark(false)
    this.dHud.setTowerStage(4)
    const profile = this.ctx.profile
    profile.stats.wins.duel = (profile.stats.wins.duel || 0) + 1
    this.ctx.saveProfile()
    this.ctx.audio.play('victory')
    this.ctx.audio.play('crowd', { vol: 0.9 })
    this.player.hero.setState('dance')
    this.hud.banner('CRUCIBLE CHAMPION', { sub: 'THE TOWER KNEELS', color: '#ffb84d', duration: 0 })
    this._panel = this.dHud.championPanel({
      name: this.playerName,
      onHub: () => { this.ctx.audio.play('click'); this.ctx.goTo('hub') },
    })
    for (let i = 0; i < 7; i++) {
      this._timeout(() => {
        _v1.set(this.player.pos.x + rand(-6, 6), rand(1, 6), rand(-2, 2))
        this.vfx.burst(_v1, { color: pick(['#ffb84d', '#ff8c3b', '#c23b2e', '#e8dcc4']), count: 24, speed: 8, size: 0.3 })
        this.ctx.audio.play('coin', { vol: 0.3 })
      }, 400 + i * 620)
    }
    this._timeout(() => this.ctx.goTo('hub'), 8000)
  }

  _defeated() {
    if (this.over) return
    this.over = 'lost'
    this.phase = 'defeated'
    this._clearBanners()
    this.dHud.setDark(false)
    this.ctx.audio.play('defeat')
    this.player.hero.setState('ko')
    this.foe?.hero.setState('dance')
    this.hud.banner('DEFEATED', { color: '#c23b2e', duration: 2.2 })
    this._panel = this.dHud.defeatPanel({
      foeName: TOWER[this.stage].name,
      onRetry: () => {
        this.ctx.audio.play('click')
        this._cleanupFlow()
        this.over = null
        this._setupFight(this.stage, { retry: true }) // tower progress kept
      },
      onAbandon: () => { this.ctx.audio.play('click'); this.ctx.goTo('hub') },
    })
  }

  _cleanupFlow() {
    this.bossArts?.reset()
    this._cancelMouseMove()
    this.gen++
    for (const id of this._timeouts) this.ctx.clearTimeout(id)
    this._timeouts.length = 0
    this._clearBanners()
    this._vsRemove?.()
    this._vsRemove = null
    this._oblitRemove?.()
    this._oblitRemove = null
    this._panel?.remove()
    this._panel = null
    this.dHud.setDark(false)
    this.dHud.setCine(false)
    this.slowmoT = 0
    this.orbitTarget = 0
    this.punch = 0
    this.exposureT = 1.12
    this.over = null
  }

  _clearBanners() {
    for (const b of this.hud.root.querySelectorAll('.big-banner')) b.remove()
  }

  // ============================== skills ==============================

  _castSkill(i) {
    if (this.phase !== 'fight' || this.cds[i] > 0.001) return
    const def = this.skillDefs[i]
    if (!this.specials.cast(this.player, def)) return
    this.cds[i] = def.cd
    this.abilityUi.flash(i)
  }

  // ============================== events ==============================

  _onHit(a, d, info) {
    // the [n]x counter rides the VICTIM's side of the screen — the player
    // also sees (crimson-tinted, left) when THEY are the one being combo'd
    const side = d === this.player ? 'L' : 'R'
    this.dHud.comboTick(side, info.combo, info.comboDmg)
    if (info.combo >= 2) this._comboTickSfx(info.combo)
    if (info.combo === 4 || info.combo === 7 || info.combo === 10) this._tierSfx(info.combo)
    if (info.combo === 5 && !this._crowdCombo) {
      this._crowdCombo = true
      this.ctx.audio.play('crowd', { vol: 0.5 })
    }
  }

  _onComboEnd(d, hits, dmg, reason) {
    this._crowdCombo = false
    const side = d === this.player ? 'L' : 'R'
    const dropped = reason === 'escape'
    this.dHud.comboEnd(side, hits, dmg, dropped)
    if (dropped && hits >= 2) this._crackSfx()
    if (hits >= 7) this.ctx.audio.play('crowd', { vol: 0.6 })
  }

  // ---------- combo-counter sfx (raw synth: audio.play has no pitch param) ----------

  /** Light metallic tick, rising in pitch with each landed move. */
  _comboTickSfx(n) {
    const a = this.ctx.audio
    if (!a.ctx || !a.enabled) return
    const f = 620 * Math.pow(2, Math.min(n - 2, 12) / 16)
    a._osc({ f, f2: f * 0.9, type: 'square', dur: 0.045, vol: 0.05 })
    a._osc({ f: f * 3.02, type: 'triangle', dur: 0.03, vol: 0.025 })
  }

  /** Short forged sting when the counter crosses a tier (4x / 7x / 10x). */
  _tierSfx(n) {
    const a = this.ctx.audio
    if (!a.ctx || !a.enabled) return
    const base = n >= 10 ? 587 : n >= 7 ? 494 : 392
    a._osc({ f: base, f2: base * 1.5, type: 'sawtooth', dur: 0.14, vol: 0.07 })
    a._osc({ f: base * 2, f2: base * 3, type: 'triangle', dur: 0.18, vol: 0.045, attack: 0.012 })
  }

  /** Dull stone crack for a dropped combo. */
  _crackSfx() {
    const a = this.ctx.audio
    if (!a.ctx || !a.enabled) return
    a._noise({ dur: 0.2, filter: 1600, filter2: 260, vol: 0.16 })
    a._osc({ f: 170, f2: 55, type: 'square', dur: 0.14, vol: 0.07 })
  }

  _onParry(d) {
    _v1.set(d.pos.x, d.pos.y + 2.4, 0)
    this.vfx.text(_v1, 'PARRIED!', { color: '#e8dcc4', size: 0.8, life: 0.9 })
  }

  // ============================== main loop ==============================

  update(dt, t) {
    if (this.phase !== 'fight' || this.player.hp <= 0) this._cancelMouseMove()
    for (const tk of this.arena.tickables) tk.tick(dt)
    this.vfx.update(dt)

    // boss-entrance exposure dip
    this.exposure = damp(this.exposure, this.exposureT, 3, dt)
    this.ctx.engine.setExposure(this.exposure)

    // hit-stop: the world holds its breath
    if (this.fight.freezeT > 0) {
      this.fight.freezeT -= dt
      this._updateCamera(dt, t)
      this.dHud.update(dt, { L: this.player, R: this.foe })
      return
    }

    // slow-mo ramp
    if (this.slowmoT > 0) {
      this.slowmoT -= dt
      this.timeScale = this.slowmoT > 0.45 ? this.slowmoScale : lerp(this.slowmoScale, 1, 1 - Math.max(0, this.slowmoT) / 0.45)
    } else this.timeScale = 1
    const gdt = dt * this.timeScale

    if (this.phase !== 'fight') this.bossArts?.reset()
    this.fight.active = this.phase === 'fight'

    switch (this.phase) {
      case 'bossin':
        this.cineT += dt
        this._idleFighters(gdt, dt)
        if (this.cineT > 2.3) { this.phase = 'cine'; this.cineT = 0; this.exposureT = 1.12 }
        break
      case 'cine':
        this.cineT += dt
        this._cineUpdate(dt)
        if (this.cineT >= 3.4) this._showPlates()
        break
      case 'fight': {
        const pIt = this._playerIntent()
        this.player.update(gdt, dt, pIt, this.foe)
        this.bossArts?.update(gdt, this.player.hp > 0 && this.foe.hp > 0)
        if (this.phase !== 'fight') break
        this.foe.update(gdt, dt, this.bossArts?.casting ? this._zero : this.ai.update(gdt), this.player)
        this.specials.update(gdt)
        this.fight.update(gdt)
        this.roundT -= gdt
        this.dHud.setTimer(this.roundT)
        if (this.roundT <= 0 && this.phase === 'fight') this._timeUp()
        this._updateCds(gdt)
        break
      }
      case 'oblitPrompt':
        // frozen tableau — only the prompt clock runs
        this.promptT -= dt
        if (this.promptT <= 0) this._oblitTimeout()
        break
      default:
        // roundEnd / finisher / plates / panels: bodies settle, no combat
        this._idleFighters(gdt, dt)
        this.specials.update(gdt)
        this.fight.update(gdt)
    }

    this.dHud.update(dt, { L: this.player, R: this.foe })
    this._updateCamera(dt, t)
  }

  _idleFighters(gdt, dt) {
    this.player.update(gdt, dt, this._zero, this.foe)
    if (this.foe) this.foe.update(gdt, dt, this._zero, this.player)
  }

  _playerIntent() {
    const input = this.ctx.input
    const it = this._pIntent
    const b = this._buf
    it.move = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0)
    it.crouch = input.isDown('KeyS')
    it.block = input.isDown('ShiftLeft') || input.isDown('ShiftRight')
    if (input.isDown('KeyA') || input.isDown('KeyD') || it.crouch || it.block) this._cancelMouseMove()
    else if (this.moveTargetX !== null) it.move = this._mouseMoveIntent()
    it.jump = b.jump
    it.light = b.light
    it.heavy = b.heavy
    it.throw = b.throw
    it.dash = b.dash
    b.jump = b.light = b.heavy = b.throw = false
    b.dash = 0
    return it
  }

  _cancelMouseMove() {
    this.moveTargetX = null
    this.moveMarker.visible = false
  }

  _mouseMoveIntent() {
    const p = this.player, f = this.foe
    if (!p.grounded || !p.canAct()) return 0
    const dx = this.moveTargetX - p.pos.x
    const direction = Math.sign(dx)
    // Leave room for the fighter's existing walking deceleration.
    const stopDistance = 0.08 + Math.max(0, p.vel.x * direction) / 14
    const blocked = f?.grounded && (f.pos.x - p.pos.x) * direction > 0 && Math.abs(f.pos.x - p.pos.x) <= 1.05
    if (Math.abs(dx) <= stopDistance || blocked) { this._cancelMouseMove(); return 0 }
    return direction
  }

  _updateCds(gdt) {
    for (let i = 0; i < 4; i++) {
      this.cds[i] = Math.max(0, this.cds[i] - gdt)
      this.abilityUi.setCooldown(i, this.cds[i] / this.skillDefs[i].cd, this.cds[i])
      const a = this.skillDefs[i].archetype
      const p = this.player
      const on = (a === 'buff' && p.frenzyT > 0) || (a === 'giant' && p.giantT > 0)
        || (a === 'ghost' && p.ghostT > 0) || (a === 'shield' && p.wardT > 0)
        || (a === 'heal' && p.healT > 0)
      this.abilityUi.setActive(i, on)
    }
  }

  // ============================== camera ==============================

  /** Intro sweep: low past the challenger walking in, past the hero, settle. */
  _cineUpdate(dt) {
    const foe = this.foe
    // the challenger stalks to their mark
    if (foe.pos.x > F_MARK) {
      foe.pos.x = Math.max(F_MARK, foe.pos.x - 1.55 * dt)
      foe.facing = -1
      foe.root.rotation.y = damp(foe.root.rotation.y, -1.22, 8, dt)
      foe.hero.setMoveSpeed(1.7)
    } else foe.hero.setMoveSpeed(0)
    foe.hero.update(dt)
    this.player.hero.setMoveSpeed(0)
    this.player.hero.update(dt)

    const k = this.cineT
    if (k < 1.25) {
      const s = smooth(k / 1.25)
      this.camera.position.set(lerp(7.6, 5.4, s), lerp(0.8, 1.4, s), lerp(3.6, 4.4, s))
      this._look.set(foe.pos.x, 1.4, 0)
    } else if (k < 2.35) {
      const s = smooth((k - 1.25) / 1.1)
      this.camera.position.set(lerp(5.4, -2.4, s), lerp(1.4, 1.15, s), lerp(4.4, 4.2, s))
      _v1.set(foe.pos.x, 1.4, 0)
      _v2.set(this.player.pos.x, 1.35, 0)
      this._look.copy(_v1.lerp(_v2, s))
    } else {
      const s = smooth((k - 2.35) / 1.05)
      this.camera.position.set(lerp(-2.4, 0, s), lerp(1.15, 3.4, s), lerp(4.2, 11.5, s))
      _v2.set(0, 1.7, 0)
      this._look.lerp(_v2, s)
    }
    this.camera.lookAt(this._look)
  }

  _updateCamera(dt, t) {
    if (this.phase === 'cine') return
    const p = this.player, f = this.foe
    const midX = f ? (p.pos.x + f.pos.x) / 2 : p.pos.x
    // vertical midpoint gets its own slower damp: a launch lifts the framing
    // gently and a knockdown fall settles it back without a pop
    this._camY = damp(this._camY, f ? Math.max(p.pos.y, f.pos.y) : p.pos.y, 3.5, dt)
    const midY = this._camY
    const sep = f ? Math.abs(p.pos.x - f.pos.x) : 6

    this.punch = damp(this.punch, 0, this.phase === 'oblitPrompt' ? 0 : 1.4, dt)
    this.orbit = damp(this.orbit, this.orbitTarget, 3, dt)
    const dist = clamp(sep * 0.9 + 5.7, 6.6, 15) * (1 - this.punch * 0.34)
    const h = 2.45 + midY * 0.42 + Math.sin(t * 0.4) * 0.12

    const k = 1 - Math.exp(-6 * dt)
    _v1.set(
      midX * 0.86 + Math.sin(this.orbit) * dist + Math.sin(t * 0.3) * 0.2,
      h,
      Math.cos(this.orbit) * dist,
    )
    this.camera.position.lerp(_v1, k)
    _v2.set(midX * 0.86, 1.42 + midY * 0.38, 0)
    this._look.lerp(_v2, k)
    this.camera.lookAt(this._look)
  }

  // ============================== plumbing ==============================

  _timeout(fn, ms) {
    const id = this.ctx.setTimeout(() => { if (!this.disposed) fn() }, ms)
    this._timeouts.push(id)
    return id
  }

  dispose() {
    this.bossArts?.dispose()
    this.disposed = true
    this.gen++
    for (const id of this._timeouts) this.ctx.clearTimeout(id)
    this.ctx.engine.setExposure(1.12)
    this.specials.dispose()
    this.player.dispose()
    this.foe?.dispose()
    this.vfx.dispose()
  }
}
