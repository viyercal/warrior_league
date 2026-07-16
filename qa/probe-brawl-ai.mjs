// Brawl probe: AI free-for-all (AIs damage EACH OTHER), hard recovery when
// launched off-stage, and the final-KO slow-mo (timeScale dip) on match end.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

const results = []
const check = (name, ok, detail) => {
  results.push(`${name}: ${ok ? 'OK' : 'FAIL'} ${detail}`)
  console.log(results[results.length - 1])
}
const boot = async () => {
  await page.goto(`http://localhost:${process.env.IPL_PORT || '5187'}/?scene=brawl&mute=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 15000 })
}

// ---------- AIs fight each other while the player hides ----------
await boot()
await page.evaluate(() => { window.__scene.player.pos.set(-12.5, 0, 0) })
await page.waitForTimeout(9000)
const ffa = await page.evaluate(() => {
  const s = window.__scene
  return {
    crimson: s.baseFighters[1].dmg + s.baseFighters[1].falls * 100,
    volt: s.baseFighters[2].dmg + s.baseFighters[2].falls * 100,
    playerDmgDealt: s.player.kos,
  }
})
check('AI FFA', ffa.crimson > 0 || ffa.volt > 0, `AIs traded damage: CRIMSON=${ffa.crimson} VOLT=${ffa.volt} (player idle)`)
await page.screenshot({ path: 'qa/screens/brawl-ai-ffa.png' })

// ---------- recovery: launch CRIMSON off-stage at moderate % ----------
const recover = async (idx, vx, vy) => page.evaluate(([i, vx, vy]) => {
  const s = window.__scene
  const f = s.baseFighters[i]
  f.dmg = 60
  f.pos.set(11 * Math.sign(vx), 2, 0)
  f.vel.set(vx, vy)
  f.grounded = false
  f.hitstun = 0.3
  f.tumble = true
}, [idx, vx, vy])

let recovered = 0
for (const [vx, vy] of [[16, 6], [-15, 4], [14, -2]]) {
  await recover(1, vx, vy)
  // wait until KO'd or safely back on the island
  const outcome = await page.evaluate(() => new Promise(res => {
    const s = window.__scene
    const f = s.baseFighters[1]
    const stocks0 = f.stocks
    const t0 = performance.now()
    const poll = () => {
      if (f.stocks < stocks0) return res('ko')
      if (f.grounded && Math.abs(f.pos.x) < 13.2) return res('recovered')
      if (performance.now() - t0 > 7000) return res('timeout')
      setTimeout(poll, 100)
    }
    poll()
  }))
  if (outcome === 'recovered') recovered++
  console.log(`  launch(${vx},${vy}) -> ${outcome}`)
}
check('AI RECOVERY', recovered >= 2, `${recovered}/3 launches recovered to stage`)

// ---------- final-KO slow-mo: eliminate down to the last AI ----------
await boot()
await page.evaluate(() => {
  const s = window.__scene
  for (const ai of s.ais) {
    Object.assign(ai.intent, { move: 0, jump: false, fastFall: false, drop: false, jab: false, smash: false, dodge: 0 })
    ai.update = () => ai.intent
  }
  // VOLT already eliminated; CRIMSON on last stock at kill %
  const volt = s.baseFighters[2]
  volt.stocks = 0
  volt.state = 'out'
  volt.root.visible = false
  const cr = s.baseFighters[1]
  cr.stocks = 1
  cr.dmg = 170
  cr.pos.set(11, 0, 0)
  cr.vel.set(0, 0)
  s.player.pos.set(9.2, 0, 0)
  s.player.vel.set(0, 0)
  s.player.facing = 1
})
await page.keyboard.press('k')
// sample timeScale over the next 1.5s
const slowmo = await page.evaluate(() => new Promise(res => {
  const s = window.__scene
  let min = 1
  const t0 = performance.now()
  const poll = () => {
    min = Math.min(min, s.timeScale)
    if (performance.now() - t0 > 2600) return res({ min, over: s.over })
    requestAnimationFrame(poll)
  }
  poll()
}))
check('FINAL-KO SLOWMO', slowmo.min < 0.5 && slowmo.over === 'won', `min timeScale=${slowmo.min.toFixed(2)}, over=${slowmo.over}`)
await page.screenshot({ path: 'qa/screens/brawl-ai-final.png' })

console.log('---')
console.log(`PASS ${results.filter(r => r.includes(': OK')).length}/${results.length}`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
