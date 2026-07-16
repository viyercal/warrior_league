// Loadout action probe: capture the hero-rebuild VFX (flash + burst + ring) mid-flight.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto('http://localhost:5182/?scene=loadout&mute=1', { waitUntil: 'load' })
await page.waitForTimeout(3800)

// pick a violet primary + gold glow, then screenshot ~120ms after the swap VFX fires
await page.locator('.loadout-swatch').nth(6).click() // primary violet
await page.waitForTimeout(500)
await page.evaluate(() => window.__scene.debug.setAppearance({ glow: '#ffd166' }))
await page.waitForTimeout(120)
await page.screenshot({ path: 'qa/screens/loadout-action.png' })

const vfxAlive = await page.evaluate(() => window.__scene.vfx.items.size)
await page.waitForTimeout(1500)
const heroGlow = await page.evaluate(() => window.__scene.hero.appearance.glow)
console.log(JSON.stringify({ vfxAlive, heroGlow }))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
