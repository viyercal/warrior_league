// probe-arena-boss.mjs — WARDEN NOVA flow: spawn at wave 5, HUD boss bar,
// telegraphed slam, half-HP summons, death slow-mo + chain, wave advance.
// Usage: node qa/probe-arena-boss.mjs [port]
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
await page.waitForTimeout(2500)
await page.evaluate(() => { window.__qaKeep = setInterval(() => { if (!window.__scene.over) window.__scene.hp = 100 }, 300) })

// jump to boss wave
await page.evaluate(() => window.__scene.debug.wave(5))
await page.waitForTimeout(1200)
const spawned = await page.evaluate(() => {
  const s = window.__scene
  return { wave: s.wave, boss: !!s.boss, hp: s.boss?.hp, bossBar: s.bossBox.style.display !== 'none' }
})
assert(spawned.wave === 5 && spawned.boss, `boss spawned on wave 5 (hp=${spawned.hp})`)
assert(spawned.hp === 400, `boss HP 400 (${spawned.hp})`)
assert(spawned.bossBar, 'boss HP bar visible in HUD')

// wait for a telegraphed slam (boss stalks in, slams when close)
let sawTele = false
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(250)
  const t = await page.evaluate(() => window.__scene.boss && window.__scene.boss.tele.visible)
  if (t) { sawTele = true; break }
}
assert(sawTele, 'slam telegraph ring appeared')
if (sawTele) await page.screenshot({ path: 'qa/screens/arena-boss-tele.png' })

// burn to half HP -> summons 4 grunts
const preSummon = await page.evaluate(() => window.__scene.horde.aliveCount())
await page.evaluate(() => { for (let i = 0; i < 21; i++) window.__scene._hitBoss(10) }) // 400 -> 190
await page.waitForTimeout(700)
const summon = await page.evaluate(() => ({
  hp: window.__scene.boss.hp, summoned: window.__scene.boss.summoned,
  alive: window.__scene.horde.aliveCount(),
}))
assert(summon.summoned && summon.alive >= preSummon + 4, `half-HP summoned grunts (${preSummon} -> ${summon.alive})`)
await page.screenshot({ path: 'qa/screens/arena-boss-fight.png' })

// kill the boss -> slow-mo + chain + banner, then removal
await page.evaluate(() => { for (let i = 0; i < 25; i++) window.__scene._hitBoss(10) })
await page.waitForTimeout(400)
const death = await page.evaluate(() => ({
  alive: window.__scene.boss?.alive, slowmo: window.__scene.slowmoT > 0 || window.__scene.timeScale < 1,
  banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
  score: window.__scene.score,
}))
assert(death.alive === false, 'boss dead')
assert(death.slowmo, 'slow-mo kicked in on boss death')
assert(death.banner.some(t => /WARDEN DOWN/i.test(t)), `WARDEN DOWN banner (${death.banner})`)
assert(death.score >= 250, `boss score bonus (+${death.score})`)
await page.screenshot({ path: 'qa/screens/arena-boss-death.png' })
await page.waitForTimeout(2600)
assert(await page.evaluate(() => !window.__scene.boss), 'boss removed from scene')

// clear leftovers -> wave must advance to 6
await page.evaluate(() => {
  const s = window.__scene
  s.spawnQueue.length = 0
  for (const e of [...s.horde.active]) s._hitEnemy(e, 9999)
})
await page.waitForTimeout(1500)
const adv = await page.evaluate(() => ({ state: window.__scene.waveState, label: window.__scene.waveEl.textContent }))
assert(adv.state === 'break' || /WAVE 6/.test(adv.label), `wave advanced after boss (${adv.label})`)

assert(errors.length === 0, `zero console errors (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)
await browser.close()
console.log(fails.length ? `\nBOSS PROBE: ${fails.length} FAILURES` : '\nBOSS PROBE: ALL PASS')
process.exit(fails.length ? 1 : 0)
