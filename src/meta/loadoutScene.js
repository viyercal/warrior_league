import * as THREE from 'three'
import { createHero } from '../art/characterFactory.js'
import { VFX } from '../art/vfx.js'
import { HUD } from '../ui/hud.js'
import { disposeObject3D, damp, clamp, v3 } from '../core/utils.js'
import { buildForgeStage } from './loadoutStage.js'
import { buildLoadoutPanel } from './loadoutPanel.js'
import '../ui/loadout.css'

/**
 * LOADOUT — the Hero Forge. Configure the ONE hero (appearance + Q/W/E/R
 * skillset) that carries into every game. params.game =
 * 'moba'|'hoops'|'arena'|'kart'|'brawl'|'siege' routes onward into that game;
 * null returns to the hub.
 */
export default class LoadoutScene {
  constructor(ctx) {
    this.ctx = ctx
    this.postOpts = { bloom: 0.6, bloomThreshold: 0.85, bloomRadius: 0.38, vignette: 0.6, saturation: 1.08 }
  }

  async init() {
    const { engine, input, audio } = this.ctx

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 400)
    this._camBase = v3(1.55, 2.0, 6.3)
    this._camLook = v3(1.55, 1.45, 0)
    this.camera.position.copy(this._camBase)
    this.camera.lookAt(this._camLook)

    this.scene.environment = engine.envMap
    this.stage = buildForgeStage(this.scene)
    this.vfx = new VFX(this.scene)

    this._dancing = false
    this._spin = 0
    this._dragging = false
    this._lastX = 0
    this._trail = null
    this.hero = null
    this.buildHero(false)

    this.hud = new HUD()
    this.panel = buildLoadoutPanel(this.hud, this.ctx, {
      onAppearance: () => this.rebuildHero(),
      onEquip: () => {
        this.vfx.ring(v3(0, this.stage.topY + 0.05, 0), { radius: 1.7, color: this.ctx.profile.appearance.glow, life: 0.45 })
      },
      onDance: () => this.toggleDance(),
    })

    // drag on the 3D (left) side spins the hero turntable with inertia
    input.onMouse((btn, down, e) => {
      if (btn !== 0) return
      if (down && e.clientX < innerWidth * 0.56) {
        this._dragging = true
        this._lastX = e.clientX
        this._canvas.style.cursor = 'grabbing'
      } else if (!down && this._dragging) {
        this._dragging = false
        this._canvas.style.cursor = 'grab'
      }
    })
    input.onKey((code, down, e) => {
      if (!down) return
      if (e.target && e.target.tagName === 'INPUT') return
      if (code === 'KeyP') this.toggleDance()
    })
    this._canvas = engine.renderer.domElement
    this._canvas.style.cursor = 'grab'

    audio.music('hub')

    // QA hooks
    this.debug = {
      dance: () => this.toggleDance(),
      setAppearance: patch => {
        Object.assign(this.ctx.profile.appearance, patch)
        this.ctx.saveProfile()
        this.rebuildHero()
      },
    }
  }

  /** (Re)create the hero from the live profile; fx = celebrate the change. */
  buildHero(fx = true) {
    const { profile, audio } = this.ctx
    this._trail?.stop()
    this._trail = null
    if (this.hero) {
      this.stage.heroMount.remove(this.hero.group)
      disposeObject3D(this.hero.group)
    }
    this.hero = createHero(profile.appearance)
    this.stage.heroMount.add(this.hero.group)
    if (this._dancing) this.hero.setState('dance')

    const a = profile.appearance
    if (a.trail === 'spark') {
      this._trail = this.vfx.trail(this.hero.arms.R.glove, { color: a.glow, size: 0.3, rate: 12, life: 0.45, jitter: 0.2 })
    } else if (a.trail === 'ribbon') {
      this._trail = this.vfx.trail(this.hero.arms.R.glove, { color: a.glow, size: 0.5, rate: 30, life: 0.35, jitter: 0.02 })
    }

    if (fx) {
      const p = v3(0, this.stage.topY + 1.15, 0)
      this.vfx.flash(p, { color: a.glow, size: 3.4 })
      this.vfx.burst(p, { color: a.glow, count: 22, speed: 5, size: 0.24, gravity: -4 })
      this.vfx.ring(v3(0, this.stage.topY + 0.04, 0), { radius: 1.9, color: a.glow, life: 0.5 })
      audio.play('click')
    }
  }

  rebuildHero() { this.buildHero(true) }

  toggleDance() {
    this._dancing = !this._dancing
    this.hero.setState(this._dancing ? 'dance' : 'normal')
    this.ctx.audio.play(this._dancing ? 'levelup' : 'click', { vol: 0.5 })
    this.panel.setDance(this._dancing)
  }

  update(dt, t) {
    const { input } = this.ctx
    this.stage.tick(dt, t)

    // turntable: continuous slow spin + damped drag inertia
    if (this._dragging) {
      const dx = input.mousePx.x - this._lastX
      this._lastX = input.mousePx.x
      this._spin = clamp(dx * 0.0085 / Math.max(dt, 1 / 240), -9, 9)
    } else {
      this._spin = damp(this._spin, 0, 3, dt)
    }
    this.stage.turntable.rotation.y += (0.32 + this._spin) * dt

    this.hero.update(dt)

    // camera: gentle breathing + mouse parallax (paused while dragging)
    const mx = this._dragging ? 0 : input.mouse.x
    const my = this._dragging ? 0 : input.mouse.y
    this.camera.position.x = this._camBase.x + Math.sin(t * 0.4) * 0.1 + mx * 0.2
    this.camera.position.y = this._camBase.y + Math.sin(t * 0.9) * 0.06 + my * 0.12
    this.camera.position.z = this._camBase.z
    this.camera.lookAt(this._camLook)

    this.vfx.update(dt)
  }

  dispose() {
    this._trail?.stop()
    this.vfx.dispose()
    if (this._canvas) this._canvas.style.cursor = ''
  }
}
