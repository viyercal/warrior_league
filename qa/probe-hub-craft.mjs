// Craft-pass close-ups (hub): forged player chip + iron sigil tags, engraved
// bronze logo lockup, carved channel plates, flagship double-ring plaque
// idle/hot. IPL_PORT env selects port.
import { chromium } from 'playwright-core'

const PORT = process.env.IPL_PORT || '8382'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto(`http://localhost:${PORT}/?scene=hub&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(3500)
await page.waitForFunction(() => window.__scene?.channels?.length === 7, { timeout: 15000 })

// player chip + logo
const chip = await page.locator('.hub-player').boundingBox()
await page.screenshot({ path: 'qa/screens/craft-hub-chip.png', clip: { x: chip.x - 12, y: chip.y - 10, width: chip.width + 24, height: chip.height + 20 } })
const logo = await page.locator('.hub-logo').boundingBox()
await page.screenshot({ path: 'qa/screens/craft-hub-logo.png', clip: { x: logo.x - 10, y: logo.y - 8, width: logo.width + 20, height: logo.height + 16 } })

// flagship plate idle
const flag = await page.locator('.hub-plate-flag').boundingBox()
await page.screenshot({ path: 'qa/screens/craft-hub-flag-idle.png', clip: { x: flag.x - 20, y: flag.y - 12, width: flag.width + 40, height: flag.height + 24 } })

// focus the crucible (hot) via keyboard, and a regular plate hot
await page.keyboard.press('Digit7')
await page.waitForTimeout(500)
const flag2 = await page.locator('.hub-plate-flag').boundingBox()
await page.screenshot({ path: 'qa/screens/craft-hub-flag-hot.png', clip: { x: flag2.x - 20, y: flag2.y - 16, width: flag2.width + 40, height: flag2.height + 30 } })
await page.keyboard.press('Digit1')
await page.waitForTimeout(500)
const p0 = await page.locator('.hub-plate').nth(0).boundingBox()
await page.screenshot({ path: 'qa/screens/craft-hub-plate-hot.png', clip: { x: p0.x - 16, y: p0.y - 14, width: p0.width + 32, height: p0.height + 26 } })

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
