// Screenshot probe: node shot.mjs <url> <outfile> [waitMs]
import { chromium } from 'playwright-core'

const [url, out, waitMs = '3500'] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(Number(waitMs))
await page.screenshot({ path: out })
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
