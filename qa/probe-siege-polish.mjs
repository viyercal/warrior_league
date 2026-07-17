// probe-siege-polish.mjs — presentation pass regression: intro cinematic
// (framing + freeze + skip), wave ritual (comp preview + PREPARE chip),
// PERFECT WAVE (+40g, beacon flare), THE GATE BLEEDS breach drama, low-HP
// gate smolder + heartbeat, ANNIHILATION slow-mo, boss entrance cinematic,
// dawn victory ceremony + battle-honors tablet, turret tier pennants.
// Usage: node qa/probe-siege-polish.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '8286'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const fails = []
const assert = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg) }

const newPage = async (loadout = ['blink', 'starfire', 'quake', 'comet'], { skipIntro = true } = {}) => {
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
  if (skipIntro) {
    await page.keyboard.press('Space')
    await page.waitForTimeout(250)
  }
  return { ctx, page, errors }
}
const closeCase = async (ctx, errors, label) => {
  assert(errors.length === 0, `zero console errors (${label})${errors.length ? ' ' + JSON.stringify(errors.slice(0, 3)) : ''}`)
  await ctx.close()
}

// ---------- INTRO: reveal shot + frozen world ----------
console.log('--- intro reveal ---')
{
  const { ctx, page, errors } = await newPage(undefined, { skipIntro: false })
  // ride the flight to the gate-reveal beat (title on screen)
  let title = false
  try {
    await page.waitForFunction(() => !!document.querySelector('.siege-title-main'), null, { timeout: 8000 })
    title = true
  } catch { /* fall through to the assert */ }
  assert(title, 'title card visible during the reveal')
  await page.screenshot({ path: 'qa/screens/siege-polish-intro.png' })
  const st = await page.evaluate(() => ({
    phase: window.__scene.phase, breakT: window.__scene.breakT,
    raiders: window.__scene.army.active.length,
    heroMoved: Math.abs(window.__scene.hero.group.position.z - 7.5),
  }))
  assert(st.phase === 'intro' && st.breakT === 3 && st.raiders === 0 && st.heroMoved < 0.01,
    `world frozen through the reveal (breakT=${st.breakT}, raiders=${st.raiders})`)
  await closeCase(ctx, errors, 'intro reveal')
}

// ---------- WAVE RITUAL: comp preview + PREPARE chip ----------
console.log('--- wave ritual ---')
{
  const { ctx, page, errors } = await newPage()
  const ritual = await page.evaluate(() => ({
    chips: [...document.querySelectorAll('.big-banner .siege-comp-chip')].map(c => c.textContent),
    prepare: document.querySelector('.siege-prepare')?.style.display !== 'none'
      ? document.querySelector('.siege-prepare').textContent : null,
  }))
  assert(ritual.chips.length >= 1 && /×10/.test(ritual.chips.join(' ')),
    `WAVE 1 banner previews 10 grunts (${ritual.chips})`)
  assert(ritual.prepare && /PREPARE/.test(ritual.prepare), `PREPARE countdown chip (${ritual.prepare})`)
  // chip counts down and disappears once the wave starts
  await page.waitForTimeout(3300)
  const active = await page.evaluate(() => ({
    state: window.__scene.waveState,
    prepare: document.querySelector('.siege-prepare').style.display !== 'none',
  }))
  assert(active.state === 'active' && !active.prepare, 'PREPARE chip clears when the wave marches')
  await closeCase(ctx, errors, 'wave ritual')
}

// ---------- PERFECT WAVE + turret pennants ----------
console.log('--- perfect wave + pennants ---')
{
  const { ctx, page, errors } = await newPage()
  await page.evaluate(() => {
    const s = window.__scene
    s.debug.gold(3000)
    for (const i of [2, 3, 4, 5]) {
      const pad = s.turrets.pads[i]
      s.turrets.build(pad)
      s.turrets.upgrade(pad.turret)
      s.turrets.upgrade(pad.turret)
    }
    window.__qaGold0 = s.gold
    s.debug.wave(1)
    window.__qaKeep = setInterval(() => { const sc = window.__scene; if (!sc.over && sc.deadT <= 0) sc.hp = 100 }, 300)
  })
  const pennants = await page.evaluate(() => window.__scene.turrets.pads[3].turret.flags.length)
  assert(pennants === 3, `lv3 ballista flies 3 tier pennants (${pennants})`)
  let perfect = null
  for (let i = 0; i < 90 && !perfect; i++) {
    await page.waitForTimeout(300)
    perfect = await page.evaluate(() => {
      const s = window.__scene
      if (s.perfectWaves > 0) {
        return {
          n: s.perfectWaves, flare: s.citadel.flare,
          banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent).join('|'),
        }
      }
      return null
    })
  }
  assert(!!perfect, 'wave held without a scratch')
  if (perfect) {
    assert(/PERFECT WAVE/.test(perfect.banner), `PERFECT WAVE banner (${perfect.banner})`)
    assert(perfect.flare > 0.4, `beacon flare fired (${perfect.flare?.toFixed(2)})`)
    await page.screenshot({ path: 'qa/screens/siege-polish-perfect.png' })
  }
  await closeCase(ctx, errors, 'perfect wave')
}

// ---------- BREACH DRAMA: THE GATE BLEEDS + low-HP smolder ----------
console.log('--- breach drama ---')
{
  const { ctx, page, errors } = await newPage()
  await page.evaluate(() => {
    const s = window.__scene
    s.debug.wave(2)
    window.__qaKeep = setInterval(() => { const sc = window.__scene; if (!sc.over && sc.deadT <= 0) sc.hp = 100 }, 300)
  })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    for (const e of window.__scene.army.active) {
      if (!e.alive) continue
      e.aggro = false
      e.wpIdx = e.wps.length - 1
      e.minion.group.position.set(e.wps.at(-1)[0], 0, e.wps.at(-1)[1] - 1)
    }
  })
  let bleed = null
  for (let i = 0; i < 30 && !bleed; i++) {
    await page.waitForTimeout(250)
    bleed = await page.evaluate(() => {
      const s = window.__scene
      if (s.gateDamage <= 0) return null
      return {
        banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent).join('|'),
        pulse: document.querySelector('.siege-citadel').classList.contains('bleed'),
        dmg: s.gateDamage,
      }
    })
  }
  assert(!!bleed, 'raiders drew blood at the gate')
  if (bleed) {
    assert(/THE GATE BLEEDS/.test(bleed.banner), `THE GATE BLEEDS warning (${bleed.banner})`)
    assert(bleed.pulse, 'crimson pulse on the bastion bar')
  }
  // below 25%: persistent gate smolder + heartbeat on the bar
  await page.evaluate(() => { window.__scene.citadel.hp = 100 })
  await page.waitForTimeout(900)
  const low = await page.evaluate(() => ({
    smolder: window.__scene.smolder.group.visible,
    heartbeat: document.querySelector('.siege-citadel').classList.contains('heartbeat'),
  }))
  assert(low.smolder, 'ember-smoke smolders at the gate below 25%')
  assert(low.heartbeat, 'bastion bar heartbeat below 25%')
  await closeCase(ctx, errors, 'breach drama')
}

// ---------- ANNIHILATION: 5+ kills in one blast -> slow-mo + popup ----------
console.log('--- annihilation ---')
{
  const { ctx, page, errors } = await newPage(['blink', 'starfire', 'quake', 'comet'])
  await page.evaluate(() => { window.__scene.breakT = 99999 })
  // ring six grunts around the hero, then quake (nova archetype, 40 dmg)
  await page.evaluate(() => {
    const s = window.__scene
    const h = s.hero.group.position
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const e = s.army.spawn('grunt', 'west')
      e.minion.group.position.set(h.x + Math.cos(a) * 2, 0, h.z + Math.sin(a) * 2)
      e.aggro = false
      e.ox = 0; e.oz = 0
    }
  })
  await page.keyboard.press('Digit3')
  await page.waitForTimeout(120)
  const ann = await page.evaluate(() => ({
    kills: window.__scene.kills,
    slow: window.__scene.timeScale,
    popup: !!document.querySelector('.siege-annihilate'),
  }))
  assert(ann.kills >= 5, `quake erased the ring (${ann.kills} kills)`)
  assert(ann.slow < 0.5, `slow-mo engaged (timeScale=${ann.slow.toFixed(2)})`)
  assert(ann.popup, 'ANNIHILATION popup on screen')
  await page.screenshot({ path: 'qa/screens/siege-polish-annihilation.png' })
  await page.waitForTimeout(1200)
  const recovered = await page.evaluate(() => window.__scene.timeScale)
  assert(recovered > 0.95, `time recovers after 0.7s (${recovered.toFixed(2)})`)
  await closeCase(ctx, errors, 'annihilation')
}

// ---------- BOSS ENTRANCE CINEMATIC ----------
console.log('--- boss entrance ---')
{
  const { ctx, page, errors } = await newPage()
  await page.evaluate(() => {
    window.__scene.debug.wave(10)
    window.__qaKeep = setInterval(() => { const sc = window.__scene; if (!sc.over && sc.deadT <= 0) sc.hp = 100 }, 300)
  })
  await page.waitForTimeout(2300) // 0.5s break + ~1.8s into the entrance
  const cine = await page.evaluate(() => ({
    phase: window.__scene.phase,
    cineOn: document.querySelector('.siege-cine-top').classList.contains('on'),
    exposure: window.__scene.exposure,
    card: document.querySelector('.siege-bosscard .siege-title-main')?.textContent || '',
    camY: window.__scene.camera.position.y,
    frozen: window.__scene.army.active.length === 0, // escort spawn held during the entrance
  }))
  assert(cine.phase === 'bossin' && cine.cineOn, 'entrance cinematic letterboxed')
  assert(cine.exposure < 0.95, `lights dimmed (exposure=${cine.exposure.toFixed(2)})`)
  assert(/SIEGE COLOSSUS/.test(cine.card), `name slam (${cine.card})`)
  assert(cine.camY < 9, `horizon-march framing, camera low (y=${cine.camY.toFixed(1)})`)
  assert(cine.frozen, 'escort spawns held during the entrance')
  await page.screenshot({ path: 'qa/screens/siege-polish-boss.png' })
  // it ends on its own, lights restored
  await page.waitForTimeout(1600)
  const after = await page.evaluate(() => ({ phase: window.__scene.phase, exposureT: window.__scene.exposureT }))
  assert(after.phase === 'play' && after.exposureT > 1.05, `entrance ends, lights up (${after.phase})`)
  await closeCase(ctx, errors, 'boss entrance')
}

// ---------- VICTORY: dawn + battle honors ----------
console.log('--- dawn ceremony ---')
{
  const { ctx, page, errors } = await newPage()
  // fight a little so the honors have content
  await page.evaluate(() => {
    const s = window.__scene
    s.debug.gold(400)
    const pad = s.turrets.pads[4]
    s.hero.group.position.set(pad.x, 0, pad.z)
  })
  await page.waitForTimeout(300)
  await page.keyboard.press('KeyF') // real build (counts in the honors)
  await page.waitForTimeout(700)
  await page.keyboard.press('Digit2') // one art cast
  await page.waitForTimeout(300)
  await page.evaluate(() => window.__scene.debug.win())
  await page.waitForTimeout(3400)
  const win = await page.evaluate(() => ({
    dawn: window.__scene.dawnT,
    victoryBeacon: window.__scene.citadel.victory,
    rows: [...document.querySelectorAll('.siege-end .siege-stat-row')].map(r => r.textContent),
    banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent).join('|'),
  }))
  assert(win.dawn === 1, `dawn fully broken (${win.dawn})`)
  assert(win.victoryBeacon, 'beacon holds gold')
  assert(/BASTION STANDS/.test(win.banner), `THE BASTION STANDS (${win.banner})`)
  assert(win.rows.length >= 6, `battle honors: ${win.rows.length} stat rows`)
  assert(win.rows.some(r => /1 RAISED — TOP LV1/.test(r)), `ballista honors row (${win.rows.find(r => /BALLISTA/.test(r))})`)
  assert(win.rows.some(r => /FAVORITE ART/.test(r) && /×1/.test(r)), `favorite art row (${win.rows.find(r => /FAVORITE/.test(r))})`)
  await page.screenshot({ path: 'qa/screens/siege-polish-dawn.png' })
  await closeCase(ctx, errors, 'dawn ceremony')
}

await browser.close()
console.log(fails.length ? `\nSIEGE POLISH PROBE: ${fails.length} FAILURES` : '\nSIEGE POLISH PROBE: ALL PASS')
process.exit(fails.length ? 1 : 0)
