// Kart skills probe: exercises ALL 12 archetypes across 3 loadouts via real
// keypresses (1-4), asserting each archetype's inGame.kart promise.
// node qa/probe-kart-skills.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5186'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
const errors = []
const check = (name, ok, detail = '') => {
  results.push([name, ok, detail])
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function boot(loadout) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/?scene=hub&mute=1`, { waitUntil: 'load' })
  await page.evaluate(lo => {
    const p = JSON.parse(localStorage.getItem('ipl-profile-v2') || '{}')
    p.loadout = lo
    localStorage.setItem('ipl-profile-v2', JSON.stringify(p))
  }, loadout)
  await page.goto(`http://localhost:${port}/?scene=kart&mute=1`, { waitUntil: 'load' })
  // boot -> intro flyover (any key skips) -> countdown -> race
  await page.waitForFunction(() => window.__scene?.state === 'intro', null, { timeout: 15000 })
  await page.keyboard.press('x')
  await page.waitForFunction(() => window.__scene?.state === 'race', null, { timeout: 12000 })
  await page.waitForTimeout(300)
  const st = await page.evaluate(() => ({
    state: window.__scene.state,
    defs: window.__scene.skillDefs.map(d => d.archetype),
  }))
  check(`loadout [${loadout.join(',')}] racing`, st.state === 'race', `archetypes=${st.defs.join(',')}`)
  return page
}

/* ================= loadout 1: blink / starfire / quake / comet ================= */
{
  const page = await boot(['blink', 'starfire', 'quake', 'comet'])
  await page.keyboard.down('w')
  await page.waitForTimeout(1200)

  // dash: teleport 12u along heading, keeps speed (re-center first — the
  // unsteered probe kart may be grinding the soft wall which bleeds speed)
  const dash = await page.evaluate(() => {
    const s = window.__scene
    const p = s.player
    const c = s.track.pos[p.idx], tn = s.track.tan[p.idx]
    p.group.position.set(c.x, 0, c.z)
    p.heading = Math.atan2(tn.x, tn.z)
    p.speed = 20
    return { x: p.group.position.x, z: p.group.position.z, speed: p.speed }
  })
  await page.keyboard.press('1')
  await page.waitForTimeout(120)
  const dash2 = await page.evaluate(() => {
    const p = window.__scene.player
    return { x: p.group.position.x, z: p.group.position.z, speed: p.speed, cd: window.__scene.cds[0] }
  })
  const dashDist = Math.hypot(dash2.x - dash.x, dash2.z - dash.z)
  // 12u blink + ~2.5u of normal travel during the 120ms sample window
  check('dash: blink ~12u, keeps speed, starts cd', dashDist > 11 && dashDist < 18 && dash2.speed >= dash.speed - 3 && dash2.cd > 0,
    `dist=${dashDist.toFixed(1)} speed ${dash.speed.toFixed(1)}->${dash2.speed.toFixed(1)} cd=${dash2.cd.toFixed(1)}`)

  // projectile: homing shell at kart ahead -> spin out
  const ahead = await page.evaluate(() => {
    const s = window.__scene
    // put a rival 15u ahead of the player so the shell has a real target
    const p = s.player
    const tgt = s.standings[s.standings.indexOf(p) - 1] || s.karts.find(k => !k.isPlayer)
    const tn = { x: Math.sin(p.heading), z: Math.cos(p.heading) }
    tgt.group.position.set(p.group.position.x + tn.x * 15, 0, p.group.position.z + tn.z * 15)
    tgt.idx = s.track.nearestIdx(tgt.group.position, p.idx, 512)
    tgt.lastS = tgt.idx / s.track.N
    tgt.spinT = 0
    for (const k of s.karts) if (!k.isPlayer) k.spinT = 0
    s.standings.sort((a, b) => b.progress - a.progress)
    return tgt.name
  })
  await page.keyboard.press('2')
  await page.waitForTimeout(150)
  const shellFired = await page.evaluate(() => window.__scene.items.shells.length)
  let spun = false
  for (let i = 0; i < 14 && !spun; i++) {
    await page.waitForTimeout(200)
    // the shell homes on the standings-ahead kart but detonates on the first rival in its path
    spun = await page.evaluate(() => window.__scene.karts.some(k => !k.isPlayer && k.spinT > 0))
  }
  check('projectile: shell fired + rival spins out', shellFired >= 1 && spun, `fired=${shellFired} target=${ahead}`)

  // nova: radial shunt to nearby karts
  const novaRes = await page.evaluate(() => {
    const s = window.__scene
    const p = s.player
    const near = s.karts.filter(k => !k.isPlayer).slice(0, 2)
    near.forEach((k, i) => {
      k.group.position.set(p.group.position.x + (i ? 3 : -3), 0, p.group.position.z + 2)
      k.idx = s.track.nearestIdx(k.group.position, p.idx, 512)
      k.lastS = k.idx / s.track.N
      k.kv.set(0, 0, 0)
    })
    return near.map(k => k.name)
  })
  await page.keyboard.press('3')
  await page.waitForTimeout(120)
  const shoved = await page.evaluate(ns => ns.map(n => {
    const k = window.__scene.karts.find(k => k.name === n)
    return { kv: k.kv.length(), skid: k.slickT }
  }), novaRes)
  check('nova: nearby karts shunted away', shoved.every(v => v.kv > 1.2 || v.skid > 0.3), shoved.map(v => `kv=${v.kv.toFixed(1)},skid=${v.skid.toFixed(1)}`).join(' / '))
  await page.screenshot({ path: 'qa/screens/kart-skill-nova.png' })

  // meteor: comet onto closest rival -> spin out + shockwave
  await page.waitForTimeout(400)
  const cometTarget = await page.evaluate(() => {
    const s = window.__scene
    s.standings.sort((a, b) => b.progress - a.progress)
    const i = s.standings.indexOf(s.player)
    const t = i > 0 ? s.standings[i - 1] : s.standings[i + 1]
    t.spinT = 0
    return t.name
  })
  await page.keyboard.press('4')
  await page.waitForTimeout(150)
  const cometUp = await page.evaluate(() => window.__scene.items.comets.length)
  let cometSpun = false
  for (let i = 0; i < 14 && !cometSpun; i++) {
    await page.waitForTimeout(200)
    cometSpun = await page.evaluate(n => window.__scene.karts.find(k => k.name === n).spinT > 0, cometTarget)
  }
  check('meteor: comet cast + rival spun out', cometUp >= 1 && cometSpun, `target=${cometTarget}`)

  // Q alias fires slot 1
  await page.waitForTimeout(5200) // blink cd 5s
  const qx = await page.evaluate(() => window.__scene.player.group.position.x)
  await page.keyboard.press('q')
  await page.waitForTimeout(100)
  const qMoved = await page.evaluate(x0 => Math.abs(window.__scene.player.group.position.x - x0), qx)
  const qCd = await page.evaluate(() => window.__scene.cds[0])
  check('Q alias casts slot 1', qCd > 4 || qMoved > 5, `cd=${qCd.toFixed(1)}`)
  await page.close()
}

/* ================= loadout 2: frostring / overdrive / aegis / mend ================= */
{
  const page = await boot(['frostring', 'overdrive', 'aegis', 'mend'])
  await page.keyboard.down('w')
  await page.waitForTimeout(1400)

  // slowfield: ice slick dropped behind; crossing kart skids + slows
  await page.keyboard.press('1')
  await page.waitForTimeout(120)
  const slick = await page.evaluate(() => {
    const s = window.__scene
    if (!s.items.slicks.length) return null
    const sl = s.items.slicks[0]
    const ai = s.karts.find(k => !k.isPlayer)
    ai.group.position.set(sl.x, 0, sl.z)
    ai.slickT = 0
    return new Promise(res => setTimeout(() => res({ n: s.items.slicks.length, slickT: ai.slickT, dur: sl.t }), 250))
  })
  check('slowfield: slick dropped, crossing kart skids', !!slick && slick.n === 1 && slick.slickT > 0, slick ? `slickT=${slick.slickT.toFixed(2)}` : 'no slick')

  // buff: raw turbo per def duration (4s), speed above the normal 26u/s cap.
  // Re-center on the road first — the unsteered probe kart grinds along the soft wall.
  await page.evaluate(() => {
    const s = window.__scene
    const p = s.player
    const c = s.track.pos[p.idx], tn = s.track.tan[p.idx]
    p.group.position.set(c.x, 0, c.z)
    p.heading = Math.atan2(tn.x, tn.z)
    p.kv.set(0, 0, 0)
  })
  await page.keyboard.press('2')
  await page.waitForTimeout(2000)
  const buff = await page.evaluate(() => ({ buffT: window.__scene.player.buffT, speed: window.__scene.player.speed, boosting: window.__scene.boosting }))
  check('buff: overdrive turbo active + fast', buff.buffT > 0 && buff.boosting && buff.speed > 28, `speed=${buff.speed.toFixed(1)} buffT=${buff.buffT.toFixed(1)}`)
  await page.screenshot({ path: 'qa/screens/kart-skill-overdrive.png' })

  // shield: absorbs exactly ONE hit
  await page.keyboard.press('3')
  await page.waitForTimeout(120)
  const sh1 = await page.evaluate(() => ({ on: window.__scene.player.shieldOn, bubble: window.__scene.bubble.visible }))
  check('shield: barrier up + bubble visible', sh1.on && sh1.bubble)
  const shieldAte = await page.evaluate(() => {
    const s = window.__scene
    const p = s.player
    p.spinT = 0; p.damage = 0
    const tn = { x: Math.sin(p.heading), z: Math.cos(p.heading) }
    s.items.fireShell({
      from: { x: p.group.position.x - tn.x * 6, y: 0.7, z: p.group.position.z - tn.z * 6 },
      dir: new (Object.getPrototypeOf(p.kv).constructor)(tn.x, 0, tn.z), owner: s.karts[1], target: p, homing: true, speed: 40,
    })
    return new Promise(res => setTimeout(() => res({
      shieldOn: p.shieldOn, spinT: p.spinT, damage: p.damage,
    }), 900))
  })
  check('shield: eats one shell (no spin, no dmg, shield gone)', !shieldAte.shieldOn && shieldAte.spinT === 0 && shieldAte.damage === 0, JSON.stringify(shieldAte))

  // heal: repair all damage + 25 boost
  const heal0 = await page.evaluate(() => {
    const s = window.__scene
    s.player.damage = 0.25
    s.player.meter = 20
    return s.player.meter
  })
  await page.keyboard.press('4')
  await page.waitForTimeout(120)
  const heal1 = await page.evaluate(() => ({ dmg: window.__scene.player.damage, meter: window.__scene.player.meter }))
  check('heal: damage repaired + 25 boost', heal1.dmg === 0 && heal1.meter >= heal0 + 24, `dmg=${heal1.dmg} meter=${heal1.meter}`)
  await page.close()
}

/* ================= loadout 3: decoy / gravity / titan / ghost ================= */
{
  const page = await boot(['decoy', 'gravity', 'titan', 'ghost'])
  await page.keyboard.down('w')
  await page.waitForTimeout(1400)

  // summon: holo-kart ahead; homing shells retarget + get intercepted
  await page.keyboard.press('1')
  await page.waitForTimeout(200)
  const decoyUp = await page.evaluate(() => !!window.__scene.decoy)
  check('summon: holo-kart deployed ahead', decoyUp)
  const baited = await page.evaluate(() => {
    const s = window.__scene
    const p = s.player
    p.spinT = 0
    const tn = { x: Math.sin(p.heading), z: Math.cos(p.heading) }
    // fire from behind with a lateral offset so the pass-by cannot clip the player
    s.items.fireShell({
      from: { x: p.group.position.x - tn.x * 8 + tn.z * 3, y: 0.7, z: p.group.position.z - tn.z * 8 - tn.x * 3 },
      dir: new (Object.getPrototypeOf(p.kv).constructor)(tn.x, 0, tn.z), owner: s.karts[1], target: p, homing: true, speed: 42,
    })
    return new Promise(res => setTimeout(() => res({
      spinT: p.spinT, shells: s.items.shells.length, decoy: !!s.decoy,
    }), 2300))
  })
  check('summon: shell baited to decoy (player unharmed)', baited.spinT === 0 && baited.shells === 0, JSON.stringify(baited))
  await page.screenshot({ path: 'qa/screens/kart-skill-decoy.png' })

  // pull: rings within 14u drift toward player + slipstream
  const pull0 = await page.evaluate(() => {
    const s = window.__scene
    const p = s.player
    const ring = s.track.rings.find(r => r.active)
    const tn = { x: Math.sin(p.heading), z: Math.cos(p.heading) }
    ring.group.position.set(p.group.position.x + tn.x * 9 + 4, 1.15, p.group.position.z + tn.z * 9)
    const d = Math.hypot(ring.group.position.x - p.group.position.x, ring.group.position.z - p.group.position.z)
    return { d, i: s.track.rings.indexOf(ring) }
  })
  await page.keyboard.press('2')
  await page.waitForTimeout(350)
  const pull1 = await page.evaluate(i => {
    const s = window.__scene
    const r = s.track.rings[i]
    const p = s.player
    return {
      pullT: p.pullT,
      d: Math.hypot(r.group.position.x - p.group.position.x, r.group.position.z - p.group.position.z),
      collected: !r.active,
    }
  }, pull0.i)
  check('pull: gravity well magnetizes rings', pull1.pullT > 0 && (pull1.collected || pull1.d < pull0.d - 1), `d ${pull0.d.toFixed(1)} -> ${pull1.d.toFixed(1)} collected=${pull1.collected}`)

  // giant: 1.75x, contact spins rivals, immune to shells
  await page.keyboard.press('3')
  await page.waitForTimeout(600)
  const giant = await page.evaluate(() => ({ t: window.__scene.player.giantT, scale: window.__scene.player.group.scale.x }))
  check('giant: titan form scale-up', giant.t > 0 && giant.scale > 1.4, `scale=${giant.scale.toFixed(2)}`)
  const crush = await page.evaluate(() => {
    const s = window.__scene
    const p = s.player
    const ai = s.karts.find(k => !k.isPlayer)
    ai.spinT = 0
    ai.group.position.set(p.group.position.x + 1.2, 0, p.group.position.z + 1.2)
    ai.idx = s.track.nearestIdx(ai.group.position, p.idx, 512)
    ai.lastS = ai.idx / s.track.N
    // also fire a shell at the giant player: should NOT spin them
    const tn = { x: Math.sin(p.heading), z: Math.cos(p.heading) }
    s.items.fireShell({
      from: { x: p.group.position.x - tn.x * 6, y: 0.7, z: p.group.position.z - tn.z * 6 },
      dir: new (Object.getPrototypeOf(p.kv).constructor)(tn.x, 0, tn.z), owner: ai, target: p, homing: true, speed: 44,
    })
    return new Promise(res => setTimeout(() => res({
      aiSpun: ai.spinT > 0, playerSpun: p.spinT > 0,
    }), 900))
  })
  check('giant: crushes on contact, immune to shells', crush.aiSpun && !crush.playerSpun, JSON.stringify(crush))
  await page.screenshot({ path: 'qa/screens/kart-skill-titan.png' })

  // ghost: translucent, shells + slicks + karts pass through
  await page.waitForTimeout(4800) // let titan expire
  await page.keyboard.press('4')
  await page.waitForTimeout(150)
  const ghost = await page.evaluate(() => {
    const s = window.__scene
    const p = s.player
    p.spinT = 0
    p.slickT = 0
    const tn = { x: Math.sin(p.heading), z: Math.cos(p.heading) }
    s.items.fireShell({
      from: { x: p.group.position.x - tn.x * 6, y: 0.7, z: p.group.position.z - tn.z * 6 },
      dir: new (Object.getPrototypeOf(p.kv).constructor)(tn.x, 0, tn.z), owner: s.karts[1], target: p, homing: true, speed: 44,
    })
    s.items.dropSlick({ x: p.group.position.x, z: p.group.position.z }, { radius: 4, duration: 2, owner: s.karts[1] })
    return new Promise(res => setTimeout(() => res({
      ghostT: p.ghostT, spinT: p.spinT, slickT: p.slickT, ghosted: !!p.visual._ghostSaved,
    }), 1000))
  })
  check('ghost: phased — immune to shells + slicks', ghost.ghostT > 0 && ghost.spinT === 0 && ghost.slickT === 0 && ghost.ghosted, JSON.stringify(ghost))
  await page.waitForTimeout(2300)
  const unghost = await page.evaluate(() => !window.__scene.player.visual._ghostSaved)
  check('ghost: opacity restored after 3s', unghost)
  await page.close()
}

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none')
const fails = results.filter(r => !r[1]).length
console.log(`SUMMARY: ${results.length - fails}/${results.length} passed`)
await browser.close()
process.exit(fails || errors.length ? 1 : 0)
