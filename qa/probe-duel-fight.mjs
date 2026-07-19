// Duel probe: the full fight kit via REAL input — walk, dash, jump attack,
// crouch poke, block chip, throw, J-J-K chain, special cancel, juggle scaling,
// hit-stop, meter build + surge consumption.
import { chromium } from 'playwright-core'

const port = process.env.IPL_PORT || '8181'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${port}/?scene=duel&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(2600)
await page.keyboard.press('x') // skip the intro cinematic
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })
console.log('PHASE FIGHT OK')

let pass = 0, fail = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
  ok ? pass++ : fail++
}

// freeze the AI into an idle dummy (block toggled via window.__blk)
await page.evaluate(() => {
  const s = window.__scene
  window.__blk = false
  window.__crouch = false
  s.ai.update = () => {
    const it = s.ai.intent
    it.move = 0; it.jump = it.light = it.heavy = it.throw = false
    it.dash = 0
    it.block = window.__blk
    it.crouch = window.__crouch
    return it
  }
  // instrument hit-stop
  window.__fz = 0
  const orig = s.fight.hitStop.bind(s.fight)
  s.fight.hitStop = k => { orig(k); window.__fz = Math.max(window.__fz, s.fight.freezeT) }
})

const S = () => page.evaluate(() => {
  const s = window.__scene
  return {
    phase: s.phase,
    p: { x: +s.player.pos.x.toFixed(2), y: +s.player.pos.y.toFixed(2), hp: s.player.hp, meter: +s.player.meter.toFixed(1), attack: s.player.attack?.kind || null, dashT: +s.player.dashT.toFixed(2), iF: +s.player.iFrames.toFixed(2), grounded: s.player.grounded, chainT: +s.player.chainT.toFixed(2) },
    f: { x: +s.foe.pos.x.toFixed(2), y: +s.foe.pos.y.toFixed(2), hp: +s.foe.hp.toFixed(1), meter: +s.foe.meter.toFixed(1), kd: +s.foe.kdT.toFixed(2), juggle: s.foe.juggleFall, combo: s.foe.comboHits, chill: +s.foe.chillT.toFixed(2), stagger: +s.foe.staggerT.toFixed(2) },
    fz: window.__fz, bolts: s.specials.bolts.length,
  }
})

const place = (px, fx, opts = {}) => page.evaluate(({ px, fx, opts }) => {
  const s = window.__scene
  for (const [f, x] of [[s.player, px], [s.foe, fx]]) {
    f.pos.set(x, 0, 0)
    f.vel.set(0, 0)
    f.attack = null
    f.hitstun = f.blockstun = f.kdT = f.staggerT = f.iFrames = f.chainT = 0
    f.juggleFall = false
    f.grabbed = false
    f.grounded = true
    f.comboHits = 0
    f.comboDmg = 0
    f.hero.setState('normal')
  }
  s.player.facing = 1
  s.foe.facing = -1
  if (opts.foeHp != null) s.foe.hp = opts.foeHp
  s.roundT = 60
}, { px, fx, opts })

// ---------- 1. walk (and walk-back slower) ----------
await place(-4, 8)
const w0 = (await S()).p.x
await page.keyboard.down('d')
await page.waitForTimeout(500)
await page.keyboard.up('d')
const w1 = (await S()).p.x
await page.keyboard.down('a')
await page.waitForTimeout(500)
await page.keyboard.up('a')
const w2 = (await S()).p.x
const fwd = w1 - w0, back = w1 - w2
check('WALK forward', fwd > 1.2, `moved ${fwd.toFixed(2)}u`)
check('WALK back slower', back > 0.4 && back < fwd, `fwd ${fwd.toFixed(2)} vs back ${back.toFixed(2)}`)

// ---------- 2. double-tap dash + backdash i-frames ----------
await place(-4, 8)
await page.keyboard.press('d')
await page.waitForTimeout(70)
await page.keyboard.press('d')
await page.waitForTimeout(120)
const dashS = await S()
check('DASH double-tap', dashS.p.dashT > 0 || dashS.p.x > -3.4, `dashT=${dashS.p.dashT} x=${dashS.p.x}`)
await page.waitForTimeout(500)
await page.keyboard.press('a')
await page.waitForTimeout(70)
await page.keyboard.press('a')
await page.waitForTimeout(100)
const bdS = await S()
check('BACKDASH i-frames', bdS.p.iF > 0.05, `iFrames=${bdS.p.iF}`)

// ---------- 3. jump attack ----------
await place(-2, 8)
await page.keyboard.press('Space')
await page.waitForTimeout(180)
await page.keyboard.press('j')
await page.waitForTimeout(80)
const jaS = await S()
check('JUMP attack (air overhead)', jaS.p.attack === 'airJ' && !jaS.p.grounded, `attack=${jaS.p.attack} y=${jaS.p.y}`)
await page.waitForTimeout(800)

// ---------- 4. crouch poke ----------
await place(-2, 8)
await page.keyboard.down('s')
await page.waitForTimeout(100)
await page.keyboard.press('j')
await page.waitForTimeout(80)
const cpS = await S()
await page.keyboard.up('s')
check('CROUCH poke (low)', cpS.p.attack === 'low', `attack=${cpS.p.attack}`)
await page.waitForTimeout(400)

// ---------- 5. block chip: fireball vs blocking foe ----------
await place(-4, 2, { foeHp: 100 })
await page.evaluate(() => { window.__blk = true })
await page.waitForTimeout(120)
await page.keyboard.press('w') // starfire fireball
await page.waitForTimeout(900)
const chipS = await S()
const chip = 100 - chipS.f.hp
check('BLOCK chips specials only', chip > 0.5 && chip < 4, `chip=${chip.toFixed(2)} (10 dmg bolt)`)

// ---------- 6. throw beats block ----------
await place(-1, 0.1, { foeHp: 100 })
await page.evaluate(() => { window.__blk = true })
await page.waitForTimeout(100)
await page.keyboard.press('f')
await page.waitForTimeout(900)
const thS = await S()
await page.evaluate(() => { window.__blk = false })
check('THROW beats block + knockdown', 100 - thS.f.hp >= 11 && (thS.f.kd > 0 || thS.f.juggle), `dmg=${(100 - thS.f.hp).toFixed(1)} kd=${thS.f.kd} juggle=${thS.f.juggle}`)
await page.waitForTimeout(1600)

// ---------- 7. J-J-K chain -> launcher ----------
await place(-1, 0.4, { foeHp: 100 })
await page.keyboard.press('j')
await page.waitForTimeout(230)
await page.keyboard.press('j')
await page.waitForTimeout(230)
await page.keyboard.press('k')
await page.waitForTimeout(300)
const chS = await S()
check('CHAIN J-J-K launcher', chS.f.combo >= 3 && (chS.f.y > 0.1 || chS.f.juggle), `combo=${chS.f.combo} foeY=${chS.f.y} juggle=${chS.f.juggle}`)
const hpAfterChain = chS.f.hp
check('SCALING on chain', 100 - hpAfterChain > 12 && 100 - hpAfterChain < 21, `chain dmg=${(100 - hpAfterChain).toFixed(1)} (raw 20 scaled)`)
// the [n]x counter stamps the victim's side, wired to the same comboHits
const m3 = await page.evaluate(() => {
  const el = document.querySelector('.duel-mult.duel-right')
  return { show: el?.classList.contains('show'), num: el?.querySelector('.duel-mult-num')?.textContent }
})
check('COUNTER stamps 3x on the chain', m3.show && m3.num === '3x', JSON.stringify(m3))

// ---------- 8. juggle the launched foe (step in like a player, then jab) ----------
await page.waitForTimeout(200)
await page.keyboard.down('d')
await page.waitForTimeout(240)
await page.keyboard.up('d')
await page.keyboard.press('j')
await page.waitForTimeout(300)
const jgS = await S()
check('JUGGLE hit while airborne', jgS.f.combo >= 4, `combo=${jgS.f.combo}`)
check('HIT-STOP occurred', jgS.fz >= 0.05, `max freeze=${jgS.fz.toFixed(3)}s`)
check('METER builds from damage', jgS.p.meter > 4, `meter=${jgS.p.meter}`)
const m4 = await page.evaluate(() => {
  const el = document.querySelector('.duel-mult.duel-right')
  return { show: el?.classList.contains('show'), num: el?.querySelector('.duel-mult-num')?.textContent, t2: el?.classList.contains('t2') }
})
check('COUNTER 4x + ember tier on the juggle', m4.show && m4.num === '4x' && m4.t2, JSON.stringify(m4))
await page.waitForTimeout(1800)

// ---------- 9. special cancel: J hit -> W fireball ----------
await place(-1, 0.4, { foeHp: 100 })
await page.evaluate(() => { const s = window.__scene; s.cds[1] = 0 })
await page.keyboard.press('j')
await page.waitForTimeout(200) // inside the 0.35s chain window after the hit
await page.keyboard.press('w')
await page.waitForTimeout(120)
const scS = await page.evaluate(() => {
  const s = window.__scene
  return { bolts: s.specials.bolts.length, attack: s.player.attack?.kind || null, cd: +s.cds[1].toFixed(1), foeHp: +s.foe.hp.toFixed(1) }
})
// cd consumed + attack canceled + (bolt in flight, or it already struck the point-blank foe)
check('SPECIAL CANCEL from chain hit', scS.cd > 0 && scS.attack === null && (scS.bolts > 0 || scS.foeHp < 95),
  `bolts=${scS.bolts} cd=${scS.cd} foeHp=${scS.foeHp}`)
await page.waitForTimeout(900)

// ---------- 10. surge consumes the full bar ----------
await place(-2.2, 0.4, { foeHp: 100 })
await page.evaluate(() => { const s = window.__scene; s.player.meter = 100; s.cds[1] = 0 })
await page.keyboard.press('w')
await page.waitForTimeout(700)
const sgS = await S()
const surgeDmg = 100 - sgS.f.hp
check('SURGE consumed meter', sgS.p.meter < 40, `meter=${sgS.p.meter}`) // rebuilt a little from the hit itself
check('SURGE boosted damage', surgeDmg >= 13, `dmg=${surgeDmg.toFixed(1)} (base 10, surge 15)`)

await page.screenshot({ path: 'qa/screens/duel-fight-probe.png' })
console.log(`RESULT: ${pass} passed, ${fail} failed`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
process.exit(fail || errors.length ? 1 : 0)
