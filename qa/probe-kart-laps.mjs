// Kart lap-logic probe: real lap increments across the line, FINAL LAP banner,
// and the REAL (non-debug) finish -> victory flow by crossing the line in P1.
// node qa/probe-kart-laps.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5186'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
const results = []
const check = (name, ok, detail = '') => {
  results.push([name, ok, detail])
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

await page.goto(`http://localhost:${port}/?scene=kart&mute=1`, { waitUntil: 'load' })
// boot -> intro flyover (any key skips) -> countdown -> race
await page.waitForFunction(() => window.__scene?.state === 'intro', null, { timeout: 15000 })
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.state === 'race', null, { timeout: 12000 })
await page.waitForTimeout(300)

// warp the player to just before the line, driving forward on the centerline
const warp = lapFrac => page.evaluate(f => {
  const s = window.__scene
  const p = s.player
  const frac = ((f % 1) + 1) % 1
  const idx = Math.floor(frac * s.track.N) % s.track.N
  const c = s.track.pos[idx], tn = s.track.tan[idx]
  p.group.position.set(c.x, 0, c.z)
  p.heading = Math.atan2(tn.x, tn.z)
  p.idx = idx
  p.lastS = idx / s.track.N
  p.sCont = f
  p.kv.set(0, 0, 0)
  p.speed = 24
}, lapFrac)

await page.keyboard.down('w')

// lap 1 -> 2
await warp(0.985)
await page.waitForTimeout(1400)
const lap2 = await page.evaluate(() => ({
  sCont: window.__scene.player.sCont,
  hud: document.querySelector('.kart-lap')?.textContent,
}))
check('crossing line increments to LAP 2', lap2.sCont > 1 && lap2.hud === 'LAP 2/3', JSON.stringify(lap2))

// lap 2 -> 3 shows FINAL LAP banner
await warp(1.985)
await page.waitForTimeout(1400)
const lap3 = await page.evaluate(() => ({
  sCont: window.__scene.player.sCont,
  hud: document.querySelector('.kart-lap')?.textContent,
  banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent).join('|'),
}))
check('FINAL LAP banner on lap 3', lap3.sCont > 2 && lap3.hud === 'LAP 3/3' && lap3.banner.includes('FINAL LAP'), JSON.stringify(lap3))

// backwards across the line must NOT increment the lap
const backOk = await page.evaluate(() => {
  const s = window.__scene
  return s.player.sCont < 2.2 // still early in lap 3 after the warp
})
await page.keyboard.up('w')
await page.evaluate(() => {
  const s = window.__scene
  const p = s.player
  const tn = s.track.tan[p.idx]
  p.heading = Math.atan2(-tn.x, -tn.z) // face backwards
  p.speed = 0
})
await page.keyboard.down('w')
await page.waitForTimeout(2500) // drive backwards across the line
const backLap = await page.evaluate(() => ({
  sCont: window.__scene.player.sCont,
  hud: document.querySelector('.kart-lap')?.textContent,
}))
check('reversing across line rolls progress BACK (no lap cheat)', backOk && backLap.sCont < 2.02, JSON.stringify(backLap))

// re-face forward, warp to the very end in P1 and cross for a REAL victory
await page.evaluate(() => {
  const s = window.__scene
  const p = s.player
  const tn = s.track.tan[p.idx]
  p.heading = Math.atan2(tn.x, tn.z)
})
const before = await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem('ipl-profile-v2'))
  return p.stats.wins.kart || 0
})
await warp(2.985)
await page.waitForTimeout(1600)
const fin = await page.evaluate(() => ({
  finished: window.__scene.player.finished,
  order: window.__scene.player.finishOrder,
  over: window.__scene.over,
  banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent).join('|'),
}))
check('real line-crossing finish in P1 = victory', fin.finished && fin.order === 1 && fin.over === 'won' && fin.banner.includes('VICTORY!'), JSON.stringify(fin))
const after = await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem('ipl-profile-v2'))
  return p.stats.wins.kart || 0
})
check('real win saved to stats', after === before + 1, `${before} -> ${after}`)
await page.waitForTimeout(1300)
await page.screenshot({ path: 'qa/screens/kart-real-win.png' })

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none')
const fails = results.filter(r => !r[1]).length
console.log(`SUMMARY: ${results.length - fails}/${results.length} passed`)
await browser.close()
process.exit(fails || errors.length ? 1 : 0)
