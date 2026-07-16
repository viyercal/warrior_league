// probe-siege-beauty.mjs — staged hero shots: mid-lane skirmish with skills
// popping, and the Colossus mid-slam-telegraph.
// Usage: node qa/probe-siege-beauty.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5188'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
page.on('pageerror', e => console.log('PAGEERROR', e))
await page.goto(`http://localhost:${port}/?scene=siege&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(2600)

// ---- shot 1: wave-6 skirmish at the west lane elbow, quake + blaster ----
await page.evaluate(() => {
  const s = window.__scene
  s.debug.gold(1500)
  for (const i of [2, 3]) {
    const pad = s.turrets.pads[i]
    s.turrets.build(pad)
    s.turrets.upgrade(pad.turret)
  }
  s.debug.wave(6)
  window.__qaKeep = setInterval(() => { const sc = window.__scene; if (!sc.over && sc.deadT <= 0) sc.hp = 100 }, 300)
})
await page.waitForTimeout(7500)
await page.evaluate(() => { window.__scene.hero.group.position.set(-9, 0, -4) })
await page.waitForTimeout(2200) // raiders aggro & close in
await page.mouse.move(700, 260)
await page.mouse.down()
await page.waitForTimeout(600)
await page.keyboard.press('Digit3') // quake nova
await page.waitForTimeout(260)
await page.screenshot({ path: 'qa/screens/siege-final-combat.png' })
await page.waitForTimeout(900)
await page.keyboard.press('Digit4') // comet inbound
await page.waitForTimeout(950)
await page.screenshot({ path: 'qa/screens/siege-final-comet.png' })
await page.mouse.up()

// ---- shot 2: colossus slam telegraph ----
await page.evaluate(() => window.__scene.debug.wave(10))
await page.waitForTimeout(3000)
await page.evaluate(() => {
  const s = window.__scene
  const b = s.boss.group.position
  s.hero.group.position.set(b.x + 2.5, 0, b.z + 7)
})
// poll for the slam telegraph
let got = false
for (let i = 0; i < 60 && !got; i++) {
  await page.waitForTimeout(250)
  got = await page.evaluate(() => window.__scene.boss?.state === 'slam' && window.__scene.boss.teleT < 0.55)
  const bp = await page.evaluate(() => {
    const s = window.__scene
    if (!s.boss) return null
    const b = s.boss.group.position
    s.hero.group.position.set(b.x + 2.5, 0, b.z + 7.5)
    return true
  })
  if (!bp) break
}
await page.screenshot({ path: 'qa/screens/siege-final-boss.png' })
console.log('slam captured:', got)
await browser.close()
