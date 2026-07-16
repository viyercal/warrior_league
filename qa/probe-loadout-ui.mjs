// Loadout UI probe: appearance changes, equip/swap, tooltip, dance, profile persistence.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto('http://localhost:5182/?scene=loadout&mute=1', { waitUntil: 'load' })
await page.waitForTimeout(3800)

const results = {}

// --- name input ---
await page.locator('.loadout-name').fill('vex marauder')
// --- appearance: primary -> red, head -> orb, hair -> horns, trail -> ribbon ---
await page.locator('.loadout-swatch').nth(1).click()
await page.waitForTimeout(250)
await page.locator('.loadout-seg-btn', { hasText: 'ORB' }).click()
await page.waitForTimeout(250)
await page.locator('.loadout-seg-btn', { hasText: 'HORNS' }).click()
await page.waitForTimeout(250)
await page.locator('.loadout-seg-btn', { hasText: 'RIBBON' }).click()
await page.waitForTimeout(400)

// --- skill equip: select slot W (index 1), click Gravity Well (grid index 8) ---
await page.locator('.loadout-slot').nth(1).click()
await page.locator('.loadout-skill').nth(8).click()
await page.waitForTimeout(200)
// --- swap: select slot Q (0), click Starfire Bolt (grid 1, currently unequipped after W change? it's in W? no: W had starfire; we replaced W with gravity, so starfire unequipped) ---
// equip starfire into Q -> Q was blink; starfire not equipped now, so simple assign
await page.locator('.loadout-slot').nth(0).click()
await page.locator('.loadout-skill').nth(1).click()
await page.waitForTimeout(200)
// --- swap test: active slot auto-advanced to W; click Blink Step? blink no longer equipped (Q overwritten). Equip blink into W, then swap comet (R) with W ---
await page.locator('.loadout-slot').nth(1).click()
await page.locator('.loadout-skill').nth(0).click() // blink -> W
await page.waitForTimeout(200)
await page.locator('.loadout-slot').nth(1).click()
await page.locator('.loadout-skill').nth(11).click() // comet already in R -> should SWAP W<->R
await page.waitForTimeout(300)

results.profile = await page.evaluate(() => JSON.parse(localStorage.getItem('ipl-profile-v2')))
results.heroAppearance = await page.evaluate(() => window.__scene.hero.appearance)

// --- tooltip on hover ---
await page.locator('.loadout-skill').nth(8).hover()
await page.waitForTimeout(400)
results.tipVisible = await page.evaluate(() => {
  const t = document.querySelector('.loadout-tip')
  return t.classList.contains('on') && t.innerText.includes('RIFT LEGENDS') && t.innerText.includes('NOVA ARENA')
})
await page.screenshot({ path: 'qa/screens/loadout-tooltip.png' })

// --- dance via P key ---
await page.mouse.move(500, 400)
await page.keyboard.press('KeyP')
await page.waitForTimeout(900)
results.dancing = await page.evaluate(() => window.__scene.hero.state)
await page.screenshot({ path: 'qa/screens/loadout-dance.png' })

// --- typing in name must NOT trigger dance ---
await page.keyboard.press('KeyP') // stop dance
await page.waitForTimeout(200)
await page.locator('.loadout-name').fill('')
await page.locator('.loadout-name').pressSequentially('pip', { delay: 40 })
await page.waitForTimeout(300)
results.stateAfterTyping = await page.evaluate(() => window.__scene.hero.state)
results.nameAfterTyping = await page.evaluate(() => JSON.parse(localStorage.getItem('ipl-profile-v2')).name)

console.log(JSON.stringify(results, null, 1))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
