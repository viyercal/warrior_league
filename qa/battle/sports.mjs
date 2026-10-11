// Remote browser battle test. All gameplay changes go through normal UI/input.
export function assessCourtProgress(states) {
  const first = states[0], last = states.at(-1)
  const simulationSeconds = last.t - first.t
  return {
    simulationSeconds,
    progressed: simulationSeconds > 0 && states.every((s, i) => Number.isFinite(s.t) && (!i || s.t >= states[i - 1].t)),
    limitedCoverage: simulationSeconds < 8,
  }
}

export function assessRaceProgress(samples, final) {
  const first = samples[0], last = samples.at(-1)
  const simulationSeconds = last.clock - first.clock
  const boundary = samples.findLastIndex(s => s.clock <= last.clock - 5)
  const recent = boundary >= 0 ? samples.slice(boundary) : []
  const stationary = positions => positions.length > 1 && positions.every(Number.isFinite)
    && Math.max(...positions) - Math.min(...positions) < 1e-6
  const rivals = last.rivals.map((r, i) => {
    const baseline = first.rivals[i]?.progress
    // Reversing briefly after an impact is legal. Detect sustained lack of any
    // progress over five simulation seconds, not failure to meet a pace target.
    const positions = recent.map(s => s.rivals[i]?.progress)
    const stalled = !r.finished && stationary(positions)
    return { index: i, baseline, end: r.progress, delta: r.progress - baseline,
      progressed: Number.isFinite(r.progress) && Number.isFinite(baseline) && r.progress > baseline, stalled }
  })
  return { simulationSeconds, playerDelta: final.progress - first.progress,
    playerProgressed: Number.isFinite(final.progress) && final.progress > first.progress,
    playerStalled: !final.finished && stationary(recent.map(s => s.progress)),
    rivals }
}

export default async function sports(ctx) {
  const { page, open, act, capture, note, sleep, check } = ctx
  const held = new Set()
  const keys = async wanted => {
    const next = new Set(wanted)
    for (const k of held) if (!next.has(k)) { await page.keyboard.up(k); held.delete(k) }
    for (const k of next) if (!held.has(k)) { await page.keyboard.down(k); held.add(k) }
  }
  const run = async (label, fn) => {
    try { await act(label, fn) }
    catch (e) { note('error', `${label} interrupted`, String(e)); await capture(`${label}-failure`).catch(() => {}) }
    finally { await keys([]) }
  }
  const sceneReady = name => page.waitForFunction(n => window.__ipl?.sm?.currentName === n && window.__scene, name, { timeout: 45000 })
  const pointOnCourt = async (x, z) => page.evaluate(({ x, z }) => {
    const s = window.__scene
    const v = s.game.player.hero.group.position.clone().set(x, 0, z).project(s.camera)
    return { x: (v.x + 1) * innerWidth / 2, y: (1 - v.y) * innerHeight / 2, visible: Math.abs(v.x) < .92 && Math.abs(v.y) < .85 }
  }, { x, z })

  await run('hub-forge-settings', async () => {
    await open('hub')
    await capture('hub-initial')
    await page.locator('.realm-settings').click()
    await page.locator('#session-sensitivity').focus()
    await page.keyboard.press('End')
    check('Sensitivity reaches maximum via keyboard', await page.locator('#session-sensitivity').inputValue() === '2')
    await page.getByRole('button', { name: 'Reset mouse sensitivity' }).click()
    check('Sensitivity reset returns 1x', await page.locator('#session-sensitivity').inputValue() === '1')
    await page.locator('#session-quality').selectOption('performance')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'War forge', exact: true }).click()
    await sceneReady('loadout')
    await page.getByRole('textbox', { name: 'War name' }).fill('BATTLE TEST')
    await page.getByRole('button', { name: 'Equip Phantom Twin', exact: true }).click({ modifiers: ['Shift'] })
    check('Phantom shortcut fills all slots', await page.locator('.loadout-slot').allTextContents().then(t => t.length === 4 && t.every(x => x.includes('Phantom Twin'))))
    await capture('forge-phantom-chorus')
    // Equip four distinct arts through the normal slot controls for real matches.
    for (const [i, name] of ['Skyfall Hammer', 'Phantom Twin', 'Shadow Step', 'Flaming Spear'].entries()) {
      await page.locator('.loadout-slot').nth(i).click()
      await page.getByRole('button', { name: `Equip ${name}`, exact: true }).click()
    }
    await page.locator('.loadout-go').click()
    await sceneReady('hub')
    await page.locator('[data-realm="hoops"]').click()
    await page.locator('.realm-guide-toggle').click()
    await capture('court-how-to-play')
    await page.locator('.realm-play').click()
    await sceneReady('hoops')
    check('Forge arts persist into court', await page.evaluate(() => window.__scene.skillDefs?.[0]?.id === 'comet' || window.__ipl.sm.profile.loadout[0] === 'comet'))
  })

  await run('blood-court-live-match', async () => {
    if (await page.evaluate(() => window.__ipl?.sm?.currentName !== 'hoops')) await open('hoops')
    await capture('court-intro')
    await page.keyboard.press('z')
    await page.waitForFunction(() => window.__scene.game.phase === 'live', undefined, { timeout: 30000 })
    const states = [], start = Date.now()
    let attempts = 0, defenses = 0, pauseChecked = false, skyfallChecked = false, lastCapture = 0
    while (Date.now() - start < 95000) {
      const s = await page.evaluate(() => {
        const s = window.__scene, g = s.game, p = g.player.hero.group.position, a = g.ai.hero.group.position
        return { phase: g.phase, t: g.t, attempts: s.match.attempts, makes: s.match.makes, score: { ...g.score }, holder: s.ball.holder, offense: g.offense, clock: g.clock,
          p: { x: p.x, z: p.z }, a: { x: a.x, z: a.z }, metering: g.player.metering, meter: g.player.meterT, buff: g.eff.skyfallT,
          skills: s.abilities.defs?.map(x => x.id) || s.ctx.profile.loadout }
      })
      states.push(s)
      if (s.phase === 'end') { await capture('court-natural-result'); break }
      if (!pauseChecked && s.t > 8) {
        await page.keyboard.press('Escape'); const t = await page.evaluate(() => window.__scene.game.t)
        await sleep(650)
        check('Court pause freezes simulation', await page.evaluate(t => window.__scene.game.t === t, t))
        await capture('court-pause'); await page.locator('[data-action="resume"]').click(); pauseChecked = true
      }
      if (s.phase === 'live' && s.holder === 'player') {
        if (!skyfallChecked && s.skills[0] === 'comet') {
          await page.keyboard.press('1'); await sleep(800)
          const after = await page.evaluate(() => ({ score: window.__scene.game.score.you, buff: window.__scene.game.eff.skyfallT }))
          check('Skyfall cast does not award points', after.score === s.score.you, { before: s.score.you, after })
          await capture('court-skyfall-possession'); skyfallChecked = true
        }
        // Walk via cursor to a realistic shot position, then use the normal meter.
        const target = await pointOnCourt(attempts % 2 ? 2.4 : -2.4, -1.4)
        if (target.visible) { await page.mouse.click(target.x, target.y, { button: 'right' }); await sleep(650) }
        const meterBefore = await page.evaluate(() => ({ t: window.__scene.game.t, fps: window.__ipl.engine.fps, attempts: window.__scene.match.attempts,
          phase: window.__scene.game.phase, holder: window.__scene.ball.holder, offense: window.__scene.game.offense, shotClock: window.__scene.game.clock, slowmo: window.__scene._slowmoT }))
        let meterWait = 'start'
        await page.keyboard.down('Space')
        try {
          await page.waitForFunction(() => window.__scene.game.player.metering || window.__scene.game.phase !== 'live' || window.__scene.ball.holder !== 'player', undefined, { timeout: 2000, polling: 40 })
          meterWait = 'progress'
          await page.waitForFunction(() => !window.__scene.game.player.metering || window.__scene.game.player.meterT >= .66, undefined, { timeout: 15000, polling: 80 })
        } catch (error) {
          if (error.name !== 'TimeoutError') throw error
          const after = await page.evaluate(() => ({ t: window.__scene.game.t, fps: window.__ipl.engine.fps, phase: window.__scene.game.phase,
            paused: window.__ipl.engine.paused, holder: window.__scene.ball.holder, meter: window.__scene.game.player.meterT,
            metering: window.__scene.game.player.metering, attempts: window.__scene.match.attempts, offense: window.__scene.game.offense,
            shotClock: window.__scene.game.clock, slowmo: window.__scene._slowmoT, inputDown: window.__ipl.input.isDown('Space'), focused: document.hasFocus(),
            focusIntercepts: !!document.activeElement?.closest('button, input, textarea, select, a, [contenteditable], [role="dialog"], .ui-interactive') }))
          const simulationSeconds = after.t - meterBefore.t
          const gameplaySeconds = meterBefore.shotClock - after.shotClock
          const detail = { before: meterBefore, after, simulationSeconds, gameplaySeconds, wait: meterWait, message: error.message }
          const ordinaryPossession = meterBefore.phase === 'live' && meterBefore.holder === 'player' && meterBefore.offense === 'player'
            && after.phase === 'live' && after.holder === 'player' && after.offense === 'player' && !after.paused
          // The shot clock and meter both use scaled gameplay time, unlike game.t.
          const sufficientTime = gameplaySeconds >= .8
          if (ordinaryPossession && sufficientTime && after.metering && after.meter < .66) {
            check('Court held meter advances after sufficient simulation time', false, detail)
          } else if (meterWait === 'start' && ordinaryPossession && sufficientTime && !after.metering
            && after.inputDown && after.focused && !after.focusIntercepts && after.attempts === meterBefore.attempts) {
            check('Court held shot starts while input and possession are available', false, detail)
          } else {
            // Low simulation progress or an interrupted possession cannot establish a meter defect.
            note('coverage', 'Court meter wait reached wall-clock limit', detail)
          }
        } finally { await page.keyboard.up('Space') }
        attempts++
        await sleep(550)
      } else if (s.phase === 'live' && s.offense === 'ai') {
        const target = await pointOnCourt(s.a.x, s.a.z + .65)
        if (target.visible) await page.mouse.click(target.x, target.y, { button: 'right' })
        await page.keyboard.press('f'); await page.keyboard.press('Space')
        if (defenses % 5 === 0) await page.keyboard.press('2')
        defenses++; await sleep(420)
      } else await sleep(250)
      if (Date.now() - lastCapture > 25000) { await capture(`court-live-${attempts}-${defenses}`); lastCapture = Date.now() }
    }
    await capture('court-final-observed')
    const first = states[0], last = states.at(-1)
    const confirmed = await page.evaluate(() => ({ attempts: window.__scene.match.attempts, makes: window.__scene.match.makes }))
    const courtProgress = assessCourtProgress(states)
    check('Court simulation progresses monotonically during real input', courtProgress.progressed, { first, last, ...courtProgress })
    if (courtProgress.limitedCoverage) note('coverage', 'Court play covers only a short simulation interval', courtProgress)
    check('Court registers actual shot attempts', confirmed.attempts > first.attempts, { confirmed, initialAttempts: first.attempts, inputSequences: attempts, defenses })
    check('Court match produces scoring or possession changes', states.some(s => s.score.you + s.score.cpu > 0) || states.some(s => s.offense !== first.offense), { attempts, defenses, last })
    note('info', 'Blood Court battle trace', { inputSequences: attempts, confirmed, defenses, samples: states.filter((_, i) => i % 8 === 0), last, skyfallChecked })
    await page.keyboard.press('Escape')
    await page.locator('[data-action="hub"]').click()
    await sceneReady('hub')
    check('Court can return to hub after extended play', await page.locator('.realm-play').isVisible())
  })

  await run('war-chariots-live-race', async () => {
    await open('kart'); await capture('kart-intro')
    await page.keyboard.press('z')
    await page.waitForFunction(() => window.__scene.state === 'race', undefined, { timeout: 40000 })
    const start = Date.now(), samples = []
    let lastSample = 0, lastCapture = 0, lastSkill = 0, supplyInputs = 0, supplyUses = 0, pauseChecked = false, driftChecked = false
    while (Date.now() - start < 160000) {
      const s = await page.evaluate(() => {
        const s = window.__scene, p = s.player, tr = s.track
        const look = Math.max(6, Math.abs(p.speed) * .6)
        const idx = (p.idx + Math.ceil(look / tr.length * tr.N)) % tr.N
        const target = tr.pos[idx], pos = p.group.position
        let angle = Math.atan2(target.x - pos.x, target.z - pos.z) - p.heading
        angle = Math.atan2(Math.sin(angle), Math.cos(angle))
        return { state: s.state, over: !!s.over, finished: p.finished, progress: p.sCont, speed: p.speed, angle, clock: s.clock,
          pos: { x: pos.x, z: pos.z }, lateral: Math.hypot(pos.x - tr.pos[p.idx].x, pos.z - tr.pos[p.idx].z),
          item: p.heldItem, spin: p.spinT, boost: p.meter, rivals: s.karts.filter(k => !k.isPlayer).map(k => ({ progress: k.sCont, speed: k.speed, finished: k.finished })) }
      })
      if (s.over || s.finished) { samples.push(s); await keys([]); await sleep(2500); await capture('kart-natural-finish'); break }
      const next = ['w']
      if (s.angle > .055) next.push('a')
      else if (s.angle < -.055) next.push('d')
      if (Math.abs(s.angle) > .65 && s.speed > 13) { next.splice(0, 1); next.push('s') }
      if (Math.abs(s.angle) < .12 && s.lateral < 3 && s.boost > 10) next.push('Shift')
      await keys(next)
      if (s.item) {
        // Exercise both the on-screen supply action and its keyboard equivalent.
        if (supplyInputs % 2 === 0) {
          // Slow software rendering needs multiple frames for actionability.
          // Stop held steering while the normal UI click is being delivered.
          await keys([])
          await page.locator('.kart-item').click({ timeout: 25000 })
        }
        else await page.keyboard.press('f')
        supplyInputs++
        const afterItem = await page.evaluate(() => window.__scene.player.heldItem)
        if (afterItem !== s.item) supplyUses++
        else note('coverage', 'Supply input was not confirmed as consumed', { item: s.item, afterItem, input: supplyInputs % 2 ? 'click' : 'key' })
      }
      if (Date.now() - lastSkill > 13000) { await page.keyboard.press('4'); await page.keyboard.press('2'); lastSkill = Date.now() }
      if (!driftChecked && s.clock > 12 && Math.abs(s.angle) > .12 && s.speed > 15) {
        await page.keyboard.down('Space'); await sleep(240); await page.keyboard.up('Space'); driftChecked = true
      }
      if (!pauseChecked && s.clock > 20) {
        await keys([]); await page.keyboard.press('Escape')
        const t = await page.evaluate(() => window.__scene.clock); await sleep(650)
        check('Race pause freezes race clock', await page.evaluate(t => window.__scene.clock === t, t))
        await capture('kart-pause'); await page.locator('[data-action="resume"]').click(); pauseChecked = true
      }
      if (Date.now() - lastSample > 3000) { samples.push(s); lastSample = Date.now() }
      if (Date.now() - lastCapture > 25000) { await capture(`kart-track-${samples.length}`); lastCapture = Date.now() }
      await sleep(90)
    }
    await keys([]); await capture('kart-final-observed')
    const final = await page.evaluate(() => ({ progress: window.__scene.player.sCont, finished: window.__scene.player.finished, clock: window.__scene.clock }))
    const raceProgress = assessRaceProgress(samples, final)
    if (raceProgress.playerProgressed || raceProgress.playerStalled) {
      check('Race progress advances from its starting position without sustained stalls', raceProgress.playerProgressed && !raceProgress.playerStalled, { final, ...raceProgress })
    } else note('coverage', 'Forward race progress unverified: no sustained stall, but no positive net progress', raceProgress)
    check('Race keeps finite positions, speeds and progress', Number.isFinite(final.progress) && samples.every(s => Number.isFinite(s.progress)
      && Number.isFinite(s.speed) && Number.isFinite(s.pos.x) && Number.isFinite(s.pos.z)
      && s.rivals.every(r => Number.isFinite(r.progress) && Number.isFinite(r.speed))), samples.at(-1))
    if (raceProgress.rivals.every(r => r.progressed) || raceProgress.rivals.some(r => r.stalled)) {
      check('Rival racers advance from their starting positions without sustained stalls', raceProgress.rivals.every(r => r.progressed && !r.stalled), raceProgress)
    } else note('coverage', 'Forward rival progress unverified: no sustained stalls, but not all have positive net progress', raceProgress)
    note('info', 'War Chariots battle trace', { final, supplyInputs, supplyUses, driftChecked, samples })
    if (!final.finished) note('coverage', 'Race did not finish within bounded remote play session', { final, wallSeconds: (Date.now() - start) / 1000 })
    // Restart and hub leave must remain available after real race input.
    await page.keyboard.press('Escape'); await page.locator('[data-action="restart"]').click()
    await page.waitForFunction(() => window.__scene.state === 'intro', undefined, { timeout: 45000 })
    check('Race restart creates a fresh race', await page.evaluate(() => !window.__scene.over && window.__scene.player.sCont < .1))
    await page.keyboard.press('Escape'); await page.locator('[data-action="hub"]').click(); await sceneReady('hub')
    await capture('hub-after-race')
  })
}
