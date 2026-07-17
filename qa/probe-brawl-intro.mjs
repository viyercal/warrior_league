// Brawl probe: polish-pass presentation — entrance cinematic (letterbox,
// frozen state, name plates, any-key skip, <=4.5s), per-KO slow-mo + plaque
// crack, SHOWDOWN trigger + tightened framing, final-KO letterbox/orbit and
// the podium results tablet with per-fighter stats.
import { chromium } from 'playwright-core'

const URL = `http://localhost:${process.env.IPL_PORT || '5187'}/?scene=brawl&mute=1`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

const results = []
const check = (name, ok, detail) => {
  results.push(`${name}: ${ok ? 'OK' : 'FAIL'} ${detail}`)
  console.log(results[results.length - 1])
}

// ---------- 1. natural intro: letterbox, hidden fighters, plates, duration ----------
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => window.__scene?.phase === 'intro', null, { timeout: 15000 })
const t0 = Date.now()
const early = await page.evaluate(() => ({
  cine: !!document.querySelector('.brawl-cine.on'),
  playerHidden: !window.__scene.player.root.visible,
}))
check('INTRO CINE', early.cine && early.playerHidden, `letterbox=${early.cine} playerHidden=${early.playerHidden}`)

await page.waitForTimeout(1000)
const mid = await page.evaluate(() => ({
  plates: document.querySelectorAll('.brawl-plate').length,
  frozen: window.__scene.baseFighters.every(f => f.dmg === 0 && f.stocks === 3),
  phase: window.__scene.phase,
}))
check('INTRO PLATES + FROZEN', mid.plates >= 1 && mid.frozen && mid.phase === 'intro',
  `plates=${mid.plates} frozen=${mid.frozen} phase=${mid.phase}`)
await page.screenshot({ path: 'qa/screens/brawl-intro-leap.png' })

await page.waitForFunction(() => window.__scene.phase !== 'intro', null, { timeout: 8000 })
const introMs = Date.now() - t0
check('INTRO DURATION', introMs < 5000, `${introMs}ms from first observation (cap 4.5s + margin)`)
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 15000 })
check('INTRO -> COUNTDOWN -> FIGHT', true, 'reached fight phase')

// ---------- 2. skip: any key ends the cinematic immediately ----------
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => window.__scene?.phase === 'intro', null, { timeout: 15000 })
await page.keyboard.press('x')
await page.waitForTimeout(300)
const skip = await page.evaluate(() => ({
  phase: window.__scene.phase,
  cine: !!document.querySelector('.brawl-cine.on'),
  placed: window.__scene.baseFighters.every(f => f.root.visible && Math.abs(f.pos.x - f.spawnX) < 0.01 && f.pos.y === 0),
}))
check('INTRO SKIP', skip.phase !== 'intro' && !skip.cine && skip.placed,
  `phase=${skip.phase} letterboxOff=${!skip.cine} fightersPlaced=${skip.placed}`)
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 15000 })

// ---------- 3. per-KO slow-mo + camera punch + plaque crack (non-final KO) ----------
await page.evaluate(() => {
  const s = window.__scene
  for (const ai of s.ais) {
    Object.assign(ai.intent, { move: 0, jump: false, fastFall: false, drop: false, jab: false, smash: false, dodge: 0 })
    ai.update = () => ai.intent
  }
  const e = s.baseFighters[1]
  e.dmg = 150
  e.iFrames = 0
  e.invulnT = 0
  e.pos.set(11, 0, 0)
  e.vel.set(0, 0)
  s.player.pos.set(9.2, 0, 0)
  s.player.vel.set(0, 0)
  s.player.facing = 1
})
await page.keyboard.press('k')
const koDrama = await page.evaluate(() => new Promise(res => {
  const s = window.__scene
  let minTs = 1
  let maxPunch = 0
  const t0 = performance.now()
  const poll = () => {
    minTs = Math.min(minTs, s.timeScale)
    maxPunch = Math.max(maxPunch, s.punch)
    if (performance.now() - t0 > 2600) return res({ minTs, maxPunch, over: s.over, stocks: s.baseFighters[1].stocks })
    requestAnimationFrame(poll)
  }
  poll()
}))
check('KO SLOW-MO + PUNCH', koDrama.minTs < 0.5 && koDrama.maxPunch > 0.3 && koDrama.over === null && koDrama.stocks === 2,
  `minTimeScale=${koDrama.minTs.toFixed(2)} punch=${koDrama.maxPunch.toFixed(2)} over=${koDrama.over} stocks=${koDrama.stocks}`)
const crack = await page.evaluate(() =>
  document.querySelectorAll('.brawl-chips .brawl-chip')[1]?.className || '')
check('PLAQUE CRACK', /brawl-crack1/.test(crack), `chip class="${crack}"`)

// ---------- 4. showdown: exactly 2 warriors left ----------
// wait out the respawn so the blast-zone teleport actually registers
await page.waitForFunction(() => window.__scene.baseFighters[1].state === 'fight', null, { timeout: 10000 })
await page.evaluate(() => {
  const f = window.__scene.baseFighters[1]
  f.stocks = 1
  f.pos.set(0, -20, 0) // beyond the bottom blast zone -> elimination
})
await page.waitForTimeout(1500)
const sd = await page.evaluate(() => ({
  showdown: window.__scene._showdown,
  maxDist: window.__scene._maxDist,
  banner: [...document.querySelectorAll('.banner-main')].map(e => e.textContent).join('|'),
}))
check('SHOWDOWN', sd.showdown && sd.maxDist < 34 && sd.banner.includes('SHOWDOWN!'),
  `showdown=${sd.showdown} maxDist=${sd.maxDist} banner="${sd.banner}"`)
await page.screenshot({ path: 'qa/screens/brawl-intro-showdown.png' })

// ---------- 5. final KO: letterbox + orbit during slow-mo, then podium results ----------
await page.waitForTimeout(1200) // let the showdown zoom settle
await page.evaluate(() => {
  const f = window.__scene.baseFighters[2]
  f.stocks = 1
  f.pos.set(0, -20, 0)
})
await page.waitForTimeout(450)
const fin = await page.evaluate(() => ({
  over: window.__scene.over,
  cine: !!document.querySelector('.brawl-cine.on'),
  orbitTarget: window.__scene.orbitTarget,
}))
check('FINAL-KO CINEMATIC', fin.over === 'won' && fin.cine && Math.abs(fin.orbitTarget) > 0.3,
  `over=${fin.over} letterbox=${fin.cine} orbitTarget=${fin.orbitTarget}`)
await page.waitForTimeout(1300)
const res = await page.evaluate(() => ({
  rows: document.querySelectorAll('.brawl-results-row').length,
  cols: document.querySelectorAll('.brawl-results-head span').length,
  winner: !!document.querySelector('.brawl-results-winner'),
  cineOff: !document.querySelector('.brawl-cine.on'),
  btn: !!document.querySelector('.brawl-hub-btn'),
  firstRow: document.querySelector('.brawl-results-row:not(.brawl-results-head)')?.textContent || '',
}))
check('RESULTS PANEL', res.rows === 4 && res.cols === 6 && res.winner && res.cineOff && res.btn,
  `rows=${res.rows} cols=${res.cols} winnerGlow=${res.winner} letterboxOff=${res.cineOff} first="${res.firstRow}"`)
await page.screenshot({ path: 'qa/screens/brawl-intro-results.png' })

console.log('---')
console.log(`PASS ${results.filter(r => r.includes(': OK')).length}/${results.length}`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
