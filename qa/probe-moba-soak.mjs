// RIFT LEGENDS soak: 75s unattended run + FPS measurement mid-fight.
// node qa/probe-moba-soak.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5183'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto(`http://localhost:${port}/?scene=moba&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(4000)

// park the hero mid-lane so towers/waves/champ all engage over time
await page.evaluate(() => {
  const s = window.__scene
  s.hero.group.position.set(-12, 0, 2)
  s.camFocus.set(-12, 0, 2)
})

const fps = await page.evaluate(() => new Promise(res => {
  let n = 0
  const t0 = performance.now()
  const loop = () => {
    n++
    if (performance.now() - t0 < 5000) requestAnimationFrame(loop)
    else res(+(n / 5).toFixed(1))
  }
  requestAnimationFrame(loop)
}))
console.log('FPS over 5s:', fps)

for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(14000)
  const st = await page.evaluate(() => {
    const s = window.__scene
    return {
      t: Math.round(s.gameT), hp: Math.round(s.hp), dead: s.playerDead,
      minions: s.army.active.filter(e => e.alive).length,
      enemy: { alive: s.enemy.alive, hp: Math.round(s.enemy.hp), x: Math.round(s.enemy.group.position.x) },
      towers: s.structures.list.filter(x => x.kind === 'tower' && x.alive).length,
      over: s.over, errs: 0,
    }
  })
  console.log(`t+${(i + 1) * 14}s:`, JSON.stringify(st))
}
await page.screenshot({ path: 'qa/screens/moba-soak.png' })
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
