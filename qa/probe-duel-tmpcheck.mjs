import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
await page.goto('http://localhost:8481/?scene=duel&mute=1', { waitUntil: 'load' })
await page.waitForTimeout(2600)
await page.keyboard.press('x')
await page.waitForFunction(() => window.__scene?.phase === 'fight', null, { timeout: 20000 })
await page.evaluate(() => {
  const s = window.__scene
  s.ai.update = () => { const it = s.ai.intent; it.move = 0; it.jump = it.light = it.heavy = it.throw = false; it.dash = 0; it.block = false; it.crouch = false; return it }
  window.__trace = []
  const ou = s.update.bind(s)
  s.update = (dt, t) => {
    ou(dt, t)
    const f = s.foe
    window.__trace.push({ dt, kd: +f.kdT.toFixed(3), jf: f.juggleFall, gu: f.getup, hs: +f.hitstun.toFixed(2), st: f.hero.state, ko: +f.hero.koT.toFixed(2), hr: +f.hero.hips.rotation.x.toFixed(3), y: +f.pos.y.toFixed(2) })
  }
  s.player.pos.x = -1; s.foe.pos.x = 0.4; s.player.facing = 1; s.roundT = 60
})
await page.keyboard.press('j'); await page.waitForTimeout(210)
await page.keyboard.press('j'); await page.waitForTimeout(210)
await page.keyboard.press('k')
await page.waitForTimeout(2700)
const tr = await page.evaluate(() => window.__trace)
let mi = 1, mv = 0
for (let i = 1; i < tr.length; i++) {
  const d = Math.abs(tr[i].hr - tr[i-1].hr) / Math.max(tr[i].dt, 1/120)
  if (d > mv) { mv = d; mi = i }
}
console.log('max hips rate', mv.toFixed(1), 'at sample', mi, 'of', tr.length)
console.log(JSON.stringify(tr.slice(Math.max(0, mi-4), mi+4), null, 1))
await browser.close()
