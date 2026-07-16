// RIFT LEGENDS flow probe: mechanics + win/lose verification via debug hooks.
// node qa/probe-moba-flow.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5183'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
const load = async () => {
  await page.goto(`http://localhost:${port}/?scene=moba&mute=1`, { waitUntil: 'load' })
  await page.waitForTimeout(4200)
}

// ============ 1. last-hit / CS / gold / XP ============
await load()
await page.evaluate(() => {
  const s = window.__scene
  // stage far from towers/waves: hero + a nearly-dead red minion at mid off-lane
  s.hero.group.position.set(-4, 0, 14)
  s.camFocus.set(-4, 0, 14)
  const e = s.army.spawn('red', 'melee', 0, 14)
  e.hp = 5
})
// right-click it
await page.waitForTimeout(300)
const clickPos = await page.evaluate(() => {
  const s = window.__scene
  let best = null, bd = 1e9
  for (const e of s.army.active) {
    if (!e.alive || e.team !== 'red') continue
    const d = (e.minion.group.position.x - s.hero.group.position.x) ** 2
    if (d < bd) { bd = d; best = e.minion.group.position }
  }
  const v = best.clone()
  v.y = 0.4
  v.project(s.camera)
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }
})
await page.mouse.click(clickPos.x, clickPos.y, { button: 'right' })
await page.waitForTimeout(2500)
const cs = await page.evaluate(() => ({ cs: window.__scene.cs, gold: window.__scene.goldEarned, xp: window.__scene.xp }))
console.log('last-hit check (want cs 1, gold 20, xp 20):', JSON.stringify(cs))

// ============ 2. skills damage + kill enemy champ ============
await page.evaluate(() => {
  const s = window.__scene
  s.hero.group.position.set(-4, 0, 14)
  s.enemy.group.position.set(-2.5, 0, 14)
  s.enemy.hp = 30
})
await page.keyboard.press('KeyE') // quake nova around hero — 40 dmg kills the staged champ
await page.waitForTimeout(1400)
const kill = await page.evaluate(() => ({
  enemyAlive: window.__scene.enemy.alive, enemyHp: Math.round(window.__scene.enemy.hp),
  kills: window.__scene.kills, gold: window.__scene.goldEarned,
  banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
}))
console.log('champ kill check (want kills 1, +300 gold):', JSON.stringify(kill))
await page.screenshot({ path: 'qa/screens/moba-flow-kill.png' })

// ============ 3. player death + respawn countdown ============
await page.evaluate(() => window.__scene.damagePlayer(9999, null))
await page.waitForTimeout(900)
const death = await page.evaluate(() => ({
  dead: window.__scene.playerDead,
  overlay: document.querySelector('.moba-death').classList.contains('on'),
  respawnT: Math.round(window.__scene.respawnT),
  deaths: window.__scene.deaths,
}))
console.log('death check (want dead, overlay, ~8s):', JSON.stringify(death))
await page.screenshot({ path: 'qa/screens/moba-flow-death.png' })
await page.evaluate(() => { window.__scene.respawnT = 0.1 })
await page.waitForTimeout(800)
const respawn = await page.evaluate(() => ({
  dead: window.__scene.playerDead, hp: window.__scene.hp,
  x: Math.round(window.__scene.hero.group.position.x),
}))
console.log('respawn check (want alive, 100hp, x=-43):', JSON.stringify(respawn))

// ============ 4. tower gating ============
const gate = await page.evaluate(() => {
  const s = window.__scene
  const outer = s.structures.tower('red', 0)
  const inner = s.structures.tower('red', 1)
  const nexus = s.structures.nexus('red')
  const before = { inner: s.structures.attackable(inner), nexus: s.structures.attackable(nexus) }
  s.structures.damage(inner, 999, 'blue') // should be IMMUNE
  const innerHpAfterImmuneHit = inner.hp
  s.structures.damage(outer, 999, 'blue') // destroys outer
  const mid = { inner: s.structures.attackable(inner), nexus: s.structures.attackable(nexus) }
  s.structures.damage(inner, 999, 'blue')
  const after = { nexus: s.structures.attackable(nexus), gold: s.goldEarned }
  return { before, innerHpAfterImmuneHit, mid, after }
})
console.log('gating check (inner immune until outer dies, nexus after both):', JSON.stringify(gate))
await page.waitForTimeout(1200)
await page.screenshot({ path: 'qa/screens/moba-flow-towerdown.png' })

// ============ 5. WIN via debug hook ============
const winsBefore = await page.evaluate(() => (JSON.parse(localStorage.getItem('ipl-profile-v2') || '{}').stats?.wins?.moba) || 0)
await page.evaluate(() => window.__scene.debug.win())
await page.waitForTimeout(1800)
const win = await page.evaluate(() => ({
  over: window.__scene.over,
  banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
  sub: document.querySelector('.banner-sub')?.textContent,
  button: !!document.querySelector('.moba-end button'),
  wins: JSON.parse(localStorage.getItem('ipl-profile-v2')).stats.wins.moba,
}))
console.log(`win check (want VICTORY banner, button, wins ${winsBefore}+1):`, JSON.stringify(win))
await page.screenshot({ path: 'qa/screens/moba-flow-victory.png' })
// click RETURN TO HUB
await page.click('.moba-end button')
await page.waitForTimeout(1600)
const afterWin = await page.evaluate(() => window.__ipl.sm.currentName)
console.log('return-to-hub after win (want hub):', afterWin)

// ============ 6. LOSE via debug hook ============
await load()
await page.evaluate(() => window.__scene.debug.lose())
await page.waitForTimeout(1200)
const lose = await page.evaluate(() => ({
  over: window.__scene.over,
  banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
  button: !!document.querySelector('.moba-end button'),
}))
console.log('lose check (want DEFEAT, button):', JSON.stringify(lose))
await page.screenshot({ path: 'qa/screens/moba-flow-defeat.png' })

// ============ 7. nexus destruction → real victory path ============
await load()
await page.evaluate(() => {
  const s = window.__scene
  s.structures.damage(s.structures.tower('red', 0), 999, 'blue')
  s.structures.damage(s.structures.tower('red', 1), 999, 'blue')
  s.structures.damage(s.structures.nexus('red'), 999, 'blue')
})
await page.waitForTimeout(2600)
const realWin = await page.evaluate(() => ({
  over: window.__scene.over,
  banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
}))
console.log('real nexus-kill victory (want won + VICTORY):', JSON.stringify(realWin))

// ============ 8. wheel zoom via synthetic event ============
await page.evaluate(() => dispatchEvent(new WheelEvent('wheel', { deltaY: -800 })))
await page.waitForTimeout(900)
const zoom = await page.evaluate(() => +window.__scene.zoom.toFixed(1))
console.log('zoom after wheel -800 (want ~16.4):', zoom)

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none')
await browser.close()
