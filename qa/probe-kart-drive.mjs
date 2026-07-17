// Kart driving probe: real keyboard input, mid-race captures.
// node qa/probe-kart-drive.mjs [port]
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
await page.waitForTimeout(300)

const state = () => page.evaluate(() => {
  const s = window.__scene
  return {
    state: s.state, speed: +s.player.speed.toFixed(1), pos: s.playerPos,
    lap: Math.floor(Math.max(0, s.player.sCont)) + 1, meter: Math.round(s.player.meter),
    drifting: s.player.drifting, sCont: +s.player.sCont.toFixed(3),
    damage: +s.player.damage.toFixed(2), over: s.over,
  }
})
console.log('at GO:', JSON.stringify(await state()))

// accelerate hard down the opening straight
await page.keyboard.down('w')
await page.waitForTimeout(2600)
await page.screenshot({ path: 'qa/screens/kart-drive-straight.png' })
console.log('straight:', JSON.stringify(await state()))

// drift through the sweeper (hold space + steer)
await page.keyboard.down('d')
await page.waitForTimeout(250)
await page.keyboard.down(' ')
await page.waitForTimeout(1400)
await page.screenshot({ path: 'qa/screens/kart-drive-drift.png' })
console.log('drifting:', JSON.stringify(await state()))
await page.waitForTimeout(1100)
await page.keyboard.up(' ')
await page.keyboard.up('d')
await page.waitForTimeout(300)
await page.screenshot({ path: 'qa/screens/kart-drive-miniturbo.png' })
console.log('after drift release:', JSON.stringify(await state()))

// keep lapping with simple steering assist for a while
await page.evaluate(() => { window.__assist = true })
const assist = setInterval(async () => {
  try {
    const steer = await page.evaluate(() => {
      const s = window.__scene
      const p = s.player
      const t = s.track
      const v1 = { x: 0, z: 0 }
      const look = (p.sCont % 1 + 1) % 1 + (12 + p.speed * 0.4) / t.length
      const i = Math.floor(((look % 1) + 1) % 1 * t.N) % t.N
      const tp = t.pos[i]
      const desired = Math.atan2(tp.x - p.group.position.x, tp.z - p.group.position.z)
      let d = desired - p.heading
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      return d
    })
    if (steer > 0.09) { await page.keyboard.down('a'); await page.keyboard.up('d') }
    else if (steer < -0.09) { await page.keyboard.down('d'); await page.keyboard.up('a') }
    else { await page.keyboard.up('a'); await page.keyboard.up('d') }
  } catch {}
}, 90)

await page.waitForTimeout(9000)
// spend boost
await page.keyboard.down('Shift')
await page.waitForTimeout(1400)
await page.screenshot({ path: 'qa/screens/kart-drive-boost.png' })
console.log('boosting:', JSON.stringify(await state()))
await page.keyboard.up('Shift')
await page.waitForTimeout(9000)
clearInterval(assist)
await page.keyboard.up('w')

await page.screenshot({ path: 'qa/screens/kart-drive-late.png' })
console.log('late:', JSON.stringify(await state()))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none')
await browser.close()
