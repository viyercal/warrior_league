// Kart end-state probe: debug.win + debug.lose — banner, stats saved,
// finish panel, RETURN TO HUB button, R restart, 8s auto-return to hub.
// node qa/probe-kart-end.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5186'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
const errors = []
const check = (name, ok, detail = '') => {
  results.push([name, ok, detail])
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const newPage = async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/?scene=kart&mute=1`, { waitUntil: 'load' })
  await page.waitForTimeout(5600)
  return page
}
const stats = page => page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem('ipl-profile-v2'))
  return { wins: p.stats.wins.kart || 0, plays: p.stats.plays.kart || 0 }
})

/* ---------------- WIN path + auto-return ---------------- */
{
  const page = await newPage()
  const s0 = await stats(page)
  await page.evaluate(() => window.__scene.debug.win())
  await page.waitForTimeout(700)
  const banner = await page.evaluate(() => document.querySelector('.banner-main')?.textContent)
  check('win: VICTORY banner', banner === 'VICTORY!', `banner="${banner}"`)
  await page.screenshot({ path: 'qa/screens/kart-end-win.png' })
  const s1 = await stats(page)
  check('win: stats.wins.kart +1 saved', s1.wins === s0.wins + 1, `${s0.wins} -> ${s1.wins}`)
  check('win: stats.plays.kart counted', s1.plays >= s0.plays && s1.plays > 0, `plays=${s1.plays}`)
  await page.waitForTimeout(1200)
  const panel = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.kart-finish-row')]
    const btns = [...document.querySelectorAll('.kart-finish-btns button')].map(b => b.textContent)
    const you = document.querySelector('.kart-finish-row.you b')?.textContent
    return { rows: rows.length, btns, you }
  })
  check('win: finish panel 6 rows, player 1ST', panel.rows === 6 && panel.you === '1ST', JSON.stringify(panel))
  check('win: RETURN TO HUB button present', panel.btns.includes('RETURN TO HUB'), panel.btns.join('|'))
  await page.screenshot({ path: 'qa/screens/kart-end-win-panel.png' })
  // 8s auto-return (timer started at debug.win)
  await page.waitForTimeout(7000)
  const scene = await page.evaluate(() => window.__ipl.sm.currentName)
  check('win: 8s auto-return to hub', scene === 'hub', `scene=${scene}`)
  await page.close()
}

/* ---------------- LOSE path + hub button ---------------- */
{
  const page = await newPage()
  const s0 = await stats(page)
  await page.evaluate(() => window.__scene.debug.lose())
  await page.waitForTimeout(700)
  const banner = await page.evaluate(() => document.querySelector('.banner-main')?.textContent)
  check('lose: FINISHED Nth banner', /^FINISHED \d(ST|ND|RD|TH)\/6$/.test(banner || ''), `banner="${banner}"`)
  const s1 = await stats(page)
  check('lose: no win recorded, play counted', s1.wins === s0.wins && s1.plays > 0, `wins ${s0.wins}->${s1.wins}`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'qa/screens/kart-end-lose-panel.png' })
  const notFirst = await page.evaluate(() => document.querySelector('.kart-finish-row.you b')?.textContent)
  check('lose: player row not 1ST', !!notFirst && notFirst !== '1ST', `you=${notFirst}`)
  // RETURN TO HUB button click
  await page.click('.kart-finish-btns button:first-child')
  await page.waitForTimeout(1500)
  const scene = await page.evaluate(() => window.__ipl.sm.currentName)
  check('lose: RETURN TO HUB button works', scene === 'hub', `scene=${scene}`)
  await page.close()
}

/* ---------------- R restart after finish ---------------- */
{
  const page = await newPage()
  await page.evaluate(() => window.__scene.debug.lose())
  await page.waitForTimeout(1800)
  await page.keyboard.press('r')
  await page.waitForTimeout(1600)
  const st = await page.evaluate(() => ({
    scene: window.__ipl.sm.currentName,
    over: window.__scene.over,
    clock: window.__scene.clock,
  }))
  check('R after finish restarts race', st.scene === 'kart' && !st.over && st.clock < 3, JSON.stringify(st))
  // during a fresh race R must NOT restart (it is the slot-4 skill alias)
  await page.waitForTimeout(4200) // countdown done
  await page.keyboard.down('w')
  await page.waitForTimeout(800)
  const clock0 = await page.evaluate(() => window.__scene.clock)
  await page.keyboard.press('r')
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => ({ clock: window.__scene.clock, cd4: window.__scene.cds[3] }))
  check('R mid-race = skill alias (no restart)', after.clock > clock0 && after.cd4 > 0, `clock ${clock0.toFixed(1)}->${after.clock.toFixed(1)} cd4=${after.cd4.toFixed(1)}`)
  await page.close()
}

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none')
const fails = results.filter(r => !r[1]).length
console.log(`SUMMARY: ${results.length - fails}/${results.length} passed`)
await browser.close()
process.exit(fails || errors.length ? 1 : 0)
