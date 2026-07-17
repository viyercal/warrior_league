// Kart polish probe: intro flyover (letterbox, plates, frozen race, auto-run,
// ANY-key skip), rival system (chevron + overtake popup), shell-on-rival
// slow-mo, wreck cam, final-lap flare, photo finish freeze, podium ceremony
// + results stats. node qa/probe-kart-polish.mjs [port]
import { chromium } from 'playwright-core'

const port = process.argv[2] || '8284'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
const errors = []
const check = (name, ok, detail = '') => {
  results.push([name, ok, detail])
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const newPage = async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`http://localhost:${port}/?scene=kart&mute=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__scene?.state === 'intro', null, { timeout: 15000 })
  return page
}

/* ---------------- 1. intro flyover, un-skipped ---------------- */
{
  const page = await newPage()
  const early = await page.evaluate(() => ({
    state: window.__scene.state,
    cine: document.querySelectorAll('.kart-cine.on').length,
    clock: window.__scene.clock,
    speed: window.__scene.player.speed,
    sCont: window.__scene.player.sCont,
  }))
  check('intro: letterboxed cinematic, race frozen',
    early.state === 'intro' && early.cine === 2 && early.clock === 0 && early.speed === 0,
    JSON.stringify(early))
  await page.waitForTimeout(1400)
  await page.screenshot({ path: 'qa/screens/kart-intro-flyover.png' })
  await page.waitForTimeout(1900) // into the grid sweep
  const plates = await page.evaluate(() => document.querySelectorAll('.kart-plate.on').length)
  check('intro: name plates pop over the grid', plates >= 3, `plates=${plates}`)
  await page.screenshot({ path: 'qa/screens/kart-intro-grid.png' })
  const t0 = Date.now()
  await page.waitForFunction(() => window.__scene?.state === 'race', null, { timeout: 12000 })
  const introBudget = (Date.now() - t0 + 3300) / 1000 // waited 3.3s before this
  const clean = await page.evaluate(() => ({
    cine: document.querySelectorAll('.kart-cine.on').length,
    plates: document.querySelectorAll('.kart-plate').length,
    sCont: window.__scene.player.sCont,
  }))
  check('intro: auto-runs to race, presentation cleaned',
    clean.cine === 0 && clean.plates === 0, JSON.stringify(clean))
  check('intro: race state stayed frozen through cinematic', clean.sCont < 0.001, `sCont=${clean.sCont.toFixed(4)}`)
  console.log(`intro+countdown wall time ≈ ${introBudget.toFixed(1)}s (intro ≤4.5s + count)`)
  await page.close()
}

/* ---------------- 2. skip + rival + money moments ---------------- */
{
  const page = await newPage()
  await page.waitForTimeout(500)
  await page.keyboard.press('x') // ANY key skips
  await page.waitForTimeout(250)
  const skipped = await page.evaluate(() => ({
    state: window.__scene.state,
    cine: document.querySelectorAll('.kart-cine.on').length,
  }))
  check('skip: any key -> countdown, letterbox off', skipped.state === 'count' && skipped.cine === 0, JSON.stringify(skipped))
  await page.waitForFunction(() => window.__scene?.state === 'race', null, { timeout: 12000 })
  // record popups as they appear
  await page.evaluate(() => {
    window.__popups = []
    const wrap = document.querySelector('.kart-popups')
    new MutationObserver(ms => {
      for (const m of ms) for (const n of m.addedNodes) window.__popups.push(n.textContent)
    }).observe(wrap, { childList: true })
  })
  await page.keyboard.down('w')
  await page.waitForTimeout(900)

  // rival = adjacent racer in standings, crimson chevron overhead + HUD plate
  const rival = await page.evaluate(() => {
    const s = window.__scene
    const r = s.drama.rival
    const gap = Math.abs(s.standings.indexOf(r) - s.standings.indexOf(s.player))
    const d = r ? s.drama.chevron.position.distanceTo(r.group.position) : 99
    return {
      name: r?.name, gap, chevOn: s.drama.chevron.visible, chevDist: d,
      hud: document.querySelector('.kart-rival.on')?.textContent || '',
    }
  })
  check('rival: adjacent in standings, chevron tracking',
    rival.gap === 1 && rival.chevOn && rival.chevDist < 3.5 && rival.hud.includes(rival.name),
    JSON.stringify(rival))
  await page.screenshot({ path: 'qa/screens/kart-rival.png' })

  // overtake the rival -> RIVAL DOWN popup
  const place = `(k, sc, sp) => {
    const s = window.__scene
    const frac = ((sc % 1) + 1) % 1
    const idx = Math.floor(frac * s.track.N) % s.track.N
    const c = s.track.pos[idx], tn = s.track.tan[idx]
    k.group.position.set(c.x, 0, c.z)
    k.heading = Math.atan2(tn.x, tn.z)
    k.idx = idx; k.lastS = idx / s.track.N; k.sCont = sc; k.progress = sc
    k.kv.set(0, 0, 0); k.speed = sp; k.spinT = 0
  }`
  await page.evaluate(pl => {
    const s = window.__scene
    const r = s.drama.rival
    eval(`window.__place = ${pl}`)
    window.__place(s.player, r.sCont - 12 / s.track.length, 26)
  }, place)
  await page.waitForTimeout(400) // rival relation registers (behind)
  await page.evaluate(() => {
    const s = window.__scene
    const r = s.drama.rival
    window.__place(s.player, r.sCont + 10 / s.track.length, 26)
  })
  await page.waitForTimeout(500)
  const pops = await page.evaluate(() => window.__popups)
  check('rival: overtake fires RIVAL DOWN popup', pops.some(t => t.includes('RIVAL DOWN')), pops.join('|'))

  // shell direct hit on the rival -> slow-mo + punch + stat
  // (park the player 24u behind first so the rival pairing is stable, then
  // fire from close behind the rival so no other kart can eat the bolt)
  const rivalHit = await page.evaluate(() => new Promise(res => {
    const s = window.__scene
    const p = s.player
    window.__place(p, s.drama.rival.sCont - 24 / s.track.length, 24)
    setTimeout(() => {
      const r = s.drama.rival
      r.spinT = 0
      const before = s.drama.stats.shellsLanded
      const rp = r.group.position
      const tn = { x: Math.sin(r.heading), z: Math.cos(r.heading) }
      s.items.fireShell({
        from: { x: rp.x - tn.x * 7, y: 0.7, z: rp.z - tn.z * 7 },
        dir: new (Object.getPrototypeOf(p.kv).constructor)(tn.x, 0, tn.z),
        owner: p, target: r, homing: true, speed: 42,
      })
      const t0 = performance.now()
      const poll = () => {
        if (s.timeScale < 0.85 || performance.now() - t0 > 3500) {
          res({ ts: +s.timeScale.toFixed(2), spun: r.spinT > 0, landed: s.drama.stats.shellsLanded - before, punch: +s.drama.punch.toFixed(2) })
        } else requestAnimationFrame(poll)
      }
      poll()
    }, 350)
  }))
  check('money moment: shell on rival = slow-mo + punch-in',
    rivalHit.ts < 0.85 && rivalHit.landed === 1 && rivalHit.punch > 0.2, JSON.stringify(rivalHit))
  await page.waitForTimeout(900)

  // wreck cam: player spun by a shell -> brief slow-mo impact frame
  const wreck = await page.evaluate(() => {
    const s = window.__scene
    const p = s.player
    p.shieldOn = false; p.ghostT = 0; p.giantT = 0; p.spinT = 0
    const pp = p.group.position
    const tn = { x: Math.sin(p.heading), z: Math.cos(p.heading) }
    s.items.fireShell({
      from: { x: pp.x - tn.x * 8, y: 0.7, z: pp.z - tn.z * 8 },
      dir: new (Object.getPrototypeOf(p.kv).constructor)(tn.x, 0, tn.z),
      owner: s.karts[1], target: p, homing: true, speed: 46,
    })
    return new Promise(res => {
      const t0 = performance.now()
      const poll = () => {
        if ((p.spinT > 0 && s.timeScale < 0.85) || performance.now() - t0 > 2500) {
          res({ ts: +s.timeScale.toFixed(2), spun: p.spinT > 0, flash: !!document.querySelector('.kart-impact.on') })
        } else requestAnimationFrame(poll)
      }
      poll()
    })
  })
  check('wreck cam: player shell-spin = slow-mo + impact flash',
    wreck.spun && wreck.ts < 0.85 && wreck.flash, JSON.stringify(wreck))
  await page.waitForTimeout(1200)

  // final lap: war-horn + torch flare target raised
  await page.evaluate(() => window.__place(window.__scene.player, 1.985, 24))
  await page.waitForTimeout(1300)
  const fl = await page.evaluate(() => ({
    flare: window.__scene.track.flareTarget,
    drums: window.__scene.drama.finalLapOn,
    lap: document.querySelector('.kart-lap')?.textContent,
  }))
  check('final lap: torches flare + drum layer armed', fl.flare > 1.3 && fl.drums && fl.lap === 'LAP 3/3', JSON.stringify(fl))

  // PHOTO FINISH: stage a rival crossing a fraction ahead
  await page.evaluate(() => {
    const s = window.__scene
    const ai = s.karts.find(k => !k.isPlayer)
    window.__place(ai, 2.994, 24)
    window.__place(s.player, 2.99, 26)
  })
  await page.waitForFunction(() => window.__scene.freezeT > 0 || window.__scene.over, null, { timeout: 8000 })
  const photo = await page.evaluate(() => ({
    freeze: window.__scene.freezeT > 0,
    banner: [...document.querySelectorAll('.banner-main')].map(b => b.textContent).join('|'),
  }))
  check('photo finish: freeze-frame + banner', photo.freeze && photo.banner.includes('PHOTO FINISH'), JSON.stringify(photo))
  await page.waitForTimeout(450) // banner entrance settles inside the 1.1s freeze
  await page.screenshot({ path: 'qa/screens/kart-photo-finish.png' })
  await page.keyboard.up('w')

  // podium ceremony + stats behind the results tablet
  await page.waitForFunction(() => !!document.querySelector('.kart-finish'), null, { timeout: 8000 })
  await page.waitForTimeout(1200)
  const pod = await page.evaluate(() => ({
    active: window.__scene.podium.active,
    onPodium: window.__scene.karts.filter(k => k.onPodium).length,
    playerUp: window.__scene.player.onPodium && window.__scene.player.group.position.y > 0.3,
    stats: [...document.querySelectorAll('.kart-stat')].map(e => e.textContent.trim()),
    rows: document.querySelectorAll('.kart-finish-row').length,
  }))
  check('podium: ceremony live, top-3 on the blocks',
    pod.active && pod.onPodium === 3 && pod.playerUp, JSON.stringify({ active: pod.active, onPodium: pod.onPodium, playerUp: pod.playerUp }))
  check('results: 6 rows + 5 stat lines (best lap/top speed/drifts/shells/art)',
    pod.rows === 6 && pod.stats.length === 5 && pod.stats.some(s => s.includes('TOP SPEED')),
    pod.stats.join(' | '))
  await page.screenshot({ path: 'qa/screens/kart-podium.png' })
  await page.close()
}

console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none')
const fails = results.filter(r => !r[1]).length
console.log(`SUMMARY: ${results.length - fails}/${results.length} passed`)
await browser.close()
process.exit(fails || errors.length ? 1 : 0)
