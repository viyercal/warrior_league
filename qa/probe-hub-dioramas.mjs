// Close-up beauty shots of the three NEW dioramas (siege, kart, brawl) by
// parking the camera in front of each frame via the debug camera override.
import { chromium } from 'playwright-core'

const PORT = process.env.IPL_PORT || '5189'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${PORT}/?scene=hub&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(3500)

const names = { 3: 'siege', 4: 'kart', 5: 'brawl' }
for (const [idx, name] of Object.entries(names)) {
  await page.evaluate(i => {
    const s = window.__scene
    const ch = s.channels[i]
    s.debug.focus(i)
    s._updateCamera = () => {
      s.camera.position.copy(ch.center).addScaledVector(ch.normal, 2.35)
      s.camera.position.y += 0.1
      s.camera.lookAt(ch.center)
    }
    for (const p of s.plates) p.style.display = 'none'
    s._updatePlates = () => {}
  }, Number(idx))
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `qa/screens/meta6-diorama-${name}.png` })
  console.log(`SHOT: qa/screens/meta6-diorama-${name}.png`)
}

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
