// Duel probe: AI sanity — it attacks, blocks sometimes, uses its specials
// with intent, and stage 1 is beatable (an idle player survives > 8s).
import { chromium } from 'playwright-core'

const port = process.env.IPL_PORT || '8181'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
let pass = 0, fail = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
  ok ? pass++ : fail++
}

await page.goto(`http://localhost:${port}/?scene=duel&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(2600)
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })

// instrument AI activity counters
await page.evaluate(() => {
  const s = window.__scene
  window.__ai = { attacks: 0, blocks: 0, casts: 0, throws: 0 }
  const orig = s.ai.update.bind(s.ai)
  s.ai.update = gdt => {
    const it = orig(gdt)
    if (it.light || it.heavy) window.__ai.attacks++
    if (it.throw) window.__ai.throws++
    if (it.block) window.__ai.blocks++
    return it
  }
  const oc = s.specials.cast.bind(s.specials)
  s.specials.cast = (f, def) => {
    const ok = oc(f, def)
    if (ok && f === s.foe) window.__ai.casts++
    return ok
  }
})

// ---------- idle survival: stage 1 must not delete a first-timer ----------
const t0 = Date.now()
let idleSurvive = 0
while (Date.now() - t0 < 14000) {
  const st = await page.evaluate(() => ({ hp: window.__scene.player.hp, phase: window.__scene.phase }))
  if (st.hp <= 0 || st.phase !== 'fight') { idleSurvive = (Date.now() - t0) / 1000; break }
  idleSurvive = (Date.now() - t0) / 1000
  await page.waitForTimeout(400)
}
const hpAfter = await page.evaluate(() => window.__scene.player.hp)
check('stage-1: idle player survives > 8s', idleSurvive > 8, `survived ${idleSurvive.toFixed(1)}s (hp=${hpAfter.toFixed(0)})`)

// AI pressed attacks + moved + dealt damage
const ai1 = await page.evaluate(() => window.__ai)
check('AI attacks', ai1.attacks > 3, `attack inputs=${ai1.attacks}`)
check('AI dealt damage to an idle player', hpAfter < 100, `player hp=${hpAfter.toFixed(0)}`)

// ---------- AI blocks: swing at ASHBORN repeatedly, count block reactions ----------
await page.evaluate(() => {
  const s = window.__scene
  s.player.hp = 100
  s.foe.hp = 100
  s.roundT = 60
})
for (let i = 0; i < 24; i++) {
  await page.evaluate(() => {
    const s = window.__scene
    // reset the dance floor: put them adjacent, clear states
    if (s.phase !== 'fight') return
    s.player.pos.x = -0.9
    s.foe.pos.x = 0.6
    s.player.hitstun = 0
    s.player.hp = 100
    s.foe.hp = 100
    s.roundT = 60
  })
  await page.keyboard.press('k') // heavy: 0.32s startup — readable
  await page.waitForTimeout(430)
}
const ai2 = await page.evaluate(() => window.__ai)
check('AI blocks sometimes (reactive reads)', ai2.blocks > 0, `block frames=${ai2.blocks}`)

// ---------- AI uses specials with intent (give it space to zone/dash) ----------
await page.evaluate(() => {
  const s = window.__scene
  s.player.pos.x = -8
  s.foe.pos.x = 8
  s.player.hp = 100
  s.foe.hp = 100
  s.roundT = 60
  for (let i = 0; i < s.ai.cds.length; i++) s.ai.cds[i] = 0
})
await page.waitForTimeout(6000)
const ai3 = await page.evaluate(() => window.__ai)
check('AI casts its specials', ai3.casts > 0, `casts=${ai3.casts}`)

// ---------- the duel stays lively: both HP bars move over a soak ----------
await page.evaluate(() => { const s = window.__scene; s.player.hp = 100; s.foe.hp = 100; s.roundT = 60 })
for (let i = 0; i < 10; i++) {
  await page.keyboard.down(i % 2 ? 'a' : 'd')
  await page.waitForTimeout(300)
  await page.keyboard.up(i % 2 ? 'a' : 'd')
  await page.keyboard.press('j')
  if (i % 3 === 0) await page.keyboard.press('k')
  await page.waitForTimeout(160)
}
const soak = await page.evaluate(() => ({ p: window.__scene.player.hp, f: window.__scene.foe.hp, phase: window.__scene.phase }))
check('soak: a real duel happened', soak.f < 100 || soak.p < 100, JSON.stringify(soak))
await page.screenshot({ path: 'qa/screens/duel-ai-soak.png' })

console.log(`RESULT: ${pass} passed, ${fail} failed`)
console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
process.exit(fail || errors.length ? 1 : 0)
