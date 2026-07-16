import * as THREE from 'three'
import { HUD } from '../../ui/hud.js'
import { clamp } from '../../core/utils.js'

const _v = new THREE.Vector3()

/** All DOM for BLOOD COURT: scoreboard, shot clock, shot meter, stamina, banners. */
export class HoopsHud {
  constructor(audio) {
    this.hud = new HUD()
    this.audio = audio

    // --- scoreboard ---
    const sb = this.hud.el('div', 'hoops-score')
    sb.innerHTML = `
      <div class="hs-team hs-you"><span class="hs-name">YOU</span><span class="hs-pts" data-you>0</span></div>
      <div class="hs-mid">
        <div class="hs-poss" data-poss>&#9664;</div>
        <div class="hs-clock" data-clock>14</div>
      </div>
      <div class="hs-team hs-cpu"><span class="hs-pts" data-cpu>0</span><span class="hs-name">CPU</span></div>`
    this.elYou = sb.querySelector('[data-you]')
    this.elCpu = sb.querySelector('[data-cpu]')
    this.elClock = sb.querySelector('[data-clock]')
    this.elPoss = sb.querySelector('[data-poss]')

    // --- shot meter ---
    this.meter = this.hud.el('div', 'hoops-meter')
    this.meter.innerHTML = `<div class="hm-band"></div><div class="hm-fill"></div>`
    this.meterBand = this.meter.querySelector('.hm-band')
    this.meterFill = this.meter.querySelector('.hm-fill')
    this.meter.style.display = 'none'

    // --- stamina ---
    this.stamina = this.hud.bar({ label: 'STAMINA', color: '#ff8c3b' })
    this.stamina.root.style.left = '22px'
    this.stamina.root.style.bottom = '24px'

    // --- fire indicator ---
    this.fireTag = this.hud.el('div', 'hoops-fire')
    this.fireTag.textContent = '🔥 ON FIRE 🔥'
    this.fireTag.style.display = 'none'

    this.hints = this.hud.hints([
      ['WASD', 'move'], ['SHIFT', 'sprint'], ['SPACE', 'shoot / block'],
      ['A A / D D', 'crossover'], ['F', 'steal'], ['1-4', 'skills'], ['H', 'hide help'],
    ])
  }

  setScore(you, cpu) {
    this.elYou.textContent = you
    this.elCpu.textContent = cpu
  }

  setPossession(who) {
    this.elPoss.innerHTML = who === 'player' ? '&#9664;' : '&#9654;'
    this.elPoss.className = 'hs-poss ' + (who === 'player' ? 'hp-you' : 'hp-cpu')
  }

  setClock(v) {
    const n = Math.max(0, Math.ceil(v))
    if (this.elClock.textContent !== String(n)) this.elClock.textContent = String(n)
    this.elClock.classList.toggle('hs-clock-low', v <= 5 && v > 0)
  }

  setFire(on) { this.fireTag.style.display = on ? 'block' : 'none' }
  setStamina(frac) { this.stamina.set(frac, `${Math.round(frac * 100)}`) }

  /** Announcer banner: FLAWLESS! / DENIED! / ON FIRE! ... (never overlaps) */
  announce(text, { color = '#ffb84d', sub = '', duration = 1.6 } = {}) {
    if (this._banner?.isConnected) this._banner.remove()
    this._banner = this.hud.banner(text, { color, sub, duration, cls: 'hoops-ann' })
  }

  toast(msg) { this.hud.toast(msg) }

  /* ---- shot meter ---- */
  meterShow() {
    this.meter.classList.remove('hm-perfect', 'hm-good', 'hm-bad')
    this.meter.style.display = 'block'
  }
  meterHide() { this.meter.style.display = 'none' }

  /** worldPos-anchored vertical meter; band = [center, halfWidth] in 0..1. */
  meterUpdate(camera, worldPos, fill, center, halfW) {
    _v.copy(worldPos).project(camera)
    const x = (_v.x * 0.5 + 0.5) * innerWidth + 64
    const y = (-_v.y * 0.5 + 0.5) * innerHeight - 70
    this.meter.style.transform = `translate(${x | 0}px, ${y | 0}px)`
    this.meterFill.style.height = `${clamp(fill, 0, 1) * 100}%`
    this.meterBand.style.bottom = `${clamp(center - halfW, 0, 1) * 100}%`
    this.meterBand.style.height = `${clamp(halfW * 2, 0, 1) * 100}%`
  }

  meterResult(kind) {
    // kind: 'perfect' | 'good' | 'bad'
    this.meter.classList.remove('hm-perfect', 'hm-good', 'hm-bad')
    void this.meter.offsetWidth
    this.meter.classList.add(`hm-${kind}`)
  }

  toggleHints() {
    this.hints.style.display = this.hints.style.display === 'none' ? 'block' : 'none'
  }

  /** End screen with a return button. Returns the button element. */
  endScreen(won, onHub) {
    this.announce(won ? 'VICTORY' : 'DEFEAT', {
      color: won ? '#ffb84d' : '#c23b2e',
      sub: won ? 'THE BLOOD COURT IS YOURS' : 'RISE AND FIGHT AGAIN',
      duration: 0,
    })
    const btn = this.hud.el('button', 'hoops-hub-btn ui-interactive', 'RETURN TO HUB')
    btn.addEventListener('click', onHub)
    return btn
  }
}
