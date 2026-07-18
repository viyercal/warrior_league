// Craft-pass close-ups (loadout): forged gem-socket swatches, stone toggle
// plaques, shield equip slots, chamfered skill tiles, parchment tooltip,
// duel NEXT chip + footer, brass nameplate focus. IPL_PORT env selects port.
import { chromium } from 'playwright-core'

const PORT = process.env.IPL_PORT || '8382'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto(`http://localhost:${PORT}/?scene=loadout&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(3500)

// swatches + segments close-up
const secA = await page.locator('.loadout-sec').nth(0).boundingBox()
await page.screenshot({ path: 'qa/screens/craft-closeup-swatches.png', clip: secA })

// hover a swatch for the hover state
await page.locator('.loadout-swatch').nth(2).hover()
await page.waitForTimeout(300)
await page.screenshot({ path: 'qa/screens/craft-closeup-swatch-hover.png', clip: secA })

// slots + tiles close-up
const secS = await page.locator('.loadout-sec').nth(1).boundingBox()
await page.screenshot({ path: 'qa/screens/craft-closeup-tiles.png', clip: secS })

// parchment tooltip (null game: 7 minis)
await page.locator('.loadout-skill').nth(8).hover()
await page.waitForTimeout(450)
await page.screenshot({ path: 'qa/screens/craft-closeup-tip-null.png' })

// duel variant: NEXT chip + footer + hot tooltip
await page.evaluate(() => window.__ipl.sm.goTo('loadout', { game: 'duel' }))
await page.waitForTimeout(1800)
await page.locator('.loadout-skill').nth(0).hover()
await page.waitForTimeout(450)
await page.screenshot({ path: 'qa/screens/craft-closeup-duel.png' })

// name input focus state
await page.locator('.loadout-name').click()
await page.waitForTimeout(300)
const head = await page.locator('.loadout-head').boundingBox()
await page.screenshot({ path: 'qa/screens/craft-closeup-name-focus.png', clip: head })

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
