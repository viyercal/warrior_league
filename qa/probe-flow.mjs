// Full-app flow probe: boot gate -> hub -> each channel -> loadout -> game -> Escape -> hub,
// then loadout persistence (color + skill swap -> localStorage 'ipl-profile-v2').
// Zero console/page errors required. Screenshots to qa/screens/flow-*.png.
import { chromium } from 'playwright-core'

const BASE = process.env.IPL_BASE || 'http://localhost:5173'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

const results = []
const check = (label, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}
const sceneIs = async name => {
  await page.waitForFunction(
    n => window.__ipl?.sm?.currentName === n, name, { timeout: 15000 })
  return page.evaluate(() => window.__ipl.sm.currentName)
}

// ---------- 1. boot WITHOUT ?scene: click gate -> hub ----------
await page.goto(BASE + '/', { waitUntil: 'load' })
await page.waitForSelector('#bootEnter.ready', { timeout: 10000 })
await page.click('#bootEnter')
check('boot: ENTER click -> hub', (await sceneIs('hub')) === 'hub')
await page.waitForTimeout(2500)
await page.screenshot({ path: 'qa/screens/flow-hub.png' })

// ---------- 2. each playable channel -> loadout -> game -> Escape -> hub ----------
// Hub wall order (CHANNEL_DEFS): 0=moba 1=hoops 2=arena 3=siege 4=kart 5=brawl
const GAMES = [['moba', 0], ['hoops', 1], ['arena', 2], ['siege', 3], ['kart', 4], ['brawl', 5]]
const GAME_TITLES = {
  moba: 'RIFT LEGENDS', hoops: 'SLAM CITY 2K', arena: 'NOVA ARENA',
  kart: 'TURBO KART GP', brawl: 'BRAWL STADIUM', siege: 'SIEGE PROTOCOL',
}
for (const [game, idx] of GAMES) {
  const pos = await page.evaluate(i => window.__scene.debug.screenPos(i), idx)
  await page.mouse.move(pos.x, pos.y, { steps: 8 })
  await page.waitForTimeout(350)
  await page.mouse.click(pos.x, pos.y)
  await sceneIs('loadout')
  const loParams = await page.evaluate(() => window.__ipl.sm.current?.ctx?.params ?? null)
  check(`${game}: channel click -> loadout`, loParams?.game === game, JSON.stringify(loParams))
  await page.waitForTimeout(1400)
  const goLabel = (await page.locator('.loadout-go').textContent())?.trim() ?? ''
  check(`${game}: ENTER button label`, goLabel.includes(GAME_TITLES[game]), goLabel)
  await page.screenshot({ path: `qa/screens/flow-loadout-${game}.png` })

  await page.click('.loadout-go')
  check(`${game}: ENTER button -> game scene`, (await sceneIs(game)) === game)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `qa/screens/flow-game-${game}.png` })

  await page.keyboard.press('Escape')
  check(`${game}: Escape -> hub`, (await sceneIs('hub')) === 'hub')
  await page.waitForTimeout(2000)
}

// ---------- 3. loadout persistence: change color + swap skill ----------
await page.keyboard.press('KeyC')
await sceneIs('loadout')
await page.waitForTimeout(1400)
// change PRIMARY color to swatch #2 ('#ff5c6e')
await page.locator('.loadout-row', { hasText: 'PRIMARY' }).locator('.loadout-swatch').nth(1).click()
// select slot Q then equip Frost Ring (grid cell index 2, id 'frostring')
await page.locator('.loadout-slot').nth(0).click()
await page.locator('.loadout-skill').nth(2).click()
await page.waitForTimeout(500)
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ipl-profile-v2')))
check('loadout: color persisted to ipl-profile-v2', stored?.appearance?.primary === '#ff5c6e', String(stored?.appearance?.primary))
check('loadout: skill swap persisted to ipl-profile-v2', stored?.loadout?.[0] === 'frostring', JSON.stringify(stored?.loadout))
await page.screenshot({ path: 'qa/screens/flow-loadout-edit.png' })

console.log(results.join('\n'))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
