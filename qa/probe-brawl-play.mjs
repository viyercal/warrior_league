// Brawl probe: movement, jumps, drop-through, dodge, jab/smash combat via REAL input.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${process.env.IPL_PORT || '5187'}/?scene=brawl&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(2500)

const state = () => page.evaluate(() => {
  const s = window.__scene
  return {
    phase: s.phase, over: s.over,
    fighters: s.baseFighters.map(f => ({
      name: f.name, x: +f.pos.x.toFixed(2), y: +f.pos.y.toFixed(2), dmg: f.dmg,
      stocks: f.stocks, state: f.state, grounded: f.grounded, facing: f.facing,
      airJumps: f.airJumps, attack: f.attack?.kind || null,
    })),
  }
})

// wait for countdown to finish
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 15000 })
console.log('PHASE FIGHT OK')
const s0 = await state()
console.log('start:', JSON.stringify(s0.fighters.map(f => [f.name, f.x, f.y])))

// --- run right ---
await page.keyboard.down('d')
await page.waitForTimeout(700)
const s1 = await state()
await page.keyboard.up('d')
console.log('RUN:', s1.fighters[0].x > s0.fighters[0].x ? 'OK moved right' : `FAIL ${s0.fighters[0].x} -> ${s1.fighters[0].x}`)

// --- jump + air jump (flip) ---
await page.keyboard.press('Space')
await page.waitForTimeout(260)
const sJump = await state()
await page.keyboard.press('Space')
await page.waitForTimeout(200)
const sAir = await state()
console.log('JUMP:', sJump.fighters[0].y > 0.5 ? 'OK airborne' : `FAIL y=${sJump.fighters[0].y}`)
console.log('AIRJUMP:', sAir.fighters[0].airJumps === 0 ? 'OK consumed' : `FAIL airJumps=${sAir.fighters[0].airJumps}`)
await page.screenshot({ path: 'qa/screens/brawl-play-air.png' })
await page.waitForTimeout(900)

// --- fast fall check (S in air) ---
await page.keyboard.press('Space')
await page.waitForTimeout(150)
await page.keyboard.down('s')
await page.waitForTimeout(400)
await page.keyboard.up('s')

// --- dodge roll: double-tap D (wait until grounded first) ---
await page.waitForFunction(() => window.__scene.player.grounded, null, { timeout: 5000 })
await page.keyboard.press('d')
await page.waitForTimeout(80)
await page.keyboard.press('d')
await page.waitForTimeout(140)
const sD = await page.evaluate(() => ({ dodgeT: window.__scene.player.dodgeT, iF: window.__scene.player.iFrames }))
console.log('DODGE:', sD.dodgeT > 0 || sD.iF > 0.1 ? `OK dodgeT=${sD.dodgeT.toFixed(2)} iFrames=${sD.iF.toFixed(2)}` : 'FAIL no dodge')
await page.waitForTimeout(500)

// --- freeze AIs for deterministic attack checks (restored before the soak) ---
await page.evaluate(() => {
  const s = window.__scene
  window.__aiSaved = s.ais.map(ai => ai.update)
  for (const ai of s.ais) {
    Object.assign(ai.intent, { move: 0, jump: false, fastFall: false, drop: false, jab: false, smash: false, dodge: 0 })
    ai.update = () => ai.intent
  }
})

// --- walk to nearest enemy and jab ---
// (clear i-frames: the enemy may have respawned mid-soak with 2s invuln)
await page.evaluate(() => {
  const s = window.__scene
  const e = s.baseFighters[1]
  e.pos.set(3, 0, 0)
  e.vel.set(0, 0)
  e.iFrames = 0
  e.invulnT = 0
  e.ghostT = 0
  s.player.pos.set(1.4, 0, 0)
  s.player.vel.set(0, 0)
  s.player.facing = 1
  s.player.hitstun = 0
})
const dmgBefore = (await state()).fighters[1].dmg
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('j')
  await page.waitForTimeout(240)
}
await page.screenshot({ path: 'qa/screens/brawl-play-jab.png' })
const dmgAfterJab = (await state()).fighters[1].dmg
console.log('JAB COMBO:', dmgAfterJab >= dmgBefore + 8 ? `OK ${dmgBefore}% -> ${dmgAfterJab}%` : `FAIL ${dmgBefore}% -> ${dmgAfterJab}%`)

// --- smash ---
await page.evaluate(() => {
  const s = window.__scene
  const e = s.baseFighters[1]
  e.pos.set(3, 0, 0)
  e.vel.set(0, 0)
  e.iFrames = 0
  e.invulnT = 0
  s.player.pos.set(1.2, 0, 0)
  s.player.vel.set(0, 0)
  s.player.facing = 1
  s.player.hitstun = 0
})
const preSmash = (await state()).fighters[1].dmg
await page.keyboard.press('k')
await page.waitForTimeout(500)
await page.screenshot({ path: 'qa/screens/brawl-play-smash.png' })
await page.waitForTimeout(400)
const postSmash = (await state()).fighters[1].dmg
console.log('SMASH:', postSmash >= preSmash + 10 ? `OK ${preSmash}% -> ${postSmash}%` : `WEAK/FAIL ${preSmash}% -> ${postSmash}%`)

// --- drop-through: get on a platform then press S ---
await page.evaluate(() => { const p = window.__scene.player; p.pos.set(-7.5, 3.8, 0); p.vel.set(0, 0) })
await page.waitForTimeout(400)
const onPlat = await page.evaluate(() => window.__scene.player.grounded && !window.__scene.player.platform?.solid)
await page.keyboard.press('s')
await page.waitForTimeout(400)
const afterDrop = await page.evaluate(() => window.__scene.player.pos.y)
console.log('DROP-THROUGH:', onPlat ? (afterDrop < 3.4 ? `OK dropped to y=${afterDrop.toFixed(2)}` : 'FAIL still on platform') : 'SKIP not on platform')

// --- unfreeze AIs, then long free-for-all soak with the player moving ---
await page.evaluate(() => {
  const s = window.__scene
  s.ais.forEach((ai, i) => { ai.update = window.__aiSaved[i] })
})
for (let i = 0; i < 14; i++) {
  await page.keyboard.down(i % 2 ? 'a' : 'd')
  await page.waitForTimeout(320)
  await page.keyboard.up(i % 2 ? 'a' : 'd')
  if (i % 3 === 0) await page.keyboard.press('j')
  if (i % 5 === 0) await page.keyboard.press('Space')
}
await page.screenshot({ path: 'qa/screens/brawl-play-brawl.png' })
const sEnd = await state()
console.log('SOAK:', JSON.stringify(sEnd, null, 1))
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
