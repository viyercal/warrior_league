// BLOOD COURT drama probe: natural intro completion (no keys), check-up
// face-off camera, made-3 slow-mo + rim nudge, momentum runs (banner +
// jumbotron flash), MATCH POINT flare, game-winner slow-mo -> ember burst ->
// delayed VICTORY + stats panel, 8s auto-return, and a DPR2 fps gate.
// node qa/probe-hoops-drama.mjs [base=http://localhost:5184]
import { chromium } from 'playwright-core'

const base = process.argv[2] || 'http://localhost:5184'
const errors = []
const fails = []
const ok = (cond, label) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + label)
  if (!cond) fails.push(label)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

const snap = () => page.evaluate(() => window.__scene.debug.snapshot())

/* ---------------- natural intro: completes on its own, ≤4.5s of cinema ---------------- */
await page.goto(`${base}/?scene=hoops&mute=1`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__scene?.game?.phase === 'intro', null, { timeout: 15000 })
const t0 = Date.now()
await page.waitForFunction(() => {
  const p = window.__scene?.game?.phase
  return !!p && p !== 'intro'
}, null, { timeout: 6500 })
const introMs = Date.now() - t0
ok(introMs < 5200, `intro auto-advances without input (${(introMs / 1000).toFixed(1)}s)`)

/* ---------------- check-up ritual: face-off camera push ---------------- */
const sawCheck = await page.evaluate(() => window.__scene?.game?.phase === 'check')
ok(sawCheck, 'intro snaps into the check-up phase')
await page.waitForTimeout(520)
const camY = await page.evaluate(() => window.__scene.camera.position.y)
ok(camY < 3.5, `check-up camera pushes into the face-off (y=${camY.toFixed(2)})`)
await page.screenshot({ path: 'qa/screens/hoops-fin-checkup.png' })
await page.waitForFunction(() => window.__scene?.game?.phase === 'live', null, { timeout: 5000 })

/* ---------------- deep three: perfect release -> slow-mo ball flight ---------------- */
async function deepThree() {
  await page.waitForFunction(() => window.__scene?.game?.phase === 'live', null, { timeout: 12000 })
  await page.evaluate(() => {
    const s = window.__scene
    if (s.game.ball.holder !== 'player') s.debug.give('player')
  })
  await page.keyboard.down('Space')
  const metering = await page.waitForFunction(
    () => window.__scene.game.player.metering === true, null, { timeout: 2000 },
  ).then(() => true).catch(() => false)
  if (!metering) { await page.keyboard.up('Space'); return false }
  await page.waitForFunction(() => {
    const g = window.__scene.game
    return g.player.meterT >= 0.67 || g.player.metering === false
  }, null, { timeout: 3000, polling: 8 })
  await page.keyboard.up('Space')
  return true
}

let slow = false
for (let i = 0; i < 4 && !slow; i++) {
  if (!(await deepThree())) continue
  slow = await page.waitForFunction(() => window.__scene?.timeScale < 0.9, null, { timeout: 3000 })
    .then(() => true).catch(() => false)
  if (!slow) { // shot missed (good-band rng): recover and retry
    await page.waitForTimeout(1500)
    await page.evaluate(() => window.__scene.debug.give('player'))
  }
}
ok(slow, 'made three from the check spot triggers ball-flight slow-mo')
await page.screenshot({ path: 'qa/screens/hoops-fin-slowmo3.png' })
const nudge = await page.evaluate(() => window.__scene._nudgeT)
ok(nudge > 0, 'slow-mo nudges the camera toward the rim')
await page.waitForFunction(() => (window.__scene?.game?.score?.you ?? -1) >= 3, null, { timeout: 5000 })
ok(true, 'the three counts on the board')

/* ---------------- momentum: unanswered run -> banner + jumbotron flash ---------------- */
await page.evaluate(() => window.__scene.debug.score('you', 2)) // 5-0 run
const runPts = await page.evaluate(() => window.__scene._run.pts)
ok(runPts === 5, `run tracker counts unanswered points (${runPts}-0)`)
const runBanner = await page.waitForFunction(
  () => (document.querySelector('.banner-main')?.textContent || '').includes('RUN'),
  null, { timeout: 4000 },
).then(() => true).catch(() => false)
ok(runBanner, 'run banner rides the next check-up')

/* ---------------- MATCH POINT: braziers flare, camera tightens ---------------- */
await page.evaluate(() => window.__scene.debug.score('you', 2)) // 7
await page.waitForTimeout(300)
await page.evaluate(() => window.__scene.debug.score('you', 3)) // 10 = match point
const mp = await page.waitForFunction(() => window.__scene?._matchPoint === true, null, { timeout: 2000 })
  .then(() => true).catch(() => false)
ok(mp, 'reaching 10 arms MATCH POINT')
const mpBanner = await page.waitForFunction(
  () => (document.querySelector('.banner-main')?.textContent || '').includes('MATCH POINT'),
  null, { timeout: 4000 },
).then(() => true).catch(() => false)
ok(mpBanner, 'MATCH POINT banner owns the next check-up')
await page.waitForTimeout(450)
await page.screenshot({ path: 'qa/screens/hoops-fin-matchpoint.png' })

/* ---------------- game winner: long slow-mo, delayed VICTORY, stats panel ---------------- */
let ended = false
for (let i = 0; i < 5 && !ended; i++) {
  if (!(await deepThree())) continue
  const sawSlow = await page.waitForFunction(() => window.__scene?.timeScale < 0.9, null, { timeout: 3000 })
    .then(() => true).catch(() => false)
  if (sawSlow) await page.screenshot({ path: 'qa/screens/hoops-fin-winner-slowmo.png' })
  ended = await page.waitForFunction(() => window.__scene?.game?.phase === 'end', null, { timeout: 8000 })
    .then(() => true).catch(() => false)
  if (!ended) {
    await page.waitForTimeout(1200)
    await page.evaluate(() => { if (window.__scene.game.phase !== 'end') window.__scene.debug.give('player') })
  }
}
ok(ended, 'winning basket ends the game')
const panelUp = await page.waitForFunction(() => !!document.querySelector('.hoops-panel'), null, { timeout: 4000 })
  .then(() => true).catch(() => false)
ok(panelUp, 'stats panel lands after the winner drama beat')
const end = await page.evaluate(() => ({
  banner: document.querySelector('.banner-main')?.textContent || '',
  match: { ...window.__scene.match, casts: undefined },
  rows: [...document.querySelectorAll('.hoops-panel-row .v')].map(e => e.textContent),
}))
ok(end.banner === 'VICTORY', `VICTORY banner shows (got "${end.banner}")`)
ok(end.match.pts3 >= 3 && end.match.makes >= 1 && end.match.attempts >= end.match.makes,
  `match ledger tracked shots (3PT=${end.match.pts3}, ${end.match.makes}/${end.match.attempts})`)
ok(end.match.longestRun >= 5, `longest run recorded (${end.match.longestRun}-0)`)
ok(end.rows.length === 8, `stats panel renders 8 rows (${end.rows.length})`)
await page.waitForTimeout(900)
await page.screenshot({ path: 'qa/screens/hoops-fin-stats.png' })
const auto = await page.waitForFunction(() => window.__ipl.sm.currentName === 'hub', null, { timeout: 11000 })
  .then(() => true).catch(() => false)
ok(auto, 'auto-returns to hub ~8s after the win')
await page.close()

/* ---------------- perf gate: live play at deviceScaleFactor 2 ----------------
   Absolute fps on a shared dev box swings with outside load, so hoops is gated
   RELATIVE to the polished reference scene (duel) sampled the same way in the
   same run: hoops must hit >= 85% of duel's fps (or an outright 54+). */
const sampleFps = p => p.evaluate(() => new Promise(res => {
  let n = 0
  const s0 = performance.now()
  const loop = () => {
    n++
    if (performance.now() - s0 < 3000) requestAnimationFrame(loop)
    else res(n / ((performance.now() - s0) / 1000))
  }
  requestAnimationFrame(loop)
}))
async function dpr2Page(url, ready) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 })
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  p.on('pageerror', e => errors.push(String(e)))
  await p.goto(url, { waitUntil: 'load' })
  await ready(p)
  return p
}
{
  const openHoops = () => dpr2Page(`${base}/?scene=hoops&mute=1`, async p => {
    await p.waitForFunction(() => window.__scene?.game?.phase === 'intro', null, { timeout: 15000 })
    await p.keyboard.press('KeyG')
    await p.waitForFunction(() => window.__scene?.game?.phase === 'live', null, { timeout: 8000 })
  })
  const openDuel = () => dpr2Page(`${base}/?scene=duel&mute=1`, async p => {
    await p.waitForTimeout(2400)
    await p.keyboard.press('x') // skip duel intro cinematic
    await p.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })
  })
  // alternating best-of-2, one fresh page at a time (outside load hits both
  // scenes the same way; fresh pages avoid headless memory pressure)
  let hoopsFps = 0, duelFps = 0, pr = 2
  for (let i = 0; i < 2; i++) {
    const ph = await openHoops()
    await ph.keyboard.down('KeyW')
    hoopsFps = Math.max(hoopsFps, await sampleFps(ph))
    await ph.keyboard.up('KeyW')
    pr = await ph.evaluate(() => window.__ipl.engine.renderer.getPixelRatio())
    await ph.close()
    const pd = await openDuel()
    duelFps = Math.max(duelFps, await sampleFps(pd))
    await pd.close()
  }
  ok(hoopsFps >= 54 || hoopsFps >= duelFps * 0.85,
    `DPR2 frame rate ok (hoops ${hoopsFps.toFixed(0)} fps vs duel reference ${duelFps.toFixed(0)} fps @ pixelRatio ${pr})`)
}

console.log('CONSOLE ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8)) : 'none')
await browser.close()
if (errors.length || fails.length) process.exit(1)
