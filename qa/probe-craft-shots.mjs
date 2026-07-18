// Craft iteration shots: full frame + close-ups (ability bar, stat bars, hints).
// Usage: node qa/probe-craft-shots.mjs <url> <prefix> [waitMs] [hoverSlot]
import { chromium } from 'playwright-core'

const [url, prefix, waitMs = '5000', hoverSlot = ''] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(Number(waitMs))

await page.screenshot({ path: `${prefix}-full.png` })

const grab = async (sel, out, pad = 14) => {
  const el = page.locator(sel).first()
  if (!(await el.count())) return
  const b = await el.boundingBox()
  if (!b) return
  await page.screenshot({
    path: out,
    clip: {
      x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad),
      width: Math.min(1440, b.width + pad * 2), height: Math.min(810, b.height + pad * 2),
    },
  })
}
await grab('.ability-bar', `${prefix}-bar.png`, 20)
await grab('.hint-box', `${prefix}-hints.png`)
await grab('.stat-bar', `${prefix}-statbar.png`)

if (hoverSlot !== '') {
  // ability bar is click-through (pointer-events: none) — force the tip open
  await page.evaluate(i => {
    const tip = document.querySelectorAll('.ability-tip')[i]
    if (tip) { tip.style.opacity = '1'; tip.style.transform = 'translate(-50%, -6px)' }
  }, Number(hoverSlot))
  await page.waitForTimeout(300)
  const b = await page.locator('.ability-bar').boundingBox()
  if (b) {
    await page.screenshot({
      path: `${prefix}-tip.png`,
      clip: { x: Math.max(0, b.x - 40), y: Math.max(0, b.y - 240), width: Math.min(1440, b.width + 80), height: Math.min(810, b.height + 260) },
    })
  }
}
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8)) : 'none')
await browser.close()
