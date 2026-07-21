// TEMP perf gate: siege mid-wave fps at deviceScaleFactor 2 (pixelRatio 2).
import { chromium } from 'playwright-core'

const port = process.argv[2] || '7173'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${port}/?scene=siege&mute=1&dpr=2`, { waitUntil: 'load' })
await page.waitForTimeout(2500)

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
await page.waitForTimeout(6000)

// real input for ~10s: move + aim + fire + skills while sampling frames
await page.mouse.move(720, 300)
await page.mouse.down()
for (const k of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) await page.keyboard.press(k)
const sample = page.evaluate(() => new Promise(res => {
  const times = []
  let last = performance.now()
  const t0 = last
  const tick = () => {
    const now = performance.now()
    times.push(now - last); last = now
    if (now - t0 < 10000) requestAnimationFrame(tick)
    else {
      times.sort((a, b) => a - b)
      const avg = times.reduce((a, b) => a + b, 0) / times.length
      const p95 = times[Math.floor(times.length * 0.95)]
      res({ fps: 1000 / avg, p95ms: p95, frames: times.length })
    }
  }
  requestAnimationFrame(tick)
}))
const drive = (async () => {
  const keys = ['w', 'a', 's', 'd']
  for (let i = 0; i < 12; i++) {
    const k = keys[i % 4]
    await page.keyboard.down(k)
    await page.mouse.move(500 + (i % 3) * 300, 250 + (i % 2) * 250)
    await page.waitForTimeout(750)
    await page.keyboard.up(k)
  }
})()
const [r] = await Promise.all([sample, drive])
await page.mouse.up()
const info = await page.evaluate(() => ({
  pr: window.__ipl.engine.renderer.getPixelRatio(),
  alive: window.__scene.army.aliveCount(),
}))
console.log(`SIEGE FPS(avg): ${r.fps.toFixed(1)}  p95 frame: ${r.p95ms.toFixed(1)}ms  pixelRatio: ${info.pr}  raiders: ${info.alive}`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 6), null, 1) : 'none')
await browser.close()
process.exit(r.fps >= 54 && !errors.length ? 0 : 1)
