import { HUD } from '../../ui/hud.js'
import { icon } from '../../ui/craft.js'
import { TEAMS, RIVER_ANGLE, LANE_HALF } from './constants.js'

const MAP_W = 116, MAP_H = 52 // world span the minimap covers

/** Builds all WAR RIFT DOM HUD. Returns handles the scene drives each frame. */
export function buildMobaHud(g) {
  const hud = new HUD()
  const abilityUi = hud.abilityBar(g.skillDefs, { game: 'moba' })

  // ---- bottom-left: level chip + HP / energy ----
  const lvChip = hud.el('div', 'moba-level', '1')
  const hpBar = hud.bar({ label: 'HP', color: '#8fae4a' }) // kit moss green — quenched blade
  Object.assign(hpBar.root.style, { left: '84px', bottom: '64px', width: '300px' })
  const enBar = hud.bar({ label: 'ENERGY', color: '#ff8c3b' })
  Object.assign(enBar.root.style, { left: '84px', bottom: '18px', width: '300px' })

  // ---- top-center clock (forged hourglass tag) / top-right scoreboard plaque ----
  const clockBox = hud.el('div', 'moba-clock',
    `<i class="moba-clock-sigil">${icon('hourglass', { size: '1em' })}</i><span class="moba-clock-time">0:00</span>`)
  const clockEl = clockBox.querySelector('.moba-clock-time')
  const statCell = (sigil, label, valCls, val) =>
    `<div class="moba-stat"><span><i class="moba-stat-sigil">${icon(sigil, { size: '1em' })}</i>${label}</span><b class="${valCls}">${val}</b></div>`
  const stats = hud.el('div', 'moba-stats ui-panel',
    statCell('coin', 'GOLD', 'moba-gold', '0') +
    statCell('crossed-swords', 'CS', 'moba-cs', '0') +
    statCell('skull', 'K / D', 'moba-kd', '0 / 0'))
  const goldEl = stats.querySelector('.moba-gold')
  const csEl = stats.querySelector('.moba-cs')
  const kdEl = stats.querySelector('.moba-kd')

  // ---- enemy warlord portrait plate + taunt spot ----
  const foePlate = hud.el('div', 'moba-foeplate',
    '<span class="moba-foe-sigil"><i>W</i></span><span class="moba-foe-name">THE WARLORD</span>')
  void foePlate
  let tauntEl = null

  // ---- cinematic letterbox + low-HP vignette ----
  const cineTop = hud.el('div', 'moba-cine moba-cine-top')
  const cineBot = hud.el('div', 'moba-cine moba-cine-bot')
  const lowEl = hud.el('div', 'moba-lowhp')

  // ---- recall channel ----
  const recallEl = hud.el('div', 'moba-recall', '<span>RECALLING</span><div class="moba-recall-track"><div class="moba-recall-fill"></div></div>')
  const recallFill = recallEl.querySelector('.moba-recall-fill')

  // ---- death overlay ----
  const deathEl = hud.el('div', 'moba-death', '<div class="moba-death-title">YOU HAVE FALLEN</div><div class="moba-death-count">6</div><div class="moba-death-sub">RISING AGAIN</div>')
  const deathCount = deathEl.querySelector('.moba-death-count')

  const vgEl = hud.el('div', 'moba-vignette')

  // ---- minimap ----
  // The forged frame is a SIBLING layer behind the canvas, not an ancestor:
  // the canvas repaints every frame, and a clip-path on an ancestor would
  // force a GPU mask over that repainting layer each frame (measured fps hit).
  const mapBox = hud.el('div', 'moba-minimap')
  hud.el('div', 'moba-minimap-frame', '', mapBox)
  const canvas = document.createElement('canvas')
  canvas.width = 420
  canvas.height = 210
  mapBox.appendChild(canvas)
  const mctx = canvas.getContext('2d')

  const hintBox = hud.hints([
    ['R-CLICK', 'Move / attack'], ['Q W E R', 'Skills'], ['B', 'Recall'],
    ['Y', 'Camera lock'], ['WHEEL', 'Zoom'], ['H', 'Toggle help'],
  ])
  hintBox.style.bottom = '156px'

  const px = x => ((x + MAP_W / 2) / MAP_W) * canvas.width
  const py = z => ((z + MAP_H / 2) / MAP_H) * canvas.height

  function drawMinimap() {
    const w = canvas.width, h = canvas.height
    mctx.clearRect(0, 0, w, h)
    // terrain — mud field, churned lane, dark stream
    mctx.fillStyle = '#26211a'
    mctx.fillRect(0, 0, w, h)
    mctx.fillStyle = 'rgba(108,80,54,0.9)'
    mctx.fillRect(px(-56), py(-LANE_HALF), px(56) - px(-56), py(LANE_HALF) - py(-LANE_HALF))
    // river band
    mctx.save()
    mctx.translate(px(0), py(0))
    mctx.rotate(-RIVER_ANGLE)
    const rw = (13 / MAP_W) * w
    mctx.fillStyle = 'rgba(70,104,90,0.85)'
    mctx.fillRect(-rw / 2, -h, rw, h * 2)
    mctx.restore()
    // structures
    for (const s of g.structures.list) {
      const c = s.alive ? TEAMS[s.team].color : '#3a352c'
      mctx.fillStyle = c
      const x = px(s.pos.x), y = py(s.pos.z)
      if (s.kind === 'tower') {
        mctx.fillRect(x - 7, y - 7, 14, 14)
        if (s.alive) { mctx.strokeStyle = 'rgba(0,0,0,0.6)'; mctx.strokeRect(x - 7, y - 7, 14, 14) }
      } else {
        mctx.save()
        mctx.translate(x, y)
        mctx.rotate(Math.PI / 4)
        mctx.fillRect(-9, -9, 18, 18)
        mctx.restore()
      }
    }
    // minions
    for (const e of g.army.active) {
      if (!e.alive) continue
      mctx.fillStyle = TEAMS[e.team].color
      mctx.beginPath()
      mctx.arc(px(e.minion.group.position.x), py(e.minion.group.position.z), 4, 0, Math.PI * 2)
      mctx.fill()
    }
    // decoy
    if (g.decoy) {
      mctx.fillStyle = '#8f86a3'
      mctx.beginPath()
      mctx.arc(px(g.decoy.pos.x), py(g.decoy.pos.z), 6, 0, Math.PI * 2)
      mctx.fill()
    }
    // champions — bright chips with bone border
    const chip = (x, z, color) => {
      mctx.fillStyle = color
      mctx.strokeStyle = '#e8dcc4'
      mctx.lineWidth = 3
      mctx.beginPath()
      mctx.arc(px(x), py(z), 8, 0, Math.PI * 2)
      mctx.fill()
      mctx.stroke()
    }
    if (g.enemy.alive) chip(g.enemy.group.position.x, g.enemy.group.position.z, TEAMS.red.color)
    if (!g.playerDead) chip(g.hero.group.position.x, g.hero.group.position.z, TEAMS.blue.color)
    // border
    mctx.strokeStyle = 'rgba(216,199,160,0.3)'
    mctx.lineWidth = 2
    mctx.strokeRect(1, 1, w - 2, h - 2)
  }

  return {
    hud, abilityUi, hpBar, enBar, hintBox,
    setLevel: n => { lvChip.textContent = String(n) },
    pulseLevel: () => {
      lvChip.classList.remove('moba-lv-pop')
      void lvChip.offsetWidth
      lvChip.classList.add('moba-lv-pop')
    },
    // called every frame — only touch the DOM when the engraving actually changes
    setStats: (gold, cs, k, d) => {
      const g = String(gold), c = String(cs), kd = `${k} / ${d}`
      if (goldEl.textContent !== g) goldEl.textContent = g
      if (csEl.textContent !== c) csEl.textContent = c
      if (kdEl.textContent !== kd) kdEl.textContent = kd
    },
    setClock: sec => {
      const m = Math.floor(sec / 60)
      const s = Math.floor(sec % 60)
      const t = `${m}:${String(s).padStart(2, '0')}`
      if (clockEl.textContent !== t) clockEl.textContent = t
    },
    recall: {
      show: () => { recallEl.classList.add('on') },
      hide: () => { recallEl.classList.remove('on') },
      set: f => { recallFill.style.width = `${Math.min(1, f) * 100}%` },
    },
    death: {
      show: () => deathEl.classList.add('on'),
      hide: () => deathEl.classList.remove('on'),
      set: secs => { deathCount.textContent = String(Math.max(0, Math.ceil(secs))) },
    },
    vignette: () => {
      vgEl.classList.remove('moba-vg-on')
      void vgEl.offsetWidth
      vgEl.classList.add('moba-vg-on')
    },
    drawMinimap,

    // ---- cinematic controls ----
    setCine: on => {
      cineTop.classList.toggle('on', on)
      cineBot.classList.toggle('on', on)
    },
    /** Hide the whole HUD behind the letterbox (intro). NEVER leak the class. */
    cineMode: on => hud.root.classList.toggle('moba-cinemode', on),
    lowHp: on => lowEl.classList.toggle('on', on),

    /** "WAR RIFT" title card. Returns { out }. */
    showTitle: () => {
      const el = hud.el('div', 'moba-title',
        '<div class="moba-title-main">WAR RIFT</div><div class="moba-title-sub">1V1 LANE WARFARE</div>')
      return { out: () => { el.classList.add('out'); setTimeout(() => el.remove(), 450) } }
    },

    /** "RAVAGER vs THE WARLORD" plates. Returns { out }. */
    showVs: pName => {
      const v = hud.el('div', 'moba-vs')
      const plate = (cls, name, title, fc) => {
        const p = hud.el('div', `moba-vs-plate ${cls}`, '', v)
        p.style.setProperty('--fc', fc)
        hud.el('div', 'moba-vs-name', name, p)
        hud.el('div', 'moba-vs-title', title, p)
      }
      plate('moba-vsl', pName, 'CHAMPION OF THE WEST GATE', '#ffb84d')
      hud.el('div', 'moba-vs-mid', 'VS', v)
      plate('moba-vsr', 'THE WARLORD', 'TYRANT OF THE EAST', '#ff5a26')
      return { out: () => { v.classList.add('out'); setTimeout(() => v.remove(), 450) } }
    },

    /** Short warlord taunt plate beside his portrait. */
    taunt: text => {
      tauntEl?.remove()
      const el = tauntEl = hud.el('div', 'moba-taunt', `“${text}”`)
      setTimeout(() => el.classList.add('out'), 2400)
      setTimeout(() => { el.remove(); if (tauntEl === el) tauntEl = null }, 2850)
    },
  }
}

/** End-of-war tally: a parchment-and-iron ledger under VICTORY/DEFEAT. */
export function endPanel(hud, ctx, stats) {
  const panel = hud.el('div', 'moba-end ui-interactive')
  hud.el('div', `moba-end-title${stats.won ? '' : ' lose'}`,
    stats.won ? 'THE RIFT STANDS CONQUERED' : 'THE RIFT LIES IN ASHES', panel)
  const grid = hud.el('div', 'moba-end-grid', '', panel)
  const stat = (label, val, cls = '', sigil = null) => {
    const cell = hud.el('div', `moba-end-stat ${cls}`, '', grid)
    if (sigil) hud.el('i', 'moba-end-sigil', icon(sigil, { size: '1em' }), cell)
    hud.el('span', '', label, cell)
    hud.el('b', '', String(val), cell)
  }
  stat('K / D', `${stats.kills} / ${stats.deaths}`, '', 'skull')
  stat('CS', stats.cs, '', 'crossed-swords')
  stat('GOLD', stats.gold, '', 'coin')
  stat('TOWERS', stats.towers, '', 'gate')
  stat('DAMAGE DEALT', stats.dmg, '', 'flame')
  stat('FAVORITE ART', stats.fav, 'fav', 'laurel')
  const btn = document.createElement('button')
  btn.textContent = 'RETURN TO HUB'
  btn.onclick = () => { ctx.audio.play('click'); ctx.goTo('hub') }
  panel.appendChild(btn)
  hud.el('div', 'moba-end-auto', 'returning to the halls shortly…', panel)
  return panel
}
