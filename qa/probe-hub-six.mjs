// Six-channel hub probe: all channels unlocked + animated, keyboard cycling
// across 6, hover, and a real-input click on EVERY channel -> loadout opens
// with the right params.game and footer label. Zero console errors required.
import { chromium } from 'playwright-core'

const PORT = process.env.IPL_PORT || '5189'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${PORT}/?scene=hub&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(3500)

// --- 1. defs: six playable channels, no locked affordances anywhere ---
const defs = await page.evaluate(() => window.__scene.channels.map(c => ({
  title: c.def.title, game: c.def.game, accent: c.def.accent, locked: !!c.def.locked,
})))
console.log('DEFS:', JSON.stringify(defs))
const lockText = await page.evaluate(() =>
  /LOCK|COMING SOON|🔒/i.test(document.getElementById('ui').innerText))
console.log('LOCK AFFORDANCES IN UI (expect false):', lockText)

// --- 2. every diorama animates ---
const sample = () => page.evaluate(() => {
  const flat = g => { const out = []; g.traverse(o => out.push(o.position.x, o.position.y, o.position.z)); return out }
  return window.__scene.channels.map(c => flat(c.stage.group))
})
const a = await sample()
await page.waitForTimeout(400)
const b = await sample()
const moved = a.map((arr, i) => {
  let d = 0
  for (let j = 0; j < arr.length; j++) d = Math.max(d, Math.abs(arr[j] - b[i][j]))
  return +d.toFixed(3)
})
console.log('DIORAMA max-deltas (all 6 > 0.01):', JSON.stringify(moved))

// --- 3. keyboard: 1-6 direct select + arrow wrap both ways ---
const kb = []
for (let i = 1; i <= 6; i++) {
  await page.keyboard.press(`Digit${i}`)
  await page.waitForTimeout(120)
  kb.push(await page.evaluate(() => window.__scene.focusIdx))
}
await page.keyboard.press('ArrowRight') // 5 -> 0
await page.waitForTimeout(120)
kb.push(await page.evaluate(() => window.__scene.focusIdx))
await page.keyboard.press('ArrowLeft') // 0 -> 5
await page.waitForTimeout(120)
kb.push(await page.evaluate(() => window.__scene.focusIdx))
console.log('KEYS 1-6 then wrap R,L (expect 0,1,2,3,4,5,0,5):', JSON.stringify(kb))

// --- 4. real-input click on each of the six channels -> loadout w/ params ---
const clicks = []
for (let i = 0; i < 6; i++) {
  const pos = await page.evaluate(idx => window.__scene.debug.screenPos(idx), i)
  await page.mouse.move(pos.x, pos.y - 10, { steps: 8 })
  await page.waitForTimeout(350)
  const hover = await page.evaluate(() => window.__scene.hoverIdx)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(2400)
  const state = await page.evaluate(() => ({
    scene: window.__ipl.sm.currentName,
    game: window.__ipl.sm.current?.ctx?.params?.game ?? null,
    label: document.querySelector('.loadout-go')?.textContent.trim() ?? null,
  }))
  clicks.push({ idx: i, hover, ...state })
  await page.keyboard.press('Escape') // real-input return path
  await page.waitForTimeout(2000)
}
console.log('CLICKS:', JSON.stringify(clicks, null, 1))

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
