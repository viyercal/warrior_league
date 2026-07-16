import * as THREE from 'three'
import { createHero } from '../art/characterFactory.js'
import { VFX } from '../art/vfx.js'
import { HUD } from '../ui/hud.js'
import { getSkill } from './skills.js'
import { damp, rand, clamp } from '../core/utils.js'
import { buildSky, buildLights, buildPlatform, buildIslands, buildAtmosphere } from './hubEnvironment.js'
import { buildChannelWall } from './hubChannels.js'
import '../ui/hub.css'

const CAM_POS = new THREE.Vector3(0, 4.0, 12.6)
const CAM_LOOK = new THREE.Vector3(0, 2.7, -2.5)

/**
 * IPL HUB — Wii-channel menu reimagined as a AAA stylized game lobby.
 * Floating hero platform + live-diorama channel wall over a dusk skyscape.
 */
export default class HubScene {
  constructor(ctx) {
    this.ctx = ctx
    this.postOpts = { bloom: 0.85, bloomThreshold: 0.82, bloomRadius: 0.5, vignette: 0.52, saturation: 1.12 }
  }

  async init() {
    const { engine, audio, profile } = this.ctx
    this.scene = new THREE.Scene()
    this.scene.environment = engine.envMap
    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 600)
    this.camera.position.copy(CAM_POS)
    this.camera.lookAt(CAM_LOOK)

    this.ticks = []
    this.ticks.push(buildSky(this.scene))
    buildLights(this.scene)
    this.ticks.push(buildIslands(this.scene))
    this.ticks.push(buildAtmosphere(this.scene))

    const platform = buildPlatform(this.scene, profile.appearance.glow)
    platform.group.position.set(0, 0, 2.6)
    this.ticks.push(platform.tick)

    this.hero = createHero(profile.appearance, { auraRing: true })
    this.hero.group.position.z = 0.85
    platform.group.add(this.hero.group)
    this.heroWorld = new THREE.Vector3()

    // warm key light just for the hero pedestal area
    const heroLight = new THREE.PointLight('#ffe8cf', 9, 9, 2)
    heroLight.position.set(1.5, 3.0, 4.0)
    platform.group.add(heroLight)

    const wall = buildChannelWall(this.scene)
    this.channels = wall.channels
    this.hitMeshes = wall.hitMeshes

    this.vfx = new VFX(this.scene)

    // interaction state
    this.focusIdx = -1
    this.hoverIdx = -1
    this.lastHoverIdx = -1
    this._kbOverride = false
    this._px = { x: 0, y: 0 }
    this.transition = null
    this.parallax = new THREE.Vector2()
    this.flairT = rand(5, 8)
    this.danceT = 0
    this._v = new THREE.Vector3()
    this._look = new THREE.Vector3().copy(CAM_LOOK)
    this._camTarget = new THREE.Vector3()

    this._buildUI()
    this._bindInput()
    audio.music('hub')

    // QA hooks
    this.debug = {
      focus: i => this._setFocus(i, true),
      activate: i => { this._setFocus(i, true); this._activate(i) },
      screenPos: i => {
        const p = this.channels[i].center.clone().project(this.camera)
        return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }
      },
    }
  }

  // ---------- DOM UI ----------

  _buildUI() {
    const { profile } = this.ctx
    const hud = this.hud = new HUD()

    hud.el('div', 'hub-logo',
      '<div class="hub-logo-main">IPL</div><div class="hub-logo-sub">IMMERSIVE PLAYABLE LEAGUE</div>')

    const skillChips = profile.loadout.map(id => {
      const s = getSkill(id)
      return s ? `<div class="hub-skill-ico" style="--sc:${s.color}" title="${s.name}">${s.icon}</div>` : ''
    }).join('')
    hud.el('div', 'hub-player',
      `<div class="hub-player-name"><span class="hub-player-dot" style="--dot:${profile.appearance.glow}"></span>${profile.name}</div>
       <div class="hub-skills">${skillChips}</div>`)

    const btn = hud.el('button', 'ghost hub-customize', 'CUSTOMIZE HERO')
    btn.addEventListener('click', () => {
      this.ctx.audio.play('click')
      this.ctx.goTo('loadout', { game: null })
    })

    hud.hints([
      ['MOUSE', 'Hover / click a channel'],
      ['← → 1-6', 'Cycle channels'],
      ['ENTER', 'Launch channel'],
      ['C', 'Customize hero'],
    ])

    this.plates = this.channels.map(ch => {
      const plate = hud.el('div', `hub-plate${ch.def.locked ? ' locked' : ''}`)
      plate.style.setProperty('--acc', ch.def.accent)
      plate.innerHTML = `<div class="hub-plate-title">${ch.def.locked ? '🔒 ' : ''}${ch.def.title}</div>
        <div class="hub-plate-sub">${ch.def.sub}</div>`
      return plate
    })
  }

  // ---------- input ----------

  _bindInput() {
    const { input, audio } = this.ctx
    input.onKey((code, down) => {
      if (!down || this.transition) return
      if (code === 'ArrowRight') this._setKbFocus((this.focusIdx + 1 + 6) % 6)
      else if (code === 'ArrowLeft') this._setKbFocus(this.focusIdx <= 0 ? 5 : this.focusIdx - 1)
      else if (/^Digit[1-6]$/.test(code)) this._setKbFocus(Number(code[5]) - 1)
      else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
        if (this.focusIdx >= 0) this._activate(this.focusIdx)
      } else if (code === 'KeyC') {
        audio.play('click')
        this.ctx.goTo('loadout', { game: null })
      }
    })
    input.onMouse((button, down) => {
      if (button !== 0 || !down || this.transition) return
      if (this.hoverIdx >= 0) this._activate(this.hoverIdx)
    })
  }

  _setFocus(idx, sound = false) {
    if (idx === this.focusIdx) return
    this.focusIdx = idx
    if (idx >= 0 && sound) this.ctx.audio.play('hover', { vol: 0.6 })
  }

  /** Keyboard selection wins over a resting cursor until the mouse moves again. */
  _setKbFocus(idx) {
    this._kbOverride = true
    this._setFocus(idx, true)
  }

  _activate(idx) {
    const ch = this.channels[idx]
    const { audio, engine } = this.ctx
    if (ch.def.locked) {
      ch.shake()
      audio.play('back')
      engine.shake(0.06, 0.2)
      this.hud.toast(`${ch.def.title} — LOCKED. COMING SOON!`)
      return
    }
    audio.play('click')
    audio.play('cast', { delay: 0.05 })
    this.hero.cast()
    this.hero.castPoint(this._v)
    this.vfx.flash(this._v, { color: ch.def.accent, size: 2.4 })
    this.vfx.burst(this._v, { color: ch.def.accent, count: 20, speed: 5, size: 0.24, gravity: -4 })
    this.transition = { ch, t: 0, fired: false, fromPos: this.camera.position.clone(), fromLook: this._look.clone() }
    for (const p of this.plates) p.classList.add('gone')
  }

  // ---------- frame loop ----------

  update(dt, t) {
    for (const tick of this.ticks) tick(dt, t)
    for (const ch of this.channels) ch.update(dt)
    this.vfx.update(dt)

    this._updateHero(dt, t)
    this._updateHover()
    this._updateCamera(dt, t)
    this._updatePlates()
  }

  _updateHero(dt, t) {
    this.hero.update(dt)
    if (this.danceT > 0) {
      this.danceT -= dt
      if (this.danceT <= 0) this.hero.setState('normal')
    }
    this.flairT -= dt
    if (this.flairT <= 0 && !this.transition) {
      this.flairT = rand(7, 10.5)
      if (Math.random() < 0.5) {
        this.hero.setState('dance')
        this.danceT = 2.4
      } else {
        this.hero.cast()
        this.hero.castPoint(this._v)
        this.vfx.flash(this._v, { color: this.ctx.profile.appearance.glow, size: 1.7 })
        this.ctx.audio.play('cast', { vol: 0.3 })
      }
    }
    // face the focused channel, else face the camera
    const target = this.focusIdx >= 0 ? this.channels[this.focusIdx].center : this.camera.position
    this.hero.faceTowards(target, dt, 5)
  }

  _updateHover() {
    if (this.transition) { this.hoverIdx = -1; return }
    // input.mouse defaults to screen center before any mousemove — don't
    // phantom-hover the middle channel until the cursor actually exists
    const px = this.ctx.input.mousePx
    const moved = px.x !== this._px.x || px.y !== this._px.y
    this._px.x = px.x
    this._px.y = px.y
    if (moved) this._kbOverride = false
    if ((!px.x && !px.y) || this._kbOverride) { this.hoverIdx = -1; this._applyFocus(); return }
    const hits = this.ctx.input.pick(this.camera, this.hitMeshes, false)
    let idx = -1
    if (hits.length) {
      idx = hits[0].object.userData.idx
      const uv = hits[0].uv
      const ch = this.channels[idx]
      if (uv) {
        ch.tiltTarget.x = (uv.y - 0.5) * 0.22
        ch.tiltTarget.y = -(uv.x - 0.5) * 0.3
      }
      this._setFocus(idx, idx !== this.lastHoverIdx)
    }
    this.hoverIdx = idx
    this.lastHoverIdx = idx
    this._applyFocus()
  }

  _applyFocus() {
    for (let i = 0; i < 6; i++) {
      const ch = this.channels[i]
      ch.focus = i === this.focusIdx
      if (i === this.focusIdx && i !== this.hoverIdx) {
        ch.tiltTarget.x = 0
        ch.tiltTarget.y = 0
      }
    }
  }

  _updateCamera(dt, t) {
    const { input } = this.ctx
    if (this.transition) {
      const tr = this.transition
      tr.t += dt
      const k = clamp(tr.t / 0.7, 0, 1)
      const e = k * k * (3 - 2 * k)
      this._camTarget.copy(tr.ch.center).addScaledVector(tr.ch.normal, 3.2)
      this._camTarget.y += 0.15
      this.camera.position.lerpVectors(tr.fromPos, this._camTarget, e)
      this._look.lerpVectors(tr.fromLook, tr.ch.center, e)
      this.camera.lookAt(this._look)
      if (k >= 0.65 && !tr.fired) {
        tr.fired = true
        this.ctx.goTo('loadout', { game: tr.ch.def.game })
      }
      return
    }
    this.parallax.x = damp(this.parallax.x, input.mouse.x, 3, dt)
    this.parallax.y = damp(this.parallax.y, input.mouse.y, 3, dt)
    const breathe = Math.sin(t * 0.45) * 0.12
    this.camera.position.set(
      CAM_POS.x + this.parallax.x * 0.6,
      CAM_POS.y + this.parallax.y * 0.32 + breathe,
      CAM_POS.z + Math.sin(t * 0.3) * 0.15,
    )
    this._look.set(
      CAM_LOOK.x + this.parallax.x * 0.9,
      CAM_LOOK.y + this.parallax.y * 0.5 + breathe * 0.4,
      CAM_LOOK.z,
    )
    this.camera.lookAt(this._look)
  }

  _updatePlates() {
    for (let i = 0; i < 6; i++) {
      const ch = this.channels[i]
      const p = this._v.copy(ch.plateAnchor)
      p.y += Math.sin(ch.t * 0.6) * 0.05 // ride the frame bob
      p.project(this.camera)
      const plate = this.plates[i]
      if (p.z > 1) { plate.style.display = 'none'; continue }
      plate.style.display = ''
      plate.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`
      plate.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`
      plate.classList.toggle('hot', i === this.focusIdx)
    }
  }

  dispose() {
    this.vfx.dispose()
  }
}
