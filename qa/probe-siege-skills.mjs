// probe-siege-skills.mjs — exercises ALL 12 skill archetypes via real 1-4
// keypresses across 3 loadouts (localStorage-injected profiles).
// Usage: node qa/probe-siege-skills.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5188'
const LOADOUTS = [
  ['blink', 'starfire', 'frostring', 'quake'],
  ['overdrive', 'aegis', 'mend', 'decoy'],
  ['gravity', 'titan', 'ghost', 'comet'],
]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const fails = []
const assert = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg) }

for (let li = 0; li < LOADOUTS.length; li++) {
  const loadout = LOADOUTS[li]
  console.log(`\n--- loadout ${li + 1}: ${loadout.join(' / ')} ---`)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 } })
  await ctx.addInitScript(lo => {
    localStorage.setItem('ipl-profile-v2', JSON.stringify({
      name: 'QA', loadout: lo,
      appearance: { primary: '#3fa7ff', secondary: '#232a4d', glow: '#7df9ff', head: 'visor', hair: 'spikes', trail: 'spark', cape: true },
      stats: { wins: {}, plays: {} },
    }))
  }, loadout)
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/?scene=siege&mute=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__scene?.phase === 'intro', null, { timeout: 15000 })
  await page.waitForTimeout(300)
  await page.keyboard.press('Space') // skip the intro cinematic
  await page.waitForTimeout(250)
  await page.evaluate(() => { window.__qaKeep = setInterval(() => { const s = window.__scene; if (!s.over && s.deadT <= 0) s.hp = 100 }, 300) })

  const equipped = await page.evaluate(() => window.__scene.skillDefs.map(d => d.id))
  assert(equipped.join() === loadout.join(), `loadout equipped [${equipped}]`)

  await page.mouse.move(720, 250) // aim up-field
  const before = await page.evaluate(() => ({ pos: { ...window.__scene.hero.group.position } }))

  for (let i = 0; i < 4; i++) {
    await page.keyboard.press(['Digit1', 'Digit2', 'Digit3', 'Digit4'][i])
    await page.waitForTimeout(420)
  }
  await page.screenshot({ path: `qa/screens/siege-skills${li + 1}.png` })

  const st = await page.evaluate(() => {
    const s = window.__scene
    let ghostMats = 0
    s.hero.group.traverse(o => { if (o !== s.hero.ring && o !== s.bubble && o.material && o.material.transparent && o.material.opacity <= 0.33) ghostMats++ })
    return {
      cds: [...s.cds], pos: { ...s.hero.group.position },
      frost: s.frost.length, vortices: s.vortices.length, meteors: s.meteors.length,
      buffT: s.buffT, giantT: s.giantT, ghostT: s.ghostT, heroScale: s.heroScale,
      shield: !!s.shield, bubbleVis: s.bubble.visible, decoy: !!s.decoy, hp: s.hp,
      ghostMats,
    }
  })
  for (let i = 0; i < 4; i++) assert(st.cds[i] > 0, `${loadout[i]} on cooldown after cast (${st.cds[i].toFixed(1)}s)`)

  if (loadout.includes('blink')) {
    const moved = Math.hypot(st.pos.x - before.pos.x, st.pos.z - before.pos.z)
    assert(moved > 3, `blink teleported hero (${moved.toFixed(1)} units)`)
  }
  if (loadout.includes('frostring')) assert(st.frost >= 1, `frost zone active (${st.frost})`)
  if (loadout.includes('overdrive')) assert(st.buffT > 0, `overdrive haste active (${st.buffT.toFixed(1)}s)`)
  if (loadout.includes('aegis')) assert(st.shield && st.bubbleVis, 'aegis shield bubble up')
  if (loadout.includes('decoy')) assert(st.decoy, 'decoy clone spawned')
  if (loadout.includes('gravity')) assert(st.vortices >= 1, `gravity vortex active (${st.vortices})`)
  if (loadout.includes('titan')) assert(st.giantT > 0 && st.heroScale > 1.3, `titan form (scale=${st.heroScale.toFixed(2)})`)
  if (loadout.includes('ghost')) {
    assert(st.ghostT > 0 && st.ghostMats > 0, `ghost translucent (${st.ghostMats} faded mats)`)
    await page.waitForTimeout(3600)
    const after = await page.evaluate(() => {
      const s = window.__scene
      let bad = 0
      s.hero.group.traverse(o => { if (o !== s.hero.ring && o !== s.bubble && o.material && o.material.transparent && o.material.opacity <= 0.33) bad++ })
      return { bad, ghostT: s.ghostT }
    })
    assert(after.ghostT <= 0 && after.bad === 0, `ghost restored materials (${after.bad} still faded)`)
  }
  if (loadout.includes('comet')) {
    await page.waitForTimeout(1600)
    const m = await page.evaluate(() => window.__scene.meteors.length)
    assert(m === 0, 'comet detonated and cleaned up')
  }
  if (loadout.includes('decoy')) {
    await page.waitForTimeout(6500)
    const d = await page.evaluate(() => !!window.__scene.decoy)
    assert(!d, 'decoy expired after duration')
  }

  assert(errors.length === 0, `zero console errors (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)
  await ctx.close()
}

await browser.close()
console.log(fails.length ? `\nSIEGE SKILLS PROBE: ${fails.length} FAILURES` : '\nSIEGE SKILLS PROBE: ALL 12 ARCHETYPES PASS')
process.exit(fails.length ? 1 : 0)
