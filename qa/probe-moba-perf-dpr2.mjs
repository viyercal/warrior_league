// WAR RIFT perf gate: fps at deviceScaleFactor 2 during a staged mid-lane
// clash with skills flying, plus a tower slow-mo money moment.
// node qa/probe-moba-perf-dpr2.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5183'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto(`http://localhost:${port}/?scene=moba&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(1500)
await page.keyboard.press('Space') // skip intro
await page.waitForTimeout(800)

// stage a dense clash mid-lane and keep everyone alive for the sample
await page.evaluate(() => {
  const s = window.__scene
  s.hero.group.position.set(-7, 0, 1)
  s.camFocus.set(-7, 0, 1)
  for (const [team, sgn] of [['blue', -1], ['red', 1]]) {
    for (let i = 0; i < 5; i++) s.army.spawn(team, 'melee', sgn * (3 + i * 1.5), -2 + i * 2)
    s.army.spawn(team, 'caster', sgn * 7, 0)
  }
  s.enemy.group.position.set(4, 0, -1)
  window.__keep = setInterval(() => { const g = window.__scene; g.hp = Math.max(g.hp, 60); g.energy = 100 }, 400)
})
await page.mouse.move(820, 380)

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
      res({ fps: +(1000 / avg).toFixed(1), p95: +times[Math.floor(times.length * 0.95)].toFixed(1), frames: times.length })
    }
  }
  requestAnimationFrame(tick)
}))
const drive = (async () => {
  for (const key of ['KeyW', 'KeyE', 'KeyR', 'KeyW', 'KeyE']) {
    await page.keyboard.press(key)
    await page.waitForTimeout(1300)
  }
  // tower slow-mo money moment inside the sample window
  await page.evaluate(() => window.__scene.structures.damage(window.__scene.structures.tower('red', 0), 999, 'blue'))
})()
const [result] = await Promise.all([sample, drive])
await page.evaluate(() => clearInterval(window.__keep))
console.log('DPR2 fight+slow-mo sample:', JSON.stringify(result))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none')
await browser.close()
