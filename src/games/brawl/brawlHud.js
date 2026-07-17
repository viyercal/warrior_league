/**
 * Mortal Arena DOM HUD: carved-stone fighter plaques (damage % + stock studs,
 * crack states, heartbeat at high %), kill feed, cinematic letterbox, intro
 * name plates and the podium results tablet. Built on the shared HUD toolkit.
 */
export class BrawlHud {
  constructor(hud, fighters) {
    this.hud = hud
    this.rows = []
    this.wrap = hud.el('div', 'brawl-chips')
    for (const f of fighters) {
      const chip = hud.el('div', 'brawl-chip', '', this.wrap)
      chip.style.setProperty('--fc', f.color)
      hud.el('div', 'brawl-chip-name', `<span class="brawl-dot"></span>${f.name}`, chip)
      const pct = hud.el('div', 'brawl-pct', '0%', chip)
      // drop the pop class when its animation ends so the 100%+ heartbeat resumes
      pct.addEventListener('animationend', e => { if (e.animationName === 'brawlPctPop') pct.classList.remove('pop') })
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
        const k = Math.min(1, f.dmg / 150) // bone -> blood as damage racks up
        r.pct.style.color = `rgb(${Math.round(232 + 23 * k)}, ${Math.round(220 - 161 * k)}, ${Math.round(196 - 150 * k)})`
        r.pct.classList.toggle('hot', f.dmg >= 100)     // heartbeat pulse
        r.chip.classList.toggle('brawl-chip-crit', f.dmg >= 200) // cracked-stone state
        if (rose) {
          r.pct.classList.remove('pop')
          void r.pct.offsetWidth
          r.pct.classList.add('pop')
        }
      }
      if (f.stocks !== r.lastStocks) {
        const dropped = f.stocks < r.lastStocks
        r.lastStocks = f.stocks
        r.pipEls.forEach((p, i) => p.classList.toggle('on', i < f.stocks))
        r.chip.classList.toggle('brawl-chip-out', f.stocks <= 0)
        if (dropped) { // the plaque cracks as stocks drop
          r.chip.classList.add(`brawl-crack${Math.min(2, Math.max(1, 3 - f.stocks))}`)
          r.chip.classList.remove('brawl-chip-hit')
          void r.chip.offsetWidth
          r.chip.classList.add('brawl-chip-hit')
        }
      }
    }
  }

  feed(msg, color = '#ffb84d') {
    const e = this.hud.el('div', 'brawl-feed-item', msg, this.feedBox)
    e.style.setProperty('--fc', color)
    while (this.feedBox.children.length > 5) this.feedBox.firstChild.remove()
    setTimeout(() => {
      e.classList.add('out')
      setTimeout(() => e.remove(), 500)
    }, 3800)
  }

  /** Cinematic letterbox bars (intro + final-KO slow-mo); hides the plaques/feed. */
  setCine(on) {
    if (!this.cineTop) {
      this.cineTop = this.hud.el('div', 'brawl-cine brawl-cine-top')
      this.cineBot = this.hud.el('div', 'brawl-cine brawl-cine-bot')
    }
    this.cineTop.classList.toggle('on', on)
    this.cineBot.classList.toggle('on', on)
    this.wrap.classList.toggle('brawl-hidden', on)
    this.feedBox.classList.toggle('brawl-hidden', on)
  }

  /** Entrance name plate ("BLOODFANG — THE CRIMSON MAW") slam. Returns a remover. */
  introPlate({ name, title, color }) {
    const p = this.hud.el('div', 'brawl-plate')
    p.style.setProperty('--fc', color)
    this.hud.el('div', 'brawl-plate-name', name, p)
    if (title) this.hud.el('div', 'brawl-plate-title', title, p)
    return () => { p.classList.add('out'); setTimeout(() => p.remove(), 300) }
  }

  /** Podium results tablet: ordered stat rows, the winner's plaque glowing. */
  results({ rows, won, onHub }) {
    const p = this.hud.el('div', 'brawl-results ui-interactive')
    this.hud.el('div', `brawl-results-title${won ? '' : ' lose'}`, won ? 'CHAMPION' : 'DEFEATED', p)
    const table = this.hud.el('div', 'brawl-results-table', '', p)
    this.hud.el('div', 'brawl-results-row brawl-results-head',
      '<span>FIGHTER</span><span>KOs</span><span>FALLS</span><span>PEAK %</span><span>SURV</span><span>FAV ART</span>', table)
    for (const r of rows) {
      const row = this.hud.el('div', `brawl-results-row${r.winner ? ' brawl-results-winner' : ''}`, '', table)
      row.style.setProperty('--fc', r.color)
      row.innerHTML =
        `<span class="brawl-results-name"><b class="brawl-place">${r.place}</b><i class="brawl-dot"></i>${r.name}</span>` +
        `<span>${r.kos}</span><span>${r.taken}</span><span>${r.maxDmg}%</span><span>${r.survived}</span>` +
        `<span class="brawl-results-fav">${r.fav}</span>`
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
