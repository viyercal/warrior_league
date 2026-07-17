// Brawl visual-capture probe: DPR2 screenshots of the polish-pass moments —
// entrance beats, SHOWDOWN framing, final-KO cinematic, results tablet.
import { chromium } from 'playwright-core'

const URL = `http://localhost:${process.env.IPL_PORT || '5187'}/?scene=brawl&mute=1`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

// ---------- intro beats ----------
await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction(() => window.__scene?.phase === 'intro', null, { timeout: 15000 })
for (const [name, ms] of [['beat1', 850], ['beat2', 1250], ['beat3', 1250], ['pull', 800]]) {
  await page.waitForTimeout(ms)
  await page.screenshot({ path: `qa/screens/polish-intro-${name}.png` })
}
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 15000 })
await page.screenshot({ path: 'qa/screens/polish-intro-fight.png' })

// ---------- showdown + final KO + results ----------
await page.evaluate(() => {
  const s = window.__scene
  for (const ai of s.ais) {
    Object.assign(ai.intent, { move: 0, jump: false, fastFall: false, drop: false, jab: false, smash: false, dodge: 0 })
    ai.update = () => ai.intent
  }
  const f = s.baseFighters[1]
  f.stocks = 1
  f.pos.set(0, -20, 0)
})
await page.waitForTimeout(900)
await page.screenshot({ path: 'qa/screens/polish-showdown.png' })
await page.waitForTimeout(1400)
// give the player some stats for a lived-in results tablet
await page.keyboard.press('q')
await page.waitForTimeout(300)
await page.evaluate(() => {
  const s = window.__scene
  const volt = s.baseFighters[2]
  volt.dmg = 138
  s.player.dmg = 64
  s.player.kos = 2
  volt.stocks = 1
  volt.pos.set(0, -20, 0) // final KO
})
await page.waitForTimeout(500)
await page.screenshot({ path: 'qa/screens/polish-final-ko.png' })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'qa/screens/polish-results.png' })

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
