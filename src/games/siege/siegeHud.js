import { HUD } from '../../ui/hud.js'
import { WAVE_COUNT } from './raiders.js'

/** All LAST BASTION DOM: bastion bar, wave/gold readouts, prompts, boss bar. */
export class SiegeHud {
  constructor(skillDefs, abilityOpts) {
    const hud = this.hud = new HUD()

    // bastion HP — big segmented bar, top center (stats keys stay "citadel")
    const cit = hud.el('div', 'siege-citadel')
    hud.el('div', 'siege-citadel-label', '<span class="siege-cit-icon">♜</span> BASTION', cit)
    const track = hud.el('div', 'siege-citadel-track', '', cit)
    this.citFill = hud.el('div', 'siege-citadel-fill', '', track)
    for (let i = 1; i < 10; i++) {
      const seg = hud.el('div', 'siege-citadel-seg', '', track)
      seg.style.left = `${i * 10}%`
    }
    this.citText = hud.el('div', 'siege-citadel-text', '', track)
    this.citEl = cit

    // wave + incoming, top left
    const wave = hud.el('div', 'siege-wave')
    this.waveNum = hud.el('div', 'siege-wave-num', 'WAVE 1', wave)
    this.waveSub = hud.el('div', 'siege-wave-sub', '', wave)

    // gold, top right
    const gold = hud.el('div', 'siege-gold')
    hud.el('div', 'siege-coin', '', gold)
    this.goldNum = hud.el('b', '', '0', gold)
    this.goldEl = gold

    // player hp, bottom left
    this.hpBar = hud.bar({ label: 'HP', color: '#5cff8a' })
    Object.assign(this.hpBar.root.style, { left: '26px', bottom: '34px', width: '300px' })

    // abilities
    this.ability = hud.abilityBar(skillDefs, abilityOpts)

    // contextual build prompt
    this.prompt = hud.el('div', 'siege-prompt')
    this.prompt.style.display = 'none'

    // boss bar
    this.bossBox = hud.el('div', 'siege-boss',
      '<div class="siege-boss-name">SIEGE COLOSSUS</div><div class="siege-boss-track"><div class="siege-boss-fill"></div></div>')
    this.bossBox.style.display = 'none'
    this.bossFill = this.bossBox.querySelector('.siege-boss-fill')

    // overlays
    this.vgEl = hud.el('div', 'siege-vignette')
    this.lowEl = hud.el('div', 'siege-lowcit')
    this.fadeEl = hud.el('div', 'siege-fade')
    this.respawnEl = hud.el('div', 'siege-respawn', 'RESPAWNING<span></span>')
    this.respawnEl.style.display = 'none'
    this.respawnSecs = this.respawnEl.querySelector('span')

    this.hintBox = hud.hints([
      ['WASD', 'Move'], ['MOUSE', 'Aim'], ['HOLD LMB', 'Attack'],
      ['1-4', 'Skills'], ['F', 'Build / upgrade'], ['H', 'Toggle help'],
    ])
  }

  setCitadel(frac, hp, max) {
    this.citFill.style.width = `${frac * 100}%`
    this.citText.textContent = `${Math.ceil(hp)} / ${max}`
    this.citEl.classList.toggle('low', frac < 0.25 && frac > 0)
  }

  citadelHit() {
    this.citEl.classList.remove('hit')
    void this.citEl.offsetWidth
    this.citEl.classList.add('hit')
  }

  setWave(label, sub) {
    this.waveNum.textContent = label
    this.waveSub.textContent = sub
  }

  setGold(g) {
    if (this._gold !== g) {
      this._gold = g
      this.goldNum.textContent = String(g)
      this.goldEl.classList.remove('pop')
      void this.goldEl.offsetWidth
      this.goldEl.classList.add('pop')
    }
  }

  setPrompt(text, ok) {
    if (!text) { this.prompt.style.display = 'none'; return }
    this.prompt.style.display = ''
    if (this._promptTxt !== text) {
      this._promptTxt = text
      this.prompt.innerHTML = `<span class="siege-prompt-key">F</span>${text}`
    }
    this.prompt.classList.toggle('no', !ok)
  }

  setHp(frac, txt) { this.hpBar.set(frac, txt) }

  showBoss() { this.bossBox.style.display = '' }
  hideBoss() { this.bossBox.style.display = 'none' }
  setBoss(frac, enraged) {
    this.bossFill.style.width = `${frac * 100}%`
    this.bossBox.classList.toggle('enraged', !!enraged)
  }

  damageFlash() {
    this.vgEl.classList.remove('on')
    void this.vgEl.offsetWidth
    this.vgEl.classList.add('on')
  }

  setCitadelDanger(on) { this.lowEl.classList.toggle('on', on) }
  fadeOut() { this.fadeEl.classList.add('on') }

  setRespawn(secs) {
    if (secs == null) { this.respawnEl.style.display = 'none'; return }
    this.respawnEl.style.display = ''
    this.respawnSecs.textContent = ` ${Math.ceil(secs)}`
  }

  toggleHints() {
    this.hintBox.style.display = this.hintBox.style.display === 'none' ? '' : 'none'
  }

  waveLabel(wave, state, incoming) {
    if (state === 'break') return [`WAVE ${wave + 1} / ${WAVE_COUNT}`, 'INCOMING…']
    return [`WAVE ${wave} / ${WAVE_COUNT}`, incoming > 0 ? `${incoming} RAIDERS LEFT` : '']
  }
}
