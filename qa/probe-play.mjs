// Gameplay sanity probe: per game — real input (move/attack/shoot/survive),
// cast all 4 equipped abilities, then debug.win() + debug.lose() end states:
// banner appears, profile stats update, return-to-hub works. Zero errors required.
import { chromium } from 'playwright-core'

const BASE = process.env.IPL_BASE || 'http://localhost:5173'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

const results = []
const check = (label, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}
const sceneIs = (name, timeout = 15000) =>
  page.waitForFunction(n => window.__ipl?.sm?.currentName === n, name, { timeout })
const goTo = async (name, settle = 3000) => {
  await page.evaluate(n => window.__ipl.sm.goTo(n), name)
  await sceneIs(name)
  await page.waitForTimeout(settle)
}
const profile = () => page.evaluate(() => JSON.parse(localStorage.getItem('ipl-profile-v2') || '{}'))
const bannerText = () => page.evaluate(() =>
  [...document.querySelectorAll('.big-banner .banner-main')].map(e => e.textContent).join('|'))
// NOTE: in hoops/arena the W key both moves AND casts slot 1 (shared KEY_CODES
// overlap with WASD) — movement presses may have started cooldowns, so wait for
// all cds to clear, then assert each slot's cd right after its own keypress.
const readCds = kind => page.evaluate(k =>
  (k === 'hoops' ? window.__scene.abilities.cds : window.__scene.cds).map(c => +c.toFixed(2)), kind)
const castQWER = async (kind = 'direct') => {
  await page.waitForFunction(k =>
    (k === 'hoops' ? window.__scene.abilities.cds : window.__scene.cds).every(c => c < 0.01),
    kind, { timeout: 10000 })
  await page.mouse.move(720, 300)
  const after = []
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press(['q', 'w', 'e', 'r'][i])
    await page.waitForTimeout(150)
    after.push((await readCds(kind))[i])
    await page.waitForTimeout(300)
  }
  return after
}

await page.goto(BASE + '/?scene=hub&mute=1', { waitUntil: 'load' })
await sceneIs('hub')
await page.waitForTimeout(2000)

/* ============================== MOBA ============================== */
await goTo('moba')

// right-click move down the lane (+x)
const mobaPos = () => page.evaluate(() => {
  const p = window.__scene.hero.group.position
  return { x: p.x, z: p.z }
})
const laneClick = async (dx = 7) => {
  const pt = await page.evaluate(d => {
    const s = window.__scene
    const v = s.hero.group.position.clone()
    v.x += d; v.y = 0
    v.project(s.camera)
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }
  }, dx)
  await page.mouse.click(pt.x, pt.y, { button: 'right' })
}
const p0 = await mobaPos()
await laneClick(7)
await page.waitForTimeout(1600)
const p1 = await mobaPos()
const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z)
check('moba: right-click move', moved > 2, `moved ${moved.toFixed(1)} units`)

// cast all 4 abilities
const mobaCds = await castQWER()
check('moba: all 4 abilities cast', mobaCds.every(c => c > 0), `cds ${JSON.stringify(mobaCds)}`)

// advance until a red minion is near, then right-click attack it
let attacked = false
for (let i = 0; i < 15 && !attacked; i++) {
  const tgt = await page.evaluate(() => {
    const s = window.__scene
    const h = s.hero.group.position
    let best = null, bd = 14
    for (const e of s.army.active) {
      if (!e.alive || e.team !== 'red') continue
      const p = e.minion.group.position
      const d = Math.hypot(p.x - h.x, p.z - h.z)
      if (d < bd) { bd = d; best = p.clone() }
    }
    if (!best) return null
    best.y = 0.5
    best.project(s.camera)
    return { x: (best.x * 0.5 + 0.5) * innerWidth, y: (-best.y * 0.5 + 0.5) * innerHeight }
  })
  if (tgt && tgt.x > 20 && tgt.x < 1420 && tgt.y > 20 && tgt.y < 790) {
    await page.mouse.click(tgt.x, tgt.y, { button: 'right' })
    for (let j = 0; j < 6 && !attacked; j++) {
      await page.waitForTimeout(250)
      attacked = await page.evaluate(() => !!window.__scene.chaseTgt || (window.__scene.kills || 0) > 0)
    }
  } else {
    await laneClick(7)
    await page.waitForTimeout(2000)
  }
}
check('moba: right-click attack acquires target', attacked)
await page.screenshot({ path: 'qa/screens/flow-play-moba.png' })

// win
let before = await profile()
await page.evaluate(() => window.__scene.debug.win())
await page.waitForTimeout(600)
check('moba: win banner', (await bannerText()).includes('VICTORY'), await bannerText())
let after = await profile()
check('moba: win stat saved', (after.stats.wins.moba || 0) === (before.stats.wins.moba || 0) + 1)
await page.screenshot({ path: 'qa/screens/flow-win-moba.png' })
await sceneIs('hub')
check('moba: auto return to hub after win', true)
await page.waitForTimeout(1500)

// lose
before = await profile()
await goTo('moba', 2500)
await page.evaluate(() => window.__scene.debug.lose())
await page.waitForTimeout(600)
check('moba: lose banner', (await bannerText()).includes('DEFEAT'), await bannerText())
after = await profile()
check('moba: lose play stat saved', (after.stats.plays.moba || 0) === (before.stats.plays.moba || 0) + 1)
await page.screenshot({ path: 'qa/screens/flow-lose-moba.png' })
await sceneIs('hub')
check('moba: auto return to hub after loss', true)
await page.waitForTimeout(1500)

/* ============================== HOOPS ============================== */
await goTo('hoops')
await page.waitForFunction(() => window.__scene.debug.snapshot().phase === 'live', null, { timeout: 15000 })

// take a real shot: possession -> drive forward -> meter shot with Space
await page.evaluate(() => window.__scene.debug.give('player'))
await page.keyboard.down('w')
await page.waitForTimeout(700)
await page.keyboard.up('w')
await page.keyboard.down(' ')
await page.waitForTimeout(450)
await page.keyboard.up(' ')
const flew = await page.waitForFunction(() => window.__scene.debug.snapshot().ball === 'flight', null, { timeout: 4000 })
  .then(() => true).catch(() => false)
check('hoops: shot released (ball in flight)', flew)
await page.screenshot({ path: 'qa/screens/flow-play-hoops.png' })
const resolved = await page.waitForFunction(() => window.__scene.debug.snapshot().ball !== 'flight', null, { timeout: 8000 })
  .then(() => true).catch(() => false)
const snap = await page.evaluate(() => window.__scene.debug.snapshot())
check('hoops: shot resolved', resolved, `score ${JSON.stringify(snap.score)} ball=${snap.ball}`)

// cast all 4 abilities
const hoopsCds = await castQWER('hoops')
check('hoops: all 4 abilities cast', hoopsCds.every(c => c > 0), `cds ${JSON.stringify(hoopsCds)}`)

// win (return via RETURN TO HUB button)
before = await profile()
await page.evaluate(() => window.__scene.debug.win())
await page.waitForTimeout(600)
check('hoops: win banner', (await bannerText()).includes('VICTORY'), await bannerText())
after = await profile()
check('hoops: win stat saved', (after.stats.wins.hoops || 0) === (before.stats.wins.hoops || 0) + 1)
await page.screenshot({ path: 'qa/screens/flow-win-hoops.png' })
await page.click('.hoops-hub-btn')
await sceneIs('hub')
check('hoops: RETURN TO HUB button works', true)
await page.waitForTimeout(1500)

// lose
before = await profile()
await goTo('hoops', 2500)
await page.evaluate(() => window.__scene.debug.lose())
await page.waitForTimeout(600)
check('hoops: lose banner', (await bannerText()).includes('DEFEAT'), await bannerText())
after = await profile()
check('hoops: lose play stat saved', (after.stats.plays.hoops || 0) === (before.stats.plays.hoops || 0) + 1)
await page.screenshot({ path: 'qa/screens/flow-lose-hoops.png' })
await sceneIs('hub')
check('hoops: auto return to hub after loss', true)
await page.waitForTimeout(1500)

/* ============================== ARENA ============================== */
await goTo('arena')
await page.waitForFunction(() => window.__scene.wave >= 1, null, { timeout: 15000 })

// move + blaster through the wave start
const a0 = await page.evaluate(() => ({ x: window.__scene.hero.group.position.x, z: window.__scene.hero.group.position.z }))
await page.keyboard.down('w')
await page.keyboard.down('d')
await page.mouse.move(900, 250)
await page.mouse.down()
await page.waitForTimeout(1600)
await page.mouse.up()
await page.keyboard.up('w')
await page.keyboard.up('d')
const a1 = await page.evaluate(() => ({ x: window.__scene.hero.group.position.x, z: window.__scene.hero.group.position.z }))
const aMoved = Math.hypot(a1.x - a0.x, a1.z - a0.z)
check('arena: WASD move', aMoved > 2, `moved ${aMoved.toFixed(1)} units`)

// cast all 4 abilities
const arenaCds = await castQWER()
check('arena: all 4 abilities cast', arenaCds.every(c => c > 0), `cds ${JSON.stringify(arenaCds)}`)

// survive the wave start
await page.keyboard.down('a')
await page.waitForTimeout(2500)
await page.keyboard.up('a')
const arenaState = await page.evaluate(() => ({ hp: window.__scene.hp, over: window.__scene.over, wave: window.__scene.wave }))
check('arena: survived wave start', arenaState.hp > 0 && !arenaState.over && arenaState.wave >= 1, JSON.stringify(arenaState))
await page.screenshot({ path: 'qa/screens/flow-play-arena.png' })

// win
before = await profile()
await page.evaluate(() => window.__scene.debug.win())
await page.waitForTimeout(600)
check('arena: win banner', (await bannerText()).includes('ARENA CHAMPION'), await bannerText())
after = await profile()
check('arena: win stat saved', (after.stats.wins.arena || 0) === (before.stats.wins.arena || 0) + 1)
await page.screenshot({ path: 'qa/screens/flow-win-arena.png' })
await sceneIs('hub')
check('arena: auto return to hub after win', true)
await page.waitForTimeout(1500)

// lose (return via HUB button in the end panel)
before = await profile()
await goTo('arena', 2500)
await page.evaluate(() => window.__scene.debug.lose())
await page.waitForTimeout(600)
check('arena: lose banner', (await bannerText()).includes('DEFEATED'), await bannerText())
after = await profile()
check('arena: lose play stat saved', (after.stats.plays.arena || 0) === (before.stats.plays.arena || 0) + 1)
await page.screenshot({ path: 'qa/screens/flow-lose-arena.png' })
await page.click('.arena-end button.ghost')
await sceneIs('hub')
check('arena: HUB button works after loss', true)

console.log(results.join('\n'))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
