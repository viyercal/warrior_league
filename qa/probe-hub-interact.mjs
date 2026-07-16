// Interaction probe: hover tilt/glow, keyboard cycling across all 6 playable
// channels, click -> camera dolly -> loadout transition. Zero console errors required.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${process.env.IPL_PORT || '5189'}/?scene=hub&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(3500)

// --- 1. hover a playable channel (RIFT LEGENDS, idx 0) ---
const pos0 = await page.evaluate(() => window.__scene.debug.screenPos(0))
await page.mouse.move(pos0.x - 40, pos0.y - 30, { steps: 12 })
await page.waitForTimeout(700)
const hoverState = await page.evaluate(() => ({
  focus: window.__scene.focusIdx,
  hoverBlend: window.__scene.channels[0].hover.toFixed(2),
  scale: window.__scene.channels[0].group.scale.x.toFixed(3),
}))
console.log('HOVER:', JSON.stringify(hoverState))
await page.screenshot({ path: 'qa/screens/hub-probe-hover.png' })

// --- 2. keyboard focus on a back-row channel (TURBO KART GP, idx 4) ---
await page.keyboard.press('Digit5')
await page.waitForTimeout(400)
const backRowState = await page.evaluate(() => ({
  focus: window.__scene.focusIdx,
  scale: window.__scene.channels[4].group.scale.x.toFixed(3),
  scene: window.__ipl.sm.currentName,
}))
console.log('BACK-ROW FOCUS (focus 4, scale > 1.03, still hub):', JSON.stringify(backRowState))
await page.screenshot({ path: 'qa/screens/hub-probe-backrow.png' })

// --- 3. arrow-key selection ---
await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(300)
const arrowState = await page.evaluate(() => window.__scene.focusIdx)
console.log('ARROW focus (expect 3):', arrowState)

// --- 4. click NOVA ARENA (idx 2) -> cast vfx + dolly + goTo loadout ---
const pos2 = await page.evaluate(() => window.__scene.debug.screenPos(2))
await page.mouse.move(pos2.x, pos2.y, { steps: 10 })
await page.waitForTimeout(350)
await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(260) // mid-dolly, cast vfx alive
await page.screenshot({ path: 'qa/screens/hub-probe-launch.png' })
await page.waitForTimeout(2200)
const after = await page.evaluate(() => ({
  scene: window.__ipl.sm.currentName,
  params: window.__ipl.sm.current?.ctx?.params ?? null,
}))
console.log('AFTER CLICK:', JSON.stringify(after))
await page.screenshot({ path: 'qa/screens/hub-probe-after-launch.png' })

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
