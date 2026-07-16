// Hero identity probe: set a distinctive appearance in loadout via real UI clicks,
// then verify the SAME hero (colors/head/hair) renders in all three games.
// Programmatic check: hero mesh material colors include the chosen primary.
// Screenshot evidence: qa/screens/flow-identity-*.png
import { chromium } from 'playwright-core'

const BASE = process.env.IPL_BASE || 'http://localhost:5173'
const PRIMARY = '#7dff8a' // bright green (PRIMARY swatch idx 4)
const GLOW = '#ff8a5c'    // orange (GLOW swatch idx 4)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

const results = []
const check = (label, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}
const sceneIs = (name, timeout = 15000) =>
  page.waitForFunction(n => window.__ipl?.sm?.currentName === n, name, { timeout })

// ---------- 1. forge the identity in loadout ----------
await page.goto(BASE + '/?scene=loadout&mute=1', { waitUntil: 'load' })
await sceneIs('loadout')
await page.waitForTimeout(2000)

const row = txt => page.locator('.loadout-row', { hasText: txt })
await row('PRIMARY').locator('.loadout-swatch').nth(4).click()
await page.waitForTimeout(250)
await row('GLOW').locator('.loadout-swatch').nth(4).click()
await page.waitForTimeout(250)
await row('HEAD').locator('.loadout-seg-btn', { hasText: 'ORB' }).click()
await page.waitForTimeout(250)
await row('HAIR').locator('.loadout-seg-btn', { hasText: 'HORNS' }).click()
await page.waitForTimeout(900)

const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ipl-profile-v2')).appearance)
check('identity set in loadout', stored.primary === PRIMARY && stored.glow === GLOW &&
  stored.head === 'orb' && stored.hair === 'horns', JSON.stringify(stored))
await page.screenshot({ path: 'qa/screens/flow-identity-loadout.png' })

// ---------- 2. verify the same hero in each game ----------
// player-hero lookup per scene shape:
//   moba/arena/siege: s.hero — hoops: s.game.player.hero
//   brawl: s.player.hero — kart: s.player.visual.hero (seated in the kart)
const heroColors = () => page.evaluate(() => {
  const s = window.__scene
  const g = (s.hero || s.game?.player?.hero || s.player?.hero || s.player?.visual?.hero)?.group
  if (!g) return null
  const set = new Set()
  g.traverse(o => {
    if (o.material?.color) set.add('#' + o.material.color.getHexString())
    if (o.material?.emissive) set.add('#' + o.material.emissive.getHexString())
  })
  return [...set]
})

const heroScreenPos = () => page.evaluate(() => {
  const s = window.__scene
  const g = (s.hero || s.game?.player?.hero || s.player?.hero || s.player?.visual?.hero)?.group
  const v = g.getWorldPosition(g.position.clone()) // nested groups (kart seat, fighter root)
  v.y += 1
  v.project(s.camera)
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }
})

for (const game of ['moba', 'hoops', 'arena', 'kart', 'brawl', 'siege']) {
  await page.evaluate(n => window.__ipl.sm.goTo(n), game)
  await sceneIs(game)
  await page.waitForTimeout(3000)
  const colors = await heroColors()
  check(`${game}: hero body uses forged primary ${PRIMARY}`,
    !!colors && colors.includes(PRIMARY), `hero mats: ${JSON.stringify(colors)}`)
  await page.screenshot({ path: `qa/screens/flow-identity-${game}.png` })
  // pull the camera in (runtime QA-only state) for a readable close-up crop
  if (game === 'moba') await page.evaluate(() => { window.__scene.zoomT = 16 })
  if (game === 'arena') await page.evaluate(() => Object.assign(window.__scene.camOffset, { y: 11, z: 6 }))
  if (game === 'siege') await page.evaluate(() => Object.assign(window.__scene.camOffset, { y: 8, z: 6 }))
  await page.waitForTimeout(1400)
  const hp = await heroScreenPos()
  const clip = {
    x: Math.max(0, Math.min(1440 - 460, hp.x - 230)),
    y: Math.max(0, Math.min(810 - 460, hp.y - 250)),
    width: 460, height: 460,
  }
  await page.screenshot({ path: `qa/screens/flow-identity-${game}-close.png`, clip })
}

console.log(results.join('\n'))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
