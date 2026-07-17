// probe-siege-perf.mjs — fps sanity during the heaviest waves with turrets
// firing, skills casting, and a full raider swarm.
// Usage: node qa/probe-siege-perf.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5188'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${port}/?scene=siege&mute=1`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__scene?.phase === 'intro', null, { timeout: 15000 })
await page.waitForTimeout(300)
await page.keyboard.press('Space') // skip the intro cinematic
await page.waitForTimeout(250)

// max out the field: 3 turrets, wave 9 swarm, keep hero alive
await page.evaluate(() => {
  const s = window.__scene
  s.debug.gold(2000)
  for (const i of [2, 3, 4]) {
    const pad = s.turrets.pads[i]
    s.turrets.build(pad)
    s.turrets.upgrade(pad.turret)
    s.turrets.upgrade(pad.turret)
  }
  s.debug.wave(9)
  window.__qaKeep = setInterval(() => { const sc = window.__scene; if (!sc.over && sc.deadT <= 0) sc.hp = 100 }, 300)
})
await page.waitForTimeout(9000)

// cast skills mid-swarm + hold fire
await page.mouse.move(720, 300)
await page.mouse.down()
for (const k of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) await page.keyboard.press(k)

const fps = await page.evaluate(() => new Promise(res => {
  let frames = 0
  const t0 = performance.now()
  const tick = () => {
    frames++
    if (performance.now() - t0 < 4000) requestAnimationFrame(tick)
    else res((frames / (performance.now() - t0)) * 1000)
  }
  requestAnimationFrame(tick)
}))
await page.mouse.up()
const alive = await page.evaluate(() => window.__scene.army.aliveCount())
await page.screenshot({ path: 'qa/screens/siege-perf.png' })
console.log(`FPS: ${fps.toFixed(1)} with ${alive} raiders alive`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 6), null, 1) : 'none')
await browser.close()
process.exit(fps > 45 ? 0 : 1)
