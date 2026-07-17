// Duel probe: tower flow — winFight advances to the next opponent's intro,
// defeat -> RETRY keeps the stage, debug.win -> champion + stats + hub return,
// debug.lose -> defeat panel + abandon to hub.
import { chromium } from 'playwright-core'

const port = process.env.IPL_PORT || '8181'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
let pass = 0, fail = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
  ok ? pass++ : fail++
}

// ---------- session 1: winFight tower climb + boss entrance + defeat/retry ----------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/?scene=duel&mute=1`, { waitUntil: 'load' })
  await page.waitForTimeout(2600)
  await page.keyboard.press('x')
  await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })
  const s0 = await page.evaluate(() => ({ stage: window.__scene.stage, foe: window.__scene.foe.name, plays: window.__ipl.sm.profile.stats.plays.duel }))
  check('fight 1 vs ASHBORN', s0.stage === 0 && s0.foe === 'ASHBORN', JSON.stringify(s0))
  check('plays.duel incremented', s0.plays >= 1, `plays=${s0.plays}`)

  // winFight -> next opponent intro (cinematic walk-in), stage 1
  await page.evaluate(() => window.__scene.debug.winFight())
  await page.waitForTimeout(3200)
  const s1 = await page.evaluate(() => ({ stage: window.__scene.stage, foe: window.__scene.foe.name, phase: window.__scene.phase }))
  check('winFight -> SERA intro', s1.stage === 1 && s1.foe === 'SERA THE COLD' && (s1.phase === 'cine' || s1.phase === 'plates'), JSON.stringify(s1))
  await page.screenshot({ path: 'qa/screens/duel-tower-intro2.png' })
  await page.keyboard.press('x')
  await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })

  // climb to the boss — verify boss entrance + red braziers
  await page.evaluate(() => window.__scene.debug.winFight())
  await page.waitForTimeout(2600)
  await page.keyboard.press('x')
  await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })
  await page.evaluate(() => window.__scene.debug.winFight())
  await page.waitForTimeout(2600)
  const boss = await page.evaluate(() => ({ stage: window.__scene.stage, foe: window.__scene.foe.name, phase: window.__scene.phase }))
  check('boss fight reached', boss.stage === 3 && boss.foe === 'THE ETERNAL', JSON.stringify(boss))
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'qa/screens/duel-tower-boss-entrance.png' })
  await page.keyboard.press('x')
  await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 25000 })

  // lose the boss fight -> DEFEATED panel; RETRY keeps stage 3
  await page.evaluate(() => window.__scene.debug.lose())
  await page.waitForTimeout(1200)
  const d = await page.evaluate(() => ({
    phase: window.__scene.phase,
    panel: !!document.querySelector('.duel-panel'),
    retry: [...document.querySelectorAll('.duel-btn')].some(b => b.textContent.includes('RETRY')),
    abandon: [...document.querySelectorAll('.duel-btn')].some(b => b.textContent.includes('ABANDON')),
  }))
  check('DEFEATED panel with RETRY + ABANDON', d.phase === 'defeated' && d.panel && d.retry && d.abandon, JSON.stringify(d))
  await page.screenshot({ path: 'qa/screens/duel-tower-defeated.png' })
  await page.click('.duel-btn') // RETRY THIS FOE
  await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })
  const r = await page.evaluate(() => ({ stage: window.__scene.stage, foe: window.__scene.foe.name, hp: window.__scene.player.hp }))
  check('RETRY keeps tower stage', r.stage === 3 && r.foe === 'THE ETERNAL' && r.hp === 100, JSON.stringify(r))

  // debug.win -> champion flow: banner + stats + panel + auto-hub
  const winsBefore = await page.evaluate(() => window.__ipl.sm.profile.stats.wins.duel || 0)
  await page.evaluate(() => window.__scene.debug.win())
  await page.waitForTimeout(900)
  const c = await page.evaluate(() => ({
    phase: window.__scene.phase,
    banner: [...document.querySelectorAll('.banner-main')].some(b => b.textContent.includes('CRUCIBLE CHAMPION')),
    wins: window.__ipl.sm.profile.stats.wins.duel || 0,
    stored: JSON.parse(localStorage.getItem('ipl-profile-v2')).stats.wins.duel || 0,
    panel: !!document.querySelector('.duel-panel'),
  }))
  check('CHAMPION banner + panel', c.phase === 'champion' && c.banner && c.panel, JSON.stringify({ phase: c.phase, banner: c.banner }))
  check('wins.duel saved', c.wins === winsBefore + 1 && c.stored === c.wins, `wins ${winsBefore} -> ${c.wins} (stored ${c.stored})`)
  await page.screenshot({ path: 'qa/screens/duel-tower-champion.png' })
  await page.waitForFunction(() => window.__ipl.sm.currentName === 'hub', null, { timeout: 12000 })
  check('auto return to hub (8s)', true)
  await page.close()
}

// ---------- session 2: debug.lose -> ABANDON goes to hub ----------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/?scene=duel&mute=1`, { waitUntil: 'load' })
  await page.waitForTimeout(2600)
  await page.keyboard.press('x')
  await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })
  await page.evaluate(() => window.__scene.debug.lose())
  await page.waitForTimeout(900)
  const btns = await page.evaluate(() => [...document.querySelectorAll('.duel-btn')].map(b => b.textContent))
  await page.evaluate(() => { [...document.querySelectorAll('.duel-btn')].find(b => b.textContent.includes('ABANDON')).click() })
  await page.waitForFunction(() => window.__ipl.sm.currentName === 'hub', null, { timeout: 8000 })
  check('ABANDON TOWER returns to hub', true, JSON.stringify(btns))
  await page.close()
}

console.log(`RESULT: ${pass} passed, ${fail} failed`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
process.exit(fail || errors.length ? 1 : 0)
