// Loadout seven-game probe: duel/THE CRUCIBLE chip + footer + tooltip states.
// Verifies the 7-line inGame tooltip stays readable (in viewport) in both the
// destination-game and hub-customize variants, and that the footer ENTER
// button's goTo target is 'duel' WITHOUT routing into the (possibly mid-build)
// duel scene itself.
import { chromium } from 'playwright-core'

const PORT = process.env.IPL_PORT || '8182'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${PORT}/?scene=loadout&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(3500)

// --- 1. game=null: tooltip lists all SEVEN games compactly, incl. CRUCIBLE ---
await page.locator('.loadout-skill').nth(8).hover()
await page.waitForTimeout(400)
const nullTip = await page.evaluate(() => {
  const t = document.querySelector('.loadout-tip')
  const r = t.getBoundingClientRect()
  return {
    minis: t.querySelectorAll('.loadout-tip-mini').length,
    labels: [...t.querySelectorAll('.loadout-tip-mini b')].map(x => x.textContent),
    hasDuelLine: t.innerText.includes('CRUCIBLE'),
    inViewport: r.top >= 0 && r.bottom <= innerHeight,
    height: Math.round(r.height),
  }
})
console.log('NULL-GAME TIP (7 minis incl CRUCIBLE, in viewport):', JSON.stringify(nullTip))
await page.screenshot({ path: 'qa/screens/hub7-tip-null.png' })

// --- 2. game=duel: NEXT chip + accent class + footer label + hot tooltip row ---
await page.evaluate(() => window.__ipl.sm.goTo('loadout', { game: 'duel' }))
await page.waitForTimeout(1600)
const duelState = await page.evaluate(() => ({
  next: document.querySelector('.loadout-next')?.textContent.trim() ?? null,
  nextClass: document.querySelector('.loadout-next')?.classList.contains('loadout-g-duel') ?? false,
  label: document.querySelector('.loadout-go')?.textContent.trim() ?? null,
  goClass: document.querySelector('.loadout-go')?.classList.contains('loadout-g-duel') ?? false,
}))
console.log('DUEL CHIP+FOOTER (NEXT THE CRUCIBLE, ENTER THE CRUCIBLE ▶, g-duel classes):', JSON.stringify(duelState))

await page.locator('.loadout-skill').nth(0).hover() // Shadow Step
await page.waitForTimeout(400)
const duelTip = await page.evaluate(() => {
  const t = document.querySelector('.loadout-tip')
  const r = t.getBoundingClientRect()
  return {
    hot: t.querySelector('.loadout-tip-game.hot b')?.textContent ?? null,
    hotLine: t.querySelector('.loadout-tip-game.hot span')?.textContent.slice(0, 40) ?? null,
    minis: t.querySelectorAll('.loadout-tip-mini').length,
    othersHdr: !!t.querySelector('.loadout-tip-others'),
    inViewport: r.top >= 0 && r.bottom <= innerHeight,
    height: Math.round(r.height),
  }
})
console.log('DUEL TIP (hot THE CRUCIBLE + duel line, 6 minis, in viewport):', JSON.stringify(duelTip))
await page.screenshot({ path: 'qa/screens/hub7-tip-duel.png' })

// --- 3. footer ENTER targets 'duel' (captured, NOT routed — scene mid-build) ---
const metaErrors = errors.length
await page.evaluate(() => {
  window.__goToTarget = null
  const sm = window.__ipl.sm
  const orig = sm.goTo.bind(sm)
  sm.goTo = (name, params) => { window.__goToTarget = { name, params: params ?? null } }
  window.__restoreGoTo = () => { sm.goTo = orig }
})
await page.locator('.loadout-go').click()
await page.waitForTimeout(300)
const target = await page.evaluate(() => window.__goToTarget)
await page.evaluate(() => window.__restoreGoTo())
console.log('ENTER BUTTON goTo TARGET (expect duel):', JSON.stringify(target))

console.log('META-LAYER ERRORS:', errors.length > metaErrors || metaErrors
  ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
