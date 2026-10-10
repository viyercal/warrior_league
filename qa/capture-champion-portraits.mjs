import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.IPL_BASE || 'http://127.0.0.1:5301'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
const errors = [], results = []
page.on('pageerror', error => errors.push(String(error)))
await mkdir('qa/screens/roster/portraits', { recursive: true })
try {
  await page.goto(`${base}/?scene=loadout&mute=1`)
  await page.waitForFunction(() => window.__ipl?.sm.currentName === 'loadout' && !window.__ipl.sm._busy)
  await page.locator('#boot').waitFor({ state: 'detached' })
  for (const name of ['Caelan', 'Nyra', 'Orren', 'Serai']) {
    await page.getByRole('button', { name: `Select ${name}`, exact: true }).click()
    await page.locator('.loadout-go').click()
    await page.waitForFunction(() => window.__ipl?.sm.currentName === 'hub' && !window.__ipl.sm._busy)
    await page.waitForFunction(() => document.querySelector('.realm-player img')?.naturalWidth > 0)
    await page.locator('.realm-player').screenshot({ path: `qa/screens/roster/portraits/${name.toLowerCase()}.png` })
    results.push({ name, loaded: true, alt: await page.locator('.realm-player img').getAttribute('alt') })
    await page.locator('.realm-player').click()
    await page.waitForFunction(() => window.__ipl?.sm.currentName === 'loadout' && !window.__ipl.sm._busy)
  }
  await page.getByRole('button', { name: 'Select Caelan', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.champion-splash')?.naturalWidth > 0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  if (await page.locator('.champion-splash').evaluate(el => getComputedStyle(el).animationName) !== 'none') throw Error('Reduced motion must suppress artwork animation')
  await page.screenshot({ path: 'qa/screens/roster/forge-final.png' })
  if (errors.length) throw Error(errors.join('\n'))
  console.log(JSON.stringify({ results, reducedMotion: true, errors }, null, 2))
  await writeFile('qa/screens/roster/portraits/results.json', JSON.stringify({ results, reducedMotion: true, errors }, null, 2))
} finally { await browser.close() }
