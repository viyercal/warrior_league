import * as THREE from 'three'
import { getSkill, KEY_CODES } from '../../meta/skills.js'
import { VFX } from '../../art/vfx.js'
import { createHero } from '../../art/characterFactory.js'
import { clamp, damp, lerp, rand, distXZ, pick } from '../../core/utils.js'
import { buildMap } from './map.js'
import { MinionArmy, Structures, EnemyChampion, HealthBar } from './units.js'
import { makeCasters, updateSkillEffects } from './combat.js'
import { buildMobaHud, endPanel } from './mobaHud.js'
import { HERO, MINION, GOLD, XP, ENERGY_COST, SPAWN_X, BOUNDS } from './constants.js'
import '../../ui/moba.css'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()

/**
 * WAR RIFT — single-lane 1v1 MOBA vs an AI warlord.
 * Right-click to move / attack, QWER loadout skills, B recall, Y camera lock.
 * Shatter the enemy war crystal (towers gate it, standard MOBA rules).
 */
export default class MobaScene {
  constructor(ctx) {
    this.ctx = ctx
    this.postOpts = { bloom: 0.84, bloomThreshold: 0.8, bloomRadius: 0.5, vignette: 0.52, saturation: 1.16, grain: 0.025 }
  }

  async init() {
    const { engine, input, audio, profile } = this.ctx
    this.audio = audio
    this.scene = new THREE.Scene()
    this.scene.environment = engine.envMap
    this.env = buildMap(this.scene)
    this.vfx = new VFX(this.scene)

    // ---------- camera ----------
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 700)
    this.camLock = true
    this.zoom = 24
    this.zoomT = 24
    this.camFocus = new THREE.Vector3(-SPAWN_X, 0, 0)
    this.camera.position.set(-SPAWN_X, 24, 14)
    this.camera.lookAt(this.camFocus)

    // ---------- player hero ----------
    this.hero = createHero(profile.appearance, { auraRing: true })
    this.hero.group.position.set(-SPAWN_X, 0, 0)
    this.hero.group.rotation.y = Math.PI / 2
    this.scene.add(this.hero.group)
    if (profile.appearance.trail !== 'none') {
      this.heroTrail = this.vfx.trail(this.hero.hips, { color: profile.appearance.glow, size: 0.38, rate: 14, life: 0.5 })
    }
    this.playerBar = new HealthBar(this.hero.group, { w: 1.35, y: 2.45, color: '#8fc25a', h: 0.13 })
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 24, 18),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#9aa8b8').multiplyScalar(1.5), transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    )
    this.bubble.position.y = 1
    this.bubble.visible = false
    this.hero.group.add(this.bubble)

    // ---------- player state ----------
    this.maxHp = HERO.hp
    this.hp = HERO.hp
    this.energy = HERO.energy
    this.level = 1
    this.xp = 0
    this.goldEarned = 0
    this.nextItemAt = GOLD.itemEvery
    this.itemDmg = 1
    this.itemSpd = 1
    this.cs = 0
    this.kills = 0
    this.deaths = 0
    this.playerDead = false
    this.respawnT = 0
    this.recallT = -1
    this.recallPulseT = 0
    this.moveTarget = null
    this.chaseTgt = null
    this.atkCd = 0
    this.heroK = new THREE.Vector3()
    this.heroScale = 1
    this.aim = new THREE.Vector3(-SPAWN_X + 6, 0, 0)
    this.playerVel = new THREE.Vector3()
    this._lastPos = new THREE.Vector3(-SPAWN_X, 0, 0)

    // ---------- skills ----------
    this.skillDefs = profile.loadout.map(getSkill)
    this.cds = [0, 0, 0, 0]
    this.buffT = 0
    this.giantT = 0
    this.ghostT = 0
    this.ghostMats = null
    this.shield = null
    this.buffTrail = null
    this.decoy = null
    this.frost = []
    this.vortices = []
    this.meteors = []
    this.skillBolts = []
    this.autoBolts = []
    this.casters = makeCasters(this)

    // ---------- units ----------
    this.army = new MinionArmy(this)
    this.structures = new Structures(this, this.env.towerDefs, this.env.nexusDefs)
    this.enemy = new EnemyChampion(this)
    this.enemy.group.userData.ent = { type: 'echamp' }
    for (const s of this.structures.list) s.def.group.userData.ent = { type: 'structure', s }

    // ---------- game state ----------
    this.gameT = 0
    this.waveT = MINION.firstWave
    this.over = null
    this._timeouts = []
    this._txt = 11

    // ---------- click markers ----------
    this.markers = {}
    for (const [key, color] of [['move', '#ffb84d'], ['atk', '#c23b2e']]) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.72, 0.95, 36),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(color).multiplyScalar(1.7), transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
      )
      m.rotation.x = -Math.PI / 2
      m.position.y = 0.07
      m.visible = false
      this.scene.add(m)
      this.markers[key] = { mesh: m, t: 1 }
    }

    // ---------- HUD ----------
    this.ui = buildMobaHud(this)

    // ---------- input ----------
    input.onKey((code, down) => {
      if (!down) return
      const i = KEY_CODES.indexOf(code)
      if (i >= 0) this._castSkill(i)
      else if (code === 'KeyB') this._startRecall()
      else if (code === 'KeyY') {
        this.camLock = !this.camLock
        if (this.camLock) this.camFocus.copy(this.hero.group.position)
        this.ui.hud.toast(this.camLock ? 'CAMERA LOCKED' : 'CAMERA UNLOCKED — edge-pan with mouse')
      } else if (code === 'KeyH') {
        this.ui.hintBox.style.display = this.ui.hintBox.style.display === 'none' ? '' : 'none'
      }
    })
    input.onMouse((btn, down) => { if (btn === 2 && down) this._command() })
    input.onWheel(dy => { this.zoomT = clamp(this.zoomT + dy * 0.012, 16, 32) })

    audio.music('battle')
    profile.stats.plays.moba = (profile.stats.plays.moba || 0) + 1
    this.ctx.saveProfile()
    this._timeout(() => {
      if (!this.over) this.ui.hud.banner('WAR RIFT', { color: '#ffb84d', sub: 'SHATTER THE ENEMY WAR CRYSTAL', duration: 2.6 })
    }, 600)

    this.debug = {
      win: () => this._victory(),
      lose: () => this._defeat(),
    }
  }

  // ============================== world interface (used by units/combat) ==============================

  playerTargetable() { return !this.playerDead && this.ghostT <= 0 && !this.over }
  playerHpFrac() { return this.hp / this.maxHp }
  dmgMul() { return (1 + 0.1 * (this.level - 1)) * this.itemDmg * (this.giantT > 0 ? 1.5 : 1) }
  moveSpeed() { return HERO.speed * this.itemSpd * (this.buffT > 0 ? 1.6 : 1) }
  cancelOrders() { this.moveTarget = null; this.chaseTgt = null }

  dmgNum(pos, str, { color = '#e8dcc4', size = 0.62 } = {}) {
    if (this._txt <= 0) return
    this._txt--
    this.vfx.text(pos, str, { color, size, life: 0.75, rise: 2.1 })
  }

  damagePlayer(dmg, srcPos, { knock = 2 } = {}) {
    if (this.over || this.playerDead || this.ghostT > 0) return
    const pos = this.hero.group.position
    if (this.shield) {
      this.shield.hp -= dmg
      _v1.copy(pos)
      _v1.y = 1.1
      this.vfx.flash(_v1, { color: '#9aa8b8', size: 2, life: 0.18 })
      this.ctx.audio.play('shield', { vol: 0.5 })
      if (this.shield.hp <= 0) this.breakShield()
      return
    }
    if (this.giantT > 0) dmg *= 0.7
    this.hp -= dmg
    this.playerBar.set(this.hp / this.maxHp)
    this.ui.vignette()
    this.ctx.audio.play('hit', { vol: 0.5 })
    _v1.copy(pos)
    _v1.y = 2.3
    this.dmgNum(_v1, String(Math.round(dmg)), { color: '#e05a48', size: 0.7 })
    if (srcPos) {
      _v2.copy(pos).sub(srcPos)
      _v2.y = 0
      if (_v2.lengthSq() < 0.01) _v2.set(1, 0, 0)
      this.heroK.addScaledVector(_v2.normalize(), knock)
    }
    if (this.hp <= 0) this._onPlayerDeath()
  }

  healPlayer(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount)
    this.playerBar.set(this.hp / this.maxHp)
    _v1.copy(this.hero.group.position)
    _v1.y = 2.3
    this.dmgNum(_v1, `+${Math.round(amount)}`, { color: '#9fce6a', size: 0.75 })
  }

  breakShield() {
    if (!this.shield) return
    this.shield = null
    this.bubble.visible = false
    _v1.copy(this.hero.group.position)
    _v1.y = 1
    this.vfx.burst(_v1, { color: '#9aa8b8', count: 20, speed: 6, size: 0.26 })
    this.ctx.audio.play('shield', { vol: 0.4 })
  }

  /** Player-sourced hit on a red minion (applies level/item/titan scaling). */
  hitMinion(e, base, { color = '#e8dcc4', kx = 0, kz = 0 } = {}) {
    if (!e.alive) return
    const dmg = Math.round(base * this.dmgMul())
    if (kx || kz) { e.kx += kx; e.kz += kz }
    _v1.copy(e.minion.group.position)
    _v1.y += 1.2
    this.dmgNum(_v1, String(dmg), { color, size: 0.55 })
    this.army.damage(e, dmg, { byPlayer: true })
  }

  /** Player-sourced hit on the enemy champion. */
  hitEnemyChamp(base, { color = '#e8dcc4' } = {}) {
    if (!this.enemy.alive) return
    const dmg = Math.round(base * this.dmgMul())
    _v1.copy(this.enemy.group.position)
    _v1.y += 2.2
    this.dmgNum(_v1, String(dmg), { color, size: 0.7 })
    _v1.y -= 1.1
    this.vfx.flash(_v1, { color: '#e06a52', size: 0.9, life: 0.12 })
    this.enemy.damage(dmg, { byPlayer: true })
  }

  /** Player AoE vs all red units. */
  aoeEnemies(x, z, r, dmg, { color = '#ffb84d', knock = 0 } = {}) {
    for (const e of this.army.active) {
      if (!e.alive || e.team !== 'red') continue
      const p = e.minion.group.position
      const dx = p.x - x, dz = p.z - z
      if (dx * dx + dz * dz > (r + 0.45) * (r + 0.45)) continue
      let kx = 0, kz = 0
      if (knock) {
        const d = Math.hypot(dx, dz) || 1
        kx = (dx / d) * knock
        kz = (dz / d) * knock
      }
      this.hitMinion(e, dmg, { color, kx, kz })
    }
    if (this.enemy.alive) {
      const p = this.enemy.group.position
      const dx = p.x - x, dz = p.z - z
      if (dx * dx + dz * dz < (r + 0.7) * (r + 0.7)) {
        if (knock) {
          const d = Math.hypot(dx, dz) || 1
          this.enemy.k.x += (dx / d) * knock
          this.enemy.k.z += (dz / d) * knock
        }
        this.hitEnemyChamp(dmg, { color })
      }
    }
  }

  // ============================== kill / gold / xp events ==============================

  onMinionKilled(e, byPlayer) {
    if (!byPlayer || e.team !== 'red') return
    this.cs++
    _v1.copy(e.minion.group.position)
    _v1.y += 1.6
    this.vfx.text(_v1, `+${GOLD.cs}g`, { color: '#ffb84d', size: 0.62, life: 0.9 })
    this.ctx.audio.play('coin', { vol: 0.5 })
    this._addGold(GOLD.cs)
    this._addXp(XP.cs)
  }

  onEnemySlain(byPlayer) {
    this.kills++
    this.ui.hud.banner('ENEMY SLAIN', { color: '#ffb84d', duration: 2, sub: byPlayer ? `+${GOLD.kill} GOLD` : '' })
    this.ctx.audio.play('kill', { vol: 0.9 })
    if (byPlayer) {
      _v1.copy(this.enemy.group.position)
      _v1.y = 2.6
      this.vfx.text(_v1, `+${GOLD.kill}g`, { color: '#ffb84d', size: 1, life: 1.2 })
      this._addGold(GOLD.kill)
      this._addXp(XP.kill)
    }
  }

  onStructureDestroyed(s, byTeam) {
    if (s.kind === 'tower') {
      if (s.team === 'red') {
        this.ui.hud.banner('WATCHTOWER FELLED', { color: '#ffb84d', duration: 2.2, sub: 'THE LANE IS OPEN' })
        if (byTeam === 'blue') {
          _v1.copy(s.pos)
          _v1.y = 4
          this.vfx.text(_v1, `+${GOLD.tower}g`, { color: '#ffb84d', size: 0.95, life: 1.2 })
          this._addGold(GOLD.tower)
        }
      } else {
        this.ui.hud.banner('YOUR WATCHTOWER HAS FALLEN', { color: '#c23b2e', duration: 2.2 })
      }
      return
    }
    // war crystal down — cinematic chain, then the end state
    const posC = s.pos.clone()
    for (const [delay, r, color] of [[150, 7, '#ffe6c8'], [420, 11, s.team === 'red' ? '#ffb84d' : '#c23b2e'], [720, 15, '#ffe6c8']]) {
      this._timeout(() => {
        posC.y = 0
        this.vfx.shockwave(posC, { color, radius: r })
        _v1.copy(posC)
        _v1.y = 3
        this.vfx.burst(_v1, { color, count: 30, speed: 12, size: 0.4, up: 6 })
        this.ctx.engine.shake(0.5, 0.4)
        this.ctx.audio.play('explode', { vol: 0.7 })
      }, delay)
    }
    this._timeout(() => (s.team === 'red' ? this._victory() : this._defeat()), 1100)
  }

  _addGold(amount) {
    this.goldEarned += amount
    while (this.goldEarned >= this.nextItemAt) {
      this.nextItemAt += GOLD.itemEvery
      this.itemDmg *= 1.06
      this.itemSpd *= 1.04
      this.ui.hud.toast('FORGED AT THE WAR CAMP: +DMG +SPD')
      this.ctx.audio.play('coin', { vol: 0.8 })
      _v1.copy(this.hero.group.position)
      _v1.y = 1.4
      this.vfx.flash(_v1, { color: '#ffb84d', size: 2.2 })
    }
  }

  _addXp(amount) {
    this.xp += amount
    while (this.level < 6 && this.xp >= HERO.xpLevels[this.level]) {
      this.level++
      this.maxHp += HERO.hpPerLevel
      this.hp = Math.min(this.maxHp, this.hp + 25)
      this.ui.setLevel(this.level)
      this.ui.pulseLevel()
      const pos = this.hero.group.position
      this.vfx.ring(pos, { color: '#ffb84d', radius: 2.6, life: 0.6 })
      _v1.copy(pos)
      _v1.y = 2.6
      this.vfx.text(_v1, 'LEVEL UP!', { color: '#ffb84d', size: 1, life: 1.2 })
      this.ctx.audio.play('levelup')
    }
  }

  // ============================== player death / respawn ==============================

  _onPlayerDeath() {
    if (this.playerDead) return
    this.hp = 0
    this.playerDead = true
    this.deaths++
    this.respawnT = 6 + 2 * this.level
    this.cancelOrders()
    this._cancelRecall()
    this.hero.setState('ko')
    this.hero.setMoveSpeed(0)
    this.playerBar.hide()
    this.ui.death.show()
    this.ui.death.set(this.respawnT)
    this.ctx.audio.play('kill', { vol: 1 })
    this.ctx.engine.shake(0.3, 0.4)
    const pos = this.hero.group.position
    _v1.copy(pos)
    _v1.y = 1
    this.vfx.impact(_v1, { color: '#c23b2e', size: 1.6 })
  }

  _respawnPlayer() {
    this.playerDead = false
    this.hp = this.maxHp
    this.energy = HERO.energy
    this.hero.setState('normal')
    this.hero.group.position.set(-SPAWN_X, 0, 0)
    this.hero.group.rotation.y = Math.PI / 2
    this.heroK.set(0, 0, 0)
    this.playerBar.hide()
    this.ui.death.hide()
    if (this.camLock) this.camFocus.copy(this.hero.group.position)
    _v1.set(-SPAWN_X, 1, 0)
    this.vfx.flash(_v1, { color: this.ctx.profile.appearance.glow, size: 3 })
    this.ctx.audio.play('spawn', { vol: 0.7 })
  }

  // ============================== commands / skills ==============================

  _pickList() {
    const list = []
    for (const e of this.army.active) if (e.alive && e.team === 'red') list.push(e.minion.group)
    if (this.enemy.alive) list.push(this.enemy.group)
    for (const s of this.structures.list) {
      if (s.team === 'red' && s.alive && this.structures.attackable(s)) list.push(s.def.group)
    }
    return list
  }

  _command() {
    if (this.over || this.playerDead) return
    const input = this.ctx.input
    const hits = input.pick(this.camera, this._pickList(), true)
    let ent = null
    for (const h of hits) {
      let o = h.object
      while (o && !o.userData.ent) o = o.parent
      if (o) { ent = o.userData.ent; break }
    }
    this._cancelRecall()
    if (!ent && input.groundPoint(this.camera, 0, _v1)) {
      // forgiving targeting: grab the nearest enemy within reach of the click point
      let bd = 1.7
      for (const e of this.army.active) {
        if (!e.alive || e.team !== 'red') continue
        const d = distXZ(_v1, e.minion.group.position)
        if (d < bd) { bd = d; ent = { type: 'minion', e } }
      }
      if (this.enemy.alive && distXZ(_v1, this.enemy.group.position) < bd + 0.4) ent = { type: 'echamp' }
      for (const s of this.structures.list) {
        if (s.team !== 'red' || !s.alive || !this.structures.attackable(s)) continue
        if (distXZ(_v1, s.pos) < s.radius + 0.8) ent = { type: 'structure', s }
      }
    }
    if (ent) {
      this.chaseTgt = ent
      this.moveTarget = null
      this._targetPoint(ent, _v1)
      this._showMarker('atk', _v1)
    } else if (input.groundPoint(this.camera, 0, _v1)) {
      _v1.x = clamp(_v1.x, -BOUNDS.x, BOUNDS.x)
      _v1.z = clamp(_v1.z, -BOUNDS.z, BOUNDS.z)
      this.moveTarget = this.moveTarget || new THREE.Vector3()
      this.moveTarget.copy(_v1)
      this.chaseTgt = null
      this._showMarker('move', _v1)
    }
  }

  _showMarker(key, pos) {
    const m = this.markers[key]
    m.mesh.position.set(pos.x, 0.07, pos.z)
    m.mesh.visible = true
    m.t = 0
  }

  _targetPoint(ent, out) {
    if (ent.type === 'minion') out.copy(ent.e.minion.group.position)
    else if (ent.type === 'echamp') out.copy(this.enemy.group.position)
    else out.copy(ent.s.pos)
    return out
  }

  _entValid(ent) {
    if (ent.type === 'minion') return ent.e.alive
    if (ent.type === 'echamp') return this.enemy.alive
    return ent.s.alive && this.structures.attackable(ent.s)
  }

  _castSkill(i) {
    if (this.over || this.playerDead || this.cds[i] > 0.001) return
    const def = this.skillDefs[i]
    const fn = this.casters[def.archetype]
    if (!fn) return
    const cost = ENERGY_COST[def.archetype] ?? 25
    if (this.energy < cost) {
      this.ctx.audio.play('back', { vol: 0.35 })
      this.ui.enBar.root.classList.remove('moba-deny')
      void this.ui.enBar.root.offsetWidth
      this.ui.enBar.root.classList.add('moba-deny')
      return
    }
    this._cancelRecall()
    if (this.ctx.input.groundPoint(this.camera, 0, _v1)) this.aim.copy(_v1)
    this.energy -= cost
    this.cds[i] = def.cd
    this.ui.abilityUi.flash(i)
    this.hero.cast()
    this.ctx.audio.play('cast', { vol: 0.5 })
    fn(def)
  }

  _startRecall() {
    if (this.over || this.playerDead || this.recallT >= 0) return
    this.cancelOrders()
    this.recallT = 0
    this.recallPulseT = 0
    this.ui.recall.show()
    this.ctx.audio.play('shield', { vol: 0.4 })
  }

  _cancelRecall() {
    if (this.recallT < 0) return
    this.recallT = -1
    this.ui.recall.hide()
  }

  // ============================== main loop ==============================

  update(dt) {
    if (!this.over) this.gameT += dt
    this._txt = 11
    for (const tk of this.env.tickables) tk.tick(dt)
    this.vfx.update(dt)

    if (!this.over) {
      this._updatePlayer(dt)
      this._updateWaves(dt)
    } else {
      this.hero.setMoveSpeed(0)
      this.hero.update(dt)
    }
    updateSkillEffects(this, dt)
    this.army.update(dt, this)
    this.enemy.update(dt, this)
    this.structures.update(dt, this)
    this._updateAutoBolts()
    this._updateMarkers(dt)
    this._updateHudFrame(dt)
    this._updateCamera(dt)
  }

  _updatePlayer(dt) {
    const input = this.ctx.input
    const pos = this.hero.group.position

    // velocity (enemy AI leads its skillshots with this)
    if (dt > 0.0001) {
      this.playerVel.copy(pos).sub(this._lastPos).divideScalar(dt)
      this.playerVel.y = 0
    }
    this._lastPos.copy(pos)

    if (this.playerDead) {
      this.respawnT -= dt
      this.ui.death.set(this.respawnT)
      if (this.respawnT <= 0) this._respawnPlayer()
      this.hero.update(dt)
      return
    }

    // regen
    this.hp = Math.min(this.maxHp, this.hp + HERO.regen * dt)
    this.energy = Math.min(HERO.energy, this.energy + HERO.energyRegen * dt)
    this.atkCd -= dt
    for (let i = 0; i < 4; i++) this.cds[i] = Math.max(0, this.cds[i] - dt)

    // live aim point for skills
    if (input.groundPoint(this.camera, 0, _v1)) {
      this.aim.copy(_v1)
      this.aim.x = clamp(this.aim.x, -BOUNDS.x, BOUNDS.x)
      this.aim.z = clamp(this.aim.z, -BOUNDS.z, BOUNDS.z)
    }

    // recall channel
    if (this.recallT >= 0) {
      this.recallT += dt
      this.recallPulseT -= dt
      this.ui.recall.set(this.recallT / HERO.recallTime)
      if (this.recallPulseT <= 0) {
        this.recallPulseT = 0.55
        this.vfx.ring(pos, { color: '#b8d4e8', radius: 2.3, life: 0.55 })
      }
      if (this.recallT >= HERO.recallTime) {
        this._cancelRecall()
        _v1.copy(pos)
        _v1.y = 1
        this.vfx.flash(_v1, { color: '#b8d4e8', size: 2.6 })
        pos.set(-SPAWN_X, 0, 0)
        this.hp = this.maxHp
        this.energy = HERO.energy
        this.playerBar.hide()
        if (this.camLock) this.camFocus.copy(pos)
        _v1.set(-SPAWN_X, 1, 0)
        this.vfx.flash(_v1, { color: '#b8d4e8', size: 3 })
        this.ctx.audio.play('heal')
      }
    }

    // movement / chase
    const spd = this.moveSpeed()
    let moving = 0
    if (this.chaseTgt && !this._entValid(this.chaseTgt)) this.chaseTgt = null
    if (this.chaseTgt) {
      this._targetPoint(this.chaseTgt, _v2)
      const range = this.chaseTgt.type === 'structure' ? HERO.range + this.chaseTgt.s.radius - 1 : HERO.range
      const d = distXZ(pos, _v2)
      if (d > range) {
        pos.x += ((_v2.x - pos.x) / d) * spd * dt
        pos.z += ((_v2.z - pos.z) / d) * spd * dt
        moving = spd
        this.hero.faceTowards(_v2, dt, 14)
      } else {
        this.hero.faceTowards(_v2, dt, 14)
        if (this.atkCd <= 0) this._autoAttack()
      }
    } else if (this.moveTarget) {
      const d = distXZ(pos, this.moveTarget)
      if (d > 0.25) {
        pos.x += ((this.moveTarget.x - pos.x) / d) * spd * Math.min(1, d / (spd * dt) || 1) * dt
        pos.z += ((this.moveTarget.z - pos.z) / d) * spd * Math.min(1, d / (spd * dt) || 1) * dt
        moving = spd
        this.hero.faceTowards(this.moveTarget, dt, 14)
      } else {
        this.moveTarget = null
      }
    }
    this.hero.setMoveSpeed(moving)

    // knockback + clamps
    pos.addScaledVector(this.heroK, dt)
    this.heroK.multiplyScalar(Math.exp(-5 * dt))
    pos.x = clamp(pos.x, -BOUNDS.x, BOUNDS.x)
    pos.z = clamp(pos.z, -BOUNDS.z, BOUNDS.z)
    this.structures.pushOut(pos, 0.45)

    // titan scale
    this.heroScale = damp(this.heroScale, this.giantT > 0 ? 1.75 : 1, 9, dt)
    this.hero.group.scale.setScalar(this.heroScale)

    this.playerBar.set(this.hp / this.maxHp)
    this.hero.update(dt)
  }

  _autoAttack() {
    this.atkCd = HERO.atkCd
    this.hero.cast()
    this.ctx.audio.play('zap', { vol: 0.28 })
    const from = this.hero.castPoint(_v1)
    this._targetPoint(this.chaseTgt, _v2)
    _v2.y = this.chaseTgt.type === 'structure' ? 3 : 1
    _v3.copy(_v2).sub(from)
    if (_v3.lengthSq() < 0.01) _v3.set(1, 0, 0)
    const glow = this.ctx.profile.appearance.glow || '#ffb84d'
    const h = this.vfx.projectile({ from, dir: _v3.normalize(), speed: 30, color: glow, size: 0.3, life: 1.4, trail: true })
    this.autoBolts.push({ h, tgt: this.chaseTgt })
  }

  _updateAutoBolts() {
    for (let i = this.autoBolts.length - 1; i >= 0; i--) {
      const b = this.autoBolts[i]
      if (!b.h.alive) { this.autoBolts.splice(i, 1); continue }
      if (!this._entValid(b.tgt)) { b.h.kill(); this.autoBolts.splice(i, 1); continue }
      this._targetPoint(b.tgt, _v1)
      _v1.y = b.tgt.type === 'structure' ? 3 : 0.9
      _v2.copy(_v1).sub(b.h.pos)
      const d = _v2.length()
      const hitR = b.tgt.type === 'structure' ? b.tgt.s.radius + 0.4 : 0.85
      if (d < hitR) {
        this.vfx.flash(b.h.pos, { color: '#ffe6c8', size: 0.7, life: 0.1 })
        if (b.tgt.type === 'minion') this.hitMinion(b.tgt.e, HERO.atkDmg)
        else if (b.tgt.type === 'echamp') this.hitEnemyChamp(HERO.atkDmg)
        else {
          const dmg = Math.round(HERO.atkDmg * this.dmgMul())
          _v1.y = 4
          this.dmgNum(_v1, String(dmg), { color: '#e8dcc4', size: 0.6 })
          this.structures.damage(b.tgt.s, dmg, 'blue')
        }
        b.h.kill()
        this.autoBolts.splice(i, 1)
        continue
      }
      b.h.vel.copy(_v2.multiplyScalar(30 / d))
    }
  }

  _updateWaves(dt) {
    this.waveT -= dt
    if (this.waveT > 0) return
    this.waveT = MINION.waveEvery
    this.army.spawnWave('blue')
    this.army.spawnWave('red')
    this.ctx.audio.play('spawn', { vol: 0.3 })
  }

  _updateMarkers(dt) {
    for (const key of ['move', 'atk']) {
      const m = this.markers[key]
      if (!m.mesh.visible) continue
      m.t += dt
      const k = m.t / 0.55
      if (k >= 1) { m.mesh.visible = false; continue }
      const e = 1 - Math.pow(1 - k, 3)
      m.mesh.scale.setScalar(lerp(1.8, 0.45, e))
      m.mesh.material.opacity = 0.95 * (1 - k)
    }
  }

  _updateHudFrame() {
    const ui = this.ui
    for (let i = 0; i < 4; i++) {
      ui.abilityUi.setCooldown(i, this.cds[i] / this.skillDefs[i].cd, this.cds[i])
      const a = this.skillDefs[i].archetype
      const on = (a === 'buff' && this.buffT > 0) || (a === 'giant' && this.giantT > 0)
        || (a === 'ghost' && this.ghostT > 0) || (a === 'shield' && !!this.shield)
        || (a === 'summon' && !!this.decoy)
      ui.abilityUi.setActive(i, on)
    }
    ui.hpBar.set(this.hp / this.maxHp, `${Math.ceil(this.hp)} / ${this.maxHp}`)
    ui.enBar.set(this.energy / HERO.energy, `${Math.floor(this.energy)} / ${HERO.energy}`)
    ui.setStats(this.goldEarned, this.cs, this.kills, this.deaths)
    ui.setClock(this.gameT)
    ui.drawMinimap()
  }

  _updateCamera(dt) {
    this.zoom = damp(this.zoom, this.zoomT, 8, dt)
    const f = this.camFocus
    if (this.camLock) {
      const hp = this.hero.group.position
      f.x = damp(f.x, hp.x, 9, dt)
      f.z = damp(f.z, hp.z, 9, dt)
    } else {
      const m = this.ctx.input.mousePx
      const pan = 30 * dt
      if (m.x < 28) f.x -= pan
      else if (m.x > innerWidth - 28) f.x += pan
      if (m.y < 28) f.z -= pan
      else if (m.y > innerHeight - 28) f.z += pan
      f.x = clamp(f.x, -BOUNDS.x, BOUNDS.x)
      f.z = clamp(f.z, -BOUNDS.z + 2, BOUNDS.z - 2)
    }
    const oz = this.zoom * (14 / 24)
    this.camera.position.set(f.x, this.zoom, f.z + oz)
    this.camera.lookAt(f.x, 0.4, f.z)
  }

  // ============================== end states ==============================

  _victory() {
    if (this.over) return
    this.over = 'won'
    this._cancelRecall()
    this.ui.death.hide()
    this.ui.recall.hide()
    this.ctx.audio.play('victory')
    if (!this.playerDead) this.hero.setState('dance')
    const profile = this.ctx.profile
    profile.stats.wins.moba = (profile.stats.wins.moba || 0) + 1
    this.ctx.saveProfile()
    this.ui.hud.banner('VICTORY', { color: '#ffb84d', duration: 0, sub: 'THE WAR RIFT IS YOURS' })
    endPanel(this.ui.hud, this.ctx)
    for (let i = 0; i < 8; i++) {
      this._timeout(() => {
        _v1.copy(this.hero.group.position)
        _v1.x += rand(-9, 9)
        _v1.z += rand(-7, 7)
        _v1.y = rand(2, 7)
        this.vfx.burst(_v1, { color: pick(['#ffb84d', '#ff8c3b', '#ff5a26', '#e8dcc4']), count: 26, speed: 8, size: 0.32, gravity: -4 })
        this.ctx.audio.play('coin', { vol: 0.4 })
      }, 400 + i * 650)
    }
    this._timeout(() => this.ctx.goTo('hub'), 8000)
  }

  _defeat() {
    if (this.over) return
    this.over = 'lost'
    this._cancelRecall()
    this.ui.death.hide()
    this.ctx.audio.play('defeat')
    this.hero.setState('ko')
    this.ui.hud.banner('DEFEAT', { color: '#c23b2e', duration: 0, sub: 'YOUR WAR CRYSTAL LIES SHATTERED' })
    endPanel(this.ui.hud, this.ctx)
    this._timeout(() => this.ctx.goTo('hub'), 8000)
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
    this.enemy?.dashTrail?.stop()
    this.vfx.dispose()
  }
}
