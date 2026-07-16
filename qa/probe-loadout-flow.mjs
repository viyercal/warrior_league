// Loadout flow probe: drag-to-spin inertia, BACK nav, pre-game variant (params.game), ENTER nav.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto('http://localhost:5182/?scene=loadout&mute=1', { waitUntil: 'load' })
await page.waitForTimeout(3800)

const results = {}

// --- drag to spin (left half) ---
const rotBefore = await page.evaluate(() => window.__scene.stage.turntable.rotation.y)
await page.mouse.move(300, 400)
await page.mouse.down()
for (let i = 0; i < 12; i++) {
  await page.mouse.move(300 + i * 28, 400, { steps: 2 })
  await page.waitForTimeout(16)
}
await page.screenshot({ path: 'qa/screens/loadout-drag.png' })
await page.mouse.up()
const rotAfterDrag = await page.evaluate(() => window.__scene.stage.turntable.rotation.y)
await page.waitForTimeout(700) // inertia should keep it spinning
const rotAfterCoast = await page.evaluate(() => window.__scene.stage.turntable.rotation.y)
results.dragDelta = +(rotAfterDrag - rotBefore).toFixed(3)
results.coastDelta = +(rotAfterCoast - rotAfterDrag).toFixed(3)

// --- BACK -> hub ---
await page.locator('.loadout-back').click()
await page.waitForTimeout(1400)
results.afterBack = await page.evaluate(() => window.__ipl.sm.currentName)

// --- pre-game variant: loadout with params.game = 'moba' ---
await page.evaluate(() => window.__ipl.sm.goTo('loadout', { game: 'moba' }))
await page.waitForTimeout(1600)
results.nextStrip = await page.evaluate(() => document.querySelector('.loadout-next')?.innerText || null)
results.goLabel = await page.evaluate(() => document.querySelector('.loadout-go')?.innerText || null)
// tooltip should highlight the moba line
await page.locator('.loadout-skill').nth(2).hover()
await page.waitForTimeout(400)
results.tipHot = await page.evaluate(() => document.querySelector('.loadout-tip-game.hot b')?.innerText || null)
results.tipDimCount = await page.evaluate(() => document.querySelectorAll('.loadout-tip-game.dim').length)
await page.screenshot({ path: 'qa/screens/loadout-moba.png' })

// --- ENTER game ---
await page.locator('.loadout-go').click()
await page.waitForTimeout(1600)
results.afterEnter = await page.evaluate(() => window.__ipl.sm.currentName)

console.log(JSON.stringify(results, null, 1))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
