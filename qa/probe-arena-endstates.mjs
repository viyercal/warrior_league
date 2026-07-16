// probe-arena-endstates.mjs — win + lose flows: banners, stat save,
// RETRY re-init, HUB return, victory auto-return.
// Usage: node qa/probe-arena-endstates.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5185'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const fails = []
const assert = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg) }

const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 } })
  await ctx.addInitScript(() => {
    localStorage.setItem('ipl-profile-v2', JSON.stringify({
      name: 'QA', loadout: ['blink', 'starfire', 'quake', 'comet'],
      appearance: { primary: '#3fa7ff', secondary: '#232a4d', glow: '#7df9ff', head: 'visor', hair: 'spikes', trail: 'spark', cape: true },
      stats: { wins: {}, plays: {} },
    }))
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/?scene=arena&mute=1`, { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  return { ctx, page, errors }
}

// ---------- WIN ----------
console.log('--- WIN flow ---')
{
  const { ctx, page, errors } = await newPage()
  await page.evaluate(() => window.__scene.debug.win())
  await page.waitForTimeout(700)
  const win = await page.evaluate(() => ({
    over: window.__scene.over,
    banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
    wins: JSON.parse(localStorage.getItem('ipl-profile-v2')).stats.wins.arena,
  }))
  assert(win.over === 'won', 'debug.win sets won state')
  assert(win.banner.some(t => /ARENA CHAMPION/i.test(t)), `ARENA CHAMPION banner (${win.banner})`)
  assert(win.wins === 1, `stats.wins.arena saved (${win.wins})`)
  await page.screenshot({ path: 'qa/screens/arena-win.png' })
  await page.waitForTimeout(8300) // auto return to hub after 8s
  const scene = await page.evaluate(() => window.__ipl.sm.currentName)
  assert(scene === 'hub', `auto-returned to hub (${scene})`)
  assert(errors.length === 0, `zero console errors (win) (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)
  await ctx.close()
}

// ---------- LOSE -> RETRY -> LOSE -> HUB ----------
console.log('--- LOSE flow ---')
{
  const { ctx, page, errors } = await newPage()
  await page.evaluate(() => window.__scene.debug.lose())
  await page.waitForTimeout(700)
  const lose = await page.evaluate(() => ({
    over: window.__scene.over, hp: window.__scene.hp,
    banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
    sub: [...document.querySelectorAll('.banner-sub')].map(b => b.textContent),
    buttons: [...document.querySelectorAll('.arena-end button')].map(b => b.textContent),
  }))
  assert(lose.over === 'dead', 'debug.lose sets dead state')
  assert(lose.banner.some(t => /DEFEATED/i.test(t)), `DEFEATED banner (${lose.banner})`)
  assert(lose.sub.some(t => /WAVE \d+ — SCORE \d+/.test(t)), `wave+score subline (${lose.sub})`)
  assert(lose.buttons.includes('RETRY') && lose.buttons.includes('HUB'), `RETRY + HUB buttons (${lose.buttons})`)
  await page.screenshot({ path: 'qa/screens/arena-lose.png' })

  // RETRY re-inits arena
  await page.click('.arena-end button:has-text("RETRY")')
  await page.waitForTimeout(1800)
  const retried = await page.evaluate(() => ({
    scene: window.__ipl.sm.currentName, over: window.__scene.over, hp: window.__scene.hp, wave: window.__scene.wave,
  }))
  assert(retried.scene === 'arena' && !retried.over && retried.hp === 100, `RETRY re-initialized arena (hp=${retried.hp}, wave=${retried.wave})`)

  // lose again -> HUB button
  await page.evaluate(() => window.__scene.debug.lose())
  await page.waitForTimeout(500)
  await page.click('.arena-end button:has-text("HUB")')
  await page.waitForTimeout(1800)
  const scene = await page.evaluate(() => window.__ipl.sm.currentName)
  assert(scene === 'hub', `HUB button returned to hub (${scene})`)
  assert(errors.length === 0, `zero console errors (lose) (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)
  await ctx.close()
}

await browser.close()
console.log(fails.length ? `\nENDSTATES PROBE: ${fails.length} FAILURES` : '\nENDSTATES PROBE: ALL PASS')
process.exit(fails.length ? 1 : 0)
