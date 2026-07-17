// RIFT LEGENDS action probe: real mouse/keyboard input, mid-lane combat screenshots.
// node qa/probe-moba-action.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5183'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto(`http://localhost:${port}/?scene=moba&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(1500)
await page.keyboard.press('Space') // any key skips the intro cinematic
await page.waitForTimeout(3000)

const state = () => page.evaluate(() => {
  const s = window.__scene
  return {
    hero: { x: +s.hero.group.position.x.toFixed(1), z: +s.hero.group.position.z.toFixed(1) },
    hp: Math.round(s.hp), energy: Math.round(s.energy),
    minions: s.army.active.filter(e => e.alive).length,
    enemy: { alive: s.enemy.alive, x: +s.enemy.group.position.x.toFixed(1), hp: Math.round(s.enemy.hp) },
    gold: s.goldEarned, cs: s.cs, over: s.over,
  }
})

// screen-project a world point through the scene camera
const toScreen = (x, y, z) => page.evaluate(([wx, wy, wz]) => {
  const v = new window.__scene.camera.constructor.prototype.constructor.name ? { x: 0 } : null
  void v
  const THREEV = window.__scene.hero.group.position.clone()
  THREEV.set(wx, wy, wz)
  THREEV.project(window.__scene.camera)
  return { x: (THREEV.x * 0.5 + 0.5) * innerWidth, y: (-THREEV.y * 0.5 + 0.5) * innerHeight }
}, [x, y, z])

console.log('start:', JSON.stringify(await state()))

// ---- walk east toward mid with right-clicks ----
for (let i = 0; i < 7; i++) {
  await page.mouse.click(1150, 330, { button: 'right' })
  await page.waitForTimeout(1400)
}
console.log('after walk:', JSON.stringify(await state()))

// ---- wait for the waves to clash near mid, then walk into the fight ----
await page.waitForTimeout(3500)
await page.mouse.click(1100, 300, { button: 'right' })
await page.waitForTimeout(2200)

// right-click an enemy minion (project its position to screen)
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
    v.y = 0.5
    v.project(s.camera)
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }
  })
  if (p) await page.mouse.click(p.x, p.y, { button: 'right' })
  return p
}

await clickNearestRed()
await page.waitForTimeout(1700)
await page.screenshot({ path: 'qa/screens/moba-action-fight.png' })

// ---- cast all four skills at the fight ----
await page.mouse.move(1050, 330)
await page.keyboard.press('KeyW')
await page.waitForTimeout(420)
await page.screenshot({ path: 'qa/screens/moba-action-skillshot.png' })
await page.keyboard.press('KeyE')
await page.waitForTimeout(350)
await page.keyboard.press('KeyR')
await page.waitForTimeout(800)
await page.screenshot({ path: 'qa/screens/moba-action-meteor.png' })
await page.keyboard.press('KeyQ')
await page.waitForTimeout(500)
await page.screenshot({ path: 'qa/screens/moba-action-blink.png' })

// keep fighting: attack-click a few times so autos + last hits happen
for (let i = 0; i < 6; i++) {
  await clickNearestRed()
  await page.waitForTimeout(1300)
}
await page.screenshot({ path: 'qa/screens/moba-action-autos.png' })
console.log('after fight:', JSON.stringify(await state()))

// ---- recall test ----
await page.keyboard.press('KeyB')
await page.waitForTimeout(1200)
await page.screenshot({ path: 'qa/screens/moba-action-recall.png' })
const midRecall = await page.evaluate(() => window.__scene.recallT)
await page.waitForTimeout(1600)
const afterRecall = await page.evaluate(() => ({
  x: +window.__scene.hero.group.position.x.toFixed(1),
  hp: Math.round(window.__scene.hp),
  recalling: window.__scene.recallT >= 0,
}))
console.log('recall mid:', midRecall, '→ after:', JSON.stringify(afterRecall))

// ---- camera: zoom + unlock/pan ----
await page.mouse.wheel(0, -600)
await page.keyboard.press('KeyY')
await page.mouse.move(1439, 400)
await page.waitForTimeout(1500)
const cam = await page.evaluate(() => ({ zoom: +window.__scene.zoom.toFixed(1), lock: window.__scene.camLock, fx: +window.__scene.camFocus.x.toFixed(1) }))
console.log('camera:', JSON.stringify(cam))
await page.keyboard.press('KeyY')

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none')
await browser.close()
