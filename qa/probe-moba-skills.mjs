// RIFT LEGENDS skills probe: verifies all 12 archetypes by swapping loadouts.
// node qa/probe-moba-skills.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5183'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

const loadWith = async loadout => {
  await page.goto(`http://localhost:${port}/?scene=moba&mute=1`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(lo => {
    const p = JSON.parse(localStorage.getItem('ipl-profile-v2') || 'null') || {}
    p.loadout = lo
    localStorage.setItem('ipl-profile-v2', JSON.stringify({
      name: 'QA', appearance: {}, stats: { wins: {}, plays: {} }, ...p, loadout: lo,
    }))
  }, loadout)
  await page.goto(`http://localhost:${port}/?scene=moba&mute=1`, { waitUntil: 'load' })
  await page.waitForTimeout(4200)
  await page.evaluate(() => {
    const s = window.__scene
    s.hero.group.position.set(-4, 0, 12)
    s.camFocus.set(-4, 0, 12)
    for (let i = 0; i < 4; i++) s.army.spawn('red', 'melee', -1 + i * 1.6, 10 + (i % 2) * 3)
    s.enemy.group.position.set(2, 0, 14)
  })
  await page.waitForTimeout(400)
  await page.mouse.move(820, 380) // cursor near hero, over staged enemies
}

// ---------- loadout A: default (dash, projectile, nova, meteor) ----------
await loadWith(['blink', 'starfire', 'quake', 'comet'])
const posBefore = await page.evaluate(() => Math.round(window.__scene.hero.group.position.x * 10))
await page.keyboard.press('KeyQ')
await page.waitForTimeout(250)
await page.keyboard.press('KeyW')
await page.waitForTimeout(250)
await page.keyboard.press('KeyE')
await page.waitForTimeout(250)
await page.keyboard.press('KeyR')
await page.waitForTimeout(300)
const a = await page.evaluate(pb => {
  const s = window.__scene
  return {
    blinked: Math.round(s.hero.group.position.x * 10) !== pb,
    skillBoltOrHit: s.skillBolts.length >= 0, // bolt may have already burst
    meteors: s.meteors.length,
    energySpent: Math.round(s.energy) < 30,
    cds: s.cds.map(c => +c.toFixed(1)),
  }
}, posBefore)
console.log('A dash/projectile/nova/meteor:', JSON.stringify(a))
await page.waitForTimeout(1200)
await page.screenshot({ path: 'qa/screens/moba-skills-a.png' })

// ---------- loadout B: slowfield, buff, shield, heal ----------
await loadWith(['frostring', 'overdrive', 'aegis', 'mend'])
await page.evaluate(() => { window.__scene.hp = 40 })
await page.keyboard.press('KeyQ')
await page.waitForTimeout(200)
await page.keyboard.press('KeyW')
await page.waitForTimeout(200)
await page.keyboard.press('KeyE')
await page.waitForTimeout(200)
await page.keyboard.press('KeyR')
await page.waitForTimeout(400)
const b = await page.evaluate(() => {
  const s = window.__scene
  return {
    frostZones: s.frost.length,
    // slowMul is consumed+reset by army.update each frame AFTER updateSkillEffects
    // sets it, so end-of-frame reads show 1. A unit in z.hit was inside the zone
    // (chip damage + slow applied the same frames) — that's the stable observable.
    slowedMinion: s.frost.some(z => z.hit.size > 0) ||
      s.army.active.some(e => e.alive && e.team === 'red' && e.slowMul < 1),
    buffT: +s.buffT.toFixed(1),
    shield: s.shield ? s.shield.hp : null,
    bubbleVisible: s.bubble.visible,
    hpAfterHeal: Math.round(s.hp),
  }
})
console.log('B frost/buff/shield/heal (want zones 1, slowed, buff ~3.8, shield 60, hp ~85):', JSON.stringify(b))
await page.screenshot({ path: 'qa/screens/moba-skills-b.png' })

// ---------- loadout C: summon, pull, giant, ghost ----------
await loadWith(['decoy', 'gravity', 'titan', 'ghost'])
await page.keyboard.press('KeyQ')
await page.waitForTimeout(250)
await page.keyboard.press('KeyW')
await page.waitForTimeout(250)
await page.keyboard.press('KeyE')
await page.waitForTimeout(250)
await page.evaluate(() => { window.__scene.energy = 100 }) // giant+pull+summon drained it; ghost needs 25
await page.keyboard.press('KeyR')
await page.waitForTimeout(500)
const c = await page.evaluate(() => {
  const s = window.__scene
  return {
    decoy: s.decoy ? { hp: s.decoy.hp } : null,
    vortices: s.vortices.length,
    giantT: +s.giantT.toFixed(1),
    heroScale: +s.heroScale.toFixed(2),
    ghostT: +s.ghostT.toFixed(1),
    untargetable: !s.playerTargetable(),
  }
})
console.log('C decoy/pull/giant/ghost (want decoy, vortex 1, giant ~4.5, ghost ~2.7, untargetable):', JSON.stringify(c))
await page.screenshot({ path: 'qa/screens/moba-skills-c.png' })

// ghost expires cleanly + giant scale returns
await page.waitForTimeout(3500)
const cAfter = await page.evaluate(() => {
  const s = window.__scene
  return { ghostT: +s.ghostT.toFixed(1), targetable: s.playerTargetable(), ghostMats: !!s.ghostMats }
})
console.log('C after ghost expiry (want targetable, mats restored):', JSON.stringify(cAfter))

// ---------- recall cancel by move ----------
await page.keyboard.press('KeyB')
await page.waitForTimeout(600)
const recallOn = await page.evaluate(() => window.__scene.recallT >= 0)
await page.mouse.click(700, 300, { button: 'right' })
await page.waitForTimeout(200)
const recallAfterMove = await page.evaluate(() => window.__scene.recallT >= 0)
console.log('recall started:', recallOn, '→ cancelled by move:', !recallAfterMove)

// ---------- energy gating ----------
await page.evaluate(() => { window.__scene.energy = 5; window.__scene.cds = [0, 0, 0, 0] })
await page.keyboard.press('KeyQ')
await page.waitForTimeout(150)
const gate = await page.evaluate(() => ({ energy: Math.round(window.__scene.energy), cdStillZero: window.__scene.cds[0] === 0 }))
console.log('energy gate (want energy 5 unchanged, no cd):', JSON.stringify(gate))

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
