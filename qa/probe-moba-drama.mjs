// WAR RIFT drama probe: intro skip, tower slow-mo punch, low-HP heartbeat +
// UNBROKEN, first blood / streaks / SHUTDOWN bounty, forge moment, warlord
// taunts, beacon-fall orbit cine + end-of-war stats panel.
// node qa/probe-moba-drama.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5183'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

const banners = () => page.evaluate(() => [...document.querySelectorAll('.banner-main')].map(b => b.textContent))
const toasts = () => page.evaluate(() => [...document.querySelectorAll('.ui-toast')].map(t => t.textContent))

await page.goto(`http://localhost:${port}/?scene=moba&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(1500)
await page.keyboard.press('Space')
await page.waitForTimeout(1200)
console.log('phase after skip (want play):', await page.evaluate(() => window.__scene.phase))

// ============ 1. tower money moment: slow-mo + camera punch ============
await page.evaluate(() => {
  const s = window.__scene
  s.hero.group.position.set(10, 0, 0) // near the red outer tower so the punch reads
  s.camFocus.set(10, 0, 0)
  s.structures.damage(s.structures.tower('red', 0), 999, 'blue')
})
await page.waitForTimeout(250)
const slomo = await page.evaluate(() => ({
  timeScale: +window.__scene.timeScale.toFixed(2),
  slowmoT: +window.__scene.slowmoT.toFixed(2),
  punchT: +window.__scene.punchT.toFixed(2),
}))
console.log('tower slow-mo (want timeScale ~0.22, punchT > 0):', JSON.stringify(slomo))
await page.screenshot({ path: 'qa/screens/moba-drama-towerfall.png' })
await page.waitForTimeout(1400)
const slomoAfter = await page.evaluate(() => +window.__scene.timeScale.toFixed(2))
console.log('timeScale recovered (want 1):', slomoAfter)

// ============ 2. low-HP heartbeat + UNBROKEN ============
await page.evaluate(() => window.__scene.damagePlayer(80, null))
await page.waitForTimeout(400)
const low = await page.evaluate(() => ({
  hp: Math.round(window.__scene.hp),
  lowhpOn: document.querySelector('.moba-lowhp').classList.contains('on'),
}))
console.log('low-HP check (want ~20hp, vignette on):', JSON.stringify(low))
await page.screenshot({ path: 'qa/screens/moba-drama-lowhp.png' })
await page.evaluate(() => window.__scene.healPlayer(45))
await page.waitForTimeout(500)
const unbroken = await page.evaluate(() => ({
  lowhpOff: !document.querySelector('.moba-lowhp').classList.contains('on'),
  toast: [...document.querySelectorAll('.ui-toast')].map(t => t.textContent).join('|'),
}))
console.log('UNBROKEN check (want vignette off + toast):', JSON.stringify(unbroken))

// ============ 3. announcer: first blood → spree → shutdown bounty ============
await page.evaluate(() => window.__scene.onEnemySlain(true))
await page.waitForTimeout(300)
console.log('kill 1 (want FIRST BLOOD):', JSON.stringify(await banners()))
await page.evaluate(() => window.__scene.onEnemySlain(true))
await page.waitForTimeout(2600) // let banner rotate out
await page.evaluate(() => window.__scene.onEnemySlain(true))
await page.waitForTimeout(300)
console.log('kill 3 (want KILLING SPREE):', JSON.stringify(await banners()))
await page.screenshot({ path: 'qa/screens/moba-drama-spree.png' })
const shutdown = await page.evaluate(() => {
  const s = window.__scene
  s.drama.enemyStreak = 4 // a streaking warlord
  const g0 = s.goldEarned
  s.onEnemySlain(true)
  return { gained: s.goldEarned - g0 }
})
await page.waitForTimeout(300)
console.log('shutdown (want +350 = 300 kill + 50 bounty, SHUTDOWN banner):',
  JSON.stringify({ ...shutdown, banners: await banners(), toasts: await toasts() }))

// ============ 4. forge moment + recall taunt ============
const forge = await page.evaluate(() => {
  const s = window.__scene
  const items0 = s.itemDmg
  s._addGold(600)
  return { itemUp: s.itemDmg > items0 }
})
await page.waitForTimeout(300)
console.log('forge (want itemUp + FORGED toast):', JSON.stringify({ ...forge, toasts: await toasts() }))
await page.evaluate(() => { window.__scene.drama.lastTauntT = -1; window.__scene._startRecall() })
await page.waitForTimeout(400)
const taunt = await page.evaluate(() => document.querySelector('.moba-taunt')?.textContent || null)
console.log('recall taunt (want a warlord line):', JSON.stringify(taunt))

// ============ 5. beacon-fall orbit cine → VICTORY + stats panel ============
await page.evaluate(() => {
  const s = window.__scene
  s.structures.damage(s.structures.tower('red', 1), 999, 'blue')
  s.structures.damage(s.structures.nexus('red'), 999, 'blue')
})
await page.waitForTimeout(1000)
const cine = await page.evaluate(() => ({
  orbit: !!window.__scene.nexusCine,
  timeScale: +window.__scene.timeScale.toFixed(2),
  letterbox: !!document.querySelector('.moba-cine.on'),
}))
console.log('beacon cine (want orbit, timeScale ~0.16, letterbox):', JSON.stringify(cine))
await page.screenshot({ path: 'qa/screens/moba-drama-beacon.png' })
await page.waitForTimeout(2200)
const end = await page.evaluate(() => ({
  over: window.__scene.over,
  banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
  stats: [...document.querySelectorAll('.moba-end-stat')].map(c => c.textContent),
  button: !!document.querySelector('.moba-end button'),
}))
console.log('end state (want won, VICTORY, 6 stats, button):', JSON.stringify(end))
await page.screenshot({ path: 'qa/screens/moba-drama-stats.png' })

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
