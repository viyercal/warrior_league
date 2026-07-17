/**
 * THE PIT HUD extras — the FURY streak-flame meter and the duel-style end
 * tablet (stats for victory AND death). Pure DOM under #ui, arena- prefixed.
 */

/** Kills-per-4s flame gauge: grows on kills, decays, blazes when hot. */
export function buildHeatMeter(hud) {
  const root = hud.el('div', 'arena-heat')
  const fill = hud.el('div', 'arena-heat-fill', '', root)
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

/**
 * End-of-run tablet: waves / score / kills / orbs / favorite art + kill
 * breakdown chips. Keeps the RETRY / HUB button contract (HUB = .ghost).
 */
export function buildEndPanel(hud, { won, stats, onRetry, onHub }) {
  const p = hud.el('div', 'arena-end ui-interactive')
  hud.el('div', `arena-end-title ${won ? '' : 'lose'}`, won ? 'THE PIT FALLS SILENT' : 'THE PIT CLAIMS ANOTHER', p)
  const rows = [
    ['WAVES SURVIVED', `${stats.waves} / ${stats.waveCount}`],
    ['SCORE', String(stats.score)],
    ['KILLS', String(stats.kills)],
    ['ORBS DEVOURED', String(stats.orbs)],
    ['FAVORITE ART', stats.favorite],
  ]
  for (const [k, v] of rows) {
    const r = hud.el('div', 'arena-stat-row', '', p)
    hud.el('span', 'arena-stat-label', k, r)
    hud.el('span', 'arena-stat-val', v, r)
  }
  const chips = hud.el('div', 'arena-kill-chips', '', p)
  for (const [type, n] of Object.entries(stats.byType)) {
    if (n) hud.el('span', 'arena-kill-chip', `${TYPE_LABELS[type] || type.toUpperCase()} ×${n}`, chips)
  }
  if (stats.elites) hud.el('span', 'arena-kill-chip elite', `ELITES ×${stats.elites}`, chips)
  if (stats.warden) hud.el('span', 'arena-kill-chip warden', 'WARDEN SLAIN', chips)
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
