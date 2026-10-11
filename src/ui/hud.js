import { KEY_LABELS } from '../meta/skills.js'
import { icon } from './craft.js' // side effect: installCraft() puts --tex-* on :root
import { selectedChampion } from '../meta/champions.js'
import { championPortrait } from './championPortrait.js'

/**
 * DOM HUD toolkit. Everything renders into #ui (cleared automatically on
 * scene change). Panels are click-through unless given class `ui-interactive`.
 */
export class HUD {
  constructor() {
    this.root = document.getElementById('ui')
    this.later = this.root.sceneScheduler?.setTimeout || window.setTimeout.bind(window)
    this.cancelLater = this.root.sceneScheduler?.clearTimeout || window.clearTimeout.bind(window)
  }

  el(tag, cls = '', html = '', parent = this.root) {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (html) e.innerHTML = html
    parent.appendChild(e)
    return e
  }

  panel(cls = '', html = '') { return this.el('div', `ui-panel ${cls}`, html) }

  /**
   * Q/W/E/R ability bar from equipped skill defs.
   * Returns { root, setCooldown(i, frac), flash(i), setActive(i, on) }.
   */
  abilityBar(skills, { game = null, keys = KEY_LABELS } = {}) {
    const root = this.el('div', 'ability-bar ui-interactive')
    if (this.root.playerProfile) {
      const { champion, skin } = selectedChampion(this.root.playerProfile)
      const identity = this.el('div', 'battle-identity', '', root)
      identity.setAttribute('aria-label', `${champion.name}, ${skin.name}`)
      championPortrait(this.el('div', 'battle-identity-picture', '', identity), champion, skin)
      const copy = this.el('div', 'battle-identity-copy', '', identity)
      this.el('b', '', champion.name, copy)
      this.el('span', '', skin.name, copy)
    }
    const slots = skills.map((s, i) => {
      const slot = this.el('div', 'ability-slot', '', root)
      slot.style.setProperty('--skill-color', s.color)
      this.el('div', 'ability-icon', s.icon, slot)
      this.el('div', 'key-badge', keys[i], slot)
      this.el('div', 'ability-name', s.name, slot)
      const cd = this.el('div', 'cd-sweep', '', slot)
      const cdText = this.el('div', 'cd-text', '', slot)
      const tipDesc = game && s.inGame?.[game] ? s.inGame[game] : s.desc
      // parchment tip is the slot's NEXT SIBLING (shield clip-path on the slot
      // would clip a child); shown via `.ability-slot:hover + .ability-tip`.
      const tip = this.el('div', 'ability-tip', `<b>${s.name}</b><span>${tipDesc}</span><i>${s.cd}s cooldown</i>`, root)
      tip.style.setProperty('--skill-color', s.color)
      tip.style.setProperty('--slot-i', i)
      return { slot, cd, cdText }
    })
    return {
      root,
      setCooldown(i, frac, secs = null) {
        const { slot, cd, cdText } = slots[i]
        cd.style.setProperty('--cd', String(Math.max(0, Math.min(1, frac))))
        slot.classList.toggle('on-cd', frac > 0.001)
        cdText.textContent = frac > 0.001 && secs != null ? Math.ceil(secs) : ''
      },
      flash(i) {
        slots[i].slot.classList.remove('cast-flash')
        void slots[i].slot.offsetWidth
        slots[i].slot.classList.add('cast-flash')
      },
      setActive(i, on) { slots[i].slot.classList.toggle('active', on) },
    }
  }

  /** Labeled resource bar. Returns { root, set(frac, text) }. */
  bar({ label = '', cls = '', color = '#5cff8a' } = {}) {
    const root = this.el('div', `stat-bar ${cls}`)
    root.style.setProperty('--bar-color', color)
    if (label) this.el('div', 'stat-bar-label', label, root)
    const track = this.el('div', 'stat-bar-track', '', root)
    const ghost = this.el('div', 'stat-bar-ghost', '', track)
    const fill = this.el('div', 'stat-bar-fill', '', track)
    const text = this.el('div', 'stat-bar-text', '', track)
    this.el('span', 'stat-bar-cap', '', root) // forged pommel end-cap
    let ghostFrac = 1
    return {
      root,
      set(frac, txt = '') {
        frac = Math.max(0, Math.min(1, frac))
        fill.style.width = `${frac * 100}%`
        if (frac > ghostFrac) ghostFrac = frac
        ghostFrac += (frac - ghostFrac) * 0.08
        ghost.style.width = `${ghostFrac * 100}%`
        text.textContent = txt
      },
    }
  }

  /** Big center announcement ("VICTORY", "DOUBLE KILL"). Auto-removes. */
  banner(text, { sub = '', color = '#ffd166', duration = 2.2, cls = '' } = {}) {
    const b = this.el('div', `big-banner ${cls}`)
    b.style.setProperty('--banner-color', color)
    const row = this.el('div', 'banner-row', '', b)
    this.el('span', 'banner-orn banner-orn-l', icon('ornament-divider'), row)
    this.el('div', 'banner-main', text, row)
    this.el('span', 'banner-orn banner-orn-r', icon('ornament-divider'), row)
    if (sub) this.el('div', 'banner-sub', sub, b)
    if (duration > 0) {
      this.later(() => b.classList.add('out'), duration * 1000)
      this.later(() => b.remove(), duration * 1000 + 600)
    }
    return b
  }

  /** Bottom toast message. */
  toast(msg, { duration = 2.6, cls = '' } = {}) {
    const t = this.el('div', `ui-toast ${cls}`, msg)
    this.later(() => t.classList.add('out'), duration * 1000)
    this.later(() => t.remove(), duration * 1000 + 500)
  }

  /** Corner hint box listing controls. */
  hints(lines, { title = 'CONTROLS' } = {}) {
    const panel = this.hintPanel = this.el('div', 'hint-box ui-interactive',
      `<div class="hint-title">${title}</div>` +
      lines.map(([k, v]) => `<div class="hint-row"><span class="hint-key">${k}</span><span>${v}</span></div>`).join(''))
    panel.id = 'battle-controls'
    panel.hidden = true
    const toggle = this.hintToggle = this.el('button', 'battle-help-toggle', '<kbd>H</kbd> Controls')
    toggle.type = 'button'
    toggle.setAttribute('aria-controls', panel.id)
    toggle.setAttribute('aria-expanded', 'false')
    toggle.onclick = () => {
      this.toggleHints()
      document.querySelector('#app canvas')?.focus({ preventScroll: true })
    }
    return panel
  }

  toggleHints() {
    if (!this.hintPanel) return
    this.hintPanel.hidden = !this.hintPanel.hidden
    this.hintToggle.setAttribute('aria-expanded', String(!this.hintPanel.hidden))
  }

  /** 3-2-1-GO countdown overlay; resolves when done. */
  countdown(audio = null) {
    return new Promise(res => {
      let n = 3
      const show = () => {
        if (n > 0) {
          const d = this.el('div', 'count-num', String(n))
          audio?.play('countdown')
          this.later(() => d.remove(), 850)
          n--
          this.later(show, 900)
        } else {
          const d = this.el('div', 'count-num go', 'GO!')
          audio?.play('go')
          this.later(() => d.remove(), 800)
          res()
        }
      }
      show()
    })
  }

  clear() { this.root.innerHTML = '' }
}
