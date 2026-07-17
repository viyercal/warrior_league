// Deep verification probe: live dioramas animating, idle hero flair (dance +
// cast variants), keyboard-focus plate highlight, C-key customize path, FPS.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${process.env.IPL_PORT || '5189'}/?scene=hub&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(3500)
// sibling agents editing src/games/** trigger vite full reloads; re-settle
await page.waitForFunction(() => window.__scene?.channels?.length === 7, { timeout: 15000 })

// --- 1. all 7 dioramas actually animate (positions change over time) ---
const sample = () => page.evaluate(() => {
  const flat = g => { const out = []; g.traverse(o => out.push(o.position.x, o.position.y, o.position.z)); return out }
  return window.__scene.channels.map(c => flat(c.stage.group))
})
const a = await sample()
await page.waitForTimeout(400)
const b = await sample()
const dioramaMoved = a.map((arr, i) => {
  let d = 0
  for (let j = 0; j < arr.length; j++) d = Math.max(d, Math.abs(arr[j] - b[i][j]))
  return +d.toFixed(3)
})
console.log('DIORAMA max-deltas (all 7 should be > 0.01):', JSON.stringify(dioramaMoved))

// --- 2. idle hero flair: instrument cast/dance, force the timer both ways ---
await page.evaluate(() => {
  const s = window.__scene
  window.__flair = { cast: 0, dance: 0 }
  const oc = s.hero.cast.bind(s.hero)
  s.hero.cast = () => { window.__flair.cast++; oc() }
  const os = s.hero.setState.bind(s.hero)
  s.hero.setState = st => { if (st === 'dance') window.__flair.dance++; os(st) }
})
// force cast variant (Math.random >= 0.5)
await page.evaluate(() => { Math.random = () => 0.9; window.__scene.flairT = 0.01 })
await page.waitForTimeout(150)
await page.screenshot({ path: 'qa/screens/hub-probe-flair-cast.png' })
// force dance variant
await page.evaluate(() => { Math.random = () => 0.1; window.__scene.flairT = 0.01 })
await page.waitForTimeout(400)
await page.screenshot({ path: 'qa/screens/hub-probe-flair-dance.png' })
const flair = await page.evaluate(() => ({ ...window.__flair, danceT: +window.__scene.danceT.toFixed(2) }))
console.log('FLAIR (cast>=1, dance>=1, danceT>0):', JSON.stringify(flair))
await page.waitForTimeout(2600) // let dance finish, restore normal state

// --- 3. keyboard focus highlights the DOM plate (same as hover) ---
await page.keyboard.press('Digit2')
await page.waitForTimeout(350)
const kb = await page.evaluate(() => ({
  focus: window.__scene.focusIdx,
  hotPlates: [...document.querySelectorAll('.hub-plate.hot')].length,
  scale: +window.__scene.channels[1].group.scale.x.toFixed(3),
}))
console.log('KB FOCUS (focus 1, 1 hot plate, scale>1.03):', JSON.stringify(kb))
await page.screenshot({ path: 'qa/screens/hub-probe-kbfocus.png' })

// --- 4. FPS over 2s ---
const fps = await page.evaluate(() => new Promise(res => {
  let frames = 0
  const t0 = performance.now()
  const loop = () => { frames++; performance.now() - t0 < 2000 ? requestAnimationFrame(loop) : res(+(frames / 2).toFixed(1)) }
  requestAnimationFrame(loop)
}))
console.log('FPS (expect ~55+):', fps)

// --- 5. C key -> customize (loadout, game null) ---
await page.keyboard.press('KeyC')
await page.waitForTimeout(1200)
const after = await page.evaluate(() => {
  const params = window.__ipl.sm.current?.ctx?.params || {}
  return { scene: window.__ipl.sm.currentName, game: 'game' in params ? String(params.game) : 'ABSENT' }
})
console.log('C KEY (loadout, game null):', JSON.stringify(after))

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
