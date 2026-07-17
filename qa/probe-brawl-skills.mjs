// Brawl probe: all 12 skill archetypes via real Q/W/E/R keypresses.
// Loads 3 different loadouts (4 skills each) by seeding the profile.
import { chromium } from 'playwright-core'

const LOADOUTS = [
  ['blink', 'starfire', 'frostring', 'quake'],
  ['overdrive', 'aegis', 'mend', 'decoy'],
  ['gravity', 'titan', 'ghost', 'comet'],
]
const KEYS = ['q', 'w', 'e', 'r']

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

async function boot(loadout) {
  await page.goto(`http://localhost:${process.env.IPL_PORT || '5187'}/?scene=brawl&mute=1`, { waitUntil: 'load' })
  await page.evaluate(l => {
    const raw = localStorage.getItem('ipl-profile-v2')
    const p = raw ? JSON.parse(raw) : { name: 'NOVA', stats: { wins: {}, plays: {} } }
    p.loadout = l
    localStorage.setItem('ipl-profile-v2', JSON.stringify(p))
  }, loadout)
  await page.goto(`http://localhost:${process.env.IPL_PORT || '5187'}/?scene=brawl&mute=1`, { waitUntil: 'load' })
  // skip the entrance cinematic (any key skips)
  await page.waitForFunction(() => !!window.__scene?.phase, null, { timeout: 15000 })
  await page.keyboard.press('x')
  await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 15000 })
  // freeze the AIs so checks are deterministic (probe-only patch)
  await page.evaluate(() => {
    const s = window.__scene
    for (const ai of s.ais) {
      Object.assign(ai.intent, { move: 0, jump: false, fastFall: false, drop: false, jab: false, smash: false, dodge: 0 })
      ai.update = () => ai.intent
    }
  })
}

const px = () => page.evaluate(() => ({
  x: window.__scene.player.pos.x, y: window.__scene.player.pos.y,
  airJumps: window.__scene.player.airJumps,
}))
const enemy = i => page.evaluate(i => {
  const f = window.__scene.baseFighters[i]
  return { x: f.pos.x, y: f.pos.y, vy: f.vel.y, dmg: f.dmg, chill: f.chillT, stocks: f.stocks }
}, i)
const place = (who, x, y = 0) => page.evaluate(([who, x, y]) => {
  const s = window.__scene
  const f = who === 'p' ? s.player : s.baseFighters[who]
  f.pos.set(x, y, 0)
  f.vel.set(0, 0)
}, [who, x, y])

const results = []
const check = (name, ok, detail) => {
  results.push(`${name}: ${ok ? 'OK' : 'FAIL'} ${detail}`)
  console.log(results[results.length - 1])
}

// ================= loadout 1: blink / starfire / frostring / quake =================
await boot(LOADOUTS[0])

// blink
await place('p', 0)
const b0 = await px()
await page.evaluate(() => { window.__scene.player.airJumps = 0 })
await page.keyboard.press('q')
await page.waitForTimeout(150)
const b1 = await px()
check('BLINK', Math.abs(b1.x - b0.x) > 4 && b1.airJumps === 1, `x ${b0.x.toFixed(1)} -> ${b1.x.toFixed(1)}, airJumps reset ${b1.airJumps}`)

// starfire — enemy directly in the bolt path
await place('p', -4)
await place(1, 0)
await page.evaluate(() => { window.__scene.player.facing = 1 })
const sf0 = await enemy(1)
await page.keyboard.press('w')
await page.waitForTimeout(200)
await page.screenshot({ path: 'qa/screens/brawl-skill-bolt.png' })
await page.waitForTimeout(600)
const sf1 = await enemy(1)
check('STARFIRE', sf1.dmg >= sf0.dmg + 12, `enemy ${sf0.dmg}% -> ${sf1.dmg}%`)

// frostring — zone under player chills nearby enemy
await place('p', 2)
await place(1, 3.5)
await page.keyboard.press('e')
await page.waitForTimeout(400)
const fr = await enemy(1)
const frZone = await page.evaluate(() => window.__scene.frost.length)
check('FROSTRING', frZone > 0 && fr.chill > 0 && fr.dmg >= sf1.dmg + 10, `zones=${frZone} chill=${fr.chill.toFixed(2)} dmg ${sf1.dmg}% -> ${fr.dmg}%`)
await page.screenshot({ path: 'qa/screens/brawl-skill-frost.png' })

// quake nova — point-blank launcher
await place('p', -2)
await place(1, -3.2)
const q0 = await enemy(1)
await page.keyboard.press('r')
await page.waitForTimeout(160)
const q1 = await enemy(1)
check('QUAKE', q1.dmg >= q0.dmg + 10 && (q1.vy > 1 || q1.y > 0.05), `dmg ${q0.dmg}% -> ${q1.dmg}%, vy=${q1.vy.toFixed(1)}`)

// ================= loadout 2: overdrive / aegis / mend / decoy =================
await boot(LOADOUTS[1])

await page.keyboard.press('q')
await page.waitForTimeout(120)
const od = await page.evaluate(() => window.__scene.player.buffT)
check('OVERDRIVE', od > 3, `buffT=${od.toFixed(2)}`)

await page.keyboard.press('w')
await page.waitForTimeout(120)
const shieldUp = await page.evaluate(() => !!window.__scene.player.shield)
// enemy jab against shielded player should not add %
await place('p', 0)
await place(1, 1.4)
const shDmg0 = await page.evaluate(() => window.__scene.player.dmg)
await page.evaluate(() => {
  const s = window.__scene
  const e = s.baseFighters[1]
  e.facing = -1
  e._beginAttack('jab1')
})
await page.waitForTimeout(300)
const shDmg1 = await page.evaluate(() => ({ dmg: window.__scene.player.dmg, hp: window.__scene.player.shield?.hp }))
check('AEGIS', shieldUp && shDmg1.dmg === shDmg0 && (shDmg1.hp ?? 60) < 60, `shield absorbed: player ${shDmg0}% -> ${shDmg1.dmg}%, shieldHp=${shDmg1.hp}`)

await page.evaluate(() => { window.__scene.player.dmg = 80 })
await page.keyboard.press('e')
await page.waitForTimeout(120)
const healed = await page.evaluate(() => window.__scene.player.dmg)
check('MEND', healed === 35, `80% -> ${healed}%`)

await page.keyboard.press('r')
await page.waitForTimeout(300)
const cl = await page.evaluate(() => ({
  clone: !!window.__scene.clone, n: window.__scene.fighters.length,
}))
check('DECOY', cl.clone && cl.n === 4, `clone spawned, fighters=${cl.n}`)
await page.screenshot({ path: 'qa/screens/brawl-skill-decoy.png' })

// ================= loadout 3: gravity / titan / ghost / comet =================
await boot(LOADOUTS[2])

await place('p', 0)
await place(1, 2.5)
const g0 = await enemy(1)
await page.keyboard.press('q')
await page.waitForTimeout(150)
const g1 = await enemy(1)
check('GRAVITY', g1.vy > 5 && g1.dmg >= g0.dmg + 8, `enemy yanked vy=${g1.vy.toFixed(1)}, dmg ${g0.dmg}% -> ${g1.dmg}%`)

await page.keyboard.press('w')
await page.waitForTimeout(700)
const ti = await page.evaluate(() => ({ t: window.__scene.player.giantT, s: window.__scene.player.scaleMul }))
check('TITAN', ti.t > 3 && ti.s > 1.4, `giantT=${ti.t.toFixed(1)} scale=${ti.s.toFixed(2)}`)
await page.screenshot({ path: 'qa/screens/brawl-skill-titan.png' })

await page.keyboard.press('e')
await page.waitForTimeout(120)
// enemy attacks ghosted player — must not connect
await place('p', 5)
await place(1, 6.4)
const gh0 = await page.evaluate(() => window.__scene.player.dmg)
await page.evaluate(() => {
  const s = window.__scene
  const e = s.baseFighters[1]
  e.facing = -1
  e._beginAttack('jab1')
})
await page.waitForTimeout(300)
const gh = await page.evaluate(() => ({ t: window.__scene.player.ghostT, dmg: window.__scene.player.dmg }))
check('GHOST', gh.t > 1.5 && gh.dmg === gh0, `ghostT=${gh.t.toFixed(1)}, untouched ${gh0}% -> ${gh.dmg}%`)

// comet — enemy at stage center eats a huge launch
await place('p', -8)
await place(1, 0.5)
const c0 = await enemy(1)
await page.keyboard.press('r')
await page.waitForTimeout(500)
await page.screenshot({ path: 'qa/screens/brawl-skill-comet.png' })
await page.waitForTimeout(900)
const c1 = await enemy(1)
check('COMET', c1.dmg >= c0.dmg + 20 || c1.stocks < c0.stocks, `enemy ${c0.dmg}% -> ${c1.dmg}% (stocks ${c0.stocks} -> ${c1.stocks})`)

console.log('---')
console.log(`PASS ${results.filter(r => r.includes('OK')).length}/${results.length}`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
