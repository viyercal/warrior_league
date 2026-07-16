// Loadout stress probe: rapid appearance swaps must not leak GPU resources or error.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto('http://localhost:5182/?scene=loadout&mute=1', { waitUntil: 'load' })
await page.waitForTimeout(3800)

const memBefore = await page.evaluate(() => ({ ...window.__ipl.engine.renderer.info.memory }))
for (let i = 0; i < 6; i++) {
  await page.locator('.loadout-swatch').nth(i).click()
  await page.waitForTimeout(90)
  await page.locator('.loadout-swatch').nth(8 + i).click()
  await page.waitForTimeout(90)
  await page.locator('.loadout-seg-btn').nth(i % 3).click()
  await page.waitForTimeout(90)
}
await page.waitForTimeout(1500) // let transient VFX die
const memAfter = await page.evaluate(() => ({ ...window.__ipl.engine.renderer.info.memory }))
const fps = await page.evaluate(() => new Promise(res => {
  let frames = 0
  const t0 = performance.now()
  const loop = () => { frames++; performance.now() - t0 < 1000 ? requestAnimationFrame(loop) : res(frames) }
  requestAnimationFrame(loop)
}))

console.log(JSON.stringify({ memBefore, memAfter, fps }))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
