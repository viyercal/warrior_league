// Duel beauty probe: captures the money shots — intro sweep, mid-juggle combo,
// the OBLITERATE prompt + finisher, and the red boss arena. Doubles as an
// end-to-end test of the match-point finisher flow.
import { chromium } from 'playwright-core'

const port = process.env.IPL_PORT || '8181'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
let pass = 0, fail = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
  ok ? pass++ : fail++
}

const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(`http://localhost:${port}/?scene=duel&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(2600)

// ---------- intro cinematic sweep ----------
await page.waitForTimeout(1200) // mid-sweep
await page.screenshot({ path: 'qa/screens/duel-beauty-intro.png' })
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })

// ---------- mid-combo juggle ----------
await page.evaluate(() => {
  const s = window.__scene
  s.ai.update = () => { const it = s.ai.intent; it.move = 0; it.jump = it.light = it.heavy = it.throw = false; it.dash = 0; it.block = false; it.crouch = false; return it }
  s.player.pos.x = -1
  s.foe.pos.x = 0.5
  s.player.facing = 1
  s.roundT = 60
})
await page.keyboard.press('j')
await page.waitForTimeout(230)
await page.keyboard.press('j')
await page.waitForTimeout(230)
await page.keyboard.press('k')
await page.waitForTimeout(430)
await page.keyboard.down('d')
await page.waitForTimeout(200)
await page.keyboard.up('d')
await page.keyboard.press('j')
await page.waitForTimeout(210)
await page.screenshot({ path: 'qa/screens/duel-beauty-combo.png' })
const combo = await page.evaluate(() => window.__scene.foe.comboHits)
check('mid-combo capture (juggle live)', combo >= 3, `combo=${combo}`)
await page.waitForTimeout(1600)

// ---------- match point -> OBLITERATE prompt -> finisher ----------
await page.evaluate(() => {
  const s = window.__scene
  s.playerWins = 1
  s.dHud.setRounds('L', 1)
  s.foe.hp = 4
  s.foe.pos.x = 0.6
  s.foe.kdT = 0
  s.foe.iFrames = 0
  s.player.pos.x = -1
  s.player.hitstun = 0
  s.player.attack = null
})
await page.keyboard.press('j')
await page.waitForTimeout(700)
const prompt = await page.evaluate(() => ({ phase: window.__scene.phase, el: !!document.querySelector('.duel-oblit') }))
check('OBLITERATE prompt appears on match point', prompt.phase === 'oblitPrompt' && prompt.el, JSON.stringify(prompt))
await page.screenshot({ path: 'qa/screens/duel-beauty-oblit-prompt.png' })
await page.keyboard.press('j') // take the finisher
await page.waitForTimeout(900)
const fin = await page.evaluate(() => ({ phase: window.__scene.phase, slow: window.__scene.timeScale < 0.9 }))
check('finisher runs in slow-mo', fin.phase === 'finisher' && fin.slow, JSON.stringify(fin))
await page.waitForTimeout(700)
await page.screenshot({ path: 'qa/screens/duel-beauty-finisher.png' })
const oblit = await page.evaluate(() => [...document.querySelectorAll('.banner-main')].some(b => b.textContent.includes('OBLITERATION')))
check('OBLITERATION banner', oblit)
// advances the tower afterwards
await page.waitForFunction(() => window.__scene?.stage === 1, null, { timeout: 12000 })
check('finisher advances the tower', true)

// ---------- boss arena (red braziers, deep fog) ----------
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })
await page.evaluate(() => window.__scene.debug.winFight())
await page.waitForTimeout(2600)
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })
await page.evaluate(() => window.__scene.debug.winFight())
await page.waitForTimeout(3400) // boss entrance: dim + ember surge
await page.screenshot({ path: 'qa/screens/duel-beauty-boss-entrance.png' })
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 25000 })
// wide framing: separate the fighters so the arena breathes
await page.evaluate(() => {
  const s = window.__scene
  s.player.pos.x = -7
  s.foe.pos.x = 7
})
await page.waitForTimeout(900)
await page.screenshot({ path: 'qa/screens/duel-beauty-boss-wide.png' })
const bossOn = await page.evaluate(() => window.__scene.stage === 3 && window.__scene.foe.name === 'THE ETERNAL')
check('boss arena captured', bossOn)

console.log(`RESULT: ${pass} passed, ${fail} failed`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
process.exit(fail || errors.length ? 1 : 0)
