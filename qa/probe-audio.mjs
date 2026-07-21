// Audio pass probe: verifies the upgraded engine with SOUND ON (no ?mute).
// Requires Chrome with --autoplay-policy=no-user-gesture-required so the
// AudioContext runs headless. Checks: graph (compressor), per-scene ambience
// beds, SFX variation, sidechain ducking, volume persistence, music crossfade
// + seamless hub↔loadout, kart engine loop lifecycle, pan. Zero errors required.
import { chromium } from 'playwright-core'

const BASE = process.env.IPL_BASE || 'http://localhost:5173'
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

const results = []
const check = (label, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}
const audio = fn => page.evaluate(fn)
const beds = () => audio(() => [...window.__ipl.audio._amb.keys()].sort())

// ---------- 1. hub: graph + hub ambience ----------
await page.goto(`${BASE}/?scene=hub`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__ipl?.sm?.currentName === 'hub', null, { timeout: 15000 })
await page.waitForTimeout(1200)
check('ctx running (autoplay flag)', await audio(() => window.__ipl.audio.ctx.state) === 'running')
check('compressor in chain', await audio(() => !!window.__ipl.audio.comp))
check('hub theme', await audio(() => window.__ipl.audio._theme) === 'hub')
check('hub beds = wind+fire', JSON.stringify(await beds()) === JSON.stringify(['fire', 'wind']))

// ---------- 2. SFX variation: 24 hits must not be identical ----------
const distinct = await audio(() => {
  const seen = new Set()
  const a = window.__ipl.audio
  const orig = a._osc.bind(a)
  a._osc = o => { seen.add(Math.round(o.f * 100) / 100); return orig(o) }
  for (let i = 0; i < 24; i++) a.play('hit')
  a._osc = orig
  return seen.size
})
check('SFX variation (24 hits → >4 distinct freqs)', distinct > 4, `${distinct} distinct`)

// ---------- 3. sidechain duck: victory dips music, then recovers ----------
await audio(() => window.__ipl.audio.play('victory'))
await page.waitForTimeout(140)
const dipped = await audio(() => window.__ipl.audio.musicDuck.gain.value)
check('victory ducks music (< 0.8)', dipped < 0.8, `gain=${dipped.toFixed(2)}`)
await page.waitForTimeout(2800)
const recovered = await audio(() => window.__ipl.audio.musicDuck.gain.value)
check('duck recovers (> 0.9)', recovered > 0.9, `gain=${recovered.toFixed(2)}`)

// ---------- 4. volume persistence ----------
await audio(() => window.__ipl.audio.setVolumes({ music: 0.44 }))
await page.waitForTimeout(350)
const stored = await audio(() => JSON.parse(localStorage.getItem('ipl-audio-v1') || '{}').music)
const busGain = await audio(() => window.__ipl.audio.musicBus.gain.value)
check('setVolumes persists to localStorage', stored === 0.44, `stored=${stored}`)
check('musicBus gain tracks setter', Math.abs(busGain - 0.44) < 0.06, `gain=${busGain.toFixed(2)}`)
await audio(() => window.__ipl.audio.setVolumes({ music: 0.3 }))

// ---------- 5. pan option fires without error ----------
await audio(() => window.__ipl.audio.play('hit', { pan: -0.8, vol: 0.1 }))
check('pan option ok', true)

// ---------- 6. hub → loadout: music seamless (stays 'hub'), beds crossfade ----------
await audio(() => window.__ipl.sm.goTo('loadout'))
await page.waitForFunction(() => window.__ipl?.sm?.currentName === 'loadout', null, { timeout: 15000 })
await page.waitForTimeout(2200)
check('hub→loadout keeps hub theme (no hard stop)', await audio(() => window.__ipl.audio._theme) === 'hub')
check('loadout beds = fire+forge', JSON.stringify(await beds()) === JSON.stringify(['fire', 'forge']))

// ---------- 7. music crossfade on theme change (loadout → moba) ----------
await audio(() => window.__ipl.sm.goTo('moba'))
await page.waitForFunction(() => window.__ipl?.sm?.currentName === 'moba', null, { timeout: 15000 })
await page.waitForTimeout(1500)
check('loadout→moba crossfades to battle', await audio(() => window.__ipl.audio._theme) === 'battle')
check('moba beds = wind', JSON.stringify(await beds()) === JSON.stringify(['wind']))
const mobaGain = await audio(() => window.__ipl.audio.musicBus.gain.value)
check('musicBus alive after crossfade', mobaGain > 0.1, `gain=${mobaGain.toFixed(2)}`)

// ---------- 8. per-scene ambience across the suite ----------
const EXPECT = {
  hoops: ['crowd'], arena: ['lava', 'windLow'], brawl: ['lava', 'windLow'],
  siege: ['fireLow', 'wind'], duel: ['crowd', 'fireLow'], kart: ['wind'],
}
for (const [scene, want] of Object.entries(EXPECT)) {
  await page.goto(`${BASE}/?scene=${scene}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__ipl?.sm?.currentName, null, { timeout: 15000 })
  await page.waitForTimeout(1600)
  check(`${scene} beds = ${want.join('+')}`, JSON.stringify(await beds()) === JSON.stringify(want))
}

// ---------- 9. kart engine loop lifecycle ----------
await page.waitForFunction(() => window.__scene?.state === 'intro', null, { timeout: 15000 })
await page.keyboard.press('x') // skip intro flyover
await page.waitForFunction(() => window.__scene?.state === 'race', null, { timeout: 15000 })
check('engine starts on GO', await audio(() => !!window.__ipl.audio._engine))
const f0 = await audio(() => window.__ipl.audio._engine.oscA.frequency.value)
await page.keyboard.down('w')
await page.waitForTimeout(2500)
const f1 = await audio(() => window.__ipl.audio._engine.oscA.frequency.value)
await page.keyboard.up('w')
check('engine pitch tracks speed', f1 > f0 + 5, `${f0.toFixed(1)}Hz → ${f1.toFixed(1)}Hz`)
await audio(() => window.__ipl.sm.goTo('hub'))
await page.waitForFunction(() => window.__ipl?.sm?.currentName === 'hub', null, { timeout: 15000 })
check('engine stopped after scene change (backstop)', await audio(() => !window.__ipl.audio._engine))

// ---------- 10. zero errors everywhere ----------
check('zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

console.log('\n' + results.join('\n'))
await browser.close()
