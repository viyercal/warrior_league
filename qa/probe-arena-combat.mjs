// probe-arena-combat.mjs — real-input combat: WASD movement, mouse aim,
// held-LMB blaster, edge clamp. Asserts kills happen and zero console errors.
// Usage: node qa/probe-arena-combat.mjs [port]
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
await page.waitForTimeout(3500) // wave 1 spawning

// hero position before movement
const p0 = await page.evaluate(() => ({ ...window.__scene.hero.group.position }))

// short strafe to prove movement, then hold ground and gun down the horde:
// aim the REAL mouse at the nearest enemy's projected screen position.
await page.keyboard.down('KeyD')
await page.waitForTimeout(900)
await page.keyboard.up('KeyD')
await page.mouse.move(720, 300)
await page.mouse.down()
for (let i = 0; i < 60; i++) {
  const px = await page.evaluate(() => {
    const s = window.__scene
    let best = null, bd = 1e9
    const hp = s.hero.group.position
    for (const e of s.horde.active) {
      if (!e.alive) continue
      const p = e.minion.group.position
      const d = (p.x - hp.x) ** 2 + (p.z - hp.z) ** 2
      if (d < bd) { bd = d; best = p }
    }
    if (!best) return null
    const v = best.clone()
    v.y = 0.5
    v.project(s.camera)
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }
  })
  if (px && px.x > 0 && px.x < 1440 && px.y > 0 && px.y < 810) await page.mouse.move(px.x, px.y)
  await page.waitForTimeout(180)
  if (i === 20) await page.screenshot({ path: 'qa/screens/arena-action1.png' })
  const kills = await page.evaluate(() => window.__scene.kills)
  if (kills >= 4) break
}
await page.mouse.up()

const mid = await page.evaluate(() => {
  const s = window.__scene
  return {
    score: s.score, kills: s.kills, hp: s.hp, wave: s.wave,
    alive: s.horde.aliveCount(), bolts: s.bolts.length,
    pos: { ...s.hero.group.position },
  }
})
assert(mid.pos.x !== p0.x || mid.pos.z !== p0.z, `WASD moved hero (${p0.x.toFixed(1)},${p0.z.toFixed(1)}) -> (${mid.pos.x.toFixed(1)},${mid.pos.z.toFixed(1)})`)
assert(mid.kills > 0, `blaster killed enemies (kills=${mid.kills}, score=${mid.score})`)
assert(mid.hp > 0 && mid.hp <= 100, `hero HP sane (${mid.hp})`)
assert(mid.wave >= 1, `wave started (wave=${mid.wave}, alive=${mid.alive})`)

// edge clamp: run one direction for 5s, radius must stay inside the wall
await page.keyboard.down('KeyW')
await page.waitForTimeout(5000)
await page.keyboard.up('KeyW')
const r = await page.evaluate(() => {
  const p = window.__scene.hero.group.position
  return Math.hypot(p.x, p.z)
})
assert(r <= 24.7, `edge soft-clamp held (r=${r.toFixed(2)} <= 24.6)`)
await page.screenshot({ path: 'qa/screens/arena-action-edge.png' })

assert(errors.length === 0, `zero console errors (${errors.length ? JSON.stringify(errors.slice(0, 5)) : 'ok'})`)
await browser.close()
console.log(fails.length ? `\nCOMBAT PROBE: ${fails.length} FAILURES` : '\nCOMBAT PROBE: ALL PASS')
process.exit(fails.length ? 1 : 0)
