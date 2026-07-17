import * as THREE from 'three'
import { getSkill, WASD_KEY_LABELS, wasdKeyIndex } from '../../meta/skills.js'
import { HUD } from '../../ui/hud.js'
import { VFX } from '../../art/vfx.js'
import { createHero } from '../../art/characterFactory.js'
import { emberGlowMaterial, glowSpriteMaterial } from '../../art/materials.js'
import { clamp, damp, lerp, rand, TAU, distXZ, pick, disposeObject3D } from '../../core/utils.js'
import { buildArena, ARENA_R } from './arenaEnv.js'
import { Horde, Boss } from './enemies.js'
import { WAVE_COUNT, BOSS_WAVE, buildWaveQueue } from './waves.js'
import '../../ui/arena.css'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()

const HERO_SPEED = 9
const BLASTER_INTERVAL = 0.16

/**
 * THE PIT — torchlit horde-survival in a volcanic fighting pit.
 * WASD move, aim with cursor, hold LMB to fire, 1-4 (or Q/E/R) loadout skills.
 * 8 waves; wave 5 is the PIT WARDEN boss.
 */
export default class ArenaScene {
  constructor(ctx) {
    this.ctx = ctx
    // realism grade: bloom reserved for true fire (high threshold), neutral saturation
    this.postOpts = { bloom: 0.5, bloomThreshold: 0.9, bloomRadius: 0.45, vignette: 0.62, saturation: 1.0, grain: 0.04, exposure: 1.02 }
  }

  async init() {
    const { engine, input, audio, profile } = this.ctx
    this.scene = new THREE.Scene()
    this.scene.environment = engine.envMap
    this.env = buildArena(this.scene)

    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 700)
    this.camOffset = new THREE.Vector3(0, 17.5, 9)
    this.camera.position.copy(this.camOffset)
    this._look = new THREE.Vector3(0, 0.6, 0)
    this.camera.lookAt(this._look)

    this.vfx = new VFX(this.scene)
    this.horde = new Horde(this.scene, ARENA_R)

    // ---------- hero ----------
    this.hero = createHero(profile.appearance, { auraRing: true })
    this.scene.add(this.hero.group)
    if (profile.appearance.trail !== 'none') {
      this.heroTrail = this.vfx.trail(this.hero.hips, { color: profile.appearance.glow, size: 0.38, rate: 14, life: 0.5 })
    }
    this.hp = 100
    this.iFrames = 0
    this.heroK = new THREE.Vector3()
    this.heroScale = 1
    this.aim = new THREE.Vector3(0, 0, 6)
    this.fireT = 0

    // shield bubble (hidden until Iron Bulwark)
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 24, 18),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#9fb4c8').multiplyScalar(1.2), transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    this.bubble.position.y = 1
    this.bubble.visible = false
    this.hero.group.add(this.bubble)

    // wall-push feedback sprite (ember flare off the rock rim)
    this.edgeS = new THREE.Sprite(glowSpriteMaterial('#ff8c3b', 0))
    this.edgeS.scale.set(7.5, 3, 1)
    this.scene.add(this.edgeS)

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
    this.bossBolts = []
    this.orbs = []
    this.orbPool = []
    this._orbGeo = new THREE.SphereGeometry(0.2, 12, 10)
    this._orbMat = emberGlowMaterial(1.8, '#ffb84d')
    this._ghostMats = null
    this._buildCasters()

    // ---------- game state ----------
    this.score = 0
    this.dispScore = 0
    this.kills = 0
    this.streak = 0
    this.streakT = 0
    this.wave = 0
    this.waveState = 'break'
    this.breakT = 2.2
    this.spawnQueue = []
    this.spawnT = 0
    this.boss = null
    this.slowmoT = 0
    this.timeScale = 1
    this.over = null
    this._timeouts = []
    this._txt = 12

    this._hordeCtx = {
      heroPos: this.hero.group.position,
      decoyPos: null,
      over: false,
      meleeHero: e => this._enemyMeleeHero(e),
      meleeDecoy: e => this._enemyMeleeDecoy(e),
      detonate: e => this._explode(e),
    }

    // ---------- HUD ----------
    const hud = this.hud = new HUD()
    this.abilityUi = hud.abilityBar(this.skillDefs, { game: 'arena', keys: WASD_KEY_LABELS })
    this.hpBar = hud.bar({ label: 'HP', color: '#8fae4a' })
    Object.assign(this.hpBar.root.style, { left: '26px', bottom: '34px', width: '300px' })
    this.waveEl = hud.el('div', 'arena-wave', 'STEEL YOURSELF')
    const scoreBox = hud.el('div', 'arena-score', '<span>SCORE</span><b>0</b>')
    this.scoreNum = scoreBox.querySelector('b')
    this.bossBox = hud.el('div', 'arena-boss',
      '<div class="arena-boss-name">PIT WARDEN</div><div class="arena-boss-track"><div class="arena-boss-fill"></div></div>')
    this.bossBox.style.display = 'none'
    this.bossFill = this.bossBox.querySelector('.arena-boss-fill')
    this.vgEl = hud.el('div', 'arena-vignette')
    this.lowEl = hud.el('div', 'arena-lowhp')
    this.hintBox = hud.hints([
      ['WASD', 'Move'], ['MOUSE', 'Aim'], ['HOLD LMB', 'Hurl fire'], ['1-4', 'Skills'], ['H', 'Toggle help'],
    ])

    input.onKey((code, down) => {
      if (!down) return
      const i = wasdKeyIndex(code)
      if (i >= 0) this._castSkill(i)
      else if (code === 'KeyH') this.hintBox.style.display = this.hintBox.style.display === 'none' ? '' : 'none'
    })

    audio.music('arena')
    profile.stats.plays.arena = (profile.stats.plays.arena || 0) + 1
    this.ctx.saveProfile()
    this._timeout(() => { if (!this.over) this.hud.banner('WAVE 1', { color: '#ffb84d', sub: 'SURVIVE THE HORDE' }) }, 650)

    this.debug = {
      win: () => this._victory(),
      lose: () => this._defeat(),
      wave: n => this._jumpWave(n),
    }
  }

  // ============================== main loop ==============================

  update(dt, t) {
    // boss-death slow-mo
    if (this.slowmoT > 0) {
      this.slowmoT -= dt
      this.timeScale = this.slowmoT > 0.55 ? 0.22 : lerp(0.22, 1, 1 - Math.max(0, this.slowmoT) / 0.55)
    } else this.timeScale = 1
    const gdt = dt * this.timeScale
    this._txt = 12

    // environment motion
    for (const tk of this.env.tickables) tk.tick(dt)
    for (const g of this.env.gates) {
      if (g.flash > 0) {
        g.flash = Math.max(0, g.flash - dt * 2)
        g.archMat.color.copy(g.baseColor).multiplyScalar(1 + 2.6 * g.flash)
        g.portalMat.uniforms.uIntensity.value = 0.7 + 2.2 * g.flash
      }
    }
    // wall pulse fade
    const em = this.edgeS.material
    if (em.opacity > 0) {
      em.opacity = Math.max(0, em.opacity - dt * 2.4)
      this.env.rimMat.color.copy(this.env.rimBase).multiplyScalar(1 + 0.9 * em.opacity)
    }

    this.vfx.update(dt)

    if (!this.over) this._updatePlayer(gdt, dt)
    else this.hero.update(dt)

    this._updateSkills(gdt, dt)
    this._updateZones(gdt, dt)
    this._updateDecoy(gdt, dt)
    this._updateWaves(gdt)

    this._hordeCtx.decoyPos = this.decoy ? this.decoy.hero.group.position : null
    this._hordeCtx.over = !!this.over
    this.horde.update(gdt, this._hordeCtx)

    if (this.boss) this._updateBoss(gdt)
    this._updateBolts(gdt)
    this._updateOrbs(gdt, dt)

    if (this.streakT > 0) {
      this.streakT -= gdt
      if (this.streakT <= 0) this.streak = 0
    }

    this._updateHud(dt)
    this._updateCamera(dt)
  }

  // ============================== player ==============================

  _updatePlayer(gdt, dt) {
    const input = this.ctx.input
    const pos = this.hero.group.position

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

    const r = Math.hypot(pos.x, pos.z)
    const maxR = ARENA_R - 1.4
    if (r > maxR) {
      pos.x *= maxR / r
      pos.z *= maxR / r
      this._edgePulse(pos)
    }

    this.iFrames = Math.max(0, this.iFrames - gdt)

    // blaster
    this.fireT -= gdt
    if (input.buttonDown(0) && this.fireT <= 0) {
      this.fireT = BLASTER_INTERVAL
      this._fireBlaster()
    }

    // colossus form scale + stomps
    this.heroScale = damp(this.heroScale, this.giantT > 0 ? 1.75 : 1, 9, dt)
    this.hero.group.scale.setScalar(this.heroScale)
    if (this.giantT > 0 && (mx || mz)) {
      this.stompT -= gdt
      if (this.stompT <= 0) {
        this.stompT = 0.42
        this.vfx.ring(pos, { color: '#c9b083', radius: 3, life: 0.4 })
        this.ctx.audio.play('explode', { vol: 0.22 })
        this._aoeEnemies(pos.x, pos.z, 3, 8, { color: '#c9b083', knock: 3.5, hitBoss: false })
      }
    }

    this.hero.update(dt)
  }

  _fireBlaster() {
    const from = this.hero.castPoint(_v1)
    _v2.copy(this.aim)
    _v2.y = from.y
    _v3.copy(_v2).sub(from)
    if (_v3.lengthSq() < 0.01) _v3.set(0, 0, 1)
    _v3.normalize()
    const glow = this.ctx.profile.appearance.glow || '#ffb84d'
    const h = this.vfx.projectile({ from, dir: _v3, speed: 34, color: glow, size: 0.26, life: 1.05, trail: true })
    this.bolts.push({ h, dmg: this.giantT > 0 ? 12 : 8, r: 0.42, big: null })
    this.hero.cast()
    this.ctx.audio.play('zap', { vol: 0.28 })
    this.vfx.flash(from, { color: glow, size: 0.8, life: 0.1 })
    this.hero.group.position.addScaledVector(_v3, -0.045) // light recoil
  }

  _edgePulse(pos) {
    const a = Math.atan2(pos.x, pos.z)
    this.edgeS.position.set(Math.sin(a) * (ARENA_R - 0.8), 1.2, Math.cos(a) * (ARENA_R - 0.8))
    this.edgeS.material.opacity = 0.85
  }

  _damageHero(dmg, fromPos, { knock = 2.4 } = {}) {
    if (this.over || this.ghostT > 0 || this.iFrames > 0) return
    const pos = this.hero.group.position
    if (this.shield) {
      this.shield.hp -= dmg
      _v1.copy(pos)
      _v1.y = 1.1
      this.vfx.flash(_v1, { color: '#9fb4c8', size: 2, life: 0.18 })
      this.ctx.audio.play('shield', { vol: 0.5 })
      if (this.shield.hp <= 0) this._breakShield()
      this.iFrames = 0.25
      return
    }
    this.hp -= dmg
    this.iFrames = 0.5
    this.ctx.audio.play('hit', { vol: 0.7 })
    this.vgEl.classList.remove('arena-vg-on')
    void this.vgEl.offsetWidth
    this.vgEl.classList.add('arena-vg-on')
    if (fromPos) {
      _v3.copy(pos).sub(fromPos)
      _v3.y = 0
      if (_v3.lengthSq() < 0.01) _v3.set(0, 0, 1)
      _v3.normalize()
      this.heroK.addScaledVector(_v3, knock)
    }
    _v1.copy(pos)
    _v1.y = 1
    this.vfx.burst(_v1, { color: '#c23b2e', count: 12, speed: 5, size: 0.22 })
    if (this.hp <= 0) {
      this.hp = 0
      this._defeat()
    }
  }

  _enemyMeleeHero(e) {
    const brute = e.type === 'brute'
    if (brute) this.ctx.engine.shake(0.22, 0.28)
    this._damageHero(e.def.dmg, e.minion.group.position, { knock: brute ? 6 : 2.4 })
  }

  _enemyMeleeDecoy(e) {
    if (!this.decoy) return
    this.decoy.hp -= e.def.dmg
    _v1.copy(this.decoy.hero.group.position)
    _v1.y = 1
    this.vfx.flash(_v1, { color: '#8f86a3', size: 1, life: 0.12 })
  }

  // ============================== combat helpers ==============================

  _hitEnemy(e, dmg, { color = '#e8dcc4', size = 0.55, kx = 0, kz = 0 } = {}) {
    if (!e.alive) return
    if (kx || kz) { e.kx += kx; e.kz += kz }
    const killed = this.horde.damage(e, dmg)
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
    this.score += 10
    this.kills++
    _v1.copy(pos)
    _v1.y += 1.1
    this.vfx.text(_v1, '+10', { color: '#ffb84d', size: 0.6, life: 0.8 })
    this.streak++
    this.streakT = 4
    if (this.streak === 10) {
      this.hud.banner('RAMPAGE!', { color: '#ff8c3b', duration: 1.4, cls: 'arena-streak' })
      this.ctx.audio.play('kill', { vol: 0.8 })
    } else if (this.streak === 20) {
      this.hud.banner('END THEM!', { color: '#c23b2e', duration: 1.6, cls: 'arena-streak' })
      this.ctx.audio.play('kill', { vol: 1 })
    }
    if (e.type === 'exploder') this._explode(e)
    else if (Math.random() < 0.2) this._dropOrb(pos)
  }

  _explode(e) {
    if (e.exploded) return
    e.exploded = true
    const p = e.minion.group.position
    this.vfx.ring(p, { color: '#ff5a26', radius: 3.2, life: 0.4 })
    this.vfx.burst(p, { color: '#ff8c3b', count: 22, speed: 8, size: 0.3 })
    _v1.copy(p)
    _v1.y = 0.8
    this.vfx.flash(_v1, { color: '#ff5a26', size: 3 })
    this.ctx.audio.play('explode', { vol: 0.5 })
    if (!this.over && distXZ(this.hero.group.position, p) < 3) this._damageHero(15, p, { knock: 4 })
    if (this.decoy && distXZ(this.decoy.hero.group.position, p) < 3) this.decoy.hp -= 15
    this._aoeEnemies(p.x, p.z, 3, 15, { color: '#ff8c3b', knock: 3, exclude: e })
    this.horde.kill(e)
  }

  _aoeEnemies(x, z, r, dmg, { color = '#ffb84d', knock = 0, exclude = null, hitBoss = true } = {}) {
    for (const e of this.horde.active) {
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
      this._hitEnemy(e, dmg, { color, kx, kz })
    }
    if (hitBoss && this.boss && this.boss.alive) {
      const bp = this.boss.group.position
      const dx = bp.x - x, dz = bp.z - z
      if (dx * dx + dz * dz < (r + 1.6) * (r + 1.6)) this._hitBoss(dmg, color)
    }
  }

  _hitBoss(dmg, color = '#e8dcc4') {
    const boss = this.boss
    if (!boss || !boss.alive) return
    boss.damage(dmg)
    if (this._txt > 0) {
      this._txt--
      _v1.copy(boss.group.position)
      _v1.y += 5.4
      this.vfx.text(_v1, String(Math.round(dmg)), { color, size: 0.75, life: 0.7, rise: 2.2 })
    }
    if (boss.hp <= 0) this._bossDeath()
  }

  // ============================== orbs ==============================

  _dropOrb(pos) {
    if (this.orbs.length >= 10) return
    let o = this.orbPool.pop()
    if (!o) {
      const g = new THREE.Group()
      const core = new THREE.Mesh(this._orbGeo, this._orbMat)
      const halo = new THREE.Sprite(glowSpriteMaterial('#ffb84d', 0.55))
      halo.scale.setScalar(1.3)
      g.add(core, halo)
      this.scene.add(g)
      o = { g }
    }
    o.t = rand(10)
    o.life = 0
    o.g.visible = true
    o.g.position.set(pos.x, 0.6, pos.z)
    this.orbs.push(o)
  }

  _updateOrbs(gdt, dt) {
    const hp = this.hero.group.position
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i]
      o.t += dt
      o.life += gdt
      const p = o.g.position
      p.y = 0.6 + Math.sin(o.t * 3) * 0.16
      const d = distXZ(p, hp)
      if (!this.over && d < 2.5) {
        const pull = 11 * gdt
        p.x += ((hp.x - p.x) / (d || 1)) * pull
        p.z += ((hp.z - p.z) / (d || 1)) * pull
      }
      if (!this.over && d < 0.9) {
        this.hp = Math.min(100, this.hp + 12)
        this.ctx.audio.play('heal', { vol: 0.5 })
        this.vfx.burst(p, { color: '#ffb84d', count: 14, speed: 4, size: 0.24 })
        _v1.copy(hp)
        _v1.y = 2
        this.vfx.text(_v1, '+12', { color: '#ffb84d', size: 0.7 })
        o.g.visible = false
        this.orbPool.push(o)
        this.orbs.splice(i, 1)
      } else if (o.life > 20) {
        o.g.visible = false
        this.orbPool.push(o)
        this.orbs.splice(i, 1)
      }
    }
  }

  // ============================== skills ==============================

  _castSkill(i) {
    if (this.over || this.cds[i] > 0.001) return
    const def = this.skillDefs[i]
    const fn = this._casters[def.archetype]
    if (!fn) return
    this.cds[i] = def.cd
    this.abilityUi.flash(i)
    this.hero.cast()
    this.ctx.audio.play('cast', { vol: 0.5 })
    fn(def)
  }

  _clampToArena(v, margin = 1.2) {
    const r = Math.hypot(v.x, v.z)
    const mx = ARENA_R - margin
    if (r > mx) {
      v.x *= mx / r
      v.z *= mx / r
    }
    return v
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
        this._clampToArena(_v2, 1.4)
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
        this.bolts.push({ h, dmg: def.params.damage, r: 0.8, big: { radius: def.params.radius + 1.6, color: def.color } })
        this.vfx.flash(from, { color: def.color, size: 1.6, life: 0.15 })
      },

      slowfield: def => {
        const c = this._clampToArena(this.aim.clone(), 2)
        const r = def.params.radius
        const g = new THREE.Group()
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(r, 40),
          new THREE.MeshBasicMaterial({ color: new THREE.Color('#c8d2d8').multiplyScalar(0.8), transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
        )
        disc.rotation.x = -Math.PI / 2
        const rim = new THREE.Mesh(
          new THREE.RingGeometry(r - 0.24, r, 48),
          new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8eef0').multiplyScalar(1.45), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
        )
        rim.rotation.x = -Math.PI / 2
        rim.position.y = 0.02
        g.add(disc, rim)
        g.position.set(c.x, 0.05, c.z)
        this.scene.add(g)
        this.vfx.ring(c, { color: def.color, radius: r, life: 0.5 })
        this.frost.push({ x: c.x, z: c.z, r, slow: def.params.slow, dmg: def.params.damage, t: 0, dur: def.params.duration, hit: new Set(), group: g, disc, rim })
      },

      nova: def => {
        const pos = this.hero.group.position
        this.vfx.shockwave(pos, { color: def.color, radius: def.params.radius })
        this.ctx.engine.shake(0.45, 0.4)
        audio.play('explode', { vol: 0.7 })
        this._aoeEnemies(pos.x, pos.z, def.params.radius, def.params.damage, { color: def.color, knock: def.params.knock })
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
        const c = this._clampToArena(this.aim.clone(), 2)
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
        const c = this._clampToArena(this.aim.clone(), 2)
        const r = def.params.radius
        const g = new THREE.Group()
        const mkRing = (ri, ro, op) => {
          const m = new THREE.Mesh(
            new THREE.RingGeometry(ri, ro, 40),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(1.4), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
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
          const saved = new Map() // materials are shared between meshes — save each ONCE
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
        const c = this._clampToArena(this.aim.clone(), 2)
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.84, 1, 48),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(1.5), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
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
      this.abilityUi.setCooldown(i, this.cds[i] / this.skillDefs[i].cd, this.cds[i])
      const a = this.skillDefs[i].archetype
      const on = (a === 'buff' && this.buffT > 0) || (a === 'giant' && this.giantT > 0)
        || (a === 'ghost' && this.ghostT > 0) || (a === 'shield' && !!this.shield)
        || (a === 'summon' && !!this.decoy)
      this.abilityUi.setActive(i, on)
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
        this.vfx.flash(_v1, { color: '#d8d2c2', size: 1.8 })
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
    this.vfx.burst(_v1, { color: '#9fb4c8', count: 20, speed: 6, size: 0.26 })
    this.ctx.audio.play('shield', { vol: 0.4 })
  }

  _updateZones(gdt, dt) {
    // frost fields
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
      for (const e of this.horde.active) {
        if (!e.alive) continue
        const p = e.minion.group.position
        const dx = p.x - z.x, dz = p.z - z.z
        if (dx * dx + dz * dz > (z.r + 0.4) * (z.r + 0.4)) continue
        e.slowMul = Math.min(e.slowMul, 1 - z.slow)
        if (!z.hit.has(e)) {
          z.hit.add(e)
          this._hitEnemy(e, z.dmg, { color: '#c8d2d8' })
        }
      }
    }
    // gravity vortices
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i]
      v.t += gdt
      v.r1.rotation.z += dt * 4.2
      v.r2.rotation.z -= dt * 2.6
      const k = 1 - v.t / v.dur
      v.group.scale.setScalar(0.5 + 0.5 * k)
      if (v.t >= v.dur) {
        this.vfx.burst(v.group.position, { color: '#a1252c', count: 20, speed: 7, size: 0.28 })
        this.scene.remove(v.group)
        disposeObject3D(v.group)
        this.vortices.splice(i, 1)
        continue
      }
      for (const e of this.horde.active) {
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
          this._hitEnemy(e, v.dmg, { color: '#c23b2e' })
        }
      }
    }
    // meteors
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
        this._aoeEnemies(m.x, m.z, m.radius, m.dmg, { color: m.color, knock: 5 })
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
      this.vfx.flash(_v1, { color: '#8f86a3', size: 2.4 })
      this.vfx.burst(_v1, { color: '#8f86a3', count: 22, speed: 6, size: 0.28 })
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
    if (this.spawnQueue.length && this.horde.aliveCount() < 40) {
      this.spawnT -= gdt
      if (this.spawnT <= 0) {
        this.spawnT = 0.55
        const n = Math.min(2, this.spawnQueue.length)
        for (let i = 0; i < n; i++) this._spawnOne(this.spawnQueue.pop())
        this.ctx.audio.play('spawn', { vol: 0.3 })
      }
    }
    if (!this.spawnQueue.length && this.horde.active.length === 0 && !this.boss) {
      if (this.wave >= WAVE_COUNT) {
        this._victory()
      } else {
        this.waveState = 'break'
        this.breakT = 2.5
        const next = this.wave + 1
        this.hud.banner(`WAVE ${next}`, {
          color: next === BOSS_WAVE ? '#c23b2e' : '#ffb84d',
          duration: 1.9,
          sub: next === BOSS_WAVE ? 'THE WARDEN COMES' : '',
        })
      }
    }
  }

  _startWave(n) {
    this.wave = n
    this.waveState = 'active'
    this.spawnQueue = buildWaveQueue(n)
    this.spawnT = 0.2
    if (n === BOSS_WAVE) this._spawnBoss()
  }

  _spawnOne(type) {
    const g = pick(this.env.gates)
    g.flash = 1
    const x = g.x + rand(-1.6, 1.6), z = g.z + rand(-1.6, 1.6)
    this.horde.spawn(type, x, z)
    _v1.set(g.x, 1.4, g.z)
    this.vfx.flash(_v1, { color: '#ff8c3b', size: 2.6, life: 0.3 })
  }

  // ============================== boss ==============================

  _spawnBoss() {
    const hp = this.hero.group.position
    let best = this.env.gates[0], bd = -1
    for (const g of this.env.gates) {
      const d = (g.x - hp.x) * (g.x - hp.x) + (g.z - hp.z) * (g.z - hp.z)
      if (d > bd) { bd = d; best = g }
    }
    this.boss = new Boss(this.scene, {
      heroPos: this.hero.group.position,
      arenaR: ARENA_R,
      slam: pos => this._bossSlam(pos),
      radialBurst: p => this._bossBurst(p),
      summonMinions: p => this._bossSummon(p),
    })
    this.boss.group.position.set(best.x, 0, best.z)
    best.flash = 1
    _v1.set(best.x, 3, best.z)
    this.vfx.flash(_v1, { color: '#c23b2e', size: 6, life: 0.45 })
    this.ctx.audio.play('spawn', { vol: 0.9 })
    this.hud.banner('PIT WARDEN', { color: '#c23b2e', sub: 'KEEPER OF THE PIT', duration: 2.4 })
    this.bossBox.style.display = ''
  }

  _bossSlam(pos) {
    this.vfx.shockwave(pos, { color: '#c23b2e', radius: 6 })
    this.ctx.engine.shake(0.5, 0.45)
    this.ctx.audio.play('explode', { vol: 0.65 })
    if (!this.over && distXZ(this.hero.group.position, pos) < 6.2) this._damageHero(20, pos, { knock: 7 })
    if (this.decoy && distXZ(this.decoy.hero.group.position, pos) < 6.2) this.decoy.hp -= 20
  }

  _bossBurst(p) {
    this.ctx.audio.play('cast', { vol: 0.6 })
    _v1.set(p.x, 3.4, p.z)
    this.vfx.flash(_v1, { color: '#c23b2e', size: 3.4, life: 0.25 })
    for (let k = 0; k < 8; k++) {
      const a = (k * TAU) / 8 + rand(0.25)
      _v1.set(p.x + Math.cos(a) * 1.6, 1.5, p.z + Math.sin(a) * 1.6)
      _v2.set(Math.cos(a), 0, Math.sin(a))
      const h = this.vfx.projectile({ from: _v1, dir: _v2, speed: 11.5, color: '#c23b2e', size: 0.5, life: 3.4, trail: false })
      this.bossBolts.push(h)
    }
  }

  _bossSummon(p) {
    this.ctx.audio.play('spawn', { vol: 0.6 })
    this.vfx.ring(p, { color: '#c23b2e', radius: 4.5, life: 0.5 })
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4
      this.horde.spawn('grunt', p.x + Math.cos(a) * 2.4, p.z + Math.sin(a) * 2.4)
    }
  }

  _bossDeath() {
    const boss = this.boss
    if (!boss || !boss.alive) return
    boss.alive = false
    boss.hero.setState('ko')
    boss.tele.visible = false
    this.slowmoT = 1.3
    this.score += 250
    this.kills++
    const pos = boss.group.position.clone()
    _v1.copy(pos)
    _v1.y = 5
    this.vfx.text(_v1, '+250', { color: '#ffb84d', size: 1.7, life: 1.4 })
    this.ctx.audio.play('kill', { vol: 1 })
    const chain = (delay, r, color) => this._timeout(() => {
      this.vfx.shockwave(pos, { color, radius: r })
      this.ctx.engine.shake(0.55, 0.5)
      this.ctx.audio.play('explode', { vol: 0.7 })
    }, delay)
    chain(0, 6, '#c23b2e')
    chain(280, 9.5, '#ff5a26')
    chain(560, 14, '#ffb84d')
    this.hud.banner('WARDEN DOWN', { color: '#ffb84d', duration: 2.2 })
    this._timeout(() => this._removeBoss(), 2600)
  }

  _removeBoss() {
    const boss = this.boss
    if (!boss) return
    this.bossBox.style.display = 'none'
    boss.disposeTele()
    this.scene.remove(boss.group)
    disposeObject3D(boss.group)
    this.boss = null
  }

  _updateBoss(gdt) {
    this.boss.update(gdt, !!this.over)
    this.bossFill.style.width = `${(Math.max(0, this.boss.hp) / this.boss.maxHp) * 100}%`
  }

  // ============================== projectiles ==============================

  _updateBolts() {
    const heroPos = this.hero.group.position
    // player bolts vs horde + boss
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      if (!b.h.alive) { this.bolts.splice(i, 1); continue }
      const bp = b.h.pos
      if (Math.hypot(bp.x, bp.z) > ARENA_R + 6) {
        b.h.kill()
        this.bolts.splice(i, 1)
        continue
      }
      let hit = false
      for (const e of this.horde.active) {
        if (!e.alive) continue
        const p = e.minion.group.position
        const rr = b.r + 0.5 * e.def.scale
        const dx = p.x - bp.x, dz = p.z - bp.z
        if (dx * dx + dz * dz > rr * rr || bp.y > 2.4 * e.def.scale) continue
        hit = true
        if (b.big) {
          this.vfx.shockwave(bp, { color: b.big.color, radius: b.big.radius })
          this.ctx.audio.play('explode', { vol: 0.5 })
          this._aoeEnemies(bp.x, bp.z, b.big.radius, b.dmg, { color: b.big.color, knock: 2.5 })
        } else {
          this.vfx.flash(bp, { color: '#ffffff', size: 0.6, life: 0.1 })
          this._hitEnemy(e, b.dmg)
        }
        break
      }
      if (!hit && this.boss && this.boss.alive) {
        const p = this.boss.group.position
        const dx = p.x - bp.x, dz = p.z - bp.z
        if (dx * dx + dz * dz < (b.r + 1.7) * (b.r + 1.7) && bp.y < 6.5) {
          hit = true
          if (b.big) {
            this.vfx.shockwave(bp, { color: b.big.color, radius: b.big.radius })
            this.ctx.audio.play('explode', { vol: 0.5 })
            this._aoeEnemies(bp.x, bp.z, b.big.radius, b.dmg, { color: b.big.color, knock: 2.5 })
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
    // boss bolts vs hero
    for (let i = this.bossBolts.length - 1; i >= 0; i--) {
      const h = this.bossBolts[i]
      if (!h.alive) { this.bossBolts.splice(i, 1); continue }
      if (Math.hypot(h.pos.x, h.pos.z) > ARENA_R + 4) {
        h.kill()
        this.bossBolts.splice(i, 1)
        continue
      }
      if (!this.over && this.iFrames <= 0 && this.ghostT <= 0 && distXZ(h.pos, heroPos) < 0.95) {
        this.vfx.impact(h.pos, { color: '#c23b2e', size: 0.8 })
        this._damageHero(10, h.pos, { knock: 3 })
        h.kill()
        this.bossBolts.splice(i, 1)
      }
    }
  }

  // ============================== end states ==============================

  /** Remove any in-flight banners (wave/streak) so end banners never overlap. */
  _clearBanners() {
    for (const b of this.hud.root.querySelectorAll('.big-banner')) b.remove()
  }

  _victory() {
    if (this.over) return
    this.over = 'won'
    this._clearBanners()
    this.ctx.audio.play('victory')
    this.hero.setState('dance')
    this.hero.setMoveSpeed(0)
    const profile = this.ctx.profile
    profile.stats.wins.arena = (profile.stats.wins.arena || 0) + 1
    this.ctx.saveProfile()
    this.hud.banner('ARENA CHAMPION', {
      color: '#ffb84d', duration: 0,
      sub: `SCORE ${this.score} — ${this.kills} KILLS — RETURNING TO HUB`,
    })
    for (let i = 0; i < 6; i++) {
      this._timeout(() => {
        _v1.set(rand(-8, 8), rand(1, 5), rand(-8, 8)).add(this.hero.group.position)
        _v1.y = rand(1, 5)
        this.vfx.burst(_v1, { color: pick(['#ffb84d', '#ff8c3b', '#e8dcc4']), count: 24, speed: 7, size: 0.3 })
        this.ctx.audio.play('coin', { vol: 0.4 })
      }, 500 + i * 700)
    }
    this._timeout(() => this.ctx.goTo('hub'), 8000)
  }

  _defeat() {
    if (this.over) return
    this.over = 'dead'
    this._clearBanners()
    this.hp = 0
    this.hero.setState('ko')
    this.hero.setMoveSpeed(0)
    this.ctx.audio.play('defeat')
    this.hud.banner('DEFEATED', {
      color: '#c23b2e', duration: 0,
      sub: `WAVE ${this.wave} — SCORE ${this.score}`,
    })
    const panel = this.hud.el('div', 'arena-end ui-interactive')
    const retry = document.createElement('button')
    retry.textContent = 'RETRY'
    retry.onclick = () => { this.ctx.audio.play('click'); this.ctx.goTo('arena') }
    const hub = document.createElement('button')
    hub.className = 'ghost'
    hub.textContent = 'HUB'
    hub.onclick = () => { this.ctx.audio.play('back'); this.ctx.goTo('hub') }
    panel.append(retry, hub)
  }

  _jumpWave(n) {
    if (this.over) return
    this.spawnQueue.length = 0
    this.horde.clearAll()
    if (this.boss) this._removeBoss()
    this.wave = clamp(n - 1, 0, WAVE_COUNT)
    this.waveState = 'break'
    this.breakT = 0.4
  }

  // ============================== hud / camera ==============================

  _updateHud(dt) {
    this.hpBar.set(this.hp / 100, `${Math.ceil(this.hp)} / 100`)
    this.dispScore += (this.score - this.dispScore) * Math.min(1, dt * 9)
    if (Math.abs(this.score - this.dispScore) < 0.6) this.dispScore = this.score
    this.scoreNum.textContent = String(Math.round(this.dispScore))

    let label
    if (this.over === 'won') label = 'ARENA CLEARED'
    else if (this.over === 'dead') label = `WAVE ${this.wave}`
    else if (this.waveState === 'break') label = `WAVE ${this.wave + 1} INCOMING`
    else {
      const left = this.spawnQueue.length + this.horde.aliveCount() + (this.boss && this.boss.alive ? 1 : 0)
      label = `WAVE ${this.wave} — ${left} LEFT`
    }
    this.waveEl.textContent = label
    this.lowEl.classList.toggle('on', this.hp > 0 && this.hp <= 28 && !this.over)
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
    this.buffTrail?.stop()
    this.heroTrail?.stop()
    this.vfx.dispose()
  }
}
