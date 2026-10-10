import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.CPU_URL || 'http://127.0.0.1:5302'
const suffix = base.endsWith('5303') ? '-production' : ''
const dir = 'qa/screens/cpu'
await mkdir(dir, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = [], checks = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
const check = (name, ok, details) => {
  checks.push({ name, ok: !!ok, details })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${details ? ` ${JSON.stringify(details)}` : ''}`)
}
const state = () => page.evaluate(() => ({ level: __ipl.sm.profile.cpuLevel, mode: __ipl.sm.profile.duelMode, scene: __ipl.sm.currentName }))
const ready = async name => {
  await page.waitForFunction(name => window.__ipl?.sm.currentName === name && !__ipl.sm._busy, name, { timeout: 30000 })
  await page.locator('#boot').waitFor({ state: 'detached' })
}
const shot = name => page.screenshot({ path: `${dir}/${name}${suffix}.png` })
try {
  await page.goto(`${base}/?scene=hub&mute=1`)
  await ready('hub')
  await page.locator('#boot').waitFor({ state: 'detached' })
  check('new profile defaults to level 6 and Tower', (await state()).level === 6 && (await state()).mode === 'tower')
  await page.locator('[data-realm="duel"]').click()
  check('Tower selected without CPU controls', await page.locator('[data-mode="tower"]').getAttribute('aria-pressed') === 'true' && !await page.locator('.realm-hub .cpu-difficulty').isVisible())
  await shot('tower-desktop')
  await page.getByRole('button', { name: 'Single Duel', exact: true }).click()
  check('Single Duel exposes CPU selector', await page.locator('.realm-hub .cpu-difficulty').isVisible())
  for (let n = 1; n <= 10; n++) {
    await page.locator(`.realm-hub input[value="${n}"]`).check()
    const s = await state()
    check(`level ${n} radio changes saved profile`, s.level === n && await page.locator('.realm-hub .cpu-value').textContent().then(t => t.startsWith(`${n} / 10`)))
  }
  await page.locator('.realm-hub input[value="10"]').press('ArrowLeft')
  check('native arrow key changes level without realm navigation', (await state()).level === 9 && await page.locator('[data-realm="duel"]').getAttribute('aria-pressed') === 'true')
  await page.reload()
  await ready('hub')
  // Last realm is saved on launch, so select again after reload.
  await page.locator('[data-realm="duel"]').click()
  check('level and Single Duel persist after reload', (await state()).level === 9 && (await state()).mode === 'single' && await page.locator('.realm-hub input[value="9"]').isChecked())
  for (const [width, height] of [[1440, 1000], [1440, 900], [1440, 810], [1280, 720], [900, 800], [390, 844]]) {
    await page.setViewportSize({ width, height })
    await page.locator('.realm-hub input[value="6"]').check()
    await page.locator('.realm-feature').evaluate(el => el.scrollTop = 0)
    await page.locator('.realm-hub').evaluate(el => el.scrollTop = 0)
    await shot(`single-${width}-${height}`)
    check(`battle button visible before scrolling at ${width}x${height}`, await page.locator('.realm-play').evaluate(el => {
      const r = el.getBoundingClientRect(), parent = el.closest('.realm-feature').getBoundingClientRect()
      return r.top >= 0 && r.bottom <= Math.min(innerHeight, parent.bottom)
    }))
    await page.getByRole('button', { name: 'How to play', exact: true }).click()
    await page.locator('.realm-guide').scrollIntoViewIfNeeded()
    const guide = await page.locator('.realm-guide').evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height, parentBottom: el.parentElement.getBoundingClientRect().bottom } })
    check(`guide visible and fits at ${width}x${height}`, guide.width <= width && guide.top >= 0 && guide.bottom <= height + 1, guide)
    await shot(`guide-${width}-${height}`)
    await page.getByRole('button', { name: 'Hide controls', exact: true }).click()
    await page.getByRole('button', { name: 'ENTER BATTLE', exact: true }).scrollIntoViewIfNeeded()
    check(`battle button reachable at ${width}x${height}`, await page.getByRole('button', { name: 'ENTER BATTLE', exact: true }).isVisible())
    check(`no horizontal hub overflow at ${width}x${height}`, await page.locator('.realm-hub').evaluate(el => el.scrollWidth <= el.clientWidth + 1))
  }
  await page.setViewportSize({ width: 1440, height: 810 })
  await page.getByRole('button', { name: 'Tower', exact: true }).click()
  check('Tower hides selector and explains progression', !await page.locator('.realm-hub .cpu-difficulty').isVisible() && await page.locator('.cpu-tower-note').isVisible())
  await page.locator('[data-realm="brawl"]').click()
  check('Brawl shares saved level without duel-mode toggle', await page.locator('.realm-hub input[value="6"]').isChecked() && !await page.locator('.cpu-mode').isVisible())
  await shot('brawl-desktop')
  for (const game of ['moba', 'hoops', 'arena', 'kart', 'siege']) {
    await page.locator(`[data-realm="${game}"]`).click()
    check(`${game} has no CPU match options`, !await page.locator('.cpu-match-options').isVisible())
  }
} catch (error) {
  check('probe completed', false, String(error))
  await shot('failure').catch(() => {})
} finally {
  check('no browser errors', errors.length === 0, errors)
  await writeFile(`docs/cpu-ui-results${suffix}.json`, JSON.stringify({ base, time: new Date().toISOString(), checks, errors }, null, 2) + '\n')
  await browser.close()
}
process.exitCode = checks.some(c => !c.ok) ? 1 : 0
