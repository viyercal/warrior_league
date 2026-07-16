import { disposeObject3D } from './utils.js'
import { loadProfile, saveProfile } from './profile.js'

const wait = ms => new Promise(r => setTimeout(r, ms))

/**
 * Routes between scene modules (hub, loadout, games) with fade transitions.
 * Handles teardown: engine updater, input handlers, music, HUD DOM, GPU memory.
 */
export class SceneManager {
  constructor({ engine, input, audio }) {
    this.engine = engine
    this.input = input
    this.audio = audio
    this.profile = loadProfile()
    this.loaders = {}
    this.current = null
    this.currentName = null
    this._busy = false
    this.fader = document.getElementById('fader')
    this.uiRoot = document.getElementById('ui')
    engine.onResize((w, h) => this.current?.resize?.(w, h))
  }

  register(name, loader) { this.loaders[name] = loader }

  async goTo(name, params = {}) {
    if (this._busy) return
    if (!this.loaders[name]) { console.error(`[IPL] unknown scene "${name}"`); return }
    this._busy = true
    try {
      this.fader.classList.add('on')
      await wait(340)

      this.engine.updater = null
      if (this.current) {
        try { this.current.dispose?.() } catch (e) { console.error(e) }
        if (this.current.scene) disposeObject3D(this.current.scene)
      }
      this.input.clearHandlers()
      this.audio.stopMusic()
      this.uiRoot.innerHTML = ''

      const Mod = (await this.loaders[name]()).default
      const ctx = {
        engine: this.engine,
        input: this.input,
        audio: this.audio,
        profile: this.profile,
        saveProfile: () => saveProfile(this.profile),
        goTo: (n, p) => this.goTo(n, p),
        params,
      }
      const mod = new Mod(ctx)
      await mod.init()

      this.current = mod
      this.currentName = name
      this.engine.setScene(mod.scene, mod.camera, mod.postOpts || {})
      this.engine.updater = (dt, t) => mod.update(dt, t)
      window.__scene = mod
      this.fader.classList.remove('on')
    } catch (e) {
      console.error('[IPL] scene load failed:', e)
      this.fader.classList.remove('on')
    } finally {
      this._busy = false
    }
  }
}
