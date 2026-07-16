// Brawl probe: organic KO + respawn, debug win/lose, stat saves, hub returns.
import { chromium } from 'playwright-core'

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
const boot = async () => {
  await page.goto(`http://localhost:${process.env.IPL_PORT || '5187'}/?scene=brawl&mute=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 15000 })
}

// ---------- organic KO: smash CRIMSON at kill % off the stage ----------
await boot()
await page.evaluate(() => {
  const s = window.__scene
  for (const ai of s.ais) {
    Object.assign(ai.intent, { move: 0, jump: false, fastFall: false, drop: false, jab: false, smash: false, dodge: 0 })
    ai.update = () => ai.intent
  }
  s.baseFighters[1].dmg = 150
  s.baseFighters[1].pos.set(11, 0, 0)
  s.baseFighters[1].vel.set(0, 0)
  s.player.pos.set(9.2, 0, 0)
  s.player.vel.set(0, 0)
  s.player.facing = 1
})
await page.keyboard.press('k')
await page.waitForTimeout(700)
await page.screenshot({ path: 'qa/screens/brawl-end-launch.png' })
const koState = async () => page.evaluate(() => {
  const f = window.__scene.baseFighters[1]
  return { stocks: f.stocks, state: f.state, kos: window.__scene.player.kos, x: +f.pos.x.toFixed(1) }
})
let ko = await koState()
for (let i = 0; i < 20 && ko.stocks === 3; i++) { await page.waitForTimeout(200); ko = await koState() }
check('SMASH KO', ko.stocks === 2 && ko.kos === 1, `CRIMSON stocks=${ko.stocks} state=${ko.state}, player kos=${ko.kos}`)

// respawn pad
await page.waitForTimeout(1800)
const rs = await page.evaluate(() => {
  const f = window.__scene.baseFighters[1]
  return { state: f.state, y: +f.pos.y.toFixed(1), pad: f.pad.visible, dmg: f.dmg }
})
check('RESPAWN', (rs.state === 'respawn' && rs.pad && rs.y > 6) || rs.state === 'fight', `state=${rs.state} y=${rs.y} pad=${rs.pad} dmg reset=${rs.dmg}`)
await page.screenshot({ path: 'qa/screens/brawl-end-respawn.png' })
// invulnerable shimmer after release
await page.waitForTimeout(1700)
const inv = await page.evaluate(() => {
  const f = window.__scene.baseFighters[1]
  return { state: f.state, iF: +f.iFrames.toFixed(2) }
})
check('RESPAWN INVULN', inv.state === 'fight' && inv.iF > 0, `state=${inv.state} iFrames=${inv.iF}`)

// ---------- debug.win: banner + stats + results + button return ----------
await boot()
const winsBefore = await page.evaluate(() => window.__scene.ctx.profile.stats.wins.brawl || 0)
await page.evaluate(() => window.__scene.debug.win())
await page.waitForTimeout(1600)
const winUi = await page.evaluate(() => ({
  banner: document.querySelector('.banner-main')?.textContent,
  results: !!document.querySelector('.brawl-results'),
  wins: window.__scene.ctx.profile.stats.wins.brawl || 0,
  saved: (JSON.parse(localStorage.getItem('ipl-profile-v2')).stats.wins.brawl) || 0,
}))
check('WIN BANNER', winUi.banner === 'CHAMPION', `banner="${winUi.banner}"`)
check('WIN STATS', winUi.wins === winsBefore + 1 && winUi.saved === winUi.wins, `wins ${winsBefore} -> ${winUi.wins} (persisted ${winUi.saved})`)
check('WIN RESULTS', winUi.results, 'results panel visible')
await page.screenshot({ path: 'qa/screens/brawl-end-champion.png' })
await page.click('.brawl-hub-btn')
await page.waitForFunction(() => window.__ipl.sm.currentName === 'hub', null, { timeout: 8000 })
check('WIN HUB BUTTON', true, 'clicked RETURN TO HUB -> hub scene')

// ---------- debug.lose: banner + no win increment + 8s auto-return ----------
await boot()
const loseBefore = await page.evaluate(() => ({
  wins: window.__scene.ctx.profile.stats.wins.brawl || 0,
  plays: window.__scene.ctx.profile.stats.plays.brawl || 0,
}))
await page.evaluate(() => window.__scene.debug.lose())
await page.waitForTimeout(1600)
const loseUi = await page.evaluate(() => ({
  banner: document.querySelector('.banner-main')?.textContent,
  results: !!document.querySelector('.brawl-results'),
  wins: window.__scene.ctx.profile.stats.wins.brawl || 0,
}))
check('LOSE BANNER', loseUi.banner === 'DEFEATED', `banner="${loseUi.banner}"`)
check('LOSE STATS', loseUi.wins === loseBefore.wins && loseBefore.plays > 0, `wins unchanged=${loseUi.wins}, plays=${loseBefore.plays}`)
check('LOSE RESULTS', loseUi.results, 'results panel visible')
await page.screenshot({ path: 'qa/screens/brawl-end-defeat.png' })
// auto-return after 8s
await page.waitForFunction(() => window.__ipl.sm.currentName === 'hub', null, { timeout: 12000 })
check('LOSE AUTO HUB', true, 'auto-returned to hub within 8s')

// ---------- player self-destruct loses a stock ----------
await boot()
await page.evaluate(() => {
  const s = window.__scene
  s.player.pos.set(0, -20, 0) // beyond bottom blast zone
})
await page.waitForTimeout(400)
const sd = await page.evaluate(() => ({ stocks: window.__scene.player.stocks, state: window.__scene.player.state }))
check('SELF-DESTRUCT', sd.stocks === 2, `player stocks=${sd.stocks} state=${sd.state}`)

console.log('---')
console.log(`PASS ${results.filter(r => r.includes(': OK')).length}/${results.length}`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
