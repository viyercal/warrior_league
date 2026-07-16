// Diagnostic: close-up of the hero to verify facing/lighting.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${process.env.IPL_PORT || '5189'}/?scene=hub&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(3500)
const info = await page.evaluate(() => {
  const s = window.__scene
  s._updateCamera = () => {
    s.camera.position.set(0.5, 1.8, 7.5)
    s.camera.lookAt(0, 1.1, 3.45)
  }
  return { heroYaw: s.hero.group.rotation.y, focus: s.focusIdx }
})
console.log('INFO:', JSON.stringify(info))
await page.waitForTimeout(600)
await page.screenshot({ path: 'qa/screens/hub-hero-closeup.png' })
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10)) : 'none')
await browser.close()
