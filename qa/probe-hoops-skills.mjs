// SLAM CITY 2K skills probe: exercises ALL 12 archetypes through 3 loadouts,
// cast with real Q/W/E/R keystrokes; verifies effect flags + cooldowns.
// node qa/probe-hoops-skills.mjs [base=http://localhost:5184]
import { chromium } from 'playwright-core'

const base = process.argv[2] || 'http://localhost:5184'
const errors = []
const fails = []
const ok = (cond, label) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + label)
  if (!cond) fails.push(label)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function openWithLoadout(loadout) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.addInitScript(lo => {
    const p = JSON.parse(localStorage.getItem('ipl-profile-v2') || 'null') || {
      name: 'QA', appearance: {
        primary: '#3fa7ff', secondary: '#232a4d', glow: '#7df9ff',
        head: 'visor', hair: 'spikes', trail: 'spark', cape: true,
      }, stats: { wins: {}, plays: {} },
    }
    p.loadout = lo
    localStorage.setItem('ipl-profile-v2', JSON.stringify(p))
  }, loadout)
  await page.goto(`${base}/?scene=hoops&mute=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__scene?.game?.phase === 'live', null, { timeout: 20000 })
  return page
}

const KEY = ['KeyQ', 'KeyW', 'KeyE', 'KeyR']
const cast = async (page, i, settleMs = 350) => {
  await page.keyboard.press(KEY[i])
  await page.waitForTimeout(settleMs)
}
const evalG = (page, fn) => page.evaluate(fn)

/* ---------------- loadout 1: blink / starfire / frostring / quake ---------------- */
{
  const page = await openWithLoadout(['blink', 'starfire', 'frostring', 'quake'])
  const before = await evalG(page, () => {
    const P = window.__scene.game.player.hero.group.position
    return { x: P.x, z: P.z }
  })
  await cast(page, 0) // blink
  const after = await evalG(page, () => {
    const P = window.__scene.game.player.hero.group.position
    return { x: P.x, z: P.z }
  })
  const moved = Math.hypot(after.x - before.x, after.z - before.z)
  ok(moved > 2, `dash/blink teleports (${moved.toFixed(1)}u)`)

  await cast(page, 1) // starfire
  ok(await evalG(page, () => window.__scene.game.eff.starfire), 'projectile/starfire arms next shot')

  await cast(page, 2) // frostring
  const ice = await evalG(page, () => {
    const e = window.__scene.game.eff
    return e.ice ? { has: true, visible: e.ice.mesh.visible } : { has: false }
  })
  ok(ice.has, 'slowfield/frost ring drops an ice patch under the defender')

  await cast(page, 3, 200) // quake
  const nova = await evalG(page, () => ({
    stun: window.__scene.game.ai.stunT, imp: window.__scene.game.ai.imp.length(),
    cd: window.__scene.abilities.cds[3],
  }))
  ok(nova.cd > 0.5, 'nova/quake goes on cooldown after cast')
  ok(nova.stun > 0 || nova.imp > 1, `nova/quake knocks the defender back (imp=${nova.imp.toFixed(1)})`)
  await page.screenshot({ path: 'qa/screens/hoops-fin-skills1.png' })

  const cds = await evalG(page, () => window.__scene.abilities.cds.map(c => c > 0))
  ok(cds.every(Boolean), 'ability bar shows all four cooldowns ticking')
  await page.close()
}

/* ---------------- loadout 2: overdrive / aegis / mend / decoy ---------------- */
{
  const page = await openWithLoadout(['overdrive', 'aegis', 'mend', 'decoy'])
  // drain stamina with a sprint FIRST (overdrive would freeze the meter), then heal
  await page.keyboard.down('Shift')
  await page.keyboard.down('KeyA')
  await page.waitForTimeout(1100)
  await page.keyboard.up('KeyA')
  await page.keyboard.up('Shift')
  const drained = await evalG(page, () => window.__scene.game.player.stamina)
  await cast(page, 2)
  const healed = await evalG(page, () => window.__scene.game.player.stamina)
  ok(drained < 95 && healed === 100, `heal/mend refills stamina (${drained.toFixed(0)} -> ${healed})`)

  await cast(page, 0)
  ok(await evalG(page, () => window.__scene.game.eff.turboT > 0), 'buff/overdrive turbo active')

  await cast(page, 1)
  ok(await evalG(page, () => window.__scene.game.eff.aegisT > 0), 'shield/aegis unstealable handle active')

  await cast(page, 3)
  ok(await evalG(page, () => !!window.__scene.game.eff.decoy), 'summon/decoy holo-screener spawned')
  await page.screenshot({ path: 'qa/screens/hoops-fin-skills2.png' })
  await page.close()
}

/* ---------------- loadout 3: gravity / titan / ghost / comet ---------------- */
{
  const page = await openWithLoadout(['gravity', 'titan', 'ghost', 'comet'])
  await cast(page, 0)
  ok(await evalG(page, () => window.__scene.game.eff.pullT > 0), 'pull/gravity rebound magnet active')

  await cast(page, 2)
  ok(await evalG(page, () => window.__scene.game.eff.ghostT > 0), 'ghost/phase cloak active')
  // wait out ghost, then confirm hero materials restored cleanly
  await page.waitForFunction(() => window.__scene.game.eff.ghostT <= 0, null, { timeout: 5000 })
  const opaque = await evalG(page, () => {
    let good = true
    window.__scene.game.player.hero.group.traverse(o => {
      if (o.material && o.material.opacity === 0.35) good = false
    })
    return good
  })
  ok(opaque, 'ghost end restores hero material opacity')

  // titan dunk: fresh possession (ghost wait burned the shot clock), cast,
  // drive inside the arc, SPACE = posterize
  await page.evaluate(() => window.__scene.debug.give('player'))
  await cast(page, 1)
  ok(await evalG(page, () => window.__scene.game.eff.titanT > 0), 'giant/titan form active')
  const scoreBefore = await evalG(page, () => window.__scene.game.score.you)
  await page.keyboard.down('KeyW')
  await page.waitForFunction(() => {
    const P = window.__scene.game.player.hero.group.position
    return Math.hypot(P.x, P.z + 5.62) < 6.0
  }, null, { timeout: 8000 })
  await page.keyboard.up('KeyW')
  await page.evaluate(() => { // AI may have poked the ball loose mid-drive; re-secure
    const g = window.__scene.game
    if (g.ball.holder !== 'player' || g.phase !== 'live') window.__scene.debug.give('player')
  })
  await page.keyboard.press('Space')
  const dunkPhase = await evalG(page, () => window.__scene.game.phase)
  ok(dunkPhase === 'dunk', 'titan + SPACE inside the arc starts the dunk drive')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'qa/screens/hoops-fin-dunk.png' })
  await page.waitForFunction(sb => window.__scene.game.score.you === sb + 2, scoreBefore, { timeout: 4000 })
  ok(true, 'titan dunk scores +2 (POSTERIZED)')

  // comet OOP from beyond the arc (check spot) = +3
  await page.waitForFunction(() => window.__scene.game.phase === 'live' &&
    window.__scene.game.ball.holder === 'player', null, { timeout: 12000 })
  const s2 = await evalG(page, () => window.__scene.game.score.you)
  await page.keyboard.press('KeyR')
  ok(await evalG(page, () => !!window.__scene.game.eff.comet), 'meteor/comet inbound')
  await page.waitForTimeout(400) // mid-flight: comet streaking at the rim
  await page.screenshot({ path: 'qa/screens/hoops-fin-comet.png' })
  const slammed = await page.waitForFunction(
    s => window.__scene.game.score.you === s + 3, s2, { timeout: 4000 },
  ).then(() => true).catch(() => false)
  ok(slammed, 'comet slam banks +3 from beyond the arc')
  await page.close()
}

console.log('CONSOLE ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8)) : 'none')
await browser.close()
if (errors.length || fails.length) process.exit(1)
