// Kart perf + beauty probe: steering-assisted racing, mid-drift capture, FPS sample.
// node qa/probe-kart-perf.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5186'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto(`http://localhost:${port}/?scene=kart&mute=1`, { waitUntil: 'load' })
// boot -> intro flyover (any key skips) -> countdown -> race
await page.waitForFunction(() => window.__scene?.state === 'intro', null, { timeout: 15000 })
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.state === 'race', null, { timeout: 12000 })
await page.keyboard.down('w')

// steering assist toward the racing line
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

await page.waitForTimeout(6500)

// FPS sample over 3s mid-race
const fps = await page.evaluate(() => new Promise(res => {
  let frames = 0
  const t0 = performance.now()
  const tick = () => {
    frames++
    if (performance.now() - t0 < 3000) requestAnimationFrame(tick)
    else res(Math.round(frames / ((performance.now() - t0) / 1000)))
  }
  requestAnimationFrame(tick)
}))
console.log('FPS mid-race:', fps)

// drift capture: hold space through the next corner
await page.keyboard.down(' ')
await page.waitForTimeout(1300)
await page.screenshot({ path: 'qa/screens/kart-fin2.png' })
await page.keyboard.up(' ')
await page.waitForTimeout(2500)
await page.screenshot({ path: 'qa/screens/kart-fin3.png' })
clearInterval(assist)
await page.keyboard.up('w')

const st = await page.evaluate(() => ({
  lap: Math.floor(Math.max(0, window.__scene.player.sCont)) + 1,
  pos: window.__scene.playerPos,
  speed: Math.round(window.__scene.player.speed),
}))
console.log('state:', JSON.stringify(st))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none')
await browser.close()
process.exit(errors.length || fps < 45 ? 1 : 0)
