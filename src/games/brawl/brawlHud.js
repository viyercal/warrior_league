/**
 * Brawl-specific DOM HUD: fighter damage chips + stock pips, kill feed,
 * results panel. Built on the shared HUD toolkit.
 */
export class BrawlHud {
  constructor(hud, fighters) {
    this.hud = hud
    this.rows = []
    const wrap = hud.el('div', 'brawl-chips')
    for (const f of fighters) {
      const chip = hud.el('div', 'brawl-chip', '', wrap)
      chip.style.setProperty('--fc', f.color)
      hud.el('div', 'brawl-chip-name', `<span class="brawl-dot"></span>${f.name}`, chip)
      const pct = hud.el('div', 'brawl-pct', '0%', chip)
      const pips = hud.el('div', 'brawl-pips', '', chip)
      const pipEls = []
      for (let i = 0; i < 3; i++) pipEls.push(hud.el('span', 'brawl-pip on', '', pips))
      this.rows.push({ f, chip, pct, pipEls, lastDmg: 0, lastStocks: 3 })
    }
    this.feedBox = hud.el('div', 'brawl-feed')
  }

  update() {
    for (const r of this.rows) {
      const f = r.f
      if (f.dmg !== r.lastDmg) {
        const rose = f.dmg > r.lastDmg
        r.lastDmg = f.dmg
        r.pct.textContent = `${Math.round(f.dmg)}%`
        const k = Math.min(1, f.dmg / 150)
        r.pct.style.color = `rgb(255, ${Math.round(242 - 190 * k)}, ${Math.round(238 - 208 * k)})`
        if (rose) {
          r.pct.classList.remove('pop')
          void r.pct.offsetWidth
          r.pct.classList.add('pop')
        }
      }
      if (f.stocks !== r.lastStocks) {
        r.lastStocks = f.stocks
        r.pipEls.forEach((p, i) => p.classList.toggle('on', i < f.stocks))
        r.chip.classList.toggle('brawl-chip-out', f.stocks <= 0)
      }
    }
  }

  feed(msg, color = '#ffd166') {
    const e = this.hud.el('div', 'brawl-feed-item', msg, this.feedBox)
    e.style.setProperty('--fc', color)
    while (this.feedBox.children.length > 5) this.feedBox.firstChild.remove()
    setTimeout(() => {
      e.classList.add('out')
      setTimeout(() => e.remove(), 500)
    }, 3800)
  }

  results({ fighters, won, onHub }) {
    const p = this.hud.el('div', 'brawl-results ui-interactive')
    this.hud.el('div', 'brawl-results-title', won ? 'CHAMPION' : 'DEFEATED', p)
    const table = this.hud.el('div', 'brawl-results-table', '', p)
    this.hud.el('div', 'brawl-results-row brawl-results-head',
      '<span>FIGHTER</span><span>KOs</span><span>FALLS</span>', table)
    for (const f of fighters) {
      const row = this.hud.el('div', 'brawl-results-row', '', table)
      row.style.setProperty('--fc', f.color)
      row.innerHTML = `<span class="brawl-results-name"><i class="brawl-dot"></i>${f.name}${f.stocks > 0 ? ' &#9733;' : ''}</span><span>${f.kos}</span><span>${f.falls}</span>`
    }
    const btn = document.createElement('button')
    btn.className = 'brawl-hub-btn'
    btn.textContent = 'RETURN TO HUB'
    btn.onclick = onHub
    p.appendChild(btn)
    this.hud.el('div', 'brawl-results-auto', 'returning to hub shortly…', p)
    return p
  }
}
