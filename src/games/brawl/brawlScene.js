import * as THREE from 'three'
import { getSkill, KEY_CODES } from '../../meta/skills.js'
import { HUD } from '../../ui/hud.js'
import { VFX } from '../../art/vfx.js'
import { clamp, lerp, damp, rand, randInt, pick, disposeObject3D } from '../../core/utils.js'
import { buildStage, PLATFORMS, MAIN, BLAST } from './stage.js'
import { Fighter, ATTACKS } from './fighter.js'
import { BrawlAI } from './brawlAi.js'
import { BrawlHud } from './brawlHud.js'
import { BrawlIntro } from './brawlIntro.js'
import '../../ui/brawl.css'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()

const AI_ROSTER = [
  {
    name: 'BLOODFANG', color: '#c23b2e', title: 'THE CRIMSON MAW',
    appearance: { primary: '#a1252c', secondary: '#3a1418', glow: '#ff8c3b', head: 'classic', hair: 'horns', cape: true },
  },
  {
    name: 'IRONJAW', color: '#9aa3b2', title: 'THE UNBENDING',
    appearance: { primary: '#6b6f78', secondary: '#2c2620', glow: '#ffb84d', head: 'visor', hair: 'none', cape: false },
  },
]

/**
 * MORTAL ARENA — Smash-style free-for-all platform duel on an ancient stone
 * slab over a lava chasm. 3 stocks each, damage % knockback, last warrior
 * standing wins. A/D move, SPACE jump (+1 air jump), S fast-fall/drop,
 * J jab combo, K smash, double-tap A/D dodge roll, Q/W/E/R loadout skills.
 */
export default class BrawlScene {
  constructor(ctx) {
    this.ctx = ctx
    // Realism grade: bloom reserved for true fire/embers, neutral saturation,
    // filmic vignette + grain, slight exposure lift so the blacks stay deep.
    // SSAO benchmarked at +5ms/frame (p95 21ms) on an integrated GPU — left off;
    // grounding comes from painted AO, contact blobs and the shadow key instead.
    this.postOpts = { bloom: 0.75, bloomThreshold: 0.92, bloomRadius: 0.5, vignette: 0.52, saturation: 1.0, grain: 0.038, exposure: 1.05 }
  }

  async init() {
    const { engine, input, audio, profile } = this.ctx
    this.scene = new THREE.Scene()
    this.scene.environment = engine.envMap
    this.env = buildStage(this.scene)

    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 900)
    this.camera.position.set(0, 5.5, 26)
    this._look = new THREE.Vector3(0, 2.4, 0)
    this.camera.lookAt(this._look)

    this.vfx = new VFX(this.scene)

    // ---------- fighters ----------
    const mk = opts => new Fighter({ scene: this.scene, vfx: this.vfx, audio, ...opts })
    this.player = mk({
      appearance: profile.appearance, name: profile.name || 'WARLORD',
      color: profile.appearance.glow || '#ffb84d', team: 0, isPlayer: true, spawnX: -7,
    })
    const ai1 = mk({ ...AI_ROSTER[0], team: 1, spawnX: 7 })
    const ai2 = mk({ ...AI_ROSTER[1], team: 2, spawnX: 0 })
    this.baseFighters = [this.player, ai1, ai2]
    this.fighters = [...this.baseFighters]
    this.ais = [new BrawlAI(ai1), new BrawlAI(ai2)]
    this._heroTrail = null // created after the entrance cinematic (_beginRoundFlow)

    // shield bubble (Iron Bulwark) — pale forged-steel sheen
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 24, 18),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#c9b98e').multiplyScalar(1.5), transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    this.bubble.position.y = 1
    this.bubble.visible = false
    this.player.root.add(this.bubble)

    // ---------- skills ----------
    this.skillDefs = profile.loadout.map(getSkill)
    this.cds = [0, 0, 0, 0]
    this.frost = []
    this.meteors = []
    this.bolts = []
    this.clone = null
    this._ghostMats = null
    this._buildCasters()

    // ---------- match state ----------
    this.phase = 'intro'
    this.over = null
    this.freezeT = 0
    this.slowmoT = 0
    this.timeScale = 1
    this._txt = 10
    this._timeouts = []

    // ---------- drama / camera state (presentation only) ----------
    this.punch = 0                            // camera punch toward _punchPos
    this._punchPos = new THREE.Vector3(0, 3, 0)
    this.zoomPulse = 0                        // brief mutual zoom (showdown)
    this.orbit = 0
    this.orbitTarget = 0                      // final-KO cinematic orbit
    this._maxDist = 34                        // tightened once showdown hits
    this._showdown = false
    this._elimN = 0
    this._artCasts = [0, 0, 0, 0]
    this._stats = new Map(this.baseFighters.map(f =>
      [f, { maxDmg: 0, survives: 0, airborne: false, defiant: false, elim: 0, jab: 0, smash: 0 }]))

    // ---------- player input ----------
    this._buf = { jump: false, jab: false, smash: false, drop: false, dodge: 0 }
    this._pIntent = { move: 0, jump: false, fastFall: false, drop: false, jab: false, smash: false, dodge: 0 }
    this._tapA = -9
    this._tapD = -9
    input.onKey((code, down) => {
      if (!down || this.disposed) return
      if (this.intro) { this._dismissIntro(); this._beginRoundFlow(); return } // ANY key skips the entrance
      const now = performance.now() / 1000
      if (code === 'Space') this._buf.jump = true
      else if (code === 'KeyJ') this._buf.jab = true
      else if (code === 'KeyK') this._buf.smash = true
      else if (code === 'KeyS') this._buf.drop = true
      else if (code === 'KeyA') { if (now - this._tapA < 0.27) this._buf.dodge = -1; this._tapA = now }
      else if (code === 'KeyD') { if (now - this._tapD < 0.27) this._buf.dodge = 1; this._tapD = now }
      else if (code === 'KeyH') this.hintBox.style.display = this.hintBox.style.display === 'none' ? '' : 'none'
      else {
        const i = KEY_CODES.indexOf(code)
        if (i >= 0) this._castSkill(i)
      }
    })

    // ---------- HUD ----------
    const hud = this.hud = new HUD()
    this.bHud = new BrawlHud(hud, this.baseFighters)
    this.abilityUi = hud.abilityBar(this.skillDefs, { game: 'brawl' })
    this.abilityUi.root.style.bottom = '118px'
    this.hintBox = hud.hints([
      ['A / D', 'Move'], ['SPACE', 'Jump / air jump'], ['S', 'Fast-fall / drop through'],
      ['A A / D D', 'Dodge roll'], ['J', 'Jab combo'], ['K', 'Smash attack'],
      ['Q W E R', 'Skills (jump is SPACE, not W)'], ['H', 'Toggle help'],
    ])

    audio.music('brawl')
    audio.ambience('chasm')
    profile.stats.plays.brawl = (profile.stats.plays.brawl || 0) + 1
    this.ctx.saveProfile()

    this._endThem = new Set() // fighters already called out by the announcer

    // ---------- entrance cinematic (state frozen; any key skips) ----------
    this.abilityUi.root.classList.add('brawl-ui-hide')
    this.hintBox.classList.add('brawl-ui-hide')
    this.intro = new BrawlIntro({
      camera: this.camera, look: this._look, vfx: this.vfx, audio, engine, bHud: this.bHud,
      entries: [
        { f: ai1, from: { x: 19, y: -5 }, arc: 6, title: AI_ROSTER[0].title },
        { f: ai2, from: { x: -18, y: -4.5 }, arc: 7.5, title: AI_ROSTER[1].title },
        { f: this.player, from: { x: -19, y: -5 }, arc: 6.5, title: 'THE CHALLENGER' },
      ],
    })

    this.debug = {
      win: () => {
        for (const f of this.baseFighters) {
          if (f === this.player) continue
          f.stocks = 0
          f.state = 'out'
          f.root.visible = false
          f.pad.visible = false
        }
        this._finish(true)
      },
      lose: () => {
        this.player.stocks = 0
        this.player.state = 'out'
        this.player.root.visible = false
        this.player.pad.visible = false
        this._finish(false)
      },
    }
  }

  // ============================== main loop ==============================

  update(dt, t) {
    for (const tk of this.env.tickables) tk.tick(dt)
    this.vfx.update(dt)

    // entrance cinematic: combat state is frozen, the intro owns the camera
    if (this.intro) {
      if (this.intro.update(dt)) { this._dismissIntro(); this._beginRoundFlow() }
      this.bHud.update()
      return
    }

    // freeze-frame on smash connect
    if (this.freezeT > 0) {
      this.freezeT -= dt
      this._updateCamera(dt, t)
      return
    }
    // final-KO slow-mo
    if (this.slowmoT > 0) {
      this.slowmoT -= dt
      this.timeScale = this.slowmoT > 0.45 ? 0.22 : lerp(0.22, 1, 1 - Math.max(0, this.slowmoT) / 0.45)
    } else this.timeScale = 1
    const gdt = dt * this.timeScale
    this._txt = 10

    // intents
    const fighting = this.phase === 'fight' && !this.over
    const pIt = this._playerIntent(fighting)
    this.player.update(gdt, dt, pIt, PLATFORMS)
    for (const ai of this.ais) {
      const it = fighting ? ai.update(gdt, this.fighters) : ai.intent
      if (!fighting) { it.move = 0; it.jump = it.jab = it.smash = it.drop = false; it.dodge = 0 }
      ai.f.update(gdt, dt, it, PLATFORMS)
    }
    if (this.clone) this._updateClone(gdt, dt)

    if (fighting) {
      this._separate(gdt)
      this._resolveMelee()
      for (const f of this.fighters) this._checkBlast(f)
      this._announcer()
      this._dramaTick()
    }
    this._updateSkills(gdt, dt)
    this.bHud.update()
    this._updateCamera(dt, t)
  }

  _playerIntent(fighting) {
    const input = this.ctx.input
    const it = this._pIntent
    const b = this._buf
    if (fighting) {
      it.move = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0)
      it.fastFall = input.isDown('KeyS')
      it.jump = b.jump
      it.jab = b.jab
      it.smash = b.smash
      it.drop = b.drop
      it.dodge = b.dodge
    } else {
      it.move = 0
      it.fastFall = it.jump = it.jab = it.smash = it.drop = false
      it.dodge = 0
    }
    b.jump = b.jab = b.smash = b.drop = false
    b.dodge = 0
    return it
  }

  /** Tear down the entrance cinematic (natural end, skip, or forced finish). */
  _dismissIntro() {
    if (!this.intro) return
    this.intro.finalize()
    this.intro = null
    this.phase = 'ready'
    this.abilityUi.root.classList.remove('brawl-ui-hide')
    this.hintBox.classList.remove('brawl-ui-hide')
  }

  /** ROUND 1 banner + countdown into the fight (post-intro flow). */
  _beginRoundFlow() {
    if (this.disposed) return
    const { audio, profile } = this.ctx
    if (profile.appearance.trail !== 'none' && !this._heroTrail) {
      this._heroTrail = this.vfx.trail(this.player.hero.hips, { color: profile.appearance.glow, size: 0.34, rate: 12, life: 0.5 })
    }
    if (this.over) return
    this.hud.banner('ROUND 1', { sub: '3 STOCKS — LAST WARRIOR STANDING', color: '#ffb84d', duration: 2 })
    this._timeout(() => {
      if (this.over) return
      this.hud.countdown(audio).then(() => {
        if (this.disposed || this.over) return
        this.phase = 'fight'
        this._timeout(() => { if (!this.over) this.hud.banner('FIGHT!', { color: '#c23b2e', duration: 1.1 }) }, 450)
      })
    }, 1500)
  }

  /**
   * Per-frame drama bookkeeping (presentation + results stats only):
   * peak damage, launches survived, and the one-time DEFIANT call-out for
   * a warrior who rides out a kill-strength launch at 150%+.
   */
  _dramaTick() {
    for (const f of this.baseFighters) {
      const st = this._stats.get(f)
      if (f.dmg > st.maxDmg) st.maxDmg = f.dmg
      if (st.airborne && f.state === 'fight' && f.grounded && f.hitstun <= 0) {
        st.airborne = false
        st.survives++
        if (!st.defiant && f.dmg >= 150) {
          st.defiant = true
          _v1.set(f.pos.x, f.pos.y + 2.7 * f.scaleMul, 0)
          this.vfx.text(_v1, 'DEFIANT', { color: '#e8dcc4', size: 1.1, life: 1.25, rise: 1.1 })
          this.ctx.audio.play('levelup', { vol: 0.35 })
        }
      }
    }
  }

  /** Pure display trigger: announcer call-out when a warrior teeters on their last stock. */
  _announcer() {
    for (const f of this.baseFighters) {
      if (f.stocks !== 1 || f.dmg <= 120 || f.state !== 'fight' || this._endThem.has(f)) continue
      this._endThem.add(f)
      this.hud.banner('END THEM!', { sub: `${f.name} IS ON THE BRINK`, color: '#c23b2e', duration: 1.8 })
      this.ctx.audio.play('crowd', { vol: 0.5 })
      break
    }
  }

  /** Soft push so grounded fighters don't stack inside each other. */
  _separate(gdt) {
    for (let i = 0; i < this.fighters.length; i++) {
      for (let j = i + 1; j < this.fighters.length; j++) {
        const a = this.fighters[i], b = this.fighters[j]
        if (a.state !== 'fight' || b.state !== 'fight') continue
        const dx = b.pos.x - a.pos.x
        const minD = 0.45 * (a.scaleMul + b.scaleMul)
        if (Math.abs(dx) > minD || Math.abs(b.pos.y - a.pos.y) > 1.2) continue
        const push = (minD - Math.abs(dx)) * 6 * gdt * (dx >= 0 ? 1 : -1)
        a.pos.x -= push
        b.pos.x += push
      }
    }
  }

  // ============================== combat ==============================

  _resolveMelee() {
    for (const a of this.fighters) {
      if (a.state !== 'fight' || !a.attack) continue
      const atk = a.attack
      const def = ATTACKS[atk.kind]
      if (atk.hasHit || atk.t < def.from || atk.t > def.to) continue
      let connected = false
      let heavyHit = false
      for (const d of this.fighters) {
        if (d === a || d.team === a.team || d.state !== 'fight' || d.untouchable()) continue
        const dxf = (d.pos.x - a.pos.x) * a.facing
        const reach = def.reach * a.scaleMul
        if (dxf < -0.3 || dxf > reach + 0.4 * d.scaleMul) continue
        if (Math.abs((d.pos.y + d.scaleMul) - (a.pos.y + a.scaleMul)) > 1.7 * Math.max(a.scaleMul, d.scaleMul)) continue
        connected = true
        const dmg = def.heavy ? randInt(def.dmgMin, def.dmgMax) : def.dmg
        const kb = this._applyHit(a, d, {
          dmg, base: def.base, scale: def.scale, up: def.up,
          dir: a.facing, color: a.glow,
        })
        if (def.heavy && kb > 0) heavyHit = true
      }
      if (connected) {
        atk.hasHit = true
        const stA = this._stats.get(a) // favorite-move bookkeeping (results panel)
        if (stA) def.heavy ? stA.smash++ : stA.jab++
        if (heavyHit) {
          this.freezeT = 0.042
          this.ctx.engine.shake(0.4, 0.32)
          this.ctx.audio.play('kill', { vol: 0.55 })
        }
      }
    }
  }

  /**
   * Deal damage% + scaling knockback to `d`, credited to `a`.
   * Returns the knockback magnitude (0 if absorbed).
   */
  _applyHit(a, d, { dmg, base, scale, up, dir, color = '#ffd166' }) {
    _v1.set((a.pos.x + d.pos.x) / 2, d.pos.y + 1.1 * d.scaleMul, 0.4)
    if (d.isClone) {
      d.hp -= dmg
      d.vel.x += dir * 3
      d.flashT = 1
      this.vfx.impact(_v1, { color, size: 0.7 })
      this.ctx.audio.play('hit', { vol: 0.3 })
      return 0
    }
    if (d.shield && d.shield.hp > 0) {
      d.shield.hp -= dmg
      this.vfx.flash(_v1, { color: '#d8c9a0', size: 2, life: 0.18 })
      this.ctx.audio.play('shield', { vol: 0.5 })
      if (d.shield.hp <= 0) this._breakShield(d)
      return 0
    }
    d.dmg = Math.min(999, d.dmg + dmg)
    const kb = (base + d.dmg * scale) * a.kbDealtMul * d.kbTakenMul
    d.vel.x = dir * kb
    d.vel.y = Math.max(d.vel.y, kb * up)
    if (kb * up > 3.5) { d.grounded = false; d.pos.y += 0.04 }
    d.hitstun = 0.1 + kb * 0.02
    d.tumble = kb > 10
    d.spinV = -dir * rand(8, 14)
    d.attack = null
    d.flashT = 1
    d.lastHitBy = a
    d.lastHitT = 4
    d.iFrames = Math.max(d.iFrames, 0.12)

    this.vfx.impact(_v1, { color, size: kb > 10 ? 1.2 : 0.75 })
    if (this._txt > 0) {
      this._txt--
      _v2.set(d.pos.x, d.pos.y + 2.3 * d.scaleMul, 0)
      this.vfx.text(_v2, `${Math.round(dmg)}%`, { color: kb > 10 ? '#ff9440' : '#ffe9a8', size: kb > 10 ? 0.85 : 0.6, life: 0.75, rise: 2.2 })
    }
    this.ctx.audio.play('hit', { vol: clamp(0.3 + kb * 0.03, 0.3, 0.85) })
    if (kb > 11) {
      d._launchTrail?.stop()
      d._launchTrail = this.vfx.trail(d.hero.hips, { color: '#ffb056', size: 0.7, rate: 55, life: 0.4 })
      this._timeout(() => { d._launchTrail?.stop(); d._launchTrail = null }, 600)
    }
    // knockback-strength reads (presentation + stats only)
    const stD = this._stats.get(d)
    if (stD) {
      if (d.dmg > stD.maxDmg) stD.maxDmg = d.dmg
      if (kb > 11) stD.airborne = true
    }
    if (kb > 17) {
      _v2.set(d.pos.x, d.pos.y + 2.8 * d.scaleMul, 0)
      this.vfx.text(_v2, 'LAUNCHED!', { color: '#ff8c3b', size: 1.05, life: 0.95, rise: 1.5 })
    }
    return kb
  }

  _breakShield(f) {
    f.shield = null
    this.bubble.visible = false
    _v1.set(f.pos.x, f.pos.y + 1, 0)
    this.vfx.burst(_v1, { color: '#c9b98e', count: 20, speed: 6, size: 0.26 })
    this.ctx.audio.play('shield', { vol: 0.4 })
  }

  // ============================== blast zones / KO ==============================

  _checkBlast(f) {
    if (f.state !== 'fight') return
    if (Math.abs(f.pos.x) < BLAST.x && f.pos.y > BLAST.bottom && f.pos.y < BLAST.top) return
    if (f.isClone) { this._removeClone(false); return }
    this._ko(f)
  }

  _ko(f) {
    const ex = clamp(f.pos.x, -24, 24)
    const ey = clamp(f.pos.y + 1, -11.5, 19)
    _v1.set(ex, ey, 0)
    // KO blast: shattering-stone burst + ember plume
    this.vfx.flash(_v1, { color: '#ffd9a0', size: 7, life: 0.3 })
    this.vfx.burst(_v1, { color: f.color, count: 30, speed: 13, size: 0.4, life: 0.7, up: 4 })
    this.vfx.burst(_v1, { color: '#8a7d6a', count: 20, speed: 9, size: 0.32, life: 0.8, up: 2, gravity: -18 })
    this.vfx.burst(_v1, { color: '#ff8c3b', count: 24, speed: 7, size: 0.3, life: 0.95, up: 9, gravity: 3 })
    this.vfx.ring(_v1, { color: f.color, radius: 4, life: 0.4, y: ey })
    this.vfx.text(_v1, 'KO!', { color: '#c23b2e', size: 2, life: 1.1, rise: 1 })
    this.ctx.engine.shake(0.55, 0.45)
    this.ctx.audio.play('explode', { vol: 0.8 })
    this.ctx.audio.play('tower', { vol: 0.5 }) // stock-loss sting
    // KO drama: brief slow-mo + camera punch toward the blast zone
    this.slowmoT = Math.max(this.slowmoT, 0.5)
    this.punch = Math.max(this.punch, 0.6)
    this._punchPos.set(ex, ey, 0)
    const st = this._stats.get(f)
    st.airborne = false

    f.stocks--
    f.falls++
    const killer = f.lastHitBy && !f.lastHitBy.isClone ? f.lastHitBy : (f.lastHitBy ? this.player : null)
    if (killer && killer !== f) {
      killer.kos++
      this.bHud.feed(`${killer.name} KO'd ${f.name}!`, killer.color)
    } else {
      this.bHud.feed(`${f.name} fell into the chasm!`, f.color)
    }
    if (f.stocks > 0) {
      f.startKO()
    } else {
      f.startKO()
      f.state = 'out'
      f.stocks = 0
      st.elim = ++this._elimN
      this.bHud.feed(`${f.name} is ELIMINATED`, '#ff5c6e')
      this._checkEnd()
      this._timeout(() => this._maybeShowdown(), 500)
    }
  }

  /** Exactly two warriors left: SHOWDOWN! banner, mutual zoom, tighter framing. */
  _maybeShowdown() {
    if (this.over || this._showdown) return
    const alive = this.baseFighters.filter(f => f.stocks > 0)
    if (alive.length !== 2) return
    this._showdown = true
    this._maxDist = 30    // camera stays tighter for the endgame
    this.zoomPulse = 0.9  // brief mutual zoom-in
    this._clearBanners()  // SHOWDOWN owns the center of the screen
    this.hud.banner('SHOWDOWN!', { sub: `${alive[0].name} VS ${alive[1].name}`, color: '#ff8c3b', duration: 2.1 })
    this.ctx.audio.play('crowd', { vol: 0.42 }) // low wind-swell
    this.ctx.audio.play('dash', { vol: 0.35 })
  }

  _checkEnd() {
    if (this.over) return
    if (this.player.stocks <= 0) { this._finish(false); return }
    const alive = this.baseFighters.filter(f => f.stocks > 0)
    if (alive.length === 1) this._finish(alive[0] === this.player)
  }

  _finish(won) {
    if (this.over) return
    this.over = won ? 'won' : 'lost'
    this._dismissIntro()
    // final-KO cinematic: extended slow-mo + ~25° orbit + letterbox
    this.slowmoT = 1.15
    this.orbitTarget = won ? 0.46 : -0.46
    this.punch = Math.max(this.punch, 0.45)
    this.bHud.setCine(true)
    this.abilityUi.root.classList.add('brawl-ui-hide')
    this.hintBox.classList.add('brawl-ui-hide')
    this._clearBanners()
    const profile = this.ctx.profile
    if (won) profile.stats.wins.brawl = (profile.stats.wins.brawl || 0) + 1
    this.ctx.saveProfile()
    if (this.clone) this._removeClone(false)

    const flawless = won && this.player.falls === 0
    this._timeout(() => {
      this.bHud.setCine(false)
      this.orbitTarget = 0
      this.abilityUi.root.classList.remove('brawl-ui-hide')
      this.hintBox.classList.remove('brawl-ui-hide')
      this.ctx.audio.play(won ? 'victory' : 'defeat')
      this.hud.banner(won ? 'CHAMPION' : 'DEFEATED', {
        color: won ? '#ffb84d' : '#c23b2e', duration: 0,
        sub: won ? (flawless ? 'FLAWLESS!' : 'THE ARENA IS YOURS') : 'ALL STOCKS LOST',
      })
      if (won) {
        this.player.hero.setState('dance')
        for (let i = 0; i < 6; i++) {
          this._timeout(() => {
            _v1.set(this.player.pos.x + rand(-7, 7), this.player.pos.y + rand(1, 6), rand(-2, 2))
            this.vfx.burst(_v1, { color: pick(['#ffb84d', '#ff8c3b', '#c23b2e', '#e8dcc4']), count: 26, speed: 8, size: 0.32 })
            this.ctx.audio.play('coin', { vol: 0.35 })
          }, 300 + i * 650)
        }
      } else {
        for (const f of this.baseFighters) {
          if (f !== this.player && f.state === 'fight') f.hero.setState('dance')
        }
      }
      this.bHud.results({
        rows: this._resultsRows(),
        won,
        onHub: () => { this.ctx.audio.play('click'); this.ctx.goTo('hub') },
      })
    }, 950)
    this._timeout(() => this.ctx.goTo('hub'), 950 + 8000)
  }

  /** Podium-ordered per-fighter stat rows for the results tablet. */
  _resultsRows() {
    const ranked = [...this.baseFighters].sort((a, b) => this._rankOf(b) - this._rankOf(a))
    return ranked.map((f, i) => {
      const st = this._stats.get(f)
      return {
        name: f.name, color: f.color, place: i + 1, winner: i === 0,
        kos: f.kos, taken: f.falls, maxDmg: Math.round(st.maxDmg),
        survived: st.survives, fav: this._favoriteOf(f),
      }
    })
  }

  _rankOf(f) {
    if (f.stocks > 0) return 1000 + f.stocks * 20 - Math.min(19, f.dmg * 0.05)
    return this._stats.get(f).elim // later elimination places higher
  }

  /** Player: most-cast art. AI warriors: their most-landed strike. */
  _favoriteOf(f) {
    if (f.isPlayer) {
      let bi = -1, bc = 0
      this._artCasts.forEach((c, i) => { if (c > bc) { bc = c; bi = i } })
      return bi >= 0 ? this.skillDefs[bi].name : '—'
    }
    const st = this._stats.get(f)
    if (!st.jab && !st.smash) return '—'
    return st.smash >= st.jab ? 'SMASH' : 'JAB FLURRY'
  }

  _clearBanners() {
    for (const b of this.hud.root.querySelectorAll('.big-banner')) b.remove()
  }

  // ============================== skills ==============================

  _castSkill(i) {
    if (this.over || this.phase !== 'fight' || this.cds[i] > 0.001) return
    if (this.player.state !== 'fight') return
    const def = this.skillDefs[i]
    const fn = this._casters[def.archetype]
    if (!fn) return
    this.cds[i] = def.cd
    this._artCasts[i]++
    this.abilityUi.flash(i)
    this.player.hero.cast()
    this.ctx.audio.play('cast', { vol: 0.5 })
    fn(def)
  }

  _enemiesOf(f) {
    return this.fighters.filter(o => o !== f && o.team !== f.team && o.state === 'fight' && !o.untouchable())
  }

  _buildCasters() {
    const audio = this.ctx.audio
    const p = this.player
    this._casters = {
      // Blink: dodge through attacks / recover to the ledge; resets air jump
      dash: def => {
        const input = this.ctx.input
        let dirX = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0)
        const offStage = Math.abs(p.pos.x) > MAIN.halfW
        if (!dirX) dirX = offStage ? -Math.sign(p.pos.x) : p.facing
        _v1.set(p.pos.x, p.pos.y + 1, 0)
        let tx = clamp(p.pos.x + dirX * def.params.range * 0.62, -BLAST.x + 2, BLAST.x - 2)
        let ty = p.pos.y
        if (offStage && p.pos.y < 1) ty = Math.min(p.pos.y + 4.5, 9) // ledge recovery lift
        p.pos.x = tx
        p.pos.y = ty
        p.vel.x *= 0.2
        p.vel.y = Math.max(p.vel.y, 0)
        p.airJumps = 1
        p.iFrames = Math.max(p.iFrames, 0.35)
        p.hitstun = 0
        p.tumble = false
        _v2.set(tx, ty + 1, 0)
        this.vfx.beam(_v1, _v2, { color: def.color, width: 0.3, life: 0.22 })
        this.vfx.flash(_v1, { color: def.color, size: 1.8 })
        this.vfx.flash(_v2, { color: def.color, size: 2.4 })
        audio.play('dash')
      },

      // Starfire: % racking bolt across the stage
      projectile: def => {
        const from = p.hero.castPoint(_v1)
        from.z = 0
        _v2.set(p.facing, 0.02, 0)
        const h = this.vfx.projectile({ from, dir: _v2, speed: def.params.speed, color: def.color, size: 0.72, life: 2.2, light: 2, trail: true })
        this.bolts.push({ h, caster: p })
        this.vfx.flash(from, { color: def.color, size: 1.4, life: 0.15 })
        audio.play('zap', { vol: 0.5 })
      },

      // Grave Chill: cursed cold zone on the platform surface under you
      slowfield: def => {
        const surf = p.platform || MAIN
        const x = clamp(p.pos.x, surf.x - surf.halfW, surf.x + surf.halfW)
        const y = surf.y
        const r = def.params.radius
        const g = new THREE.Group()
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(r, 40),
          new THREE.MeshBasicMaterial({ color: new THREE.Color('#aebfb4').multiplyScalar(0.7), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
        )
        disc.rotation.x = -Math.PI / 2
        const rim = new THREE.Mesh(
          new THREE.RingGeometry(r - 0.24, r, 48),
          new THREE.MeshBasicMaterial({ color: new THREE.Color('#dce8dc').multiplyScalar(1.7), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        )
        rim.rotation.x = -Math.PI / 2
        rim.position.y = 0.02
        g.add(disc, rim)
        g.position.set(x, y + 0.06, 0)
        this.scene.add(g)
        _v1.set(x, y, 0)
        this.vfx.ring(_v1, { color: def.color, radius: r, life: 0.5, y: y + 0.08 })
        this.frost.push({ x, y, r, slow: def.params.slow, dmg: def.params.damage, t: 0, dur: def.params.duration, hit: new Set(), group: g, rim })
      },

      // Seismic Slam: point-blank launcher, kill move at high percent
      nova: def => {
        _v1.set(p.pos.x, p.pos.y, 0)
        this.vfx.shockwave(_v1, { color: def.color, radius: def.params.radius })
        this.ctx.engine.shake(0.45, 0.4)
        audio.play('explode', { vol: 0.7 })
        const r = def.params.radius * p.scaleMul
        for (const d of this._enemiesOf(p)) {
          const dx = d.pos.x - p.pos.x, dy = d.pos.y - p.pos.y
          if (dx * dx + dy * dy > r * r) continue
          this._applyHit(p, d, { dmg: 16, base: 9, scale: 0.16, up: 0.78, dir: Math.sign(dx) || p.facing, color: def.color })
        }
      },

      // Overdrive: 1.5x move + attack speed
      buff: def => {
        p.buffT = def.params.duration
        this._buffTrail?.stop()
        this._buffTrail = this.vfx.trail(p.hero.hips, { color: def.color, size: 0.7, rate: 42, life: 0.4 })
        _v1.set(p.pos.x, p.pos.y + 1, 0)
        this.vfx.flash(_v1, { color: def.color, size: 2.4 })
        audio.play('dash', { vol: 0.7 })
      },

      // Aegis: absorb bubble vs damage %
      shield: def => {
        p.shield = { hp: def.params.absorb, max: def.params.absorb, t: def.params.duration }
        this.bubble.visible = true
        audio.play('shield')
        _v1.set(p.pos.x, p.pos.y, 0)
        this.vfx.ring(_v1, { color: def.color, radius: 2, life: 0.4, y: p.pos.y + 0.06 })
      },

      // Vital Surge: shave 45% off your damage meter
      heal: def => {
        p.dmg = Math.max(0, p.dmg - def.params.amount)
        audio.play('heal')
        _v1.set(p.pos.x, p.pos.y, 0)
        this.vfx.ring(_v1, { color: def.color, radius: 2.4, life: 0.5, y: p.pos.y + 0.06 })
        _v1.y += 1.2
        this.vfx.burst(_v1, { color: def.color, count: 20, speed: 4.5, size: 0.28, gravity: 3, up: 3 })
        _v1.y += 1
        this.vfx.text(_v1, `-${def.params.amount}%`, { color: def.color, size: 0.9 })
      },

      // Mirror Decoy: clone fights beside you (jabs only) for 6s
      summon: def => {
        if (this.clone) this._removeClone(false)
        const f = new Fighter({
          scene: this.scene, vfx: this.vfx, audio,
          appearance: this.ctx.profile.appearance, name: 'DECOY', color: def.color,
          team: 0, isClone: true, spawnX: clamp(p.pos.x + p.facing * 1.6, -12, 12),
        })
        f.pos.y = p.pos.y + 0.1
        f.hp = def.params.hp
        f.hero.group.traverse(o => {
          if (o.material && !o.material._decoyed) {
            o.material._decoyed = true
            o.material.transparent = true
            o.material.opacity = Math.min(o.material.opacity ?? 1, 0.55)
          }
        })
        this.clone = { f, ai: new BrawlAI(f, { jabsOnly: true }), t: def.params.duration }
        this.fighters.push(f)
        _v1.set(f.pos.x, f.pos.y + 1, 0)
        this.vfx.flash(_v1, { color: def.color, size: 2.6 })
        this.vfx.burst(_v1, { color: def.color, count: 18, speed: 5, size: 0.26 })
      },

      // Gravity Well: yank fighters into the air above you — combo starter
      pull: def => {
        _v1.set(p.pos.x, p.pos.y + 1.4, 0)
        this.vfx.flash(_v1, { color: def.color, size: 3.2, life: 0.35 })
        this.vfx.ring(_v1, { color: def.color, radius: def.params.radius, life: 0.5, y: p.pos.y + 0.08 })
        this.vfx.burst(_v1, { color: def.color, count: 24, speed: 6, size: 0.3, up: 6, gravity: 4 })
        audio.play('zap', { vol: 0.6 })
        const r = def.params.radius
        for (const d of this._enemiesOf(p)) {
          const dx = d.pos.x - p.pos.x, dy = d.pos.y - p.pos.y
          if (dx * dx + dy * dy > r * r) continue
          d.dmg = Math.min(999, d.dmg + def.params.damage)
          d.vel.x = clamp((p.pos.x - d.pos.x) * 2.2, -9, 9)
          d.vel.y = 11.5
          d.grounded = false
          d.pos.y += 0.05
          d.hitstun = 0.42
          d.flashT = 1
          d.lastHitBy = p
          d.lastHitT = 4
          _v2.set(d.pos.x, d.pos.y + 1.6, 0)
          this.vfx.text(_v2, `${def.params.damage}%`, { color: def.color, size: 0.6 })
          this.vfx.lightning(_v1, _v2, { color: def.color, life: 0.22 })
        }
      },

      // Titan Form: 1.75x scale, 0.6x knockback taken, 1.5x dealt
      giant: def => {
        p.giantT = def.params.duration
        audio.play('levelup')
        _v1.set(p.pos.x, p.pos.y, 0)
        this.vfx.ring(_v1, { color: def.color, radius: 4, life: 0.5, y: p.pos.y + 0.06 })
        _v1.y += 1.4
        this.vfx.flash(_v1, { color: def.color, size: 3.2 })
      },

      // Phase Cloak: untouchable + translucent for 3s
      ghost: def => {
        p.ghostT = def.params.duration
        if (!this._ghostMats) {
          const saved = new Map()
          p.hero.group.traverse(o => {
            if (o.material && o !== this.bubble && !saved.has(o.material)) {
              saved.set(o.material, [o.material.transparent, o.material.opacity])
              o.material.transparent = true
              o.material.opacity = Math.min(o.material.opacity ?? 1, 0.32)
            }
          })
          this._ghostMats = saved
        }
        _v1.set(p.pos.x, p.pos.y + 1, 0)
        this.vfx.flash(_v1, { color: def.color, size: 2.4 })
        audio.play('dash', { vol: 0.5 })
      },

      // Comet Crash: comet smashes the stage center — massive launch
      meteor: def => {
        const cx = 0, cy = MAIN.y
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.84, 1, 48),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(1.8), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.set(cx, cy + 0.07, 0)
        ring.scale.setScalar(def.params.radius)
        this.scene.add(ring)
        _v1.set(cx + 11, 30, -7)
        _v2.set(cx, cy + 0.4, 0).sub(_v1)
        const dist = _v2.length()
        const h = this.vfx.projectile({ from: _v1, dir: _v2.normalize(), speed: dist / def.params.delay, color: def.color, size: 1.4, life: def.params.delay + 1, light: 3, trail: true })
        this.meteors.push({ x: cx, y: cy, h, t: 0, delay: def.params.delay, radius: def.params.radius + 1.2, ring, boomed: false, color: def.color })
      },
    }
  }

  _updateSkills(gdt, dt) {
    const p = this.player
    for (let i = 0; i < 4; i++) {
      this.cds[i] = Math.max(0, this.cds[i] - gdt)
      this.abilityUi.setCooldown(i, this.cds[i] / this.skillDefs[i].cd, this.cds[i])
      const a = this.skillDefs[i].archetype
      const on = (a === 'buff' && p.buffT > 0) || (a === 'giant' && p.giantT > 0)
        || (a === 'ghost' && p.ghostT > 0) || (a === 'shield' && !!p.shield)
        || (a === 'summon' && !!this.clone)
      this.abilityUi.setActive(i, on)
    }

    if (p.buffT > 0) {
      p.buffT -= gdt
      if (p.buffT <= 0) {
        this._buffTrail?.stop()
        this._buffTrail = null
      }
    }
    if (p.giantT > 0) p.giantT -= gdt
    if (p.ghostT > 0) {
      p.ghostT -= gdt
      if (p.ghostT <= 0 && this._ghostMats) {
        for (const [m, [tr, op]] of this._ghostMats) {
          m.transparent = tr
          m.opacity = op
        }
        this._ghostMats = null
        _v1.set(p.pos.x, p.pos.y + 1, 0)
        this.vfx.flash(_v1, { color: '#d8d2c4', size: 1.8 })
      }
    }
    if (p.shield) {
      p.shield.t -= gdt
      const k = Math.max(0, p.shield.hp) / p.shield.max
      this.bubble.material.opacity = 0.1 + 0.22 * k
      this.bubble.scale.setScalar(1 + 0.05 * Math.sin(p.hero.t * 6))
      if (p.shield.t <= 0) this._breakShield(p)
    }

    // frost zones
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
      for (const d of this._enemiesOf(p)) {
        if (Math.abs(d.pos.x - z.x) > z.r || Math.abs(d.pos.y - z.y) > 1.3) continue
        d.chillT = Math.max(d.chillT, 0.2)
        if (!z.hit.has(d)) {
          z.hit.add(d)
          d.dmg = Math.min(999, d.dmg + z.dmg)
          d.flashT = 1
          d.lastHitBy = p
          d.lastHitT = 4
          _v1.set(d.pos.x, d.pos.y + 1.8, 0)
          this.vfx.text(_v1, `${z.dmg}%`, { color: '#cfe0d2', size: 0.6 })
          this.vfx.impact(_v1, { color: '#cfe0d2', size: 0.6 })
        }
      }
    }

    // meteors
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i]
      m.t += gdt
      m.ring.material.opacity = 0.35 + 0.35 * Math.sin(m.t * 16)
      if (!m.boomed && (m.h.pos.y <= m.y + 0.5 || !m.h.alive || m.t >= m.delay + 0.4)) {
        m.boomed = true
        m.h.kill()
        _v1.set(m.x, m.y, 0)
        this.vfx.shockwave(_v1, { color: m.color, radius: m.radius + 1 })
        this.vfx.ring(_v1, { color: '#ffffff', radius: m.radius, life: 0.35, y: m.y + 0.1 })
        this.ctx.engine.shake(0.7, 0.5)
        this.ctx.audio.play('explode', { vol: 0.9 })
        for (const d of this._enemiesOf(p)) {
          const dx = d.pos.x - m.x, dy = d.pos.y - m.y
          if (dx * dx + dy * dy > m.radius * m.radius) continue
          this._applyHit(p, d, { dmg: 22, base: 13, scale: 0.17, up: 0.85, dir: Math.sign(dx) || (Math.random() < 0.5 ? -1 : 1), color: m.color })
        }
        this.scene.remove(m.ring)
        m.ring.geometry.dispose()
        m.ring.material.dispose()
        this.meteors.splice(i, 1)
      }
    }

    // starfire bolts
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      if (!b.h.alive) { this.bolts.splice(i, 1); continue }
      const bp = b.h.pos
      if (Math.abs(bp.x) > BLAST.x + 4) {
        b.h.kill()
        this.bolts.splice(i, 1)
        continue
      }
      for (const d of this._enemiesOf(b.caster)) {
        if (Math.abs(bp.x - d.pos.x) > 0.9 * d.scaleMul || Math.abs(bp.y - (d.pos.y + d.scaleMul)) > 1.2 * d.scaleMul) continue
        this.vfx.impact(bp, { color: '#ffb454', size: 0.9 })
        this._applyHit(b.caster, d, { dmg: 12, base: 3.4, scale: 0.045, up: 0.5, dir: Math.sign(b.h.vel.x) || 1, color: '#ffb454' })
        b.h.kill()
        this.bolts.splice(i, 1)
        break
      }
    }
  }

  _updateClone(gdt, dt) {
    const c = this.clone
    c.t -= gdt
    const fighting = this.phase === 'fight' && !this.over
    const it = fighting ? c.ai.update(gdt, this.fighters) : c.ai.intent
    c.f.update(gdt, dt, it, PLATFORMS)
    if (c.t <= 0 || c.f.hp <= 0) this._removeClone(true)
  }

  _removeClone(withVfx) {
    const c = this.clone
    if (!c) return
    if (withVfx) {
      _v1.set(c.f.pos.x, c.f.pos.y + 1, 0)
      this.vfx.flash(_v1, { color: c.f.color, size: 2.2 })
      this.vfx.burst(_v1, { color: c.f.color, count: 20, speed: 6, size: 0.26 })
      this.ctx.audio.play('explode', { vol: 0.25 })
    }
    c.f.dispose()
    this.scene.remove(c.f.root)
    this.scene.remove(c.f.pad)
    disposeObject3D(c.f.root)
    disposeObject3D(c.f.pad)
    const idx = this.fighters.indexOf(c.f)
    if (idx >= 0) this.fighters.splice(idx, 1)
    this.clone = null
  }

  // ============================== camera ==============================

  _updateCamera(dt, t) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0
    for (const f of this.baseFighters) {
      if (f.state !== 'fight' && f.state !== 'respawn') continue
      n++
      if (f.pos.x < minX) minX = f.pos.x
      if (f.pos.x > maxX) maxX = f.pos.x
      if (f.pos.y < minY) minY = f.pos.y
      if (f.pos.y > maxY) maxY = f.pos.y
    }
    if (!n) { minX = maxX = 0; minY = maxY = 3 }
    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2
    const spread = Math.max(maxX - minX, (maxY - minY) * 1.35)

    // drama modifiers: KO punch (toward the blast), showdown zoom, final-KO orbit
    this.punch = damp(this.punch, 0, 1.5, dt)
    this.zoomPulse = damp(this.zoomPulse, 0, 1.2, dt)
    this.orbit = damp(this.orbit, this.orbitTarget, 2.6, dt)
    const dist = clamp(spread * 0.95 + 8.5, 14, this._maxDist)
      * (1 - this.punch * 0.28 - this.zoomPulse * 0.3)
    const cx = lerp(midX * 0.9, clamp(this._punchPos.x, -16, 16), this.punch * 0.55)
    const cy = lerp(midY * 0.55, clamp(this._punchPos.y, -6, 12) * 0.55, this.punch * 0.55)

    const k = 1 - Math.exp(-5 * dt)
    _v1.set(
      cx + Math.sin(t * 0.31) * 0.35 + Math.sin(this.orbit) * dist,
      cy + 3.6 + Math.sin(t * 0.43) * 0.3,
      Math.cos(this.orbit) * dist,
    )
    this.camera.position.lerp(_v1, k)
    _v2.set(cx, cy + 2, 0)
    this._look.lerp(_v2, k)
    this.camera.lookAt(this._look)
  }

  // ============================== plumbing ==============================

  _timeout(fn, ms) {
    const id = setTimeout(() => { if (!this.disposed) fn() }, ms)
    this._timeouts.push(id)
    return id
  }

  dispose() {
    this.disposed = true
    for (const id of this._timeouts) clearTimeout(id)
    this._heroTrail?.stop()
    this._buffTrail?.stop()
    for (const f of this.fighters) f.dispose()
    this.vfx.dispose()
  }
}
