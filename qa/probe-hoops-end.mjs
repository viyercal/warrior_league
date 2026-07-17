// BLOOD COURT end-state probe: BOTH win and lose show a banner + the duel-style
// stats panel (points by type, shooting %, steals/blocks, longest run, favorite
// art), save stats, and return to the hub (auto after 8s AND via the button).
// node qa/probe-hoops-end.mjs [base=http://localhost:5184]
import { chromium } from 'playwright-core'

const base = process.argv[2] || 'http://localhost:5184'
const errors = []
const fails = []
const ok = (cond, label) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + label)
  if (!cond) fails.push(label)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function open() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`${base}/?scene=hoops&mute=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__scene?.game?.phase === 'live', null, { timeout: 20000 })
  return page
}
const wins = page => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('ipl-profile-v2')).stats.wins.hoops || 0))

const STAT_ROWS = ['2-POINTERS', '3-POINTERS', 'DUNKS', 'SHOOTING', 'STEALS', 'BLOCKS', 'LONGEST RUN', 'FAVORITE ART']
async function checkStatsPanel(page, label) {
  ok(await page.evaluate(() => !!document.querySelector('.hoops-panel')), `stats panel appears on ${label}`)
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.hoops-panel-row .k')].map(e => e.textContent))
  ok(STAT_ROWS.every(k => rows.includes(k)), `stats panel rows complete on ${label} (${rows.join(', ')})`)
  ok(await page.evaluate(() => !!document.querySelector('.hoops-panel .hoops-hub-btn')),
    `RETURN TO HUB button lives inside the ${label} panel`)
}

/* ---------------- WIN: banner + stat save + auto-return ---------------- */
{
  const page = await open()
  const w0 = await wins(page)
  await page.evaluate(() => window.__scene.debug.win())
  await page.waitForTimeout(700)
  const banner = await page.evaluate(() => document.querySelector('.banner-main')?.textContent || '')
  ok(banner === 'VICTORY', `win banner shows (got "${banner}")`)
  ok(await page.evaluate(() => !!document.querySelector('.hoops-hub-btn')), 'RETURN TO HUB button present on win')
  await checkStatsPanel(page, 'win')
  const w1 = await wins(page)
  ok(w1 === w0 + 1, `win increments stats.wins.hoops (${w0} -> ${w1})`)
  const ended = await page.evaluate(() => window.__scene.debug.snapshot().phase)
  ok(ended === 'end', 'game phase = end after win')
  await page.waitForTimeout(1600) // confetti + dancing hero + orbit cam
  await page.screenshot({ path: 'qa/screens/hoops-fin-victory.png' })
  const auto = await page.waitForFunction(
    () => window.__ipl.sm.currentName === 'hub', null, { timeout: 10000 },
  ).then(() => true).catch(() => false)
  ok(auto, 'auto-returns to hub ~8s after win')
  await page.close()
}

/* ---------------- LOSE: banner + no stat bump + button returns ---------------- */
{
  const page = await open()
  const w0 = await wins(page)
  await page.evaluate(() => window.__scene.debug.lose())
  await page.waitForTimeout(700)
  const banner = await page.evaluate(() => document.querySelector('.banner-main')?.textContent || '')
  ok(banner === 'DEFEAT', `lose banner shows (got "${banner}")`)
  const w1 = await wins(page)
  ok(w1 === w0, 'lose does not increment wins')
  await checkStatsPanel(page, 'defeat')
  await page.screenshot({ path: 'qa/screens/hoops-fin-defeat.png' })
  await page.locator('.hoops-hub-btn').click()
  const back = await page.waitForFunction(
    () => window.__ipl.sm.currentName === 'hub', null, { timeout: 6000 },
  ).then(() => true).catch(() => false)
  ok(back, 'RETURN TO HUB button works after defeat')
  await page.close()
}

console.log('CONSOLE ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8)) : 'none')
await browser.close()
if (errors.length || fails.length) process.exit(1)
