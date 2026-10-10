import '../ui/session.css'
import { createCpuPicker } from '../ui/cpuDifficulty.js'
import { saveProfile } from './profile.js'

const STORAGE = 'iwl-session-v1'
const GAME_NAMES = { moba: 'War Rift', hoops: 'Blood Court', arena: 'The Pit', kart: 'War Chariots', brawl: 'Mortal Arena', siege: 'Last Bastion', duel: 'The Crucible' }
const AUDIO_SCENES = { hub: ['hub', 'hub'], loadout: ['hub', 'forge'], moba: ['battle', 'rift'], hoops: ['court', 'court'], arena: ['arena', 'pit'], kart: ['race', 'race'], brawl: ['brawl', 'chasm'], siege: ['siege', 'gate'], duel: ['duel', 'crucible'] }

/** Persistent session controls, independent of scene-owned HUD DOM. */
export class GameSession {
  constructor({ engine, input, audio, sm }) {
    Object.assign(this, { engine, input, audio, sm })
    let saved = {}
    try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {} } catch { /* storage unavailable */ }
    this.preferences = {
      quality: ['auto', 'high', 'performance'].includes(saved.quality) ? saved.quality : 'auto',
      mouseSensitivity: Number.isFinite(saved.mouseSensitivity) ? Math.max(0.25, Math.min(2, saved.mouseSensitivity)) : 1,
      reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : matchMedia('(prefers-reduced-motion: reduce)').matches,
      master: saved.master > 0 && saved.master <= 1 ? saved.master : audio.volumes.master || 0.85,
    }
    this.soundOn = audio.enabled && audio.volumes.master > 0
    this.opened = false
    this._build()
    this.applyPreferences()
    sm.onChange(({ type }) => {
      if (type === 'start') this.close(false)
      this.menu.dataset.scene = sm.currentName || ''
      this.menu.hidden = type !== 'ready' || !GAME_NAMES[sm.currentName]
      if (type === 'ready' && GAME_NAMES[sm.currentName]) {
        this._refreshCpu()
        const canvas = engine.renderer.domElement
        canvas.tabIndex = -1
        canvas.focus({ preventScroll: true })
        if (document.hidden) this.open('away')
      }
    })
    // Capture before Input's bubble listeners so pause keys never reach a game.
    addEventListener('keydown', event => this._key(event), true)
    addEventListener('iwl:settings', () => this.open())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && GAME_NAMES[sm.currentName] && !sm._busy) this.open('away')
    })
    addEventListener('blur', () => {
      if (GAME_NAMES[sm.currentName] && !sm._busy) this.open('away')
    })
  }

  _build() {
    this.menu = document.createElement('button')
    this.menu.className = 'session-menu'
    this.menu.type = 'button'
    this.menu.hidden = true
    this.menu.innerHTML = '<span aria-hidden="true">Ⅱ</span><span>Pause</span><kbd>P</kbd>'
    this.cpuBadge = document.createElement('span')
    this.cpuBadge.className = 'session-cpu-badge'
    this.menu.append(this.cpuBadge)
    this.menu.setAttribute('aria-label', 'Pause and settings (P)')
    this.menu.addEventListener('click', () => this.open())
    this.overlay = document.createElement('div')
    this.overlay.className = 'session-overlay'
    this.overlay.hidden = true
    this.overlay.innerHTML = `
      <section class="session-panel" role="dialog" aria-modal="true" aria-labelledby="session-title" aria-describedby="session-description">
        <p class="session-eyebrow" id="session-realm">Immortal Warlords League</p>
        <h1 id="session-title">A moment of respite.</h1>
        <p id="session-description">The realm waits for your return.</p>
        <div class="session-actions">
          <button type="button" class="session-primary" data-action="resume">Return to battle <span aria-hidden="true">↗</span></button>
          <button type="button" data-action="restart">Begin again <span>Restart this realm</span></button>
          <button type="button" data-action="hub">The Convergence <span>Choose another realm</span></button>
        </div>
        <fieldset class="session-settings">
          <legend>Make yourself at home</legend>
          <div class="session-setting session-sensitivity"><label for="session-sensitivity">Mouse sensitivity <small id="session-sensitivity-help">Camera movement & Forge rotation</small></label><div class="session-sensitivity-control"><input id="session-sensitivity" type="range" min="0.25" max="2" step="0.05" aria-describedby="session-sensitivity-help"><output for="session-sensitivity" id="session-sensitivity-value">1.00×</output><button type="button" class="session-toggle" data-action="reset-sensitivity" aria-label="Reset mouse sensitivity">Reset</button></div></div>
          <label class="session-setting"><span>Sound <small>Music, ambience & combat</small></span><button type="button" class="session-toggle" data-action="sound" aria-pressed="true">On</button></label>
          <label class="session-setting" for="session-quality"><span>Visual quality <small id="session-quality-help">Auto adapts to your device</small></span><select id="session-quality" aria-describedby="session-quality-help"><option value="auto">Auto</option><option value="high">High</option><option value="performance">Performance</option></select></label>
          <label class="session-setting"><span>Reduced motion <small>Less shake, gentler transitions</small></span><button type="button" class="session-toggle" data-action="motion" aria-pressed="false">Off</button></label>
        </fieldset>
        <p class="session-footnote"><kbd>Esc</kbd> to return <span>Preferences are saved on this device</span></p>
      </section>`
    document.body.append(this.menu, this.overlay)
    this.cpuPicker = createCpuPicker({
      profile: this.sm.profile,
      onChange: () => { saveProfile(this.sm.profile); this._refreshCpu() },
    })
    this.overlay.querySelector('.session-settings').before(this.cpuPicker.root)
    this.cpuPicker.root.hidden = true
    this.resume = this.overlay.querySelector('[data-action="resume"]')
    this.resume.addEventListener('click', () => this.close())
    this.overlay.querySelector('[data-action="restart"]').addEventListener('click', () => this.sm.goTo(this.sm.currentName, this.sm.currentParams))
    this.overlay.querySelector('[data-action="hub"]').addEventListener('click', () => this.sm.goTo('hub'))
    this.overlay.querySelector('[data-action="sound"]').addEventListener('click', () => this.toggleSound())
    this.overlay.querySelector('[data-action="motion"]').addEventListener('click', () => {
      this.preferences.reducedMotion = !this.preferences.reducedMotion
      this.applyPreferences()
      this.save()
    })
    this.overlay.querySelector('#session-quality').addEventListener('change', event => {
      this.preferences.quality = event.target.value
      this.applyPreferences()
      this.save()
    })
    this.overlay.querySelector('#session-sensitivity').addEventListener('input', event => {
      this.preferences.mouseSensitivity = Number(event.target.value)
      this.applyPreferences()
      this.save()
    })
    this.overlay.querySelector('[data-action="reset-sensitivity"]').addEventListener('click', () => {
      this.preferences.mouseSensitivity = 1
      this.applyPreferences()
      this.save()
    })
  }

  save() {
    try { localStorage.setItem(STORAGE, JSON.stringify(this.preferences)) } catch { /* private browsing */ }
  }

  _refreshCpu() {
    const active = this.sm.current?.ctx.cpuDifficulty
    this.cpuPicker.root.hidden = !active
    this.cpuBadge.textContent = active ? `CPU ${active.level}` : ''
    this.cpuBadge.hidden = !active
    if (active) this.cpuPicker.refresh({ game: this.sm.currentName, activeLevel: active.level })
    this.overlay.querySelector('[data-action="restart"] span').textContent = active
      ? `Start at CPU level ${this.sm.profile.cpuLevel}` : 'Restart this realm'
  }

  applyPreferences() {
    this.input.setMouseSensitivity(this.preferences.mouseSensitivity)
    this.overlay.querySelector('#session-sensitivity').value = this.preferences.mouseSensitivity
    this.overlay.querySelector('#session-sensitivity-value').value = `${this.preferences.mouseSensitivity.toFixed(2)}×`
    this.engine.setQuality(this.preferences.quality)
    this.engine.setReducedMotion(this.preferences.reducedMotion)
    document.documentElement.classList.toggle('iwl-reduced-motion', this.preferences.reducedMotion)
    const sound = this.overlay.querySelector('[data-action="sound"]')
    sound.textContent = this.soundOn ? 'On' : 'Off'
    sound.setAttribute('aria-pressed', String(this.soundOn))
    const motion = this.overlay.querySelector('[data-action="motion"]')
    motion.textContent = this.preferences.reducedMotion ? 'On' : 'Off'
    motion.setAttribute('aria-pressed', String(this.preferences.reducedMotion))
    this.overlay.querySelector('#session-quality').value = this.preferences.quality
    this.overlay.querySelector('#session-quality-help').textContent = this.engine._dprLock ? 'Resolution locked by the launch URL' : 'Auto adapts to your device'
  }

  toggleSound() {
    this.soundOn = !this.soundOn
    if (!this.soundOn && this.audio.volumes.master > 0) this.preferences.master = this.audio.volumes.master
    this.audio.enabled = true
    this.audio.setVolumes({ master: this.soundOn ? this.preferences.master : 0 })
    if (this.soundOn) {
      this.audio.unlock()
      const [theme, ambience] = AUDIO_SCENES[this.sm.currentName] || AUDIO_SCENES.hub
      this.audio.music(theme)
      this.audio.ambience(ambience)
    }
    this.save()
    this.applyPreferences()
  }

  open(reason = 'manual') {
    if (this.opened || this.sm._busy || !this.sm.currentName || this.sm.currentName === 'loadout' || this.sm.fader.classList.contains('on')) return
    this.opened = true
    this._refreshCpu()
    this.previousFocus = document.activeElement
    const game = GAME_NAMES[this.sm.currentName]
    this.overlay.querySelector('#session-realm').textContent = game || 'The Convergence'
    this.overlay.querySelector('#session-title').textContent = game ? 'A moment of respite.' : 'Settle into the realm.'
    this.overlay.querySelector('#session-description').textContent = reason === 'away' ? 'Paused while you were away. Return when you are ready.' : game ? 'Your battle is paused. The realm waits for your return.' : 'Shape the sights and sounds of your journey.'
    this.resume.innerHTML = game ? 'Return to battle <span aria-hidden="true">↗</span>' : 'Return to the Convergence <span aria-hidden="true">↗</span>'
    for (const action of ['restart', 'hub']) this.overlay.querySelector(`[data-action="${action}"]`).hidden = !game
    this.audio.setEngine?.(0, 0)
    this.engine.setPaused(true)
    this.input.setBlocked(true)
    this.sm.uiRoot.inert = true
    document.documentElement.classList.add('iwl-paused')
    this.menu.hidden = true
    this.overlay.hidden = false
    this.resume.focus({ preventScroll: true })
  }

  close(restoreFocus = true) {
    if (!this.opened) return
    this.opened = false
    this.overlay.hidden = true
    document.documentElement.classList.remove('iwl-paused')
    this.sm.uiRoot.inert = false
    this.engine.setPaused(false)
    this.input.setBlocked(false)
    this.menu.hidden = !GAME_NAMES[this.sm.currentName]
    if (restoreFocus) {
      const target = this.previousFocus?.isConnected && this.previousFocus !== document.body ? this.previousFocus : this.engine.renderer.domElement
      target.tabIndex = target === this.engine.renderer.domElement ? -1 : target.tabIndex
      target.focus({ preventScroll: true })
      // Keep keyboard gameplay available after activating Resume from the menu.
      if (GAME_NAMES[this.sm.currentName]) this.engine.renderer.domElement.focus({ preventScroll: true })
    }
  }

  _key(event) {
    if (this.opened) {
      if (event.code === 'Escape' || (event.code === 'KeyP' && !this.input.isInteractive(event.target))) {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.close()
      } else if (event.code === 'Tab') {
        const controls = [...this.overlay.querySelectorAll('button, select, input')].filter(el => !el.closest('[hidden]') && !el.disabled && (el.type !== 'radio' || el.checked))
        const index = controls.indexOf(document.activeElement)
        if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1).focus() }
        else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0].focus() }
      }
      return
    }
    if (event.repeat || this.sm._busy) return
    if (event.code === 'Escape' && this.sm.currentName === 'loadout') {
      event.preventDefault(); event.stopImmediatePropagation(); this.sm.goTo('hub'); return
    }
    if ((event.code === 'KeyP' || event.code === 'Escape') && this.sm.currentName !== 'loadout' && !this.input.isInteractive(event.target)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.open()
    }
  }
}
