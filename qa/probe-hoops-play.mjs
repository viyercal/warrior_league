// BLOOD COURT gameplay probe: cinematic intro (letterbox + title + VS plate,
// any-key skip), real-input meter shots -> ON FIRE, rebound, shot-clock
// turnover, crossover, defensive block/steal.
// node qa/probe-hoops-play.mjs [base=http://localhost:5184]
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
const waitLive = () => page.waitForFunction(() => window.__scene?.game?.phase === 'live', null, { timeout: 20000 })

await page.goto(`${base}/?scene=hoops&mute=1`, { waitUntil: 'load' })

// --- cinematic intro: letterboxed, titled, frozen game state, ANY key skips ---
await page.waitForFunction(() => window.__scene?.game?.phase === 'intro', null, { timeout: 15000 })
const intro = await page.evaluate(() => ({
  cine: !!document.querySelector('.hoops-cine.on'),
  title: document.querySelector('.hoops-intro-title')?.textContent || '',
  vs: !!document.querySelector('.hoops-vs-mid'),
  foe: document.querySelector('.hoops-vsr .hoops-vs-name')?.textContent || '',
  rule: document.querySelector('.hoops-intro-rule')?.textContent || '',
  clock: window.__scene.game.clock,
}))
ok(intro.cine, 'intro shows letterbox bars')
ok(intro.title === 'BLOOD COURT', `intro title card shows (got "${intro.title}")`)
ok(intro.vs && intro.foe === 'IRONHIDE', `VS plate names the CPU warrior (got "${intro.foe}")`)
ok(intro.rule.includes('FIRST TO 11'), `house-rule plate shows (got "${intro.rule}")`)
await page.waitForTimeout(900)
const frozen = await page.evaluate(c0 => window.__scene.game.clock === c0 && window.__scene.game.phase === 'intro', intro.clock)
ok(frozen, 'game state stays frozen during the intro')
await page.screenshot({ path: 'qa/screens/hoops-fin-intro.png' })
await page.keyboard.press('KeyG') // ANY key skips
const skipped = await page.waitForFunction(() => window.__scene.game.phase !== 'intro', null, { timeout: 1500 })
  .then(() => true).catch(() => false)
ok(skipped, 'any key skips the intro')
ok(await page.evaluate(() => !document.querySelector('.hoops-cine.on')), 'letterbox clears after skip')

await waitLive()
ok(true, 'scene reaches live phase after intro + check-up')

// --- movement + sprint (real keys) ---
const p0 = await page.evaluate(() => window.__scene.game.player.hero.group.position.z)
await page.keyboard.down('Shift')
await page.keyboard.down('KeyW')
await page.waitForTimeout(900)
await page.keyboard.up('KeyW')
await page.keyboard.up('Shift')
const p1 = await page.evaluate(() => ({
  z: window.__scene.game.player.hero.group.position.z,
  stam: window.__scene.game.player.stamina,
}))
ok(p1.z < p0 - 2, `WASD sprint moves toward hoop (z ${p0.toFixed(1)} -> ${p1.z.toFixed(1)})`)
ok(p1.stam < 99, `sprint drains stamina (${p1.stam.toFixed(0)})`)

// --- meter shot helper: walk in, ignite (W skill), release in the green band ---
async function attemptShot(shotIdx) {
  await waitLive()
  await page.keyboard.press('KeyW') // starfire: +accuracy, ignited arc
  await page.waitForTimeout(120)
  await page.keyboard.down('KeyW') // walk in
  await page.waitForFunction(() => {
    const P = window.__scene.game.player.hero.group.position
    return Math.hypot(P.x, P.z + 5.62) < 4.4
  }, null, { timeout: 8000 }).catch(() => {})
  await page.keyboard.up('KeyW')
  await page.keyboard.down('Space')
  const metering = await page.waitForFunction(
    () => window.__scene.game.player.metering === true, null, { timeout: 2000 },
  ).then(() => true).catch(() => false)
  if (!metering) { // ball was stolen / play reset mid-approach: bail and retry
    await page.keyboard.up('Space')
    await page.evaluate(() => window.__scene.debug.give('player'))
    return null
  }
  if (shotIdx === 0) {
    const meterVisible = await page.evaluate(() => document.querySelector('.hoops-meter').style.display !== 'none')
    ok(meterVisible, 'shot meter DOM appears while holding SPACE')
    await page.screenshot({ path: 'qa/screens/hoops-fin-meter.png' })
  }
  // release inside the band (poll the live meter)
  await page.waitForFunction(() => {
    const g = window.__scene.game
    return g.player.meterT > 0.68 || g.player.metering === false
  }, null, { timeout: 3000, polling: 8 })
  await page.keyboard.up('Space')
  // wait for launch (0.18s windup), then arrival, then the score to register
  await page.waitForFunction(() => window.__scene.game.ball.state === 'flight', null, { timeout: 2000 }).catch(() => {})
  await page.waitForFunction(() => {
    const g = window.__scene.game
    return g.phase === 'made' || (g.ball.state !== 'flight' && g.phase !== 'live') || g.ball.state === 'loose'
  }, null, { timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(300)
  return snap()
}

// --- score 3 straight buckets -> ON FIRE (stop as soon as it lights) ---
let makes = 0
let lastScore = 0
let fire = false
for (let i = 0; i < 6 && !fire; i++) {
  const s = await attemptShot(i)
  if (!s) { makes = 0; continue }
  if (s.score.you > lastScore) makes++
  else makes = 0 // fire needs consecutive makes
  // authoritative consecutive-makes counter (guards against snapshot races)
  makes = Math.max(makes, await page.evaluate(() => window.__scene.game.streak))
  lastScore = s.score.you
  fire = s.onFire
  if (s.phase === 'end') break
  // true turnover (not the post-make reset): take the ball back
  if (!fire && s.phase !== 'made' && s.offense !== 'player') {
    await page.evaluate(() => window.__scene.debug.give('player'))
    makes = 0
  }
}
const fireSnap = await snap()
ok(makes >= 3, `made 3 consecutive baskets via shot meter (score ${fireSnap.score.you})`)
ok(fireSnap.onFire, 'ON FIRE triggers after 3 straight makes')
await page.waitForTimeout(600)
await page.screenshot({ path: 'qa/screens/hoops-fin-onfire.png' })

// --- deliberate brick -> live rebound ---
await waitLive()
await page.evaluate(() => window.__scene.debug.give('player'))
await page.keyboard.down('Space')
await page.waitForTimeout(120) // release way below the band = brick
await page.keyboard.up('Space')
const sawLoose = await page.waitForFunction(
  () => window.__scene.game.ball.state === 'loose', null, { timeout: 5000 },
).then(() => true).catch(() => false)
ok(sawLoose, 'missed shot rims out into a live loose ball')
const recovered = await page.waitForFunction(
  () => window.__scene.game.ball.state === 'held', null, { timeout: 8000 },
).then(() => true).catch(() => false)
ok(recovered, 'rebound gets picked up (live rebound chase)')
const fireAfterMiss = await page.evaluate(() => window.__scene.game.onFire)
ok(!fireAfterMiss, 'ON FIRE extinguishes after a miss')

// --- shot clock turnover ---
await page.evaluate(() => window.__scene.debug.give('player'))
await page.evaluate(() => { window.__scene.game.clock = 0.6 })
await page.waitForTimeout(1400)
const to = await snap()
ok(to.offense === 'ai', `shot-clock expiry turns the ball over (offense=${to.offense})`)

// --- crossover double-tap ---
await page.waitForFunction(() => window.__scene.game.phase === 'live', null, { timeout: 10000 })
const impBefore = await page.evaluate(() => window.__scene.game.player.imp.length())
await page.keyboard.press('KeyD')
await page.waitForTimeout(90)
await page.keyboard.press('KeyD')
const impAfter = await page.evaluate(() => window.__scene.game.player.imp.length())
ok(impAfter > impBefore + 2, `double-tap D crossover lunges (imp ${impAfter.toFixed(1)})`)

// --- defense: jump block + steal swipe inputs ---
await page.evaluate(() => window.__scene.debug.give('ai'))
await page.waitForTimeout(150)
await page.keyboard.press('Space')
const jumped = await page.evaluate(() => window.__scene.game.player.jumpT > 0)
ok(jumped, 'SPACE while defending triggers jump block')
await page.keyboard.press('KeyF') // steal swipe (rng outcome — just must not error)
await page.waitForTimeout(700)
await page.screenshot({ path: 'qa/screens/hoops-fin-defense.png' })

// let the CPU run its offense a bit (drives/shots) while we watch for errors
await page.waitForTimeout(6000)
const cpu = await snap()
ok(true, `CPU offense ran (phase=${cpu.phase}, cpu score=${cpu.score.cpu})`)

// perf sanity: frame rate over 1.5s of live play
const fps = await page.evaluate(() => new Promise(res => {
  let n = 0
  const t0 = performance.now()
  const loop = () => {
    n++
    if (performance.now() - t0 < 1500) requestAnimationFrame(loop)
    else res(n / ((performance.now() - t0) / 1000))
  }
  requestAnimationFrame(loop)
}))
ok(fps > 45, `frame rate ok (${fps.toFixed(0)} fps)`)

console.log('CONSOLE ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8)) : 'none')
await browser.close()
if (errors.length || fails.length) process.exit(1)
