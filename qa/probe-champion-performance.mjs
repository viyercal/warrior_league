import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.IPL_BASE || 'http://127.0.0.1:5303'
const out = 'qa/screens/champion-performance'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = [], errors = []
try {
  for (const game of ['moba', 'siege']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(String(e)))
    await page.addInitScript(() => localStorage.setItem('ipl-profile-v2', JSON.stringify({ champion: 'serai' })))
    await page.goto(`${base}/?scene=${game}&mute=1`)
    await page.waitForFunction(n => window.__ipl?.sm.currentName === n && !window.__ipl.sm._busy, game, { timeout: 60000 })
    await page.locator('#boot').waitFor({ state: 'detached' })
    await page.keyboard.press('KeyZ')
    await page.waitForFunction(() => window.__scene.phase === 'play')
    await page.evaluate(() => {
      window.__frames = []
      window.__frameStart = window.__frameLast = performance.now()
      window.__untick = window.__ipl.engine.addTicker(() => {
        const now = performance.now()
        window.__frames.push({ elapsed: now - window.__frameStart, ms: now - window.__frameLast })
        window.__frameLast = now
      })
    })
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(2200)
    await page.keyboard.up('ArrowRight')
    await page.keyboard.press(game === 'moba' ? 'KeyW' : 'Digit2')
    await page.keyboard.down('ArrowLeft')
    await page.waitForTimeout(2200)
    await page.keyboard.up('ArrowLeft')
    await page.waitForTimeout(3600)
    const measured = await page.evaluate(() => {
      window.__untick()
      const stats = frames => {
        const sorted = frames.map(f => f.ms).sort((a, b) => a - b)
        return { frames: sorted.length, medianMs: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)], maximumMs: sorted.at(-1), pausesOver50ms: frames.filter(f => f.ms > 50) }
      }
      return { initialSecond: stats(window.__frames.filter(f => f.elapsed <= 1000)), followingSevenSeconds: stats(window.__frames.filter(f => f.elapsed > 1000)) }
    })
    results.push({ champion: 'serai', game, ...measured })
    console.log(JSON.stringify(results.at(-1)))
    await context.close()
  }
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify({ base, viewport: [1440, 1000], results, errors, scope: 'Short isolated production smoke samples, not a cross-device benchmark' }, null, 2))
  await browser.close()
}
