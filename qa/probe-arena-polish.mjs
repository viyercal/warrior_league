// probe-arena-polish.mjs — polish-pass drama systems: ELITE spawns (scale/HP/
// crown/score/orb/hit-stop), ANNIHILATION multi-kill slow-mo + punch-in, FURY
// heat meter, last-stand pulse + UNBROKEN (once per run), end stat tablet.
// Usage: node qa/probe-arena-polish.mjs [port]
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
await page.waitForTimeout(900)
await page.keyboard.press('Space') // skip the intro cinematic
await page.waitForTimeout(500)
// invulnerable hero so drama tests control HP exactly
await page.evaluate(() => { window.__qaIfr = setInterval(() => { window.__scene.iFrames = 2 }, 300) })

// ---------- ELITE variant ----------
console.log('--- elites ---')
const elite = await page.evaluate(() => {
  const s = window.__scene
  const hp = s.hero.group.position
  const e = s.horde.spawn('grunt', hp.x + 4, hp.z, true)
  return {
    elite: e.elite, hp: e.hp, scale: e.scale, groupScale: e.minion.group.scale.x,
    crown: !!e.minion.crown && e.minion.crown.visible,
  }
})
assert(elite.elite, 'elite flag set')
assert(elite.hp === 40, `elite grunt 2x HP (${elite.hp})`)
assert(Math.abs(elite.scale - 1.4) < 0.01 && Math.abs(elite.groupScale - 1.4) < 0.01, `elite 1.4x scale (${elite.groupScale})`)
assert(elite.crown, 'ember crown visible')
await page.waitForTimeout(400)
await page.screenshot({ path: 'qa/screens/arena-elite.png' })

const ek = await page.evaluate(() => {
  const s = window.__scene
  const e = s.horde.active.find(x => x.elite && x.alive)
  const score0 = s.score, orbs0 = s.orbs.length
  s._hitEnemy(e, 9999)
  return {
    dScore: s.score - score0, dOrbs: s.orbs.length - orbs0,
    freeze: s.freezeT, eliteKills: s.eliteKills, crownOff: !e.minion.crown.visible || !e.alive,
  }
})
assert(ek.dScore === 30, `elite pays 3x score (+${ek.dScore})`)
assert(ek.dOrbs === 1, 'elite guaranteed heal orb dropped')
assert(ek.freeze > 0, `elite kill hit-stop (${ek.freeze.toFixed(2)}s)`)
assert(ek.eliteKills === 1, 'elite kill recorded in stats')

// non-elite spawns stay stock
const plain = await page.evaluate(() => {
  const s = window.__scene
  const e = s.horde.spawn('grunt', 6, 6, false)
  const r = { hp: e.hp, scale: e.scale, crown: !!e.minion.crown && e.minion.crown.visible }
  s.horde.kill(e)
  return r
})
assert(plain.hp === 20 && plain.scale === 1 && !plain.crown, `non-elite grunt unchanged (hp=${plain.hp})`)

// ---------- ANNIHILATION: 4+ kills in 0.4s ----------
console.log('--- annihilation ---')
const ann = await page.evaluate(() => {
  const s = window.__scene
  const hp = s.hero.group.position
  for (let i = 0; i < 6; i++) s.horde.spawn('grunt', hp.x + 3 + (i % 3), hp.z + Math.floor(i / 3), false)
  const k0 = s.kills
  s._aoeEnemies(hp.x + 3.5, hp.z + 0.5, 12, 999)
  return { kills: s.kills - k0, slow: s.slowmoT, punch: s.punch, heat: s.heat }
})
assert(ann.kills >= 4, `multi-kill burst (${ann.kills} kills)`)
assert(ann.slow > 0.5, `slow-mo armed (${ann.slow.toFixed(2)}s)`)
assert(ann.punch > 0.5, `camera punch-in armed (${ann.punch.toFixed(2)})`)
await page.waitForTimeout(250)
const annMid = await page.evaluate(() => ({
  ts: window.__scene.timeScale,
  banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
}))
assert(annMid.ts < 0.6, `time dilated during money moment (${annMid.ts.toFixed(2)})`)
assert(annMid.banner.some(t => /ANNIHILATION/.test(t)), `ANNIHILATION popup (${annMid.banner})`)
await page.screenshot({ path: 'qa/screens/arena-annihilation.png' })

// ---------- FURY heat meter ----------
const heat = await page.evaluate(() => ({
  heat: window.__scene.heat,
  fill: document.querySelector('.arena-heat-fill')?.style.height,
}))
assert(heat.heat > 0.3, `FURY heat grew on kills (${heat.heat.toFixed(2)})`)
assert(parseInt(heat.fill) > 20, `heat meter fill rendered (${heat.fill})`)
const decayed = await page.waitForFunction(
  h0 => window.__scene.heat < h0 - 0.05, heat.heat, { timeout: 5000 }).then(() => true).catch(() => false)
assert(decayed, 'FURY heat decays without kills')

// ---------- last stand + UNBROKEN (once per run) ----------
console.log('--- last stand ---')
await page.evaluate(() => { window.__scene.hp = 15 })
await page.waitForTimeout(600)
const ls = await page.evaluate(() => ({
  on: document.querySelector('.arena-laststand')?.classList.contains('on'),
  lastStand: window.__scene.lastStand,
}))
assert(ls.on && ls.lastStand, 'crimson last-stand pulse below 20% HP')
await page.screenshot({ path: 'qa/screens/arena-laststand.png' })

await page.evaluate(() => { window.__scene.hp = 60 })
await page.waitForTimeout(400)
const ub = await page.evaluate(() => ({
  banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
  off: !document.querySelector('.arena-laststand')?.classList.contains('on'),
  unbroken: window.__scene.unbroken,
}))
assert(ub.banner.some(t => /UNBROKEN/.test(t)), `UNBROKEN popup on recovery (${ub.banner})`)
assert(ub.off, 'last-stand pulse cleared on recovery')
assert(ub.unbroken, 'unbroken latched')
await page.waitForTimeout(2800) // let the first banner fade fully
await page.evaluate(() => { window.__scene.hp = 15 })
await page.waitForTimeout(400)
await page.evaluate(() => { window.__scene.hp = 60 })
await page.waitForTimeout(400)
const ub2 = await page.evaluate(() => [...document.querySelectorAll('.banner-main')].map(b => b.textContent))
assert(!ub2.some(t => /UNBROKEN/.test(t)), 'UNBROKEN fires only once per run')

// ---------- end tablet stats (death path; win path covered by endstates probe) ----------
console.log('--- end tablet ---')
await page.evaluate(() => window.__scene.debug.lose())
await page.waitForTimeout(600)
const panel = await page.evaluate(() => ({
  labels: [...document.querySelectorAll('.arena-stat-label')].map(e => e.textContent),
  vals: [...document.querySelectorAll('.arena-stat-val')].map(e => e.textContent),
  chips: [...document.querySelectorAll('.arena-kill-chip')].map(c => c.textContent),
  buttons: [...document.querySelectorAll('.arena-end button')].map(b => b.textContent),
}))
assert(panel.labels.length >= 5, `stat rows present (${panel.labels.join(', ')})`)
assert(panel.labels.some(l => /FAVORITE ART/.test(l)), 'favorite art row present')
assert(panel.chips.some(c => /ELITES ×1/.test(c)), `elite kill chip (${panel.chips})`)
assert(panel.chips.some(c => /GRUNTS/.test(c)), `kill-by-type chips (${panel.chips})`)
assert(panel.buttons.includes('RETRY') && panel.buttons.includes('HUB'), `RETRY + HUB kept (${panel.buttons})`)
await page.screenshot({ path: 'qa/screens/arena-endpanel.png' })

assert(errors.length === 0, `zero console errors (${errors.length ? JSON.stringify(errors.slice(0, 5)) : 'ok'})`)
await browser.close()
console.log(fails.length ? `\nPOLISH PROBE: ${fails.length} FAILURES` : '\nPOLISH PROBE: ALL PASS')
process.exit(fails.length ? 1 : 0)
