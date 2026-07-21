// TEMP perf gate: kart mid-race fps at deviceScaleFactor 2 (pixelRatio 2).
import { chromium } from 'playwright-core'

const port = process.argv[2] || '7173'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto(`http://localhost:${port}/?scene=kart&mute=1&dpr=2`, { waitUntil: 'load' })
// boot -> intro flyover (any key skips) -> countdown -> race
await page.waitForFunction(() => window.__scene?.state === 'intro', null, { timeout: 15000 })
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.state === 'race', null, { timeout: 12000 })
await page.keyboard.down('w')

// steering assist toward the racing line (same as probe-kart-perf)
const assist = setInterval(async () => {
  try {
    const steer = await page.evaluate(() => {
      const s = window.__scene
      const p = s.player
      const t = s.track
      const look = ((p.sCont % 1) + 1) % 1 + (10 + p.speed * 0.42) / t.length
      const i = Math.floor(((look % 1) + 1) % 1 * t.N) % t.N
      const tp = t.pos[i]
      const desired = Math.atan2(tp.x - p.group.position.x, tp.z - p.group.position.z)
      let d = desired - p.heading
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      return d
    })
    if (steer > 0.08) { await page.keyboard.down('a'); await page.keyboard.up('d') }
    else if (steer < -0.08) { await page.keyboard.down('d'); await page.keyboard.up('a') }
    else { await page.keyboard.up('a'); await page.keyboard.up('d') }
  } catch {}
}, 90)

await page.waitForTimeout(4000)

// 10s frame-timing sample mid-race while still driving
const r = await page.evaluate(() => new Promise(res => {
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
clearInterval(assist)
await page.keyboard.up('w')
const info = await page.evaluate(() => ({
  pr: window.__ipl.engine.renderer.getPixelRatio(),
  speed: Math.round(window.__scene.player.speed),
  lap: Math.floor(Math.max(0, window.__scene.player.sCont)) + 1,
}))
console.log(`KART FPS(avg): ${r.fps.toFixed(1)}  p95 frame: ${r.p95ms.toFixed(1)}ms  pixelRatio: ${info.pr}  speed: ${info.speed}  lap: ${info.lap}`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 6), null, 1) : 'none')
await browser.close()
process.exit(r.fps >= 54 && !errors.length ? 0 : 1)
