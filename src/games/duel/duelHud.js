import { icon } from '../../ui/craft.js'

/**
 * THE CRUCIBLE HUD — MK layout: two opposing tapered-blade health bars with
 * forged finial caps, ghost damage trails, rivet-gem round pips, an engraved
 * stone timer block with hourglass finial, ember-quenched surge gauges in the
 * bottom corners, carved tower-ladder plaques, an engraved-metal [n]x combo
 * multiplier with a parchment damage subtotal, vs-plates, finisher overlay
 * and the defeat/champion tablets.
 * All DOM, all classes "duel-" prefixed.
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
      // blade assembly: forged pommel finial + tapered trough (ghost, fill, etched ticks)
      const blade = hud.el('div', 'duel-blade', '', wrap)
      hud.el('span', 'duel-hpcap', '', blade)
      const bar = hud.el('div', 'duel-hp', '', blade)
      const ghost = hud.el('div', 'duel-hpghost', '', bar)
      const fill = hud.el('div', 'duel-hpfill', '', bar)
      hud.el('div', 'duel-hpticks', '', bar)
      const pips = hud.el('div', 'duel-pips', '', wrap)
      const pipEls = [hud.el('span', 'duel-pip', '', pips), hud.el('span', 'duel-pip', '', pips)]
      this.sides[side] = { wrap, sigil, name, fill, ghost, pipEls, hpFrac: 1 }
    }
    // engraved stone numeral block, hourglass finial at its crown
    const timerBlock = hud.el('div', 'duel-timerblock', '', top)
    hud.el('div', 'duel-timer-finial', icon('hourglass', { size: 13 }), timerBlock)
    this.timerEl = hud.el('div', 'duel-timer', '60', timerBlock)

    // surge meters, bottom corners
    for (const side of ['L', 'R']) {
      const m = hud.el('div', `duel-meter ${side === 'L' ? 'duel-left' : 'duel-right'}`)
      const segs = []
      for (let i = 0; i < 4; i++) segs.push(hud.el('span', 'duel-meter-seg', '<i></i>', m))
      const label = hud.el('div', 'duel-meter-label', `${icon('flame', { size: 11 })}SURGE`, m)
      this.sides[side].meter = { root: m, segs, label }
    }

    // [n]x combo counters — engraved-metal multiplier stamped high on the
    // VICTIM's side ('L' = the player is being combo'd -> crimson-tinted)
    for (const side of ['L', 'R']) {
      const c = hud.el('div', `duel-mult ${side === 'L' ? 'duel-left duel-incoming' : 'duel-right'}`)
      const num = hud.el('div', 'duel-mult-num', '', c)
      const sub = hud.el('div', 'duel-mult-sub', '', c)
      const grade = hud.el('div', 'duel-mult-grade', '', c)
      this.combo[side] = { root: c, num, sub, grade, hideT: null, tier: 0 }
    }
    // screen-edge ember flare fired on counter tier-ups
    this.flare = hud.el('div', 'duel-flare')
    this.flare.addEventListener('animationend', () => this.flare.classList.remove('on'))

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

  /**
   * The [n]x multiplier. Appears on the SECOND successive hit and re-stamps
   * (scale-pop + rotation jitter) on every landed move. Tiers escalate with
   * the grade thresholds: t1 bronze 2-3x, t2 ember 4-6x, t3 blood 7-9x,
   * t4 gold-leaf 10x+ — tier-ups fire the screen-edge ember flare.
   * Driven by FightSystem's comboHits (the same counter damage scaling uses).
   */
  comboTick(side, hits, dmg) {
    const c = this.combo[side]
    if (c.hideT) { clearTimeout(c.hideT); c.hideT = null }
    if (hits < 2) { // a fresh combo is underway — clear any stale stamp
      c.root.classList.remove('show', 'final', 'drop')
      c.tier = 0
      return
    }
    const tier = hits >= 10 ? 4 : hits >= 7 ? 3 : hits >= 4 ? 2 : 1
    c.root.classList.remove('final', 'drop', 't1', 't2', 't3', 't4')
    c.root.classList.add('show', `t${tier}`)
    c.num.textContent = `${hits}x`
    c.sub.textContent = `${Math.round(dmg)} DMG`
    c.grade.textContent = ''
    c.root.style.setProperty('--jr', `${(Math.random() * 9 - 4.5).toFixed(1)}deg`)
    c.root.style.setProperty('--mpop', String(Math.min(1.9, 1.3 + hits * 0.05)))
    c.num.classList.remove('pop')
    void c.num.offsetWidth
    c.num.classList.add('pop')
    if (tier > c.tier && tier >= 2) this._flare(tier)
    c.tier = tier
  }

  _flare(tier) {
    const f = this.flare
    f.className = `duel-flare f${tier}`
    void f.offsetWidth
    f.classList.add('on')
  }

  /** Final stamp: knockdown conversions slam the grade; escapes crack + crumble. */
  comboEnd(side, hits, dmg, dropped = false) {
    const c = this.combo[side]
    if (c.hideT) { clearTimeout(c.hideT); c.hideT = null }
    if (hits < 2 || !c.root.classList.contains('show')) return
    c.tier = 0
    if (dropped) {
      c.root.classList.add('drop')
      c.hideT = setTimeout(() => c.root.classList.remove('show', 'drop'), 800)
      return
    }
    c.root.classList.add('final')
    if (hits >= 4) {
      c.grade.textContent = hits >= 10 ? 'LEGENDARY' : hits >= 7 ? 'SAVAGE' : 'FIERCE'
      c.grade.className = `duel-mult-grade g${hits >= 10 ? 3 : hits >= 7 ? 2 : 1}`
    }
    c.hideT = setTimeout(() => c.root.classList.remove('show', 'final'), hits >= 4 ? 1500 : 800)
  }

  hideCombos() {
    for (const side of ['L', 'R']) {
      const c = this.combo[side]
      if (c.hideT) clearTimeout(c.hideT)
      c.root.classList.remove('show', 'final', 'drop')
      c.tier = 0
    }
  }

  /** "RAVAGER vs GOREHOWL" title-card slam. Returns a remover. */
  showVs(pName, pTitle, foe) {
    const v = this.hud.el('div', 'duel-vs')
    const buildPlate = (el, name, title) => {
      this.hud.el('div', 'duel-vs-name', name, el)
      this.hud.el('div', 'duel-vs-orn', icon('ornament-divider', { size: 150 }), el)
      this.hud.el('div', 'duel-vs-title', title, el)
    }
    const l = this.hud.el('div', 'duel-vs-plate duel-vsl', '', v)
    buildPlate(l, pName, pTitle)
    this.hud.el('div', 'duel-vs-mid',
      `<span class="duel-vs-swords">${icon('crossed-swords', { size: 40 })}</span><span class="duel-vs-text">VS</span>`, v)
    const r = this.hud.el('div', 'duel-vs-plate duel-vsr', '', v)
    r.style.setProperty('--fc', foe.color)
    buildPlate(r, foe.name, foe.title)
    return () => { v.classList.add('out'); setTimeout(() => v.remove(), 450) }
  }

  /** Darkened-arena overlay for the finisher. */
  setDark(on) {
    if (!this.darkEl) this.darkEl = this.hud.el('div', 'duel-dark')
    this.darkEl.classList.toggle('on', on)
  }

  showOblitPrompt() {
    this.oblitEl = this.hud.el('div', 'duel-oblit',
      `<span class="duel-oblit-orn">${icon('ornament-divider', { size: 170 })}</span>` +
      '<span class="duel-oblit-text">OBLITERATE!</span>' +
      `<span class="duel-oblit-orn duel-oblit-orn-b">${icon('ornament-divider', { size: 170 })}</span>`)
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
    this.hud.el('div', 'duel-panel-crest duel-crest-lose', icon('skull', { size: 38 }), p)
    this.hud.el('div', 'duel-panel-title lose', 'DEFEATED', p)
    this.hud.el('div', 'duel-panel-orn', icon('ornament-divider', { size: 180 }), p)
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
    this.hud.el('div', 'duel-panel-crest', icon('laurel', { size: 40 }), p)
    this.hud.el('div', 'duel-panel-title', 'CRUCIBLE CHAMPION', p)
    this.hud.el('div', 'duel-panel-orn', icon('ornament-divider', { size: 180 }), p)
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
