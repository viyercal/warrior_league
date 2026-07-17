import { HUD } from '../../ui/hud.js'
import { WAVE_COUNT } from './raiders.js'

/** Display-only raider glyphs for wave-composition rows + kill tallies. */
export const RAIDER_CHIPS = {
  grunt: { glyph: '⚔', color: '#c98d5f', label: 'GRUNT' },
  sprinter: { glyph: '➤', color: '#dcc296', label: 'SPRINTER' },
  exploder: { glyph: '✶', color: '#ffb84d', label: 'EXPLODER' },
  brute: { glyph: '◆', color: '#c23b2e', label: 'BRUTE' },
  shieldbearer: { glyph: '⛨', color: '#b8c8d8', label: 'SHIELDBEARER' },
  colossus: { glyph: '♆', color: '#ff5a26', label: 'COLOSSUS' },
}

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

    // cinematic letterbox (intro + boss entrance)
    this.cineTop = hud.el('div', 'siege-cine siege-cine-top')
    this.cineBot = hud.el('div', 'siege-cine siege-cine-bot')

    // between-wave PREPARE countdown chip
    this.prepEl = hud.el('div', 'siege-prepare')
    this.prepEl.style.display = 'none'
    this._prep = null

    this.hintBox = hud.hints([
      ['WASD', 'Move'], ['MOUSE', 'Aim'], ['HOLD LMB', 'Attack'],
      ['1-4', 'Skills'], ['F', 'Build / upgrade'], ['H', 'Toggle help'],
    ])
  }

  // ---------- cinematics ----------

  setCine(on) {
    this.cineTop.classList.toggle('on', on)
    this.cineBot.classList.toggle('on', on)
    this.hud.root.classList.toggle('siege-cinema', on) // hides gameplay chrome
  }

  /** Intro title card: LAST BASTION / HOLD THE GATE. Returns a remover. */
  showTitle() {
    const t = this.hud.el('div', 'siege-title')
    this.hud.el('div', 'siege-title-main', 'LAST BASTION', t)
    this.hud.el('div', 'siege-title-sub', 'HOLD THE GATE — 10 WAVES', t)
    return () => { t.classList.add('out'); setTimeout(() => t.remove(), 500) }
  }

  /** Boss entrance name slam. Returns a remover. */
  bossCard() {
    const t = this.hud.el('div', 'siege-title siege-bosscard')
    this.hud.el('div', 'siege-title-main', 'SIEGE COLOSSUS', t)
    this.hud.el('div', 'siege-title-sub', 'GATE-BREAKER OF THE BURNING CAMPS', t)
    return () => { t.classList.add('out'); setTimeout(() => t.remove(), 500) }
  }

  // ---------- wave ritual ----------

  /** Chip row of raider glyphs (icon ×count). comp = {type: count}. */
  compRow(comp, parent) {
    const row = this.hud.el('div', 'siege-comp', '', parent)
    for (const [type, count] of Object.entries(comp)) {
      const def = RAIDER_CHIPS[type]
      if (!def || !count) continue
      const chip = this.hud.el('span', 'siege-comp-chip', '', row)
      chip.style.setProperty('--cc', def.color)
      this.hud.el('i', 'siege-comp-glyph', def.glyph, chip)
      this.hud.el('b', '', `×${count}`, chip)
    }
    return row
  }

  /** Same chips as compRow, as an HTML string (for stats-panel values). */
  compHTML(comp) {
    const chips = Object.entries(comp)
      .filter(([type, count]) => RAIDER_CHIPS[type] && count)
      .map(([type, count]) => {
        const def = RAIDER_CHIPS[type]
        return `<span class="siege-comp-chip" style="--cc:${def.color}">` +
          `<i class="siege-comp-glyph">${def.glyph}</i><b>×${count}</b></span>`
      })
    return chips.length ? `<span class="siege-comp">${chips.join('')}</span>` : ''
  }

  /** Wave banner with a composition preview row of what marches. */
  waveBanner(n, comp, { boss = false, sub = '' } = {}) {
    const b = this.hud.banner(`WAVE ${n}`, {
      color: boss ? '#c23b2e' : '#ff8a3c', duration: 2.4, sub,
    })
    if (boss) comp = { colossus: 1, ...comp }
    this.compRow(comp, b)
    return b
  }

  setPrepare(secs) {
    if (secs == null) {
      if (this._prep !== null) { this._prep = null; this.prepEl.style.display = 'none' }
      return null
    }
    this.prepEl.style.display = ''
    if (this._prep !== secs) {
      this._prep = secs
      this.prepEl.innerHTML = `PREPARE — <b>${secs}</b>`
      this.prepEl.classList.remove('tick')
      void this.prepEl.offsetWidth
      this.prepEl.classList.add('tick')
      return secs // caller may play a tick
    }
    return null
  }

  // ---------- breach drama ----------

  /** Crimson pulse on the bastion bar when the gate first bleeds. */
  bleedPulse() {
    this.citEl.classList.remove('bleed')
    void this.citEl.offsetWidth
    this.citEl.classList.add('bleed')
  }

  annihilate() {
    const el = this.hud.el('div', 'siege-annihilate', 'ANNIHILATION')
    setTimeout(() => el.classList.add('out'), 950)
    setTimeout(() => el.remove(), 1400)
  }

  // ---------- end-of-run stats tablet ----------

  /**
   * Duel-style end tablet: title, sub, stat rows, buttons.
   * rows: [[label, valueHTML], …]; buttons: [{text, ghost, onClick}, …].
   * Root keeps the `.siege-end` contract (probes click `.siege-end button`).
   */
  endPanel({ title, sub = '', lose = false, rows = [], buttons = [], note = '' }) {
    const p = this.hud.el('div', 'siege-end ui-interactive')
    this.hud.el('div', `siege-end-title${lose ? ' lose' : ''}`, title, p)
    if (sub) this.hud.el('div', 'siege-end-sub', sub, p)
    const box = this.hud.el('div', 'siege-stats', '', p)
    for (const [label, value] of rows) {
      const r = this.hud.el('div', 'siege-stat-row', '', box)
      this.hud.el('span', 'siege-stat-label', label, r)
      this.hud.el('span', 'siege-stat-value', value, r)
    }
    const rowEl = this.hud.el('div', 'siege-end-row', '', p)
    for (const { text, ghost, onClick } of buttons) {
      const btn = document.createElement('button')
      if (ghost) btn.className = 'ghost'
      btn.textContent = text
      btn.onclick = onClick
      rowEl.appendChild(btn)
    }
    if (note) this.hud.el('div', 'siege-end-note', note, p)
    return p
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

  setCitadelDanger(on) {
    this.lowEl.classList.toggle('on', on)
    this.citEl.classList.toggle('heartbeat', on) // the bar itself thumps
  }
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
