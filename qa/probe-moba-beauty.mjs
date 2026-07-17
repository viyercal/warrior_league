// RIFT LEGENDS beauty probe: staged mid-lane wave clash + skill barrage screenshots.
// node qa/probe-moba-beauty.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5183'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto(`http://localhost:${port}/?scene=moba&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(1800)
// mid-sweep intro frame (letterbox + lane flyover), then skip with any key
await page.screenshot({ path: 'qa/screens/moba-beauty-intro.png' })
await page.keyboard.press('Space')
await page.waitForTimeout(2200)

// stage a dense wave clash at mid with the hero in the middle of it
await page.evaluate(() => {
  const s = window.__scene
  s.hero.group.position.set(-7, 0, 1)
  s.camFocus.set(-7, 0, 1)
  for (const [team, sgn] of [['blue', -1], ['red', 1]]) {
    for (let i = 0; i < 3; i++) s.army.spawn(team, 'melee', sgn * (3 + i * 1.5), -2 + i * 2)
    s.army.spawn(team, 'caster', sgn * 7, 0)
  }
  s.enemy.group.position.set(10, 0, -1)
})
await page.waitForTimeout(2600)

// right-click the nearest red minion → autos begin
const clickNearestRed = async () => {
  const p = await page.evaluate(() => {
    const s = window.__scene
    const hp = s.hero.group.position
    let best = null, bd = 1e9
    for (const e of s.army.active) {
      if (!e.alive || e.team !== 'red') continue
      const d = (e.minion.group.position.x - hp.x) ** 2 + (e.minion.group.position.z - hp.z) ** 2
      if (d < bd) { bd = d; best = e.minion.group.position }
    }
    if (!best && s.enemy.alive) best = s.enemy.group.position
    if (!best) return null
    const v = best.clone()
    v.y = 0.4
    v.project(s.camera)
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }
  })
  if (p) await page.mouse.click(p.x, p.y, { button: 'right' })
  return p
}
const aimAtReds = async () => {
  const p = await clickNearestRed()
  if (p) await page.mouse.move(p.x, p.y)
}

await aimAtReds()
await page.waitForTimeout(1900)
await page.screenshot({ path: 'qa/screens/moba-beauty-autos.png' })

await aimAtReds()
await page.waitForTimeout(300)
await page.keyboard.press('KeyW') // starfire into the wave
await page.waitForTimeout(500)
await page.screenshot({ path: 'qa/screens/moba-beauty-skillshot.png' })

await page.keyboard.press('KeyE') // quake
await page.waitForTimeout(260)
await page.keyboard.press('KeyR') // comet
await page.waitForTimeout(950)
await page.screenshot({ path: 'qa/screens/moba-beauty-comet.png' })
await page.waitForTimeout(1400)
await page.screenshot({ path: 'qa/screens/moba-beauty-aftermath.png' })

// zoomed-in hero closeup
await page.evaluate(() => dispatchEvent(new WheelEvent('wheel', { deltaY: -700 })))
await aimAtReds()
await page.waitForTimeout(1400)
await page.screenshot({ path: 'qa/screens/moba-beauty-closeup.png' })

const st = await page.evaluate(() => {
  const s = window.__scene
  const info = window.__ipl.engine.renderer.info
  return {
    cs: s.cs, gold: s.goldEarned, hp: Math.round(s.hp),
    minions: s.army.active.filter(e => e.alive).length,
    drawCalls: info.render.calls, tris: info.render.triangles,
  }
})
console.log('state:', JSON.stringify(st))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none')
await browser.close()
