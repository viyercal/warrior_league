// Loadout six-game probe: footer button label + routing for kart/brawl/siege,
// tooltip states (destination-game highlight vs all-six list), no overflow.
import { chromium } from 'playwright-core'

const PORT = process.env.IPL_PORT || '5189'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${PORT}/?scene=loadout&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(3500)

// --- 1. game=null: tooltip lists all SEVEN games compactly ---
await page.locator('.loadout-skill').nth(8).hover()
await page.waitForTimeout(400)
const nullTip = await page.evaluate(() => {
  const t = document.querySelector('.loadout-tip')
  const r = t.getBoundingClientRect()
  return {
    minis: t.querySelectorAll('.loadout-tip-mini').length,
    labels: [...t.querySelectorAll('.loadout-tip-mini b')].map(x => x.textContent),
    inViewport: r.top >= 0 && r.bottom <= innerHeight,
    height: Math.round(r.height),
  }
})
console.log('NULL-GAME TIP (7 minis, in viewport):', JSON.stringify(nullTip))
await page.screenshot({ path: 'qa/screens/meta6-tip-null.png' })

// --- 2. each new game: NEXT STOP chip + footer label + tooltip hot row ---
const games = { kart: 'WAR CHARIOTS', brawl: 'MORTAL ARENA', siege: 'LAST BASTION' }
for (const [game, title] of Object.entries(games)) {
  await page.evaluate(g => window.__ipl.sm.goTo('loadout', { game: g }), game)
  await page.waitForTimeout(1600)
  await page.locator('.loadout-skill').nth(8).hover()
  await page.waitForTimeout(400)
  const state = await page.evaluate(() => {
    const t = document.querySelector('.loadout-tip')
    const r = t.getBoundingClientRect()
    return {
      label: document.querySelector('.loadout-go').textContent.trim(),
      next: document.querySelector('.loadout-next')?.textContent.trim() ?? null,
      hot: t.querySelector('.loadout-tip-game.hot b')?.textContent ?? null,
      minis: t.querySelectorAll('.loadout-tip-mini').length,
      othersHdr: !!t.querySelector('.loadout-tip-others'),
      inViewport: r.top >= 0 && r.bottom <= innerHeight,
    }
  })
  console.log(`GAME ${game} (label ENTER ${title} ▶, hot ${title}, 6 minis):`, JSON.stringify(state))
  if (game === 'kart') await page.screenshot({ path: 'qa/screens/meta6-tip-kart.png' })
}

// --- 3. footer click routes into the game scene (real input, kart) ---
await page.evaluate(() => window.__ipl.sm.goTo('loadout', { game: 'kart' }))
await page.waitForTimeout(1600)
const metaErrors = errors.length // errors past this point belong to the game scene, not the meta layer
await page.locator('.loadout-go').click()
await page.waitForTimeout(2600)
const routed = await page.evaluate(() => window.__ipl.sm.currentName)
console.log('GO CLICK ROUTES TO (expect kart):', routed)

console.log('META-LAYER ERRORS:', metaErrors ? JSON.stringify(errors.slice(0, metaErrors), null, 1) : 'none')
const gameErrors = errors.slice(metaErrors)
console.log('POST-ROUTE GAME-SCENE ERRORS (not meta-owned):', gameErrors.length ? JSON.stringify(gameErrors.slice(0, 5), null, 1) : 'none')
await browser.close()
