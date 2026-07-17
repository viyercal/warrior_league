// probe-siege-mechanics.mjs — asserts each skill's inGame.siege PROMISE and the
// remaining economy/combat mechanics, with real key input (aim is set as state
// for determinism). Complements probe-siege-flow (endstates) and
// probe-siege-skills (cooldown/state wiring).
// Usage: node qa/probe-siege-mechanics.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5188'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const fails = []
const assert = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg) }

const newPage = async loadout => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 } })
  await ctx.addInitScript(lo => {
    localStorage.setItem('ipl-profile-v2', JSON.stringify({
      name: 'QA', loadout: lo,
      appearance: { primary: '#3fa7ff', secondary: '#232a4d', glow: '#7df9ff', head: 'visor', hair: 'spikes', trail: 'spark', cape: true },
      stats: { wins: {}, plays: {} },
    }))
  }, loadout)
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/?scene=siege&mute=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__scene?.phase === 'intro', null, { timeout: 15000 })
  await page.waitForTimeout(300)
  await page.keyboard.press('Space') // skip the intro cinematic (world is frozen during it)
  await page.waitForTimeout(250)
  await page.evaluate(() => { window.__scene.breakT = 99999 }) // hold waves off — hermetic field
  return { ctx, page, errors }
}
const closeCase = async (ctx, errors, label) => {
  assert(errors.length === 0, `zero console errors (${label})${errors.length ? ' ' + JSON.stringify(errors.slice(0, 3)) : ''}`)
  await ctx.close()
}
// spawn a raider at (x,z), lane-marching, non-aggro unless asked
const SPAWN = `(type, x, z, aggro) => {
  const s = window.__scene
  const e = s.army.spawn(type, 'west')
  e.minion.group.position.set(x, 0, z)
  e.ox = 0; e.oz = 0; e.aggro = !!aggro
  return e
}`
// aim with the REAL mouse: project world point -> screen px, move cursor there.
// The first mousemove on a fresh page is sometimes dropped, and the
// mouse-parallax camera shifts the projection — so poll until the input layer
// confirms the cursor, and settle at least two passes.
const aimAt = async (page, x, z) => {
  let settled = 0
  for (let tries = 0; tries < 14 && settled < 2; tries++) {
    let [px, py] = await page.evaluate(([wx, wz]) => {
      const s = window.__scene
      const v = s.aim.clone().set(wx, 0.01, wz).project(s.camera)
      return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]
    }, [x, z])
    // clamp into the viewport: an off-screen move never registers, while a
    // clamped one tilts the parallax camera so later passes converge
    px = Math.min(1430, Math.max(10, px))
    py = Math.min(800, Math.max(10, py))
    await page.mouse.move(px + (tries % 2), py)
    await page.waitForTimeout(100)
    const ok = await page.evaluate(([tx, ty]) => {
      const m = window.__ipl.input.mousePx
      return Math.abs(m.x - tx) < 4 && Math.abs(m.y - ty) < 4
    }, [px + (tries % 2), py])
    settled = ok ? settled + 1 : 0
  }
}

// ================= LOADOUT A: starfire / quake / mend / aegis =================
console.log('--- starfire burst / quake knock / mend heal / aegis absorb ---')
{
  const { ctx, page, errors } = await newPage(['starfire', 'quake', 'mend', 'aegis'])

  // starfire: bursts on the first raider it touches — AoE hits the cluster
  await aimAt(page, 0, 1.5)
  await page.evaluate(`(${SPAWN})('grunt', 0, 1.5, false); (${SPAWN})('grunt', 0.6, 1, false); (${SPAWN})('grunt', -0.6, 1.2, false)`)
  await page.keyboard.press('Digit1')
  await page.waitForTimeout(900)
  const sf = await page.evaluate(() => {
    const s = window.__scene
    return { hurt: s.army.active.filter(e => e.hp < e.def.hp || !e.alive).length + (3 - s.army.active.length), kills: s.kills }
  })
  assert(sf.hurt >= 2, `starfire burst hit the cluster (${sf.hurt}/3 hurt, ${sf.kills} kills)`)

  // quake: point-blank damage + knockback (brute survives 40 dmg, gets shoved)
  await page.evaluate(() => window.__scene.army.clearAll())
  const bd0 = await page.evaluate(`(() => {
    const e = (${SPAWN})('brute', 2.2, 6.4, false)
    window.__qaBrute = e
    const s = window.__scene, p = s.hero.group.position
    return Math.hypot(e.minion.group.position.x - p.x, e.minion.group.position.z - p.z)
  })()`)
  await page.keyboard.press('Digit2')
  await page.waitForTimeout(600)
  const qk = await page.evaluate(() => {
    const e = window.__qaBrute, s = window.__scene, p = s.hero.group.position
    return { hp: e.hp, d: Math.hypot(e.minion.group.position.x - p.x, e.minion.group.position.z - p.z) }
  })
  assert(qk.hp === 38, `quake dealt 40 to brute (78 -> ${qk.hp})`)
  assert(qk.d > bd0 + 0.8, `quake knocked brute back (${bd0.toFixed(1)} -> ${qk.d.toFixed(1)}u)`)

  // mend: +45 hp, capped at 100
  await page.evaluate(() => { window.__scene.army.clearAll(); window.__scene.hp = 40 })
  await page.keyboard.press('Digit3')
  await page.waitForTimeout(250)
  const hp = await page.evaluate(() => window.__scene.hp)
  assert(hp === 85, `mend healed 45 (40 -> ${hp})`)

  // aegis: barrier absorbs the hit, hp untouched
  await page.keyboard.press('Digit4')
  await page.waitForTimeout(250)
  const ag = await page.evaluate(() => {
    const s = window.__scene
    s._damageHero(20, null)
    return { hp: s.hp, shield: s.shield?.hp }
  })
  assert(ag.hp === 85 && ag.shield === 40, `aegis absorbed 20 (hp ${ag.hp}, shield ${ag.shield}/60)`)
  await closeCase(ctx, errors, 'loadout A')
}

// ================= LOADOUT B: frostring / gravity / titan / ghost =================
console.log('--- frost slow / gravity pull / titan stomp / ghost untargetable ---')
{
  const { ctx, page, errors } = await newPage(['frostring', 'gravity', 'titan', 'ghost'])

  // frostring: chills raiders inside (slowMul) + chip damage
  await aimAt(page, 0, -2)
  await page.evaluate(`(${SPAWN})('grunt', 0, -2, false)`)
  await page.keyboard.press('Digit1')
  await page.waitForTimeout(400)
  const fr = await page.evaluate(() => {
    const e = window.__scene.army.active[0]
    return { slow: e.slowMul, hp: e.hp }
  })
  assert(fr.slow <= 0.5, `frost slows raider (slowMul ${fr.slow.toFixed(2)})`)
  assert(fr.hp === 12, `frost chip damage (22 -> ${fr.hp})`)

  // gravity: drags raiders toward the well
  await aimAt(page, 1.5, -6)
  await page.evaluate(`window.__scene.army.clearAll(); window.__qaB = (${SPAWN})('brute', 6, -6, false)`)
  await page.keyboard.press('Digit2')
  await page.waitForTimeout(900)
  const gv = await page.evaluate(() => {
    const p = window.__qaB.minion.group.position
    return Math.hypot(p.x - 1.5, p.z - -6)
  })
  assert(gv < 2.5, `gravity dragged brute to the well (4.5u -> ${gv.toFixed(1)}u)`)

  // titan: stomp shockwaves damage raiders while moving
  await page.evaluate(`window.__scene.army.clearAll(); const h = window.__scene.hero.group.position; (${SPAWN})('grunt', h.x + 1.4, h.z, false); (${SPAWN})('grunt', h.x - 1.4, h.z, false)`)
  await page.keyboard.press('Digit3')
  await page.waitForTimeout(150)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(350)
  await page.keyboard.up('KeyW')
  const ti = await page.evaluate(() => window.__scene.army.active.map(e => e.hp))
  assert(ti.some(h => h <= 14), `titan stomp damaged adjacent raiders (hp ${ti})`)

  // ghost: raiders cannot target the hero while phased
  await page.keyboard.press('Digit4')
  await page.waitForTimeout(300)
  const gh = await page.evaluate(() => window.__scene._armyCtx.heroTargetable)
  assert(gh === false, 'ghost makes hero untargetable to raiders')
  await closeCase(ctx, errors, 'loadout B')
}

// ================= LOADOUT C: blink / decoy / comet / overdrive =================
console.log('--- blink i-frames / decoy taunt / comet wipe / overdrive sprint ---')
{
  const { ctx, page, errors } = await newPage(['blink', 'decoy', 'comet', 'overdrive'])

  // blink: teleport with brief i-frames
  await aimAt(page, 0, -2)
  await page.keyboard.press('Digit1')
  const bl = await page.evaluate(() => ({ i: window.__scene.iFrames, z: window.__scene.hero.group.position.z }))
  assert(bl.i > 0, `blink grants i-frames (${bl.i.toFixed(2)}s)`)
  assert(bl.z < 2, `blink teleported up-field (z=${bl.z.toFixed(1)})`)

  // decoy: taunts raiders within ~10u — they walk to it and beat on it
  await aimAt(page, -4, 0)
  await page.keyboard.press('Digit2')
  await page.waitForTimeout(200)
  await page.evaluate(`(${SPAWN})('grunt', -8, 0, false)`)
  await page.waitForTimeout(3000)
  const dc = await page.evaluate(() => {
    const s = window.__scene
    const p = s.army.active[0].minion.group.position
    return { d: Math.hypot(p.x - -4, p.z), hp: s.decoy?.hp }
  })
  assert(dc.d < 2.5, `taunted grunt closed on decoy (${dc.d.toFixed(1)}u away)`)
  assert(dc.hp < 40, `decoy soaked raider hits (hp ${dc.hp}/40)`)

  // comet: lane-wipe — cluster deleted
  await aimAt(page, 5.4, -5.4)
  await page.evaluate(`window.__scene.army.clearAll()
    for (let i = 0; i < 4; i++) (${SPAWN})('grunt', 5 + (i % 2) * 0.9, -5 - (i >> 1) * 0.9, false)`)
  const k0 = await page.evaluate(() => window.__scene.kills)
  await page.keyboard.press('Digit3')
  await page.waitForTimeout(1700)
  const cm = await page.evaluate(() => window.__scene.kills)
  assert(cm - k0 >= 3, `comet wiped the cluster (${cm - k0}/4 kills)`)

  // overdrive: sprint — clearly faster than base 9 u/s
  await page.evaluate(() => { window.__scene.army.clearAll(); window.__scene.hero.group.position.set(0, 0, 10) })
  await page.keyboard.press('Digit4')
  await page.waitForTimeout(120)
  const z0 = await page.evaluate(() => window.__scene.hero.group.position.z)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(800)
  await page.keyboard.up('KeyW')
  const moved = await page.evaluate(z => z - window.__scene.hero.group.position.z, z0)
  assert(moved > 9, `overdrive sprint (${moved.toFixed(1)}u in 0.8s vs 7.2 base)`)
  await closeCase(ctx, errors, 'loadout C')
}

// ================= ECONOMY / SIEGE MECHANICS =================
console.log('--- exploder wall damage / rebuild discount / wave bonus / H toggle ---')
{
  const { ctx, page, errors } = await newPage(['blink', 'starfire', 'quake', 'comet'])

  // exploder detonates at the gate and scorches the citadel walls
  const cit0 = await page.evaluate(`(() => {
    const e = (${SPAWN})('exploder', 1.4, 11, false)
    e.wpIdx = e.wps.length - 1
    return window.__scene.citadel.hp
  })()`)
  await page.waitForTimeout(1200)
  const ex = await page.evaluate(() => ({ cit: window.__scene.citadel.hp, alive: window.__scene.army.aliveCount() }))
  assert(ex.cit <= cit0 - 22, `exploder blast damaged citadel walls (${cit0} -> ${ex.cit})`)
  assert(ex.alive === 0, 'exploder died in its own blast')

  // destroyed turret -> half-price rebuild prompt + real F rebuild
  await page.evaluate(() => {
    const s = window.__scene
    s.debug.gold(400)
    const pad = s.turrets.pads[4] // (-4.6, 8.6)
    s.turrets.build(pad)
    s.turrets.take(pad.turret, 999) // mortar-grade wipe
    s.hero.group.position.set(pad.x, 0, pad.z)
  })
  await page.waitForTimeout(400)
  const rb = await page.evaluate(() => ({
    discount: window.__scene.turrets.pads[4].discount,
    prompt: document.querySelector('.siege-prompt')?.textContent,
    gold: window.__scene.gold,
  }))
  assert(rb.discount === true, 'destroyed pad flagged for half-price rebuild')
  assert(/50g/.test(rb.prompt || ''), `prompt offers 50g rebuild ("${rb.prompt}")`)
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(700)
  const rb2 = await page.evaluate(() => ({
    lvl: window.__scene.turrets.pads[4].turret?.level, gold: window.__scene.gold,
  }))
  assert(rb2.lvl === 1 && rb2.gold === rb.gold - 50, `rebuilt for 50g (${rb.gold} -> ${rb2.gold})`)

  // wave-clear bonus: turrets clear wave 1 -> +60g on top of kill gold
  await page.evaluate(() => {
    const s = window.__scene
    s.debug.gold(3000)
    for (const i of [2, 3, 5]) {
      const pad = s.turrets.pads[i]
      if (!pad.turret) s.turrets.build(pad)
      s.turrets.upgrade(pad.turret)
      s.turrets.upgrade(pad.turret)
    }
    const p4 = s.turrets.pads[4].turret
    s.turrets.upgrade(p4); s.turrets.upgrade(p4)
    s.hero.group.position.set(0, 0, 7.5)
    window.__qaEarn0 = s.goldEarned
    s.debug.wave(1)
  })
  let cleared = null
  for (let i = 0; i < 100 && !cleared; i++) {
    await page.waitForTimeout(300)
    cleared = await page.evaluate(() => {
      const s = window.__scene
      if (s.waveState === 'break' && s.wave === 1) return { delta: s.goldEarned - window.__qaEarn0, perfect: s.perfectWaves }
      return null
    })
  }
  assert(!!cleared, 'wave 1 cleared by turrets')
  // turrets stop everything before the gate -> PERFECT WAVE adds +40 on top
  if (cleared) assert(cleared.delta === 180, `wave bonus: 10 kills x8 + 60 bonus + 40 perfect = 180g (${cleared.delta}g)`)
  if (cleared) assert(cleared.perfect === 1, `PERFECT WAVE counted (${cleared.perfect})`)

  // H toggles the hint box
  const h0 = await page.evaluate(() => document.querySelector('.hint-box').style.display !== 'none')
  await page.keyboard.press('KeyH')
  const h1 = await page.evaluate(() => document.querySelector('.hint-box').style.display !== 'none')
  await page.keyboard.press('KeyH')
  const h2 = await page.evaluate(() => document.querySelector('.hint-box').style.display !== 'none')
  assert(h0 && !h1 && h2, `H toggles hints (${h0} -> ${h1} -> ${h2})`)
  await closeCase(ctx, errors, 'mechanics')
}

await browser.close()
console.log(fails.length ? `\nSIEGE MECHANICS PROBE: ${fails.length} FAILURES` : '\nSIEGE MECHANICS PROBE: ALL PASS')
process.exit(fails.length ? 1 : 0)
