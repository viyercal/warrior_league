// Sigil contact sheet: renders every ICONS entry at 16 / 24 / 48px on iron
// and parchment cards so legibility + style consistency can be judged fast.
// Usage: IPL_PORT=8381 node qa/probe-craft-sheet.mjs [out.png]
import { chromium } from 'playwright-core'

const out = process.argv[2] || 'qa/screens/craft/sheet.png'
const BASE = `http://localhost:${process.env.IPL_PORT || '8381'}`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
await page.goto(`${BASE}/?scene=hub&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(1200)

await page.evaluate(async () => {
  const { ICONS, icon } = await import('/src/ui/craft.js')
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#14100c;overflow:auto;padding:18px;display:grid;grid-template-columns:repeat(6,1fr);gap:10px;font-family:Georgia,serif'
  for (const name of Object.keys(ICONS)) {
    const card = document.createElement('div')
    card.style.cssText = 'background:#26221c;padding:10px 8px;text-align:center;color:#e8dcc4'
    card.innerHTML =
      `<div style="font-size:10px;letter-spacing:.12em;margin-bottom:6px;color:#a8987e">${name.toUpperCase()}</div>` +
      `<div style="display:flex;gap:12px;align-items:center;justify-content:center;color:#ffb84d">` +
      `${icon(name, { size: 16 })}${icon(name, { size: 24 })}${icon(name, { size: 48 })}</div>` +
      `<div style="margin-top:8px;background:#d3c19a;color:#52412c;padding:5px;display:flex;gap:12px;align-items:center;justify-content:center">` +
      `${icon(name, { size: 16 })}${icon(name, { size: 32 })}</div>`
    host.appendChild(card)
  }
  document.body.appendChild(host)
})
await page.waitForTimeout(300)
await page.screenshot({ path: out, fullPage: false })
console.log('sheet ->', out)
await browser.close()
