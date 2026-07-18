import { icon } from '../../ui/craft.js'

/**
 * THE PIT HUD extras — the FURY brazier gauge and the end-of-run
 * parchment-iron ledger (stats for victory AND death). Pure DOM under #ui,
 * arena- prefixed.
 */

/** Kills-per-4s brazier gauge: an iron bowl whose column of embers rises on
 *  kills, decays, and sets the flame sigil blazing when hot. */
export function buildHeatMeter(hud) {
  const root = hud.el('div', 'arena-heat')
  const stem = hud.el('div', 'arena-heat-stem', '', root)
  const fill = hud.el('div', 'arena-heat-fill', '', stem)
  hud.el('div', 'arena-heat-bowl', icon('flame', { size: 13 }), root)
  hud.el('div', 'arena-heat-label', 'FURY', root)
  return {
    root,
    set(heat) {
      fill.style.height = `${Math.round(heat * 100)}%`
      root.classList.toggle('blazing', heat > 0.62)
    },
  }
}

const TYPE_LABELS = { grunt: 'GRUNTS', sprinter: 'SPRINTERS', brute: 'BRUTES', exploder: 'BOMBERS' }
const TYPE_SIGILS = { grunt: 'skull', sprinter: 'blink', brute: 'titan', exploder: 'flame' }
const ROW_SIGILS = ['banner', 'coin', 'crossed-swords', 'flame', 'hourglass']

/**
 * End-of-run ledger: waves / score / kills / orbs / favorite art on inked
 * parchment + per-type sigil kill chips. Keeps the RETRY / HUB button
 * contract (HUB = .ghost).
 */
export function buildEndPanel(hud, { won, stats, onRetry, onHub }) {
  const p = hud.el('div', 'arena-end ui-interactive')
  hud.el('div', `arena-end-crest ${won ? '' : 'lose'}`, icon(won ? 'laurel' : 'skull', { size: 34 }), p)
  hud.el('div', `arena-end-title ${won ? '' : 'lose'}`, won ? 'THE PIT FALLS SILENT' : 'THE PIT CLAIMS ANOTHER', p)
  hud.el('div', 'arena-end-orn', icon('ornament-divider', { size: 190 }), p)
  const rows = [
    ['WAVES SURVIVED', `${stats.waves} / ${stats.waveCount}`],
    ['SCORE', String(stats.score)],
    ['KILLS', String(stats.kills)],
    ['ORBS DEVOURED', String(stats.orbs)],
    ['FAVORITE ART', stats.favorite],
  ]
  const ledger = hud.el('div', 'arena-end-ledger', '', p)
  rows.forEach(([k, v], i) => {
    const r = hud.el('div', 'arena-stat-row', '', ledger)
    hud.el('span', 'arena-stat-label', `<i class="arena-stat-sigil">${icon(ROW_SIGILS[i], { size: 13 })}</i>${k}`, r)
    hud.el('span', 'arena-stat-val', v, r)
  })
  const chips = hud.el('div', 'arena-kill-chips', '', p)
  for (const [type, n] of Object.entries(stats.byType)) {
    if (n) {
      hud.el('span', 'arena-kill-chip',
        `${icon(TYPE_SIGILS[type] || 'skull', { size: 12 })}${TYPE_LABELS[type] || type.toUpperCase()} ×${n}`, chips)
    }
  }
  if (stats.elites) hud.el('span', 'arena-kill-chip elite', `${icon('laurel', { size: 12 })}ELITES ×${stats.elites}`, chips)
  if (stats.warden) hud.el('span', 'arena-kill-chip warden', `${icon('crossed-swords', { size: 12 })}WARDEN SLAIN`, chips)
  const row = hud.el('div', 'arena-end-buttons', '', p)
  if (onRetry) {
    const retry = document.createElement('button')
    retry.textContent = 'RETRY'
    retry.onclick = onRetry
    row.appendChild(retry)
  }
  const hub = document.createElement('button')
  hub.className = 'ghost'
  hub.textContent = 'HUB'
  hub.onclick = onHub
  row.appendChild(hub)
  if (won) hud.el('div', 'arena-end-auto', 'returning to the halls shortly…', p)
  return p
}
