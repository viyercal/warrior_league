import { WASD_KEY_LABELS } from '../../meta/skills.js'
import { clamp } from '../../core/utils.js'

const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH']
export const ordinal = p => ORD[p - 1] || `${p}TH`

export function fmtTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/**
 * All DOM HUD for WAR CHARIOTS (parchment + bronze): position, lap/clock,
 * boost + damage bars, speed, minimap, drift flash, popups, wrong-way,
 * speedlines, finish panel.
 */
export function buildKartHud(hud, { skillDefs, minimapPts }) {
  const ability = hud.abilityBar(skillDefs, { game: 'kart', keys: WASD_KEY_LABELS })

  const posEl = hud.el('div', 'kart-pos', '<b>6</b><span>/6</span>')
  const posNum = posEl.querySelector('b')
  const posTotal = posEl.querySelector('span')
  const topEl = hud.el('div', 'kart-top', '<div class="kart-lap">LAP 1/3</div><div class="kart-clock">0:00.0</div>')
  const lapEl = topEl.querySelector('.kart-lap')
  const clockEl = topEl.querySelector('.kart-clock')

  // bottom-left cluster: boost + damage + speed
  const cluster = hud.el('div', 'kart-cluster')
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
    popup(text, good) {
      const el = document.createElement('div')
      el.className = `kart-popup ${good ? 'up' : 'down'}`
      el.textContent = text
      popupWrap.appendChild(el)
      setTimeout(() => el.remove(), 1600)
    },
    posChanged(p) {
      if (p !== lastPos) {
        this.popup(p < lastPos ? `${ordinal(p)}!` : `${ordinal(p)}`, p < lastPos)
        lastPos = p
      }
    },
    wrongWay(on) { wrongEl.classList.toggle('on', on) },
    speedLines(on) { speedlines.classList.toggle('on', on) },
    drawMap(karts) {
      mctx.clearRect(0, 0, 172, 172)
      mctx.drawImage(base, 0, 0)
      for (let i = karts.length - 1; i >= 0; i--) {
        const k = karts[i]
        const [px, py] = mapPt(k.group.position.x, k.group.position.z)
        mctx.beginPath()
        mctx.arc(px, py, k.isPlayer ? 5.5 : 4, 0, Math.PI * 2)
        mctx.fillStyle = k.isPlayer ? '#ffffff' : k.mapColor
        mctx.shadowColor = k.isPlayer ? '#fff' : k.mapColor
        mctx.shadowBlur = k.isPlayer ? 8 : 4
        mctx.fill()
      }
      mctx.shadowBlur = 0
    },
    finishPanel(rows, { playerPos, onHub, onRetry }) {
      const panel = hud.el('div', 'kart-finish ui-interactive')
      hud.el('div', 'kart-finish-title', 'FINAL STANDINGS', panel)
      const list = hud.el('div', 'kart-finish-list', '', panel)
      rows.forEach((r, i) => {
        hud.el('div', `kart-finish-row${r.isPlayer ? ' you' : ''}${i === 0 ? ' first' : ''}`,
          `<b>${ordinal(i + 1)}</b><span class="kn" style="--kc:${r.color}">${r.name}</span><span class="kt">${r.time}</span>`, list)
      })
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
