// Seven-channel hub probe (supersedes probe-hub-six): 7 defs with THE CRUCIBLE
// flagship centered + enlarged, all 7 dioramas animated, keyboard cycling
// across 7 (digits + arrow wrap), and a real-input click on the Crucible ->
// loadout opens with params.game === 'duel' and the "ENTER THE CRUCIBLE ▶"
// footer. Zero console errors required.
import { chromium } from 'playwright-core'

const PORT = process.env.IPL_PORT || '8182'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${PORT}/?scene=hub&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(3500)
await page.waitForFunction(() => window.__scene?.channels?.length === 7, { timeout: 15000 })

// --- 1. defs: seven playable channels, duel is the flagship ---
const defs = await page.evaluate(() => window.__scene.channels.map(c => ({
  title: c.def.title, game: c.def.game, accent: c.def.accent,
  flagship: !!c.def.flagship, scale: +c.baseScale.toFixed(2),
})))
console.log('DEFS (7, duel last):', JSON.stringify(defs))
const flag = defs[6]
console.log('FLAGSHIP CHECK (duel, THE CRUCIBLE, scale 1.35, flagship true):',
  JSON.stringify({ ok: flag.game === 'duel' && flag.title === 'THE CRUCIBLE' && flag.flagship && flag.scale === 1.35 }))
const flagPlate = await page.evaluate(() => ({
  count: document.querySelectorAll('.hub-plate-flag').length,
  title: document.querySelector('.hub-plate-flag .hub-plate-title')?.textContent.trim() ?? null,
  sub: document.querySelector('.hub-plate-flag .hub-plate-sub')?.textContent.trim() ?? null,
}))
console.log('FLAGSHIP PLATE (1, THE CRUCIBLE, 1V1 TOURNAMENT — BEST OF 3):', JSON.stringify(flagPlate))

// --- 2. every diorama animates (max position delta over 400ms) ---
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
console.log('DIORAMA max-deltas (all 7 > 0.01):', JSON.stringify(moved))

// --- 2b. crucible fight loop: health bar fills actually drain/refill ---
const barScale = () => page.evaluate(() => {
  const bars = []
  window.__scene.channels[6].stage.group.traverse(o => {
    if (o.geometry?.parameters?.width === 0.42) bars.push(+o.scale.x.toFixed(3))
  })
  return bars
})
const hb1 = await barScale()
await page.waitForTimeout(2400) // one full fight cycle
const hb2 = await barScale()
console.log('CRUCIBLE HP BARS (2 fills, some scale change):',
  JSON.stringify({ hb1, hb2, changed: hb1.some((v, i) => Math.abs(v - hb2[i]) > 0.01) }))

// --- 3. keyboard: 1-7 direct select + arrow wrap both ways ---
const kb = []
for (let i = 1; i <= 7; i++) {
  await page.keyboard.press(`Digit${i}`)
  await page.waitForTimeout(120)
  kb.push(await page.evaluate(() => window.__scene.focusIdx))
}
await page.keyboard.press('ArrowRight') // 6 -> 0
await page.waitForTimeout(120)
kb.push(await page.evaluate(() => window.__scene.focusIdx))
await page.keyboard.press('ArrowLeft') // 0 -> 6
await page.waitForTimeout(120)
kb.push(await page.evaluate(() => window.__scene.focusIdx))
console.log('KEYS 1-7 then wrap R,L (expect 0,1,2,3,4,5,6,0,6):', JSON.stringify(kb))

// --- 4. real-input click on THE CRUCIBLE -> loadout w/ game 'duel' + footer ---
const pos = await page.evaluate(() => window.__scene.debug.screenPos(6))
await page.mouse.move(pos.x, pos.y - 10, { steps: 8 })
await page.waitForTimeout(400)
const hover = await page.evaluate(() => ({
  hoverIdx: window.__scene.hoverIdx,
  scale: +window.__scene.channels[6].group.scale.x.toFixed(3),
}))
console.log('CRUCIBLE HOVER (idx 6, scale ~1.43):', JSON.stringify(hover))
await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(2400)
const afterClick = await page.evaluate(() => ({
  scene: window.__ipl.sm.currentName,
  game: window.__ipl.sm.current?.ctx?.params?.game ?? null,
  label: document.querySelector('.loadout-go')?.textContent.trim() ?? null,
  goClass: document.querySelector('.loadout-go')?.classList.contains('loadout-g-duel') ?? false,
  next: document.querySelector('.loadout-next')?.textContent.trim() ?? null,
}))
console.log('CRUCIBLE CLICK (loadout, duel, ENTER THE CRUCIBLE ▶):', JSON.stringify(afterClick))
await page.keyboard.press('Escape')
await page.waitForTimeout(2000)

// --- 5. legacy channel unchanged: click WAR RIFT (idx 0) the same way ---
const pos0 = await page.evaluate(() => window.__scene.debug.screenPos(0))
await page.mouse.move(pos0.x, pos0.y - 10, { steps: 8 })
await page.waitForTimeout(350)
await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(2400)
const legacy = await page.evaluate(() => ({
  scene: window.__ipl.sm.currentName,
  game: window.__ipl.sm.current?.ctx?.params?.game ?? null,
}))
console.log('LEGACY CLICK idx 0 (loadout, moba):', JSON.stringify(legacy))

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
