// probe-siege-look.mjs — visual inspection: jump into wave 3 combat, build +
// upgrade a turret with real F presses, blast raiders, capture stills.
// Usage: node qa/probe-siege-look.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5188'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${port}/?scene=siege&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(3000)

// stand on a pad, build, upgrade twice
await page.evaluate(() => {
  const s = window.__scene
  s.debug.gold(1000)
  s.hero.group.position.set(-8, 0, -1)
})
await page.waitForTimeout(300)
await page.keyboard.press('KeyF')
await page.waitForTimeout(900)
await page.keyboard.press('KeyF')
await page.waitForTimeout(700)
await page.keyboard.press('KeyF')
await page.waitForTimeout(700)
await page.screenshot({ path: 'qa/screens/siege-look-turret.png' })

// wave 3 combat: wait for raiders to reach midfield, then blast them
await page.evaluate(() => window.__scene.debug.wave(3))
await page.waitForTimeout(9000)
await page.mouse.move(720, 240)
await page.mouse.down()
await page.waitForTimeout(1800)
await page.screenshot({ path: 'qa/screens/siege-look-combat.png' })
await page.mouse.up()

// near-citadel view: raiders at the gate
await page.evaluate(() => { window.__scene.hero.group.position.set(0, 0, 6) })
await page.waitForTimeout(6000)
await page.screenshot({ path: 'qa/screens/siege-look-gate.png' })

const st = await page.evaluate(() => {
  const s = window.__scene
  return {
    gold: s.gold, wave: s.wave, alive: s.army.aliveCount(),
    turretLevel: s.turrets.pads.map(p => p.turret ? p.turret.level : 0),
    citadel: s.citadel.hp,
  }
})
console.log('STATE:', JSON.stringify(st))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 6), null, 1) : 'none')
await browser.close()
