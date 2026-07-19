// Duel probe: GAME-FEEL pass — knockdown continuity (no single-frame pops
// through launch -> fall -> bounce -> prone -> rise), a readable prone beat,
// visible wakeup invulnerability, OTG impossibility, whiff-over-downed
// feedback, quick-rise, and the [n]x combo counter (appears at 2x, increments,
// tiers at 7x, mirrors incoming combos in crimson, crumbles on drops, resets
// between combos).
import { chromium } from 'playwright-core'

const port = process.env.IPL_PORT || '8181'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
let pass = 0, fail = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
  ok ? pass++ : fail++
}

await page.goto(`http://localhost:${port}/?scene=duel&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(2600)
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })

// freeze the AI into an idle dummy; instrument whiff cues + a per-frame tracer
await page.evaluate(() => {
  const s = window.__scene
  s.ai.update = () => {
    const it = s.ai.intent
    it.move = 0; it.jump = it.light = it.heavy = it.throw = false
    it.dash = 0; it.block = false; it.crouch = false
    return it
  }
  window.__swish = 0
  const op = window.__ipl.audio.play.bind(window.__ipl.audio)
  window.__ipl.audio.play = (name, o) => { if (name === 'swish') window.__swish++; return op(name, o) }
  window.__trace = null
  const ou = s.update.bind(s)
  s.update = (dt, t) => {
    ou(dt, t)
    if (!window.__trace) return
    const f = s.foe
    window.__trace.push({
      dt, y: f.pos.y, gr: f.hero.group.rotation.x,
      hr: f.hero.hips.rotation.x, hy: f.hero.hips.position.y,
      kd: f.kdT, jf: f.juggleFall, sh: f.shimmer.material.opacity, iF: f.iFrames,
    })
  }
})

const place = (px, fx) => page.evaluate(({ px, fx }) => {
  const s = window.__scene
  for (const [f, x] of [[s.player, px], [s.foe, fx]]) {
    f.pos.set(x, 0, 0); f.vel.set(0, 0)
    f.attack = null
    f.hitstun = f.blockstun = f.kdT = f.staggerT = f.iFrames = f.chainT = 0
    f.juggleFall = false; f.grabbed = false; f.grounded = true
    f.kdVy = 0; f.kdSettled = true; f.qrT = 0; f.getup = false; f.wakeInvT = 0
    f.comboHits = 0; f.comboDmg = 0
    f.hp = 100
    f.hero.setState('normal')
    f.hero.group.rotation.x = 0
    f.hero.hips.rotation.x = 0
  }
  s.player.facing = 1; s.foe.facing = -1
  s.player.meter = 0
  s.roundT = 60
  s.dHud.hideCombos()
}, { px, fx })

// ============ A. knockdown continuity: launch -> fall -> prone -> rise ============
await place(-1, 0.4)
await page.evaluate(() => { window.__trace = [] })
await page.keyboard.press('j')
await page.waitForTimeout(230)
await page.keyboard.press('j')
await page.waitForTimeout(230)
await page.keyboard.press('k') // launcher
await page.waitForTimeout(2700) // full arc: fall, bounce, prone, rise, wake shimmer
const trace = await page.evaluate(() => { const t = window.__trace; window.__trace = null; return t })
{
  const wrap = d => { let x = d % (Math.PI * 2); if (x > Math.PI) x -= Math.PI * 2; if (x < -Math.PI) x += Math.PI * 2; return x }
  let maxY = 0, maxG = 0, maxH = 0, maxHy = 0
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1], b = trace[i]
    const dt = Math.max(b.dt, 1 / 120) // engine dt (clamped <= 0.05)
    maxY = Math.max(maxY, Math.abs(b.y - a.y) / dt)
    maxG = Math.max(maxG, Math.abs(wrap(b.gr - a.gr)) / dt)
    maxH = Math.max(maxH, Math.abs(b.hr - a.hr) / dt)
    maxHy = Math.max(maxHy, Math.abs(b.hy - a.hy) / dt)
  }
  // rate ceilings: legit motion tops out ~13u/s fall, ~12rad/s tumble/untumble,
  // ~14rad/s hip roll, ~3u/s hip lift. The old snaps measured 30-100+ /s.
  check('CONTINUITY pos.y (no teleports)', maxY < 16, `max ${maxY.toFixed(1)} u/s`)
  check('CONTINUITY body rotation (no untumble snap)', maxG < 15, `max ${maxG.toFixed(1)} rad/s`)
  check('CONTINUITY hips rotation (no wakeup pop)', maxH < 18, `max ${maxH.toFixed(1)} rad/s`)
  check('CONTINUITY hips height (no stand-up teleport)', maxHy < 4.5, `max ${maxHy.toFixed(1)} u/s`)
  const kdSamples = trace.filter(s => s.kd > 0)
  check('KNOCKDOWN happened', kdSamples.length > 10, `${kdSamples.length} downed samples`)
  const bounce = kdSamples.some(s => s.y > 0.03)
  check('LANDING rebound (weighty bounce)', bounce, `peak kd y=${Math.max(...kdSamples.map(s => s.y)).toFixed(2)}`)
  const prone = kdSamples.reduce((t, s) => t + (s.hr < -1.2 ? s.dt : 0), 0)
  check('PRONE beat readable (>= 0.22s fully down)', prone >= 0.22, `${prone.toFixed(2)}s prone`)
  const wake = trace.some(s => s.kd <= 0 && s.iF > 0 && s.sh > 0.04)
  check('WAKEUP invulnerability shimmer visible', wake)
}

// ============ B. OTG impossible + whiff-over-downed feedback ============
await place(-1, 0.3)
await page.evaluate(() => {
  const s = window.__scene
  s.fight.applyHit(s.player, s.foe, { dmg: 6, launch: 9, kb: 1 })
})
await page.waitForFunction(() => window.__scene.foe.kdT > 0.5, null, { timeout: 4000 })
const otg = await page.evaluate(() => {
  const s = window.__scene
  const hp0 = s.foe.hp
  const res = s.fight.applyHit(s.player, s.foe, { dmg: 10, kind: 'heavy' })
  return { res, hp0: +hp0.toFixed(1), hp1: +s.foe.hp.toFixed(1), kd: +s.foe.kdT.toFixed(2) }
})
check('OTG impossible (downed body cannot be hit)', otg.res === 'miss' && otg.hp0 === otg.hp1, JSON.stringify(otg))
const sw0 = await page.evaluate(() => window.__swish)
await page.keyboard.press('j') // swing over the prone body
await page.waitForTimeout(350)
const sw1 = await page.evaluate(() => window.__swish)
check('WHIFF over downed body reads clean (swish cue)', sw1 > sw0, `swish ${sw0} -> ${sw1}`)
await page.waitForTimeout(1400)

// ============ C. quick-rise: direction held at landing = faster get-up ============
const downtime = async hold => {
  await place(-4, 3)
  if (hold) await page.keyboard.down('d')
  const ms = await page.evaluate(() => new Promise(res => {
    const s = window.__scene
    s.fight.applyHit(s.foe, s.player, { dmg: 4, launch: 10, kb: 1 })
    let t0 = 0
    const iv = setInterval(() => {
      if (!t0 && s.player.kdT > 0) t0 = performance.now()
      if (t0 && s.player.kdT <= 0.002) { clearInterval(iv); res(performance.now() - t0) }
    }, 25)
  }))
  if (hold) await page.keyboard.up('d')
  await page.waitForTimeout(650) // let the wakeup window clear
  return ms
}
const slow = await downtime(false)
const fast = await downtime(true)
check('QUICK-RISE shortens the knockdown', fast < slow - 250, `held ${fast.toFixed(0)}ms vs ${slow.toFixed(0)}ms`)

// ============ D. the [n]x combo counter ============
const mult = side => page.evaluate(sel => {
  const el = document.querySelector(sel)
  return {
    show: el?.classList.contains('show') || false,
    num: el?.querySelector('.duel-mult-num')?.textContent || '',
    sub: el?.querySelector('.duel-mult-sub')?.textContent || '',
    cls: el?.className || '',
  }
}, side === 'L' ? '.duel-mult.duel-left' : '.duel-mult.duel-right')

// D1: hidden on the first hit, 2x on the second, increments on the third
// (210ms press gaps: inside the 0.35s chain window, well inside hitstun)
await place(-1, 0.4)
await page.keyboard.press('j')
await page.waitForTimeout(210)
const m1 = await mult('R')
check('COUNTER hidden on the 1st hit', !m1.show, JSON.stringify(m1))
await page.keyboard.press('j')
await page.waitForTimeout(210)
const m2 = await mult('R')
check('COUNTER shows 2x on the 2nd hit', m2.show && m2.num === '2x' && /t1/.test(m2.cls), JSON.stringify(m2))
await page.screenshot({ path: 'qa/screens/duel-feel-counter-2x.png' })
await page.keyboard.press('k')
await page.waitForTimeout(280)
const m3 = await mult('R')
check('COUNTER increments to 3x', m3.show && m3.num === '3x', JSON.stringify(m3))
check('COUNTER carries the damage subtotal', /DMG/.test(m3.sub), m3.sub)
// the launcher converts to a knockdown -> final stamp, then it clears
await page.waitForTimeout(2600)
const m4 = await mult('R')
check('COUNTER resets between combos', !m4.show, JSON.stringify(m4))

// D2: incoming combo mirrors to the player's side, crimson-tinted
await place(-1, 0.6)
await page.evaluate(() => {
  const s = window.__scene
  s.fight.applyHit(s.foe, s.player, { dmg: 2, hitstun: 0.9, kb: 0.2 })
  s.fight.applyHit(s.foe, s.player, { dmg: 2, hitstun: 0.9, kb: 0.2 })
})
await page.waitForTimeout(150)
const inc = await mult('L')
check('COUNTER mirrors incoming combos (left, crimson)', inc.show && inc.num === '2x' && /duel-incoming/.test(inc.cls), JSON.stringify(inc))

// D3: blood tier at 7x on the incoming side
await page.evaluate(() => {
  const s = window.__scene
  for (let i = 0; i < 5; i++) s.fight.applyHit(s.foe, s.player, { dmg: 2, hitstun: 0.9, kb: 0.2 })
})
await page.waitForTimeout(150)
const t7 = await mult('L')
check('COUNTER blood tier at 7x', t7.show && t7.num === '7x' && /t3/.test(t7.cls), JSON.stringify(t7))
await page.screenshot({ path: 'qa/screens/duel-feel-counter-7x.png' })

// D4: the victim recovers standing -> dropped combo cracks and crumbles
await page.waitForTimeout(950) // hitstun expires, player recovers on his feet
const drop = await page.evaluate(() => {
  const el = document.querySelector('.duel-mult.duel-left')
  return { drop: el.classList.contains('drop'), show: el.classList.contains('show') }
})
check('DROPPED combo crumbles (escape -> crack)', drop.drop || !drop.show, JSON.stringify(drop))
await page.screenshot({ path: 'qa/screens/duel-feel-counter-drop.png' })
await page.waitForTimeout(900)
const gone = await mult('L')
check('DROPPED stamp clears', !gone.show, JSON.stringify(gone))

console.log(`RESULT: ${pass} passed, ${fail} failed`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
process.exit(fail || errors.length ? 1 : 0)
