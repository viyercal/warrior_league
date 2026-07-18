import * as THREE from 'three'
import { HUD } from '../../ui/hud.js'
import { icon } from '../../ui/craft.js'
import { clamp } from '../../core/utils.js'
import { AI_NAME } from './constants.js'

const _v = new THREE.Vector3()

/** Forged pointer sigil (arrow-up rotated toward the holder via CSS). */
const POSS_SIGIL = icon('arrow-up', { size: 13 })

/** Ledger sigils engraved next to each stat row (svg only — no text). */
const ROW_SIGILS = {
  '2-POINTERS': 'court-ring',
  '3-POINTERS': 'court-ring',
  DUNKS: 'flame',
  SHOOTING: 'coin',
  STEALS: 'skull',
  BLOCKS: 'aegis',
  'LONGEST RUN': 'overdrive',
  'FAVORITE ART': 'crossed-swords',
}

/** All DOM for BLOOD COURT: scoreboard, shot clock, shot meter, stamina,
 *  banners, cinematic intro card, micro shot-labels and the end stats panel. */
export class HoopsHud {
  constructor(audio) {
    this.hud = new HUD()
    this.audio = audio

    // --- scoreboard ---
    const sb = this.hud.el('div', 'hoops-score')
    sb.innerHTML = `
      <div class="hs-team hs-you"><span class="hs-name">YOU</span><span class="hs-pts" data-you>0</span></div>
      <div class="hs-mid">
        <div class="hs-poss" data-poss>${POSS_SIGIL}</div>
        <div class="hs-clock-tag"><span class="hs-hg">${icon('hourglass', { size: 11 })}</span><div class="hs-clock" data-clock>14</div></div>
      </div>
      <div class="hs-team hs-cpu"><span class="hs-pts" data-cpu>0</span><span class="hs-name">${AI_NAME}</span></div>`
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

    // --- fire indicator: flame-sigil iron tag ---
    this.fireTag = this.hud.el('div', 'hoops-fire')
    this.fireTag.innerHTML =
      `<i class="hf-sig">${icon('flame', { size: 15 })}</i>ON FIRE<i class="hf-sig">${icon('flame', { size: 15 })}</i>`
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
    this.elPoss.innerHTML = POSS_SIGIL
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

  /* ---- cinematic letterbox (also fades the gameplay HUD chrome out) ---- */
  cine(on) {
    if (!this._cineTop) {
      this._cineTop = this.hud.el('div', 'hoops-cine hoops-cine-top')
      this._cineBot = this.hud.el('div', 'hoops-cine hoops-cine-bot')
    }
    this._cineTop.classList.toggle('on', on)
    this._cineBot.classList.toggle('on', on)
    this.hud.root.classList.toggle('hoops-cine-mode', on)
  }

  /** Intro title card: BLOOD COURT + vs-plates + house rule. Returns a remover. */
  showIntro({ player, foe }) {
    const w = this.hud.el('div', 'hoops-intro')
    this.hud.el('div', 'hoops-intro-title', 'BLOOD COURT', w)
    this.hud.el('div', 'hoops-intro-sub', 'GLADIATOR B-BALL', w)
    const vs = this.hud.el('div', 'hoops-vs', '', w)
    const l = this.hud.el('div', 'hoops-vs-plate hoops-vsl', '', vs)
    this.hud.el('div', 'hoops-vs-name', player, l)
    this.hud.el('div', 'hoops-vs-sub', 'CHALLENGER', l)
    this.hud.el('div', 'hoops-vs-mid', 'VS', vs)
    const r = this.hud.el('div', 'hoops-vs-plate hoops-vsr', '', vs)
    this.hud.el('div', 'hoops-vs-name', foe, r)
    this.hud.el('div', 'hoops-vs-sub', 'WARDEN OF THE RIM', r)
    this.hud.el('div', 'hoops-intro-rule', 'FIRST TO 11 — CHECK UP', w)
    this.hud.el('div', 'hoops-intro-skip', 'PRESS ANY KEY', w)
    return () => { w.classList.add('out'); setTimeout(() => w.remove(), 420) }
  }

  /** Small release-read label: OPEN LOOK / CONTESTED! / HEAT CHECK. */
  microLabel(text, kind = 'open') {
    this._micro?.remove()
    const m = this._micro = this.hud.el('div', `hoops-micro hoops-micro-${kind}`, text)
    setTimeout(() => {
      m.classList.add('out')
      setTimeout(() => m.remove(), 320)
    }, 950)
  }

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

  /** Duel-style end-of-game stats tablet. Returns the panel element. */
  statsPanel({ won, score, match, favorite, onHub }) {
    const p = this.hud.el('div', 'hoops-panel ui-interactive')
    const laurel = won ? `<i class="hp-laurel">${icon('laurel', { size: 20 })}</i>` : ''
    this.hud.el('div', `hoops-panel-title${won ? '' : ' lose'}`,
      `${laurel}${won ? 'BLOOD COURT CHAMPION' : `${AI_NAME} TAKES THE COURT`}${laurel}`, p)
    this.hud.el('div', 'hoops-panel-score',
      `<span class="hps-you">${score.you}</span><i>—</i><span class="hps-cpu">${score.cpu}</span>`, p)
    const grid = this.hud.el('div', 'hoops-panel-grid', '', p)
    const row = (k, v) => {
      const r = this.hud.el('div', 'hoops-panel-row', '', grid)
      const sig = ROW_SIGILS[k] ? `<i class="hp-sig">${icon(ROW_SIGILS[k], { size: 13 })}</i>` : ''
      this.hud.el('span', 'k', `${sig}${k}`, r)
      this.hud.el('span', 'v', v, r)
    }
    const pct = match.attempts ? Math.round(100 * match.makes / match.attempts) : 0
    row('2-POINTERS', `${match.pts2} PTS`)
    row('3-POINTERS', `${match.pts3} PTS`)
    row('DUNKS', `${match.dunks} (${match.dunkPts} PTS)`)
    row('SHOOTING', `${match.makes}/${match.attempts} · ${pct}%`)
    row('STEALS', String(match.steals))
    row('BLOCKS', String(match.blocks))
    row('LONGEST RUN', match.longestRun ? `${match.longestRun}-0` : '—')
    row('FAVORITE ART', favorite || '—')
    const btn = this.hud.el('button', 'hoops-hub-btn ui-interactive', 'RETURN TO HUB', p)
    btn.addEventListener('click', onHub)
    this.hud.el('div', 'hoops-panel-auto', 'returning to the halls shortly…', p)
    return p
  }
}
