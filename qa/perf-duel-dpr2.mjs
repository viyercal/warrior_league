// Duel perf gate: fps at deviceScaleFactor 2 (pixelRatio 2) during a live fight.
import { chromium } from 'playwright-core'

const port = process.env.IPL_PORT || '8181'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${port}/?scene=duel&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(2600)
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })
await page.evaluate(() => {
  // keep the round alive for the whole sample
  window.__keep = setInterval(() => {
    const s = window.__scene
    if (s.phase === 'fight') { s.player.hp = Math.max(s.player.hp, 40); s.foe.hp = Math.max(s.foe.hp, 40); s.roundT = 60 }
  }, 400)
})

const sample = page.evaluate(() => new Promise(res => {
  const times = []
  let last = performance.now()
  const t0 = last
  const tick = () => {
    const now = performance.now()
    times.push(now - last); last = now
    if (now - t0 < 9000) requestAnimationFrame(tick)
    else {
      times.sort((a, b) => a - b)
      const avg = times.reduce((a, b) => a + b, 0) / times.length
      res({ fps: 1000 / avg, p95: times[Math.floor(times.length * 0.95)], frames: times.length })
    }
  }
  requestAnimationFrame(tick)
}))
const drive = (async () => {
  for (let i = 0; i < 12; i++) {
    await page.keyboard.down(i % 2 ? 'a' : 'd')
    await page.waitForTimeout(280)
    await page.keyboard.up(i % 2 ? 'a' : 'd')
    await page.keyboard.press('j')
    if (i % 3 === 0) await page.keyboard.press('k')
    if (i % 4 === 0) await page.keyboard.press(['q', 'w', 'e', 'r'][(i / 4) % 4 | 0])
    await page.waitForTimeout(300)
  }
})()
const [r] = await Promise.all([sample, drive])
const pr = await page.evaluate(() => { clearInterval(window.__keep); return window.__ipl.engine.renderer.getPixelRatio() })
console.log(`DUEL FPS(avg): ${r.fps.toFixed(1)}  p95 frame: ${r.p95.toFixed(1)}ms  pixelRatio: ${pr}  frames: ${r.frames}`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 6), null, 1) : 'none')
await browser.close()
process.exit(r.fps >= 54 && !errors.length ? 0 : 1)
