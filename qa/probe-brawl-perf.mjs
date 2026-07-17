// Brawl probe: frame-rate sanity during a busy free-for-all with skills firing.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${process.env.IPL_PORT || '5187'}/?scene=brawl&mute=1`, { waitUntil: 'load' })
// skip the entrance cinematic (any key skips)
await page.waitForFunction(() => !!window.__scene?.phase, null, { timeout: 15000 })
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 15000 })

// stir the pot: skills + movement while AIs brawl
const stir = async () => {
  for (const k of ['q', 'w', 'e', 'r']) {
    await page.keyboard.press(k)
    await page.keyboard.down('d')
    await page.waitForTimeout(350)
    await page.keyboard.up('d')
    await page.keyboard.press('Space')
    await page.keyboard.press('j')
    await page.waitForTimeout(250)
  }
}
await stir()

const stats = await page.evaluate(() => new Promise(res => {
  const deltas = []
  let last = performance.now()
  const tick = () => {
    const now = performance.now()
    deltas.push(now - last)
    last = now
    if (deltas.length < 600) requestAnimationFrame(tick)
    else {
      deltas.sort((a, b) => a - b)
      const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length
      res({
        avgMs: +avg.toFixed(2),
        fps: +(1000 / avg).toFixed(1),
        p95: +deltas[Math.floor(deltas.length * 0.95)].toFixed(2),
        worst: +deltas[deltas.length - 1].toFixed(2),
        over25ms: deltas.filter(d => d > 25).length,
      })
    }
  }
  requestAnimationFrame(tick)
}))
console.log('PERF (600 frames mid-brawl):', JSON.stringify(stats))
console.log('VERDICT:', stats.fps > 50 && stats.over25ms < 30 ? 'OK smooth' : 'CHECK hitching')
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
