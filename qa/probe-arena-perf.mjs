// probe-arena-perf.mjs — wave 8 horde stress: ~38 enemies + held blaster fire,
// measures FPS over 5s via rAF. Reports fps; fails under 30 (headless floor).
// Usage: node qa/probe-arena-perf.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5185'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
const fails = []
const assert = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg) }

await page.goto(`http://localhost:${port}/?scene=arena&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(2200)
await page.evaluate(() => {
  window.__qaKeep = setInterval(() => { if (!window.__scene.over) window.__scene.hp = 100 }, 250)
  window.__scene.debug.wave(8)
})

// kite while the horde builds up (standing still lets exploders AOE-clear it)
const DIRS = ['KeyW', 'KeyD', 'KeyS', 'KeyA']
let alive = 0
for (let i = 0; i < 70 && alive < 30; i++) {
  const k = DIRS[Math.floor(i / 4) % 4]
  await page.keyboard.down(k)
  await page.waitForTimeout(400)
  await page.keyboard.up(k)
  alive = await page.evaluate(() => window.__scene.horde.aliveCount())
}
assert(alive >= 30, `horde built up (${alive} alive)`)

// fire the blaster into the crowd while circling the rim during measurement
await page.mouse.move(720, 300)
await page.mouse.down()
await page.keyboard.down('KeyD')
const fps = await page.evaluate(() => new Promise(res => {
  let frames = 0
  const t0 = performance.now()
  const tick = () => {
    frames++
    if (performance.now() - t0 < 5000) requestAnimationFrame(tick)
    else res(frames / ((performance.now() - t0) / 1000))
  }
  requestAnimationFrame(tick)
}))
await page.screenshot({ path: 'qa/screens/arena-horde.png' })
await page.keyboard.up('KeyD')
await page.mouse.up()

const stats = await page.evaluate(() => ({ alive: window.__scene.horde.aliveCount(), wave: window.__scene.wave }))
console.log(`FPS: ${fps.toFixed(1)} with ${stats.alive} enemies alive (wave ${stats.wave})`)
assert(fps >= 30, `fps >= 30 in headless with full horde (${fps.toFixed(1)})`)
assert(errors.length === 0, `zero console errors (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)

await browser.close()
console.log(fails.length ? `\nPERF PROBE: ${fails.length} FAILURES` : '\nPERF PROBE: ALL PASS')
process.exit(fails.length ? 1 : 0)
