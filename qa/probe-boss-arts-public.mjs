import { chromium } from 'playwright-core'
import { writeFile, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = process.env.IPL_BASE
if (!base) throw Error('Set IPL_BASE')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const checks = [], errors = [], failed = []
page.on('pageerror', e => errors.push(String(e)))
page.on('response', r => { if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() }) })
const check = (name, ok) => { checks.push({ name, ok }); console.log(ok ? 'PASS' : 'FAIL', name); assert.ok(ok, name) }
try {
  await mkdir('qa/screens/boss-arts', { recursive: true })
  await page.goto(`${base}/?scene=arena&mute=1&dpr=1`, { timeout: 90000 })
  for (const mode of ['arena', 'siege', 'duel']) {
    if (mode !== 'arena') await page.evaluate(m => window.__ipl.sm.goTo(m, m === 'duel' ? { mode: 'tower' } : {}), mode)
    await page.waitForFunction(m => window.__ipl?.sm.currentName === m && !window.__ipl.sm._busy, mode, { timeout: 120000 })
    await page.locator('#boot').waitFor({ state: 'detached' }); await page.keyboard.press('z')
    if (mode !== 'duel') {
      await page.evaluate(m => window.__scene.debug.wave(m === 'arena' ? 5 : 10), mode)
      await page.waitForFunction(() => !!window.__scene.boss)
      await page.keyboard.press('z')
    }
    await page.waitForFunction(() => window.__scene.bossArts?.pending.length > 0, null, { timeout: 30000 })
    await page.waitForTimeout(350)
    await page.screenshot({ path: `qa/screens/boss-arts/${mode}-live-mobile.png` })
    check(`${mode} mobile dodge cue is visible`, await page.locator('.boss-art-cue').last().evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 240 && r.bottom < 590 && r.left >= 0 && r.right <= innerWidth }))
    check(`${mode} public boss casts warned ability`, await page.evaluate(() => window.__scene.bossArts.casts > 0 && !!document.querySelector('.boss-art-cue')))
  }
  check('public assets load successfully', failed.length === 0)
  check('no browser errors', errors.length === 0)
} finally {
  await writeFile('docs/boss-arts-public-results.json', JSON.stringify({ base, checks, errors, failed }, null, 2))
  await browser.close()
}
