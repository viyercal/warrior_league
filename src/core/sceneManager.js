import { disposeObject3D } from './utils.js'
import { loadProfile, saveProfile } from './profile.js'
import { cpuDifficulty, hasCpuLevels, normalizeDuelMode } from './cpuDifficulty.js'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const TITLES = { hub: 'The Convergence', loadout: 'The Forge', moba: 'War Rift', hoops: 'Blood Court', arena: 'The Pit', kart: 'War Chariots', brawl: 'Mortal Arena', siege: 'Last Bastion', duel: 'The Crucible' }
const BATTLES = new Set(['moba', 'hoops', 'arena', 'kart', 'brawl', 'siege', 'duel'])

/** Cached module loading and transactional scene teardown, with visible recovery. */
export class SceneManager {
  constructor({ engine, input, audio }) {
    Object.assign(this, { engine, input, audio })
    this.profile = loadProfile()
    this.loaders = Object.create(null)
    this._modules = new Map()
    this._listeners = new Set()
    this.current = null
    this.currentName = null
    this.currentParams = {}
    this._busy = false
    this.fader = document.getElementById('fader')
    this.uiRoot = document.getElementById('ui')
    this.uiRoot.playerProfile = this.profile
    this.fader.setAttribute('aria-live', 'polite')
    this.fader.setAttribute('aria-hidden', 'true')
    this.fader.inert = true
    engine.onResize((w, h) => this.current?.resize?.(w, h))
  }

  register(name, loader) { this.loaders[name] = loader }
  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn) }
  _emit(type, name) { for (const fn of this._listeners) fn({ type, name }) }

  preload(name) {
    if (!this.loaders[name]) return Promise.reject(new Error(`Unknown realm: ${name}`))
    if (!this._modules.has(name)) {
      const pending = Promise.resolve().then(() => this.loaders[name]()).catch(error => {
        this._modules.delete(name)
        throw error
      })
      this._modules.set(name, pending)
    }
    return this._modules.get(name)
  }

  _loading(name, phase) {
    this.fader.replaceChildren()
    const card = document.createElement('div')
    card.className = 'session-loading'
    const label = document.createElement('p')
    label.className = 'session-eyebrow'
    label.textContent = phase
    const title = document.createElement('h2')
    title.textContent = TITLES[name] || 'Unknown realm'
    const line = document.createElement('div')
    line.className = 'session-loading-line'
    card.append(label, title, line)
    this.fader.append(card)
  }

  _dispose(mod) {
    if (!mod) return
    try { mod.dispose?.() } catch (error) { console.error('[IWL] scene disposal failed:', error) }
    try { if (mod.scene) disposeObject3D(mod.scene) } catch (error) { console.error('[IWL] GPU disposal failed:', error) }
  }

  _releaseCurrent() {
    this.engine.updater = null
    this.engine.scene = null
    this.engine.camera = null
    this.engine.composer?.dispose?.()
    this.engine.composer = null
    this.engine.clearTimers(this.engine.timerScope)
    this._dispose(this.current)
    this.current = null
    this.currentName = null
    window.__scene = null
    this.input.clearHandlers()
    this.audio.stopEngine?.()
    this.uiRoot.replaceChildren()
  }

  async goTo(name, params = {}) {
    if (this._busy) return false
    if (name === 'duel') params = { ...params, mode: normalizeDuelMode(params.mode ?? this.profile.duelMode) }
    this._busy = true
    this.engine.setPaused(true, 'transition')
    this.input.setBlocked(true, 'transition')
    this._emit('start', name)
    this._loading(name, 'Opening the passage')
    this.fader.classList.add('on')
    this.fader.setAttribute('aria-hidden', 'false')
    this.fader.inert = false
    this.uiRoot.inert = true
    let mod = null
    let released = false
    try {
      // Import concurrently with the short fade. Cached routes pay no import cost.
      const [module] = await Promise.all([this.preload(name), wait(this.engine.reducedMotion ? 0 : 160)])
      this._loading(name, 'Preparing the realm')
      this._releaseCurrent()
      released = true
      this.uiRoot.classList.toggle('battle-ui', BATTLES.has(name))
      this.uiRoot.dataset.scene = name
      if (BATTLES.has(name) && name !== 'moba') {
        this.input.setKeyAliases({
          ArrowLeft: 'KeyA', ArrowRight: 'KeyD', ArrowDown: 'KeyS',
          ArrowUp: name === 'duel' || name === 'brawl' ? 'Space' : 'KeyW',
        })
      }
      const scope = Symbol(name)
      this.engine.timerScope = scope
      const timers = {
        setTimeout: (fn, ms) => this.engine.setTimeout(fn, ms, scope),
        clearTimeout: id => this.engine.clearTimeout(id),
      }
      this.uiRoot.sceneScheduler = timers
      const ctx = {
        engine: this.engine, input: this.input, audio: this.audio, profile: this.profile,
        cpuDifficulty: hasCpuLevels(name, params.mode) ? cpuDifficulty(this.profile.cpuLevel) : null,
        saveProfile: () => saveProfile(this.profile),
        goTo: (n, p) => this.goTo(n, p), preload: n => this.preload(n), params, ...timers,
      }
      mod = new module.default(ctx)
      await mod.init()
      if (!mod.scene || !mod.camera) throw new Error('Realm did not create a scene and camera')
      this.engine.setScene(mod.scene, mod.camera, mod.postOpts || {})
      this.current = mod
      this.currentName = name
      this.currentParams = params
      this.engine.updater = (dt, t) => mod.update?.(dt, t)
      window.__scene = mod
      this.fader.classList.remove('on')
      this.fader.setAttribute('aria-hidden', 'true')
      this.fader.inert = true
      this.uiRoot.inert = false
      this._busy = false
      this._emit('ready', name)
      return true
    } catch (error) {
      console.error('[IWL] scene load failed:', error)
      if (released) {
        this.engine.updater = null
        this.engine.scene = null
        this.engine.camera = null
        this.engine.composer?.dispose?.()
        this.engine.composer = null
        this.engine.clearTimers(this.engine.timerScope)
        this._dispose(mod)
        this.input.clearHandlers()
        this.audio.stopEngine?.()
        this.uiRoot.replaceChildren()
      }
      this._loading(name, 'The passage could not be opened')
      const card = this.fader.firstElementChild
      const detail = document.createElement('p')
      detail.textContent = this.loaders[name] ? 'Your warrior is safe. Try the passage again, or return to the Convergence.' : 'This realm does not exist. Return to the Convergence to choose a realm.'
      card.append(detail)
      const actions = document.createElement('div')
      actions.className = 'session-loading-actions'
      const action = (label, fn) => {
        const button = document.createElement('button')
        button.textContent = label
        button.addEventListener('click', fn)
        actions.append(button)
      }
      if (this.loaders[name]) action('Try again', () => this.goTo(name, params))
      action('Return to Convergence', () => this.goTo('hub'))
      card.append(actions)
      actions.firstElementChild.focus()
      this._emit('error', name)
      return false
    } finally {
      this._busy = false
      // A failed scene stays frozen behind the recovery panel.
      if (!this.fader.classList.contains('on')) {
        this.engine.setPaused(false, 'transition')
        this.input.setBlocked(false, 'transition')
      }
    }
  }
}
