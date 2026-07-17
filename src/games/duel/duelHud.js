/**
 * THE CRUCIBLE HUD — MK layout: two opposing angled health bars with ghost
 * damage trails, round pips, center timer, surge-meter segments in the bottom
 * corners, tower-progress chips, combo ticker, vs-plates, finisher overlay
 * and the defeat/champion tablets. All DOM, all classes "duel-" prefixed.
 */
export class DuelHud {
  constructor(hud) {
    this.hud = hud
    this.sides = {}
    this.ghost = { L: 1, R: 1 }
    this.combo = {}
    this._timerVal = -1

    const top = hud.el('div', 'duel-top')
    for (const side of ['L', 'R']) {
      const wrap = hud.el('div', `duel-hpwrap ${side === 'L' ? 'duel-left' : 'duel-right'}`, '', top)
      const plate = hud.el('div', 'duel-nameplate', '', wrap)
      const sigil = hud.el('span', 'duel-sigil', '', plate)
      const name = hud.el('span', 'duel-name', '', plate)
      const bar = hud.el('div', 'duel-hp', '', wrap)
      const ghost = hud.el('div', 'duel-hpghost', '', bar)
      const fill = hud.el('div', 'duel-hpfill', '', bar)
      const pips = hud.el('div', 'duel-pips', '', wrap)
      const pipEls = [hud.el('span', 'duel-pip', '', pips), hud.el('span', 'duel-pip', '', pips)]
      this.sides[side] = { wrap, sigil, name, fill, ghost, pipEls, hpFrac: 1 }
    }
    this.timerEl = hud.el('div', 'duel-timer', '60', top)

    // surge meters, bottom corners
    for (const side of ['L', 'R']) {
      const m = hud.el('div', `duel-meter ${side === 'L' ? 'duel-left' : 'duel-right'}`)
      const segs = []
      for (let i = 0; i < 4; i++) segs.push(hud.el('span', 'duel-meter-seg', '<i></i>', m))
      const label = hud.el('div', 'duel-meter-label', 'SURGE', m)
      this.sides[side].meter = { root: m, segs, label }
    }

    // combo tickers (player combos read on the left, foe on the right)
    for (const side of ['L', 'R']) {
      const c = hud.el('div', `duel-combo ${side === 'L' ? 'duel-left' : 'duel-right'}`)
      const hits = hud.el('div', 'duel-combo-hits', '', c)
      const dmg = hud.el('div', 'duel-combo-dmg', '', c)
      const grade = hud.el('div', 'duel-combo-grade', '', c)
      this.combo[side] = { root: c, hits, dmg, grade, hideT: null }
    }

    // tower progress chips
    this.towerBox = hud.el('div', 'duel-tower')
    this.towerChips = []
  }

  setFighter(side, { name, color }) {
    const s = this.sides[side]
    s.name.textContent = name
    s.wrap.style.setProperty('--fc', color)
    s.sigil.textContent = name.charAt(0)
    s.hpFrac = 1
    this.ghost[side] = 1
  }

  buildTower(roster, stage) {
    this.towerBox.innerHTML = ''
    this.towerChips = roster.map((o, i) => {
      const chip = this.hud.el('div', 'duel-chip', '', this.towerBox)
      chip.style.setProperty('--fc', o.color)
      this.hud.el('span', 'duel-chip-sigil', o.short.charAt(0), chip)
      this.hud.el('span', 'duel-chip-name', o.short, chip)
      return chip
    })
    this.setTowerStage(stage)
  }

  setTowerStage(stage) {
    this.towerChips.forEach((chip, i) => {
      chip.classList.toggle('done', i < stage)
      chip.classList.toggle('current', i === stage)
    })
  }

  setRounds(side, wins) {
    this.sides[side].pipEls.forEach((p, i) => p.classList.toggle('on', i < wins))
  }

  setTimer(secs) {
    const v = Math.max(0, Math.ceil(secs))
    if (v === this._timerVal) return
    this._timerVal = v
    this.timerEl.textContent = String(v)
    this.timerEl.classList.toggle('low', v <= 10)
  }

  /** Damped ghost-trail health + meter segments. Call every frame. */
  update(dt, fighters) {
    for (const side of ['L', 'R']) {
      const f = fighters[side]
      const s = this.sides[side]
      if (!f) continue
      const frac = Math.max(0, f.hp / 100)
      s.fill.style.transform = `scaleX(${frac})`
      if (frac > this.ghost[side]) this.ghost[side] = frac
      this.ghost[side] += (frac - this.ghost[side]) * Math.min(1, dt * 3.2)
      s.ghost.style.transform = `scaleX(${this.ghost[side]})`
      // meter
      const m = f.meter / 100
      s.meter.segs.forEach((seg, i) => {
        const k = Math.max(0, Math.min(1, m * 4 - i))
        seg.firstChild.style.transform = `scaleX(${k})`
      })
      s.meter.root.classList.toggle('full', f.meter >= 100)
    }
  }

  comboTick(side, hits, dmg) {
    const c = this.combo[side]
    if (c.hideT) { clearTimeout(c.hideT); c.hideT = null }
    c.root.classList.add('show')
    c.grade.textContent = ''
    c.hits.textContent = `${hits} HIT${hits > 1 ? 'S' : ''}`
    c.dmg.textContent = `${Math.round(dmg)} DMG`
    c.root.style.setProperty('--pop', String(Math.min(1.6, 1 + hits * 0.05)))
    c.root.classList.remove('pop')
    void c.root.offsetWidth
    c.root.classList.add('pop')
  }

  comboEnd(side, hits, dmg) {
    const c = this.combo[side]
    if (hits >= 4) {
      c.grade.textContent = hits >= 10 ? 'LEGENDARY' : hits >= 7 ? 'SAVAGE' : 'FIERCE'
      c.grade.className = `duel-combo-grade g${hits >= 10 ? 3 : hits >= 7 ? 2 : 1}`
    }
    c.hideT = setTimeout(() => c.root.classList.remove('show'), hits >= 4 ? 1300 : 450)
  }

  hideCombos() {
    for (const side of ['L', 'R']) {
      const c = this.combo[side]
      if (c.hideT) clearTimeout(c.hideT)
      c.root.classList.remove('show')
    }
  }

  /** "RAVAGER vs GOREHOWL" title-card slam. Returns a remover. */
  showVs(pName, pTitle, foe) {
    const v = this.hud.el('div', 'duel-vs')
    const l = this.hud.el('div', 'duel-vs-plate duel-vsl', '', v)
    this.hud.el('div', 'duel-vs-name', pName, l)
    this.hud.el('div', 'duel-vs-title', pTitle, l)
    this.hud.el('div', 'duel-vs-mid', 'VS', v)
    const r = this.hud.el('div', 'duel-vs-plate duel-vsr', '', v)
    r.style.setProperty('--fc', foe.color)
    this.hud.el('div', 'duel-vs-name', foe.name, r)
    this.hud.el('div', 'duel-vs-title', foe.title, r)
    return () => { v.classList.add('out'); setTimeout(() => v.remove(), 450) }
  }

  /** Darkened-arena overlay for the finisher. */
  setDark(on) {
    if (!this.darkEl) this.darkEl = this.hud.el('div', 'duel-dark')
    this.darkEl.classList.toggle('on', on)
  }

  showOblitPrompt() {
    this.oblitEl = this.hud.el('div', 'duel-oblit', 'OBLITERATE!')
    return () => { this.oblitEl?.remove(); this.oblitEl = null }
  }

  /** Cinematic letterbox bars for the intro sweep. */
  setCine(on) {
    if (!this.cineTop) {
      this.cineTop = this.hud.el('div', 'duel-cine duel-cine-top')
      this.cineBot = this.hud.el('div', 'duel-cine duel-cine-bot')
    }
    this.cineTop.classList.toggle('on', on)
    this.cineBot.classList.toggle('on', on)
  }

  defeatPanel({ foeName, onRetry, onAbandon }) {
    const p = this.hud.el('div', 'duel-panel ui-interactive')
    this.hud.el('div', 'duel-panel-title lose', 'DEFEATED', p)
    this.hud.el('div', 'duel-panel-sub', `${foeName} HOLDS THE CRUCIBLE`, p)
    const row = this.hud.el('div', 'duel-panel-row', '', p)
    const retry = document.createElement('button')
    retry.className = 'duel-btn'
    retry.textContent = 'RETRY THIS FOE'
    retry.onclick = onRetry
    const abandon = document.createElement('button')
    abandon.className = 'duel-btn duel-btn-ghost'
    abandon.textContent = 'ABANDON TOWER'
    abandon.onclick = onAbandon
    row.append(retry, abandon)
    return p
  }

  championPanel({ name, onHub }) {
    const p = this.hud.el('div', 'duel-panel ui-interactive')
    this.hud.el('div', 'duel-panel-title', 'CRUCIBLE CHAMPION', p)
    this.hud.el('div', 'duel-panel-sub', `${name} STANDS ALONE ATOP THE TOWER`, p)
    const btn = document.createElement('button')
    btn.className = 'duel-btn'
    btn.textContent = 'RETURN TO THE HALLS'
    btn.onclick = onHub
    p.appendChild(btn)
    this.hud.el('div', 'duel-panel-auto', 'returning to the halls shortly…', p)
    return p
  }
}
