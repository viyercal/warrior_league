// Duel probe: ALL 12 skill archetypes across 3 loadouts (via ipl-profile-v2),
// each asserted against its inGame.duel promise.
import { chromium } from 'playwright-core'

const port = process.env.IPL_PORT || '8181'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
let pass = 0, fail = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
  ok ? pass++ : fail++
}

const LOADOUTS = [
  ['blink', 'starfire', 'frostring', 'quake'],
  ['overdrive', 'aegis', 'mend', 'decoy'],
  ['gravity', 'titan', 'ghost', 'comet'],
]
const KEY = { 0: 'q', 1: 'w', 2: 'e', 3: 'r' }

for (const [li, loadout] of LOADOUTS.entries()) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.addInitScript(lo => {
    const p = {
      name: 'RAVAGER',
      appearance: { primary: '#b0793a', secondary: '#3a2a20', glow: '#ff8c3b', head: 'visor', hair: 'spikes', trail: 'spark', cape: true },
      loadout: lo, stats: { wins: {}, plays: {} },
    }
    localStorage.setItem('ipl-profile-v2', JSON.stringify(p))
  }, loadout)
  await page.goto(`http://localhost:${port}/?scene=duel&mute=1`, { waitUntil: 'load' })
  await page.waitForTimeout(2600)
  await page.keyboard.press('x')
  await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })

  // freeze AI, optional foe block/jump via window flags
  await page.evaluate(() => {
    const s = window.__scene
    window.__blk = false
    s.ai.update = () => {
      const it = s.ai.intent
      it.move = 0; it.jump = it.light = it.heavy = it.throw = false
      it.dash = 0; it.crouch = false
      it.block = window.__blk
      return it
    }
  })

  const place = (px, fx) => page.evaluate(({ px, fx }) => {
    const s = window.__scene
    for (const [f, x] of [[s.player, px], [s.foe, fx]]) {
      f.pos.set(x, 0, 0); f.vel.set(0, 0)
      f.attack = null
      f.hitstun = f.blockstun = f.kdT = f.staggerT = f.iFrames = f.chainT = 0
      f.juggleFall = false; f.grabbed = false; f.grounded = true
      f.comboHits = 0
      f.frenzyT = f.giantT = f.ghostT = f.wardT = f.healT = f.chillT = 0
      f.hero.setState('normal')
    }
    s.player.facing = 1; s.foe.facing = -1
    s.foe.hp = 100; s.player.hp = 100
    s.player.meter = 0; s.foe.meter = 0
    s.cds = [0, 0, 0, 0]
    s.roundT = 60
    s.specials.reset()
  }, { px, fx })
  const F = () => page.evaluate(() => {
    const s = window.__scene
    return {
      p: { x: +s.player.pos.x.toFixed(2), hp: +s.player.hp.toFixed(1), frenzy: +s.player.frenzyT.toFixed(2), giant: +s.player.giantT.toFixed(2), ghost: +s.player.ghostT.toFixed(2), ward: +s.player.wardT.toFixed(2), heal: +s.player.healT.toFixed(2), iF: +s.player.iFrames.toFixed(2), stagger: +s.player.staggerT.toFixed(2) },
      f: { x: +s.foe.pos.x.toFixed(2), y: +s.foe.pos.y.toFixed(2), hp: +s.foe.hp.toFixed(1), chill: +s.foe.chillT.toFixed(2), stagger: +s.foe.staggerT.toFixed(2), juggle: s.foe.juggleFall, kd: +s.foe.kdT.toFixed(2) },
      bolts: s.specials.bolts.length, fields: s.specials.fields.length, meteors: s.specials.meteors.length, twins: s.specials.twins.length,
    }
  })

  for (const [si, id] of loadout.entries()) {
    switch (id) {
      case 'blink': { // vanish and reappear BEHIND your foe
        await place(-4, 2)
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(150)
        const r = await F()
        check('blink: teleports BEHIND the foe', r.p.x > r.f.x && Math.abs(r.p.x - r.f.x) < 2.2 && r.p.iF > 0, `p.x=${r.p.x} foe.x=${r.f.x} iF=${r.p.iF}`)
        break
      }
      case 'starfire': { // fireball across the pit
        await place(-8, 8)
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(250)
        const mid = await F()
        await page.waitForTimeout(1100)
        const r = await F()
        check('starfire: bolt travels + hits', mid.bolts > 0 && r.f.hp < 100, `inFlight=${mid.bolts} foeHp=${r.f.hp}`)
        break
      }
      case 'frostring': { // ice patch under foe, 45% slow
        await place(-6, 4)
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(400)
        const r = await F()
        const walkMul = await page.evaluate(() => window.__scene.foe.walkMul())
        check('frostring: patch under foe + slow', r.fields > 0 && r.f.chill > 0 && walkMul < 0.7, `fields=${r.fields} chill=${r.f.chill} walkMul=${walkMul.toFixed(2)}`)
        break
      }
      case 'quake': { // rising uppercut launcher
        await place(-1, 0.5)
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(450)
        const r = await F()
        check('quake: uppercut launches', (r.f.y > 0.2 || r.f.juggle) && r.f.hp < 100, `foeY=${r.f.y} juggle=${r.f.juggle} hp=${r.f.hp}`)
        break
      }
      case 'overdrive': { // frenzy: chain windows +50%
        await place(-4, 6)
        const w0 = await page.evaluate(() => window.__scene.player.chainWindow())
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(200)
        const r = await F()
        const w1 = await page.evaluate(() => window.__scene.player.chainWindow())
        check('overdrive: frenzy + longer chains', r.p.frenzy > 3 && w1 > w0 * 1.4, `frenzyT=${r.p.frenzy} window ${w0.toFixed(2)}->${w1.toFixed(2)}`)
        break
      }
      case 'aegis': { // parry-ward: absorbs next hit, staggers attacker
        await place(-1.6, 0.1)
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(200)
        // foe jabs into the ward
        await page.evaluate(() => { window.__scene.foe._beginAttack('jab') })
        await page.waitForTimeout(400)
        const r = await F()
        check('aegis: ward eats hit + staggers attacker', r.p.hp === 100 && r.p.ward === 0 && r.f.stagger > 0.2, `hp=${r.p.hp} ward=${r.p.ward} foeStagger=${r.f.stagger}`)
        break
      }
      case 'mend': { // +16 HP over 2s, interrupted by hits
        await place(-5, 6)
        await page.evaluate(() => { window.__scene.player.hp = 50 })
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(1000)
        const mid = await F()
        // interrupt with a hit
        await page.evaluate(() => {
          const s = window.__scene
          s.fight.applyHit(s.foe, s.player, { dmg: 5, kind: 'light', attackKind: null })
        })
        await page.waitForTimeout(120)
        const r = await F()
        check('mend: heals over time', mid.p.hp > 53 && mid.p.heal > 0, `hp@1s=${mid.p.hp} healT=${mid.p.heal}`)
        check('mend: interrupted by a hit', r.p.heal === 0, `healT=${r.p.heal}`)
        break
      }
      case 'decoy': { // shadow twin lunges from behind, 8 dmg + stagger
        await place(-2.5, 1.5)
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(150)
        const mid = await F()
        await page.waitForTimeout(700)
        const r = await F()
        check('decoy: twin lunges + strikes for 8 + stagger', mid.twins > 0 && r.f.hp <= 92.5 && r.f.hp > 88, `twins=${mid.twins} foeHp=${r.f.hp}`)
        break
      }
      case 'gravity': { // chained harrow drags foe to point-blank; whiffs on jumpers
        await place(-4, 2)
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(700)
        const r = await F()
        check('gravity: drags foe to your fists + stun', Math.abs(r.f.x - r.p.x) < 1.6 && r.f.hp < 100, `gap=${Math.abs(r.f.x - r.p.x).toFixed(2)} hp=${r.f.hp} stagger=${r.f.stagger}`)
        // whiff on jumper
        await place(-4, 2)
        await page.evaluate(() => { const f = window.__scene.foe; f.grounded = false; f.pos.y = 1.6; f.vel.y = 2 })
        await page.evaluate(() => { window.__scene.cds[0] = 0 })
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(500)
        const r2 = await F()
        check('gravity: whiffs on jumpers', r2.f.hp === 100, `hp=${r2.f.hp}`)
        break
      }
      case 'titan': { // colossus stance: armored heavies, reach +30%, walk -20%
        await place(-4, 6)
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(200)
        const r = await F()
        const mods = await page.evaluate(() => {
          const p = window.__scene.player
          return { reach: p.reachMul(), walk: p.walkMul() }
        })
        // heavy armor: start a heavy, eat a hit during startup — no interrupt
        const armored = await page.evaluate(async () => {
          const s = window.__scene
          s.player.pos.x = -1
          s.foe.pos.x = 0.6
          s.player._beginAttack('heavy')
          s.fight.applyHit(s.foe, s.player, { dmg: 5, kind: 'light', attackKind: null })
          return { stillAttacking: s.player.attack?.kind === 'heavy', armorUsed: s.player.attack?.armorUsed }
        })
        check('titan: stance mods', r.p.giant > 3 && mods.reach > 1.2 && mods.walk < 0.9, `giantT=${r.p.giant} reach=${mods.reach} walk=${mods.walk}`)
        check('titan: heavies armor through a hit', armored.stillAttacking && armored.armorUsed, JSON.stringify(armored))
        await page.waitForTimeout(700)
        break
      }
      case 'ghost': { // next strike passes through block
        await place(-1.2, 0.4)
        await page.evaluate(() => { window.__blk = true })
        await page.waitForTimeout(150)
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(150)
        await page.keyboard.press('j')
        await page.waitForTimeout(350)
        const r = await F()
        await page.evaluate(() => { window.__blk = false })
        check('ghost: strike passes through block', r.f.hp <= 95.5 && r.f.hp > 90 && r.p.ghost === 0, `foeHp=${r.f.hp} ghostT=${r.p.ghost} (5 dmg through block)`)
        break
      }
      case 'comet': { // skyfall hammer at center pit after 0.9s telegraph
        await place(-5, 0.5)
        await page.keyboard.press(KEY[si])
        await page.waitForTimeout(300)
        const mid = await F()
        await page.waitForTimeout(1100)
        const r = await F()
        check('comet: telegraph then center-stage slam', mid.meteors > 0 && r.f.hp <= 80 && (r.f.kd > 0 || r.f.juggle || r.f.y > 0), `telegraph=${mid.meteors} hp=${r.f.hp}`)
        break
      }
    }
  }
  await page.screenshot({ path: `qa/screens/duel-skills-${li + 1}.png` })
  await page.close()
}

console.log(`RESULT: ${pass} passed, ${fail} failed`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
process.exit(fail || errors.length ? 1 : 0)
