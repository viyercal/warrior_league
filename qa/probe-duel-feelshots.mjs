// Duel feel-pass screenshot iterator: counter moments (2x pop, 4x tier-up
// flare, 7x blood incoming, 10x gold-leaf, dropped-combo crumble) and the
// knockdown silhouette burst (mid-fall / prone / rising).
import { chromium } from 'playwright-core'

const port = process.env.IPL_PORT || '8181'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${port}/?scene=duel&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(2600)
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })

await page.evaluate(() => {
  const s = window.__scene
  s.ai.update = () => {
    const it = s.ai.intent
    it.move = 0; it.jump = it.light = it.heavy = it.throw = false
    it.dash = 0; it.block = false; it.crouch = false
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
    f.kdVy = 0; f.kdSettled = true; f.qrT = 0; f.getup = false; f.wakeInvT = 0
    f.comboHits = 0; f.comboDmg = 0
    f.hp = 100
    f.hero.setState('normal')
    f.hero.group.rotation.x = 0
    f.hero.hips.rotation.x = 0
  }
  s.player.facing = 1; s.foe.facing = -1
  s.roundT = 60
  s.dHud.hideCombos()
}, { px, fx })
const hits = (n, dur = 0.9) => page.evaluate(({ n, dur }) => {
  const s = window.__scene
  for (let i = 0; i < n; i++) s.fight.applyHit(s.foe, s.player, { dmg: 2, hitstun: dur, kb: 0.1 })
}, { n, dur })

// ---------- 1. fresh 2x mid-pop ----------
await place(-1, 0.4)
await page.keyboard.press('j')
await page.waitForTimeout(210)
await page.keyboard.press('j')
await page.waitForTimeout(160) // catch the stamp mid-pop
await page.screenshot({ path: 'qa/screens/duel-feel-2x-pop.png' })
await page.waitForTimeout(1600)

// ---------- 2. 4x ember tier-up with the screen-edge flare ----------
await place(-1, 0.4)
await page.evaluate(() => {
  const s = window.__scene
  for (let i = 0; i < 4; i++) s.fight.applyHit(s.player, s.foe, { dmg: 3, hitstun: 0.9, kb: 0.1 })
})
await page.waitForTimeout(120) // flare animation is 0.55s
await page.screenshot({ path: 'qa/screens/duel-feel-4x-flare.png' })
await page.waitForTimeout(1600)

// ---------- 3. 7x blood tier, incoming (crimson, left) ----------
await place(-1, 0.4)
await hits(7)
await page.waitForTimeout(260)
await page.screenshot({ path: 'qa/screens/duel-feel-7x-blood.png' })
await page.waitForTimeout(1600)

// ---------- 4. 10x gold-leaf (outgoing: the player's own combo) ----------
await place(-1, 0.4)
await page.evaluate(() => {
  const s = window.__scene
  for (let i = 0; i < 10; i++) s.fight.applyHit(s.player, s.foe, { dmg: 3, hitstun: 0.9, kb: 0.1 })
})
await page.waitForTimeout(300)
await page.screenshot({ path: 'qa/screens/duel-feel-10x-gold.png' })
await page.waitForTimeout(1600)

// ---------- 5. dropped combo crumble (victim escapes standing) ----------
await place(-1, 0.4)
await hits(5, 0.55)
await page.waitForTimeout(780) // hitstun expires -> escape -> crack + crumble
await page.screenshot({ path: 'qa/screens/duel-feel-drop-crumble.png' })
await page.waitForTimeout(1200)

// ---------- 6. knockdown silhouette burst ----------
await place(-1, 0.4)
await page.keyboard.press('j')
await page.waitForTimeout(210)
await page.keyboard.press('j')
await page.waitForTimeout(210)
await page.keyboard.press('k') // launcher
await page.waitForTimeout(450)
await page.screenshot({ path: 'qa/screens/duel-feel-kd-1-fall.png' })   // tumbling mid-air
await page.waitForTimeout(700)
await page.screenshot({ path: 'qa/screens/duel-feel-kd-2-prone.png' })  // settled prone beat
await page.waitForTimeout(600)
await page.screenshot({ path: 'qa/screens/duel-feel-kd-3-rise.png' })   // roll-to-crouch rise
await page.waitForTimeout(300)
await page.screenshot({ path: 'qa/screens/duel-feel-kd-4-wake.png' })   // wakeup shimmer

console.log('SHOTS DONE')
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
process.exit(errors.length ? 1 : 0)
