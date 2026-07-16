// probe-siege-flow.mjs — full mechanics + endstates:
// build/upgrade via real F, turret auto-fire + gold, shieldbearer frontal
// resist, raider citadel assault, player down/respawn, boss wave (mortars,
// slam telegraph, death -> victory), debug.win/lose flows with stat saves.
// Usage: node qa/probe-siege-flow.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '5188'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const fails = []
const assert = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + msg) }

const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 } })
  await ctx.addInitScript(() => {
    localStorage.setItem('ipl-profile-v2', JSON.stringify({
      name: 'QA', loadout: ['blink', 'starfire', 'quake', 'comet'],
      appearance: { primary: '#3fa7ff', secondary: '#232a4d', glow: '#7df9ff', head: 'visor', hair: 'spikes', trail: 'spark', cape: true },
      stats: { wins: {}, plays: {} },
    }))
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/?scene=siege&mute=1`, { waitUntil: 'load' })
  await page.waitForTimeout(2400)
  return { ctx, page, errors }
}

// ---------- BUILD / UPGRADE / TURRET COMBAT ----------
console.log('--- build & turret flow ---')
{
  const { ctx, page, errors } = await newPage()
  // walk onto a pad for real (WASD) — pad (4.6, 8.6) is right of spawn (0,7.5)
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(520)
  await page.keyboard.up('KeyD')
  const nearPad = await page.evaluate(() => {
    const s = window.__scene
    const p = s.hero.group.position
    return { x: p.x, z: p.z, prompt: document.querySelector('.siege-prompt')?.style.display !== 'none' }
  })
  assert(nearPad.prompt, `build prompt visible on pad approach (hero x=${nearPad.x.toFixed(1)})`)

  const g0 = await page.evaluate(() => window.__scene.gold)
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(800)
  let t = await page.evaluate(() => ({
    gold: window.__scene.gold,
    lvl: window.__scene.turrets.pads.map(p => p.turret?.level || 0),
  }))
  assert(t.lvl.includes(1), `turret built (levels ${t.lvl})`)
  assert(t.gold === g0 - 100, `100g spent (${g0} -> ${t.gold})`)

  // upgrade prompt + upgrades (gold cheat), F pressed for real
  await page.evaluate(() => window.__scene.debug.gold(500))
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(600)
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(600)
  t = await page.evaluate(() => ({ lvl: Math.max(...window.__scene.turrets.pads.map(p => p.turret?.level || 0)), gold: window.__scene.gold }))
  assert(t.lvl === 3, `turret upgraded to lvl 3 (${t.lvl})`)

  // turret kills raiders on its own -> gold flows in
  await page.evaluate(() => {
    const s = window.__scene
    s.debug.wave(2)
    s.hero.group.position.set(0, 0, 7.5) // step off, let the turret work
  })
  await page.waitForTimeout(12000)
  const combat = await page.evaluate(() => ({ kills: window.__scene.kills, earned: window.__scene.goldEarned }))
  assert(combat.kills > 0, `turret scored kills (${combat.kills})`)
  assert(combat.earned >= combat.kills * 8, `kill gold awarded (${combat.earned}g)`)
  assert(errors.length === 0, `zero console errors (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)
  await ctx.close()
}

// ---------- SHIELDBEARER FRONTAL RESIST ----------
console.log('--- shieldbearer resist ---')
{
  const { ctx, page, errors } = await newPage()
  await page.evaluate(() => {
    const s = window.__scene
    const e = s.army.spawn('shieldbearer', 'west')
    e.minion.group.position.set(0, 0, 2) // in front of hero, will aggro + face him
    e.aggro = true
    window.__qaSB = e
    s.hp = 1000 // survive pokes
  })
  await page.waitForTimeout(900) // let it face the hero
  await page.mouse.move(720, 300) // aim at it (up-field from hero)
  await page.mouse.down()
  await page.waitForTimeout(1300)
  await page.mouse.up()
  const sb = await page.evaluate(() => ({
    hp: window.__qaSB.hp, max: window.__qaSB.def.hp, flash: window.__qaSB.shieldFlash,
    alive: window.__qaSB.alive,
  }))
  // ~8 bolts @8dmg in 1.3s would deal 64 unshielded (kill from 48); frontal 50% keeps it alive
  assert(sb.alive && sb.hp < sb.max, `frontal fire reduced (hp ${sb.hp}/${sb.max}, still alive)`)
  assert(errors.length === 0, `zero console errors (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)
  await ctx.close()
}

// ---------- CITADEL ASSAULT + PLAYER RESPAWN ----------
console.log('--- citadel assault + respawn ---')
{
  const { ctx, page, errors } = await newPage()
  await page.evaluate(() => {
    const s = window.__scene
    s.debug.wave(4)
  })
  await page.waitForTimeout(2500)
  // teleport raiders to the gate; they should start hitting the citadel
  await page.evaluate(() => {
    for (const e of window.__scene.army.active) {
      if (!e.alive) continue
      e.wpIdx = e.wps.length - 1
      e.minion.group.position.set(e.wps.at(-1)[0], 0, e.wps.at(-1)[1] - 1.2)
    }
  })
  await page.waitForTimeout(4000)
  const cit = await page.evaluate(() => window.__scene.citadel.hp)
  assert(cit < 500, `raiders damage the citadel (${cit}/500)`)

  // player death -> respawn overlay -> back at 5s
  await page.evaluate(() => {
    const s = window.__scene
    s.hp = 1
    s.iFrames = 0
    s._damageHero(50, null)
  })
  await page.waitForTimeout(400)
  const down = await page.evaluate(() => ({
    deadT: window.__scene.deadT,
    overlay: document.querySelector('.siege-respawn')?.style.display !== 'none',
  }))
  assert(down.deadT > 3, `player downed, 5s timer (${down.deadT.toFixed(1)})`)
  assert(down.overlay, 'RESPAWNING overlay visible')
  await page.waitForTimeout(5400)
  const up = await page.evaluate(() => ({
    hp: window.__scene.hp, deadT: window.__scene.deadT,
    z: window.__scene.hero.group.position.z,
  }))
  assert(up.hp === 100 && up.deadT <= 0, `respawned at full hp (${up.hp})`)
  assert(Math.abs(up.z - 7.5) < 2, `respawned at citadel (z=${up.z.toFixed(1)})`)
  assert(errors.length === 0, `zero console errors (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)
  await ctx.close()
}

// ---------- BOSS WAVE ----------
console.log('--- boss wave ---')
{
  const { ctx, page, errors } = await newPage()
  await page.evaluate(() => {
    const s = window.__scene
    s.debug.gold(400)
    // pre-build a turret so mortars have a target
    const pad = s.turrets.pads[3]
    s.gold -= 100
    s.turrets.build(pad)
    s.debug.wave(10)
    window.__qaKeep = setInterval(() => { const sc = window.__scene; if (!sc.over && sc.deadT <= 0) sc.hp = 100 }, 300)
  })
  await page.waitForTimeout(2500)
  const b0 = await page.evaluate(() => ({
    boss: !!window.__scene.boss, bar: document.querySelector('.siege-boss')?.style.display === '',
    hp: window.__scene.boss?.hp,
  }))
  assert(b0.boss && b0.bar, `MAGMA COLOSSUS spawned with HUD bar (hp=${b0.hp})`)

  // let it march + act (mortars at the turret, maybe slams)
  await page.waitForTimeout(14000)
  const acts = await page.evaluate(() => ({
    mortarsSeen: window.__scene.mortars.length > 0 || window.__scene.turrets.pads[3].turret === null
      || window.__scene.turrets.pads[3].turret.hp < 60,
    marched: window.__scene.boss.group.position.z > -24,
    enraged: window.__scene.boss.enraged,
  }))
  assert(acts.marched, 'boss marches down the center')
  assert(acts.mortarsSeen, 'boss mortars targeted the turret')
  await page.screenshot({ path: 'qa/screens/siege-boss.png' })

  // enrage check then kill via the real damage path
  await page.evaluate(() => { window.__scene.boss.hp = 200; window.__scene._hitBoss(10) })
  await page.waitForTimeout(700)
  const en = await page.evaluate(() => window.__scene.boss.enraged)
  assert(en, 'boss enrages below 30%')
  await page.evaluate(() => window.__scene._hitBoss(9999))
  await page.waitForTimeout(3600)
  const win = await page.evaluate(() => ({
    over: window.__scene.over,
    banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
    wins: JSON.parse(localStorage.getItem('ipl-profile-v2')).stats.wins.siege,
  }))
  assert(win.over === 'won', `boss death leads to victory (${win.over})`)
  assert(win.banner.some(t => /CITADEL STANDS/i.test(t)), `CITADEL STANDS banner (${win.banner})`)
  assert(win.wins === 1, `stats.wins.siege saved (${win.wins})`)
  await page.screenshot({ path: 'qa/screens/siege-win.png' })
  assert(errors.length === 0, `zero console errors (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)
  await ctx.close()
}

// ---------- WIN (debug) : auto-return ----------
console.log('--- WIN flow ---')
{
  const { ctx, page, errors } = await newPage()
  await page.evaluate(() => window.__scene.debug.win())
  await page.waitForTimeout(700)
  const win = await page.evaluate(() => ({
    over: window.__scene.over,
    banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
    wins: JSON.parse(localStorage.getItem('ipl-profile-v2')).stats.wins.siege,
    buttons: [...document.querySelectorAll('.siege-end button')].map(b => b.textContent),
  }))
  assert(win.over === 'won', 'debug.win sets won state')
  assert(win.banner.some(t => /CITADEL STANDS/i.test(t)), `CITADEL STANDS banner (${win.banner})`)
  assert(win.wins === 1, `stats.wins.siege saved (${win.wins})`)
  assert(win.buttons.some(b => /HUB/i.test(b)), `RETURN TO HUB button (${win.buttons})`)
  await page.waitForTimeout(8300)
  const scene = await page.evaluate(() => window.__ipl.sm.currentName)
  assert(scene === 'hub', `auto-returned to hub (${scene})`)
  assert(errors.length === 0, `zero console errors (win) (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)
  await ctx.close()
}

// ---------- LOSE -> RETRY -> LOSE -> HUB ----------
console.log('--- LOSE flow ---')
{
  const { ctx, page, errors } = await newPage()
  await page.evaluate(() => window.__scene.debug.lose())
  await page.waitForTimeout(900)
  const lose = await page.evaluate(() => ({
    over: window.__scene.over, cit: window.__scene.citadel.hp,
    banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent),
    sub: [...document.querySelectorAll('.banner-sub')].map(b => b.textContent),
    buttons: [...document.querySelectorAll('.siege-end button')].map(b => b.textContent),
  }))
  assert(lose.over === 'fallen', 'debug.lose sets fallen state')
  assert(lose.cit === 0, `citadel hp zeroed (${lose.cit})`)
  assert(lose.banner.some(t => /CITADEL FALLEN/i.test(t)), `CITADEL FALLEN banner (${lose.banner})`)
  assert(lose.sub.some(t => /WAVE \d+ — SCORE \d+/.test(t)), `wave+score subline (${lose.sub})`)
  assert(lose.buttons.includes('RETRY') && lose.buttons.includes('HUB'), `RETRY + HUB buttons (${lose.buttons})`)
  await page.waitForTimeout(1600)
  await page.screenshot({ path: 'qa/screens/siege-lose.png' })

  await page.click('.siege-end button:has-text("RETRY")')
  await page.waitForTimeout(1800)
  const retried = await page.evaluate(() => ({
    scene: window.__ipl.sm.currentName, over: window.__scene.over,
    cit: window.__scene.citadel.hp, gold: window.__scene.gold,
  }))
  assert(retried.scene === 'siege' && !retried.over && retried.cit === 500 && retried.gold === 120,
    `RETRY re-initialized siege (cit=${retried.cit}, gold=${retried.gold})`)

  await page.evaluate(() => window.__scene.debug.lose())
  await page.waitForTimeout(600)
  await page.click('.siege-end button:has-text("HUB")')
  await page.waitForTimeout(1800)
  const scene = await page.evaluate(() => window.__ipl.sm.currentName)
  assert(scene === 'hub', `HUB button returned to hub (${scene})`)
  assert(errors.length === 0, `zero console errors (lose) (${errors.length ? JSON.stringify(errors.slice(0, 4)) : 'ok'})`)
  await ctx.close()
}

await browser.close()
console.log(fails.length ? `\nSIEGE FLOW PROBE: ${fails.length} FAILURES` : '\nSIEGE FLOW PROBE: ALL PASS')
process.exit(fails.length ? 1 : 0)
