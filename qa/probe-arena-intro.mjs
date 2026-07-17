// probe-arena-intro.mjs — THE PIT intro cinematic: letterbox + title plates,
// state frozen while it plays, ≤4.5s budget, auto-finish -> WAVE 1 banner +
// battle-camera snap, and ANY-key skip.
// Usage: node qa/probe-arena-intro.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5185'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const fails = []
const assert = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg) }

const newPage = async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/?scene=arena&mute=1`, { waitUntil: 'load' })
  return { page, errors }
}

// ---------- natural intro: plays out and hands off to WAVE 1 ----------
console.log('--- natural intro ---')
{
  const { page, errors } = await newPage()
  await page.waitForTimeout(1000)
  const mid = await page.evaluate(() => {
    const s = window.__scene
    return {
      active: s.cine.active, mode: s.cine.mode, dur: s.cine.INTRO_DUR,
      bars: document.querySelectorAll('.arena-cine.on').length,
      title: document.querySelector('.arena-title-main')?.textContent,
      plate: document.querySelector('.arena-title-plate')?.textContent,
      wave: s.wave, alive: s.horde.active.length, breakT: s.breakT, score: s.score,
      camY: s.camera.position.y,
    }
  })
  assert(mid.active && mid.mode === 'intro', 'intro cinematic active after load')
  assert(mid.bars === 2, `letterboxed (2 bars on, got ${mid.bars})`)
  assert(mid.title === 'THE PIT', `"THE PIT" title plate (${mid.title})`)
  assert(/SURVIVE 8 WAVES/.test(mid.plate || ''), `"SURVIVE 8 WAVES" plate (${mid.plate})`)
  assert(mid.dur <= 4.5, `intro duration budget ≤ 4.5s (${mid.dur}s)`)
  assert(mid.wave === 0 && mid.alive === 0 && mid.breakT === 2.2 && mid.score === 0,
    `state frozen during intro (wave=${mid.wave}, alive=${mid.alive}, breakT=${mid.breakT})`)
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'qa/screens/arena-intro.png' })

  await page.waitForTimeout(3400) // past the 4.2s auto-finish
  const end = await page.evaluate(() => {
    const s = window.__scene
    const hp = s.hero.group.position
    return {
      active: s.cine.active,
      bars: document.querySelectorAll('.arena-cine.on').length,
      banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
      camSnap: Math.abs(s.camera.position.y - s.camOffset.y) < 1.2
        && Math.abs(s.camera.position.z - (hp.z + s.camOffset.z)) < 1.6,
    }
  })
  assert(!end.active && end.bars === 0, 'intro auto-finished, letterbox off')
  assert(end.banner.some(t => /WAVE 1/.test(t)), `WAVE 1 banner after intro (${end.banner})`)
  assert(end.camSnap, 'camera snapped to the battle framing')
  await page.waitForFunction(() => window.__scene.wave >= 1, null, { timeout: 8000 })
  assert(true, 'wave flow continues after intro (wave 1 started)')
  assert(errors.length === 0, `zero console errors (natural) (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)
  await page.close()
}

// ---------- ANY key skips ----------
console.log('--- any-key skip ---')
{
  const { page, errors } = await newPage()
  await page.waitForTimeout(900)
  await page.keyboard.press('KeyJ') // unbound key — pure skip
  await page.waitForTimeout(350)
  const sk = await page.evaluate(() => {
    const s = window.__scene
    return {
      active: s.cine.active,
      bars: document.querySelectorAll('.arena-cine.on').length,
      title: !!document.querySelector('.arena-title'),
      banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
      camY: s.camera.position.y,
      cds: [...s.cds],
    }
  })
  assert(!sk.active && sk.bars === 0 && !sk.title, 'skip ended cinematic + removed plates')
  assert(sk.banner.some(t => /WAVE 1/.test(t)), `WAVE 1 banner right after skip (${sk.banner})`)
  assert(Math.abs(sk.camY - 17.5) < 1.2, `camera snapped to gameplay (y=${sk.camY.toFixed(1)})`)
  assert(sk.cds.every(c => c === 0), 'skip key did not cast a skill')
  await page.waitForFunction(() => window.__scene.wave >= 1, null, { timeout: 8000 })
  assert(true, 'wave 1 starts after skip')
  assert(errors.length === 0, `zero console errors (skip) (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)
  await page.close()
}

await browser.close()
console.log(fails.length ? `\nINTRO PROBE: ${fails.length} FAILURES` : '\nINTRO PROBE: ALL PASS')
process.exit(fails.length ? 1 : 0)
