import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.IPL_BASE || 'http://127.0.0.1:5299'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
const errors = []
const check = (name, ok) => {
  results.push({ name, ok })
  console.log(ok ? 'PASS' : 'FAIL', name)
  if (!ok) process.exitCode = 1
}
await mkdir('qa/screens/immersive', { recursive: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  page.on('pageerror', e => errors.push(String(e)))
  for (const game of ['moba', 'duel']) {
    await page.goto(`${base}/?scene=${game}&mute=1`)
    await page.waitForFunction(name => window.__ipl?.sm.currentName === name && !window.__ipl.sm._busy, game)
    await page.locator('#boot').waitFor({ state: 'detached' })
    await page.waitForTimeout(6500)
    const pause = page.getByRole('button', { name: 'Pause and settings (P)', exact: true })
    const bounds = await pause.boundingBox()
    const abilityBounds=await page.locator('.ability-bar').boundingBox()
    check(`${game} pause clears the lower combat HUD`, bounds.x>abilityBounds.x+abilityBounds.width&&bounds.y+bounds.height<=900)
    await page.screenshot({ path: `qa/screens/immersive/${game}-final.png` })
    await pause.click()
    check(`${game} relocated pause button opens menu`, await page.locator('.session-overlay').isVisible())
    await page.getByRole('button', { name: 'Return to battle', exact: false }).click()
    check(`${game} resume releases pause`, await page.evaluate(() => !window.__ipl.engine.paused))
  }
  await page.keyboard.press('Escape')
  await page.locator('[data-action="hub"]').click()
  await page.waitForFunction(() => window.__ipl?.sm.currentName === 'hub' && !window.__ipl.sm._busy)
  check('inactive loading overlay is hidden from keyboard and assistive technology', await page.locator('#fader').evaluate(el => el.inert && el.getAttribute('aria-hidden') === 'true'))
  await page.locator('#app canvas').focus()
  let allNumeric = true
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press(`Digit${i + 1}`)
    allNumeric &&= await page.locator('.realm-card').nth(i).getAttribute('aria-pressed') === 'true'
  }
  check('all seven numeric hub shortcuts select realms', allNumeric)
  await page.keyboard.press('h')
  const guideOpened = await page.locator('.realm-guide').isVisible()
  await page.keyboard.press('h')
  check('H opens and closes hub instructions', guideOpened && !await page.locator('.realm-guide').isVisible())
  await page.keyboard.press('c')
  await page.waitForFunction(() => window.__ipl?.sm.currentName === 'loadout' && !window.__ipl.sm._busy)
  check('C opens the forge', await page.locator('.loadout-go').isVisible())
  await page.mouse.move(300, 380)
  await page.mouse.down()
  await page.mouse.move(450, 380, { steps: 6 })
  check('forge turntable responds to dragging', await page.evaluate(() => window.__scene._dragging && Math.abs(window.__scene._spin) > 0))
  await page.evaluate(() => dispatchEvent(new Event('blur')))
  check('forge releases drag when focus is lost', await page.evaluate(() => !window.__scene._dragging))
  await page.mouse.up()
  await page.locator('#app canvas').focus()
  await page.keyboard.press('p')
  check('P toggles the forge dance', await page.locator('.loadout-dance').getAttribute('aria-pressed') === 'true')
  check('final combat checks have no page errors', errors.length === 0)
  await page.close()

  const unavailable = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await unavailable.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /webgl/i.test(kind) ? null : getContext.call(this, kind, ...args)
    }
  })
  await unavailable.goto(base)
  const retry = unavailable.getByRole('button', { name: 'TRY AGAIN', exact: true })
  await retry.waitFor({ state: 'visible' })
  check('unavailable WebGL explains startup failure', await unavailable.locator('#bootStatus').innerText().then(t => t.includes('WebGL')))
  const before = await unavailable.evaluate(() => performance.timeOrigin)
  await retry.click()
  await unavailable.waitForFunction(origin => performance.timeOrigin > origin, before)
  await retry.waitFor({ state: 'visible' })
  check('startup Try again reloads and remains recoverable', await retry.isEnabled())
  await unavailable.screenshot({ path: 'qa/screens/immersive/startup-unavailable.png' })
} catch (error) {
  check('final probe completed', false)
  console.error(error)
} finally {
  await writeFile('qa/screens/immersive/final-results.json', JSON.stringify({ results, errors }, null, 2))
  await browser.close()
}
