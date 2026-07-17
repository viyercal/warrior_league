// Action shot: move into wave 1, fire blaster, capture mid-combat frame.
// Usage: node qa/probe-arena-cam.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '7185'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${port}/?scene=arena&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(6000) // intro (≤4.5s) plays out, wave 1 ramps up
await page.keyboard.down('KeyW')
await page.mouse.move(900, 250)
await page.mouse.down()
await page.waitForTimeout(2600)
await page.keyboard.up('KeyW')
await page.keyboard.press('Digit3')
await page.waitForTimeout(450)
await page.screenshot({ path: 'qa/screens/ship-arena-action.png' })
await page.mouse.up()
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 5)) : 'none')
await browser.close()
