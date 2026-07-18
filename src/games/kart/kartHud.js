import { WASD_KEY_LABELS } from '../../meta/skills.js'
import { icon } from '../../ui/craft.js'
import { clamp } from '../../core/utils.js'

const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH']
export const ordinal = p => ORD[p - 1] || `${p}TH`

/** Engraved place numerals for the standings ledger. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

/** Per-stat sigil glyphs on the results ledger (svg only — no text). */
const STAT_SIGILS = {
  'BEST LAP': 'hourglass',
  'TOP SPEED': 'overdrive',
  'DRIFT BOOSTS': 'flame',
  'SHELLS LANDED': 'comet',
  'FAVORITE ART': 'crossed-swords',
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/**
 * All DOM HUD for WAR CHARIOTS (parchment + bronze): position, lap/clock,
 * boost + damage bars, speed, minimap, drift flash, popups, wrong-way,
 * speedlines, rival plate, cinematic letterbox, impact flash, finish panel.
 */
export function buildKartHud(hud, { skillDefs, minimapPts, audio = null }) {
  const ability = hud.abilityBar(skillDefs, { game: 'kart', keys: WASD_KEY_LABELS })

  // position medallion: engraved bronze disc ringed by a laurel
  const posEl = hud.el('div', 'kart-pos',
    `<span class="kp-ring">${icon('laurel', { size: 88 })}</span>` +
    '<span class="kp-num"><b>6</b><span class="kp-of">/6</span></span>')
  const posNum = posEl.querySelector('b')
  const posTotal = posEl.querySelector('.kp-of')
  const rivalEl = hud.el('div', 'kart-rival')
  const topEl = hud.el('div', 'kart-top', '<div class="kart-lap">LAP 1/3</div><div class="kart-clock">0:00.0</div>')
  const lapEl = topEl.querySelector('.kart-lap')
  const clockEl = topEl.querySelector('.kart-clock')

  // cinematic letterbox + chrome that fades out during the intro flyover
  const cineTop = hud.el('div', 'kart-cine kart-cine-top')
  const cineBot = hud.el('div', 'kart-cine kart-cine-bot')
  const impactEl = hud.el('div', 'kart-impact')
  const chrome = [posEl, rivalEl, topEl, ability.root]

  // bottom-left cluster: boost + damage + speed
  const cluster = hud.el('div', 'kart-cluster')
  chrome.push(cluster)
  const boostWrap = hud.el('div', 'kart-boost', '<span>BOOST</span><div class="kart-boost-track"><div class="kart-boost-fill"></div></div>', cluster)
  const boostFill = boostWrap.querySelector('.kart-boost-fill')
  const dmgWrap = hud.el('div', 'kart-dmg', '<span>DMG</span><div class="kart-dmg-track"><div class="kart-dmg-fill"></div></div>', cluster)
  const dmgFill = dmgWrap.querySelector('.kart-dmg-fill')
  const speedEl = hud.el('div', 'kart-speed', '0<i>km/h</i>', cluster)

  const driftEl = hud.el('div', 'kart-drift')
  const popupWrap = hud.el('div', 'kart-popups')
  const wrongEl = hud.el('div', 'kart-wrongway', 'TURN AROUND!')
  const speedlines = hud.el('div', 'kart-speedlines')

  // ---------- minimap ----------
  const mapBox = hud.el('div', 'kart-minimap')
  chrome.push(mapBox)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 172
  mapBox.appendChild(canvas)
  const mctx = canvas.getContext('2d')
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const [x, z] of minimapPts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
  }
  const pad = 14
  const sc = Math.min((172 - pad * 2) / (maxX - minX), (172 - pad * 2) / (maxZ - minZ))
  const mapPt = (x, z) => [
    pad + (x - minX) * sc + (172 - pad * 2 - (maxX - minX) * sc) / 2,
    pad + (z - minZ) * sc + (172 - pad * 2 - (maxZ - minZ) * sc) / 2,
  ]
  // cache track outline
  const base = document.createElement('canvas')
  base.width = base.height = 172
  const bctx = base.getContext('2d')
  bctx.strokeStyle = 'rgba(255, 205, 150, 0.9)'
  bctx.lineWidth = 5
  bctx.lineJoin = 'round'
  bctx.shadowColor = 'rgba(255,150,80,0.8)'
  bctx.shadowBlur = 6
  bctx.beginPath()
  minimapPts.forEach(([x, z], i) => {
    const [px, py] = mapPt(x, z)
    i === 0 ? bctx.moveTo(px, py) : bctx.lineTo(px, py)
  })
  bctx.closePath()
  bctx.stroke()
  // start/finish notch
  const [sx, sy] = mapPt(minimapPts[0][0], minimapPts[0][1])
  bctx.fillStyle = '#fff'
  bctx.fillRect(sx - 3, sy - 3, 6, 6)

  let lastPos = 6
  let pendPos = 6
  let pendSince = 0
  let shownPos = -1
  let shownSpeed = -1
  return {
    ability,
    setPos(p, total) {
      if (p === shownPos) return
      shownPos = p
      posNum.textContent = String(p)
      posTotal.textContent = `/${total}`
      posEl.classList.toggle('kart-pos-lead', p === 1)
    },
    setLap(l, total) { lapEl.textContent = `LAP ${clamp(l, 1, total)}/${total}` },
    setClock(sec) { clockEl.textContent = fmtTime(Math.max(0, sec)) },
    setSpeed(v) {
      const s = Math.round(Math.abs(v) * 4.4)
      if (s === shownSpeed) return
      shownSpeed = s
      speedEl.innerHTML = `${s}<i>km/h</i>`
    },
    setBoost(frac) { boostFill.style.width = `${clamp(frac, 0, 1) * 100}%` },
    setDamage(frac) {
      dmgFill.style.width = `${clamp(frac, 0, 1) * 100}%`
      dmgWrap.classList.toggle('hot', frac > 0.66)
    },
    driftFlash(text, cls) {
      driftEl.textContent = text
      driftEl.className = `kart-drift on ${cls || ''}`
      void driftEl.offsetWidth
      clearTimeout(driftEl._t)
      driftEl._t = setTimeout(() => driftEl.classList.remove('on'), 1000)
    },
    popup(text, cls, sigil = null) {
      const el = document.createElement('div')
      el.className = `kart-popup ${cls || ''}`
      el.textContent = text
      if (sigil) el.insertAdjacentHTML('beforeend', `<i class="kp-sig">${icon(sigil, { size: '0.8em' })}</i>`)
      popupWrap.appendChild(el)
      setTimeout(() => el.remove(), 1700)
    },
    posChanged(p) {
      // hysteresis: a position must hold ~0.3s before it announces (no
      // popup/sting flapping while trading paint side-by-side)
      const now = performance.now()
      if (p === lastPos) { pendPos = p; return }
      if (p !== pendPos) { pendPos = p; pendSince = now; return }
      if (now - pendSince < 300) return
      const up = p < lastPos
      this.popup(`P${p}`, up ? 'up' : 'down', up ? 'arrow-up' : 'arrow-down')
      audio?.play(up ? 'swish' : 'back', { vol: up ? 0.45 : 0.4 })
      lastPos = p
    },
    setRival(name) {
      rivalEl.classList.toggle('on', !!name)
      if (name) rivalEl.innerHTML = `<i>${icon('crossed-swords', { size: 13 })}</i>RIVAL · ${name}`
    },
    /** Fade the gameplay chrome (intro flyover / podium ceremony). */
    hideChrome(on) {
      for (const el of chrome) el.classList.toggle('kart-chrome-hide', on)
    },
    /** Cinematic letterbox + chrome fade for the intro flyover. */
    setCine(on) {
      cineTop.classList.toggle('on', on)
      cineBot.classList.toggle('on', on)
      this.hideChrome(on)
    },
    registerChrome(el) { chrome.push(el) },
    /** Crimson wreck-cam vignette flash. */
    impactFlash() {
      impactEl.classList.remove('on')
      void impactEl.offsetWidth
      impactEl.classList.add('on')
    },
    wrongWay(on) { wrongEl.classList.toggle('on', on) },
    speedLines(on) { speedlines.classList.toggle('on', on) },
    drawMap(karts, rival = null) {
      mctx.clearRect(0, 0, 172, 172)
      mctx.drawImage(base, 0, 0)
      for (let i = karts.length - 1; i >= 0; i--) {
        const k = karts[i]
        const [px, py] = mapPt(k.group.position.x, k.group.position.z)
        if (k === rival) { // crimson rival halo
          mctx.beginPath()
          mctx.arc(px, py, 7.5, 0, Math.PI * 2)
          mctx.strokeStyle = '#c23b2e'
          mctx.lineWidth = 2
          mctx.shadowColor = '#c23b2e'
          mctx.shadowBlur = 6
          mctx.stroke()
        }
        mctx.beginPath()
        mctx.arc(px, py, k.isPlayer ? 5.5 : 4, 0, Math.PI * 2)
        mctx.fillStyle = k.isPlayer ? '#ffffff' : k.mapColor
        mctx.shadowColor = k.isPlayer ? '#fff' : k.mapColor
        mctx.shadowBlur = k.isPlayer ? 8 : 4
        mctx.fill()
      }
      mctx.shadowBlur = 0
    },
    finishPanel(rows, { playerPos, onHub, onRetry, stats = null, side = false }) {
      const panel = hud.el('div', `kart-finish ui-interactive${side ? ' kart-finish-side' : ''}`)
      const wheel = `<i class="kft-sig">${icon('chariot-wheel', { size: 18 })}</i>`
      hud.el('div', 'kart-finish-title', `${wheel}FINAL STANDINGS${wheel}`, panel)
      const list = hud.el('div', 'kart-finish-list', '', panel)
      rows.forEach((r, i) => {
        hud.el('div', `kart-finish-row${r.isPlayer ? ' you' : ''}${i === 0 ? ' first' : ''}`,
          `<span class="kf-place"><i class="kf-rn">${ROMAN[i] || i + 1}</i><b>${ordinal(i + 1)}</b></span>` +
          `<span class="kn" style="--kc:${r.color}">${r.name}</span><span class="kt">${r.time}</span>`, list)
      })
      if (stats) {
        const grid = hud.el('div', 'kart-finish-stats', '', panel)
        for (const [label, value] of stats) {
          const sig = STAT_SIGILS[label] ? `<i class="ks-sig">${icon(STAT_SIGILS[label], { size: 12 })}</i>` : ''
          hud.el('div', 'kart-stat', `<span>${sig}${label}</span><b>${value}</b>`, grid)
        }
      }
      const btns = hud.el('div', 'kart-finish-btns', '', panel)
      const hubBtn = document.createElement('button')
      hubBtn.textContent = 'RETURN TO HUB'
      hubBtn.onclick = onHub
      const retry = document.createElement('button')
      retry.className = 'ghost'
      retry.textContent = 'RACE AGAIN (R)'
      retry.onclick = onRetry
      btns.append(hubBtn, retry)
      return panel
    },
  }
}
