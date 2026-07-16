// Brawl beauty probe: capture real juicy moments for art-bar judgment.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

const boot = async loadout => {
  await page.goto(`http://localhost:${process.env.IPL_PORT || '5187'}/?scene=brawl&mute=1`, { waitUntil: 'load' })
  if (loadout) {
    await page.evaluate(l => {
      const p = JSON.parse(localStorage.getItem('ipl-profile-v2'))
      p.loadout = l
      localStorage.setItem('ipl-profile-v2', JSON.stringify(p))
    }, loadout)
    await page.goto(`http://localhost:${process.env.IPL_PORT || '5187'}/?scene=brawl&mute=1`, { waitUntil: 'load' })
  }
  await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 15000 })
}

// ---- 1. heavy smash launch at kill % (freeze-frame + launch trail + shake) ----
await boot()
await page.evaluate(() => {
  const s = window.__scene
  for (const ai of s.ais) {
    Object.assign(ai.intent, { move: 0, jump: false, fastFall: false, drop: false, jab: false, smash: false, dodge: 0 })
    ai.update = () => ai.intent
  }
  const e = s.baseFighters[1]
  e.dmg = 120
  e.iFrames = 0
  e.invulnT = 0
  e.pos.set(2.2, 0, 0)
  e.vel.set(0, 0)
  s.player.pos.set(0.4, 0, 0)
  s.player.vel.set(0, 0)
  s.player.facing = 1
})
await page.keyboard.press('k')
await page.waitForTimeout(640)
await page.screenshot({ path: 'qa/screens/brawl-beauty-launch.png' })

// ---- 2. comet impact on grouped fighters ----
await boot(['comet', 'quake', 'gravity', 'titan'])
await page.evaluate(() => {
  const s = window.__scene
  for (const ai of s.ais) {
    Object.assign(ai.intent, { move: 0, jump: false, fastFall: false, drop: false, jab: false, smash: false, dodge: 0 })
    ai.update = () => ai.intent
  }
  s.baseFighters[1].pos.set(-1.2, 0, 0)
  s.baseFighters[2].pos.set(1.4, 0, 0)
  s.player.pos.set(-6, 0, 0)
})
await page.keyboard.press('q')
await page.waitForTimeout(980)
await page.screenshot({ path: 'qa/screens/brawl-beauty-comet.png' })

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
