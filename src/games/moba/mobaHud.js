import { HUD } from '../../ui/hud.js'
import { TEAMS, RIVER_ANGLE, LANE_HALF } from './constants.js'

const MAP_W = 116, MAP_H = 52 // world span the minimap covers

/** Builds all RIFT LEGENDS DOM HUD. Returns handles the scene drives each frame. */
export function buildMobaHud(g) {
  const hud = new HUD()
  const abilityUi = hud.abilityBar(g.skillDefs, { game: 'moba' })

  // ---- bottom-left: level chip + HP / energy ----
  const lvChip = hud.el('div', 'moba-level', '1')
  const hpBar = hud.bar({ label: 'HP', color: '#5cff8a' })
  Object.assign(hpBar.root.style, { left: '84px', bottom: '64px', width: '300px' })
  const enBar = hud.bar({ label: 'ENERGY', color: '#54a8ff' })
  Object.assign(enBar.root.style, { left: '84px', bottom: '18px', width: '300px' })

  // ---- top-center clock / top-right stats ----
  const clockEl = hud.el('div', 'moba-clock', '0:00')
  const stats = hud.el('div', 'moba-stats ui-panel',
    '<div class="moba-stat"><span>GOLD</span><b class="moba-gold">0</b></div>' +
    '<div class="moba-stat"><span>CS</span><b class="moba-cs">0</b></div>' +
    '<div class="moba-stat"><span>K / D</span><b class="moba-kd">0 / 0</b></div>')
  const goldEl = stats.querySelector('.moba-gold')
  const csEl = stats.querySelector('.moba-cs')
  const kdEl = stats.querySelector('.moba-kd')

  // ---- recall channel ----
  const recallEl = hud.el('div', 'moba-recall', '<span>RECALLING</span><div class="moba-recall-track"><div class="moba-recall-fill"></div></div>')
  const recallFill = recallEl.querySelector('.moba-recall-fill')

  // ---- death overlay ----
  const deathEl = hud.el('div', 'moba-death', '<div class="moba-death-title">YOU DIED</div><div class="moba-death-count">6</div><div class="moba-death-sub">RESPAWNING</div>')
  const deathCount = deathEl.querySelector('.moba-death-count')

  const vgEl = hud.el('div', 'moba-vignette')

  // ---- minimap ----
  const mapBox = hud.el('div', 'moba-minimap')
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
    // terrain
    mctx.fillStyle = '#173722'
    mctx.fillRect(0, 0, w, h)
    mctx.fillStyle = 'rgba(140,106,70,0.85)'
    mctx.fillRect(px(-56), py(-LANE_HALF), px(56) - px(-56), py(LANE_HALF) - py(-LANE_HALF))
    // river band
    mctx.save()
    mctx.translate(px(0), py(0))
    mctx.rotate(-RIVER_ANGLE)
    const rw = (13 / MAP_W) * w
    mctx.fillStyle = 'rgba(60,190,220,0.8)'
    mctx.fillRect(-rw / 2, -h, rw, h * 2)
    mctx.restore()
    // structures
    for (const s of g.structures.list) {
      const c = s.alive ? TEAMS[s.team].color : '#2a2f3c'
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
      mctx.fillStyle = '#c58fff'
      mctx.beginPath()
      mctx.arc(px(g.decoy.pos.x), py(g.decoy.pos.z), 6, 0, Math.PI * 2)
      mctx.fill()
    }
    // champions — bright chips with white border
    const chip = (x, z, color) => {
      mctx.fillStyle = color
      mctx.strokeStyle = '#ffffff'
      mctx.lineWidth = 3
      mctx.beginPath()
      mctx.arc(px(x), py(z), 8, 0, Math.PI * 2)
      mctx.fill()
      mctx.stroke()
    }
    if (g.enemy.alive) chip(g.enemy.group.position.x, g.enemy.group.position.z, TEAMS.red.color)
    if (!g.playerDead) chip(g.hero.group.position.x, g.hero.group.position.z, TEAMS.blue.color)
    // border
    mctx.strokeStyle = 'rgba(255,255,255,0.25)'
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
    setStats: (gold, cs, k, d) => {
      goldEl.textContent = String(gold)
      csEl.textContent = String(cs)
      kdEl.textContent = `${k} / ${d}`
    },
    setClock: sec => {
      const m = Math.floor(sec / 60)
      const s = Math.floor(sec % 60)
      clockEl.textContent = `${m}:${String(s).padStart(2, '0')}`
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
  }
}

/** End-of-game panel with a RETURN TO HUB button. */
export function endPanel(hud, ctx) {
  const panel = hud.el('div', 'moba-end ui-interactive')
  const btn = document.createElement('button')
  btn.textContent = 'RETURN TO HUB'
  btn.onclick = () => { ctx.audio.play('click'); ctx.goTo('hub') }
  panel.appendChild(btn)
  return panel
}
