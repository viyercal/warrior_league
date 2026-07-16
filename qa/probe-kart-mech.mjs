// Kart mechanics probe: drift tiers + mini-turbo, boost pad, boost ring +
// respawn, wrong-way warning, kart collision shunt, AI shells, offroad slow.
// node qa/probe-kart-mech.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5186'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

const results = []
const check = (name, ok, detail = '') => {
  results.push([name, ok, detail])
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

await page.goto(`http://localhost:${port}/?scene=kart&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(5600) // boot + intro + countdown

check('race started', await page.evaluate(() => window.__scene.state === 'race'))

// ---------- drift tier 1 (blue) then tier 2 (SUPER) ----------
await page.keyboard.down('w')
await page.waitForTimeout(1700)
await page.keyboard.down('a')
await page.waitForTimeout(200)
await page.keyboard.down(' ')
await page.waitForTimeout(400)
const drifting = await page.evaluate(() => window.__scene.player.drifting)
check('drift engages (space + steer)', drifting)
await page.waitForTimeout(2100) // total drift ~2.5s -> tier 2
const preRelease = await page.evaluate(() => ({ t: window.__scene.player.driftT, m: window.__scene.player.meter }))
await page.keyboard.up(' ')
await page.waitForTimeout(120)
const post = await page.evaluate(() => {
  const p = window.__scene.player
  const el = document.querySelector('.kart-drift')
  return { boostT: p.boostT, power: p.boostPower, meter: p.meter, flash: el?.textContent, on: el?.classList.contains('on') }
})
check('drift held long enough for tier 2', preRelease.t > 2.2, `driftT pre-release=${preRelease.t.toFixed(2)}`)
check('mini-turbo burst on release', post.boostT > 0.5 && post.power >= 12, `boostT=${post.boostT.toFixed(2)} power=${post.power}`)
check('SUPER BOOST! flash shown', post.on && post.flash === 'SUPER BOOST!', `flash="${post.flash}"`)
check('meter filled by drift tier', post.meter >= preRelease.m + 17, `meter ${preRelease.m.toFixed(0)} -> ${post.meter.toFixed(0)}`)
await page.keyboard.up('a')

// ---------- boost pad (teleport onto pad, roll over it) ----------
await page.evaluate(() => {
  const s = window.__scene
  const pad = s.track.pads[0]
  s.player.group.position.set(pad.x, 0, pad.z)
  s.player.boostT = 0
  s.player.padCd = 0
})
await page.waitForTimeout(150)
const padRes = await page.evaluate(() => ({ boostT: window.__scene.player.boostT, cd: window.__scene.player.padCd }))
check('boost pad grants burst', padRes.boostT > 0.8 && padRes.cd > 0, `boostT=${padRes.boostT.toFixed(2)}`)

// ---------- boost ring collect + respawn timer ----------
const ringRes = await page.evaluate(() => {
  const s = window.__scene
  const ring = s.track.rings.find(r => r.active)
  s.player.meter = 10
  s.player.group.position.set(ring.home.x, 0, ring.home.z)
  return new Promise(res => setTimeout(() => res({
    active: ring.active, respawnT: ring.respawnT, meter: s.player.meter,
  }), 200))
})
check('boost ring collected (+meter, deactivates)', !ringRes.active && ringRes.meter >= 27, `meter=${ringRes.meter} active=${ringRes.active}`)
check('ring respawn timer ~6s', ringRes.respawnT > 5.5 && ringRes.respawnT <= 6, `respawnT=${ringRes.respawnT.toFixed(2)}`)

// ---------- offroad slow (drive parallel to the track, 12u off the line) ----------
await page.evaluate(() => {
  const s = window.__scene
  const c = s.track.pos[s.player.idx]
  const l = s.track.left[s.player.idx]
  const tn = s.track.tan[s.player.idx]
  s.player.group.position.set(c.x + l.x * 12, 0, c.z + l.z * 12)
  s.player.heading = Math.atan2(tn.x, tn.z) // stay parallel -> stay offroad
  s.player.speed = 26
})
await page.waitForTimeout(1300)
const off = await page.evaluate(() => ({ offroad: window.__scene.player.offroad, speed: window.__scene.player.speed }))
check('offroad detected + heavy slow', off.offroad && off.speed < 18, `offroad=${off.offroad} speed=${off.speed.toFixed(1)}`)
await page.keyboard.up('w')

// ---------- wrong-way warning ----------
await page.evaluate(() => {
  const s = window.__scene
  const c = s.track.pos[s.player.idx]
  s.player.group.position.set(c.x, 0, c.z)
  const tn = s.track.tan[s.player.idx]
  s.player.heading = Math.atan2(-tn.x, -tn.z) // face backwards
  s.player.speed = 0
})
await page.keyboard.down('w')
await page.waitForTimeout(1600)
const wrong = await page.evaluate(() => document.querySelector('.kart-wrongway')?.classList.contains('on'))
check('wrong-way "TURN AROUND!" shows', !!wrong)
await page.screenshot({ path: 'qa/screens/kart-mech-wrongway.png' })
await page.keyboard.up('w')

// ---------- collision shunt + damage ----------
const col = await page.evaluate(() => {
  const s = window.__scene
  const ai = s.karts.find(k => !k.isPlayer && k.spinT <= 0)
  // bring the AI to the player (fix its cached track idx or the soft wall snaps it back)
  const p = s.player
  const tn = { x: Math.sin(p.heading), z: Math.cos(p.heading) }
  ai.group.position.set(p.group.position.x - tn.x * 2.0, 0, p.group.position.z - tn.z * 2.0)
  ai.idx = s.track.nearestIdx(ai.group.position, p.idx, 512)
  ai.lastS = ai.idx / s.track.N
  ai.heading = p.heading
  ai.speed = 30
  ai.kv.set(0, 0, 0)
  p.speed = 0
  p.kv.set(0, 0, 0)
  p.damage = 0
  return new Promise(res => setTimeout(() => res({
    kv: s.player.kv.length(), dmg: s.player.damage,
  }), 200))
})
check('kart collision shunts player', col.kv > 0.4 || col.dmg > 0, `|kv|=${col.kv.toFixed(2)} dmg=${col.dmg}`)

// ---------- AI shell fire (count fireShell calls — shells can die fast) ----------
await page.evaluate(() => {
  const it = window.__scene.items
  window.__shellCount = 0
  const orig = it.fireShell.bind(it)
  it.fireShell = (...a) => { window.__shellCount++; return orig(...a) }
  window.__scene.aiShellT = 0.05
})
let shellSeen = false
for (let i = 0; i < 12 && !shellSeen; i++) {
  await page.waitForTimeout(250)
  shellSeen = await page.evaluate(() => window.__shellCount > 0)
}
check('AI fires shells at kart ahead', shellSeen)

// ---------- damage reduces top speed + damage bar ----------
const dmg = await page.evaluate(() => {
  const s = window.__scene
  s.player.damage = 0.3
  return new Promise(res => setTimeout(() => {
    const w = document.querySelector('.kart-dmg-fill')?.style.width
    res({ barWidth: w })
  }, 150))
})
check('damage bar reflects damage', dmg.barWidth === '100%', `width=${dmg.barWidth}`)

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none')
const fails = results.filter(r => !r[1]).length
console.log(`SUMMARY: ${results.length - fails}/${results.length} passed`)
await browser.close()
process.exit(fails || errors.length ? 1 : 0)
