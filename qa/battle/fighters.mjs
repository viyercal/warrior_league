// Remote-only battle session. All game actions use browser input; evaluations
// below read state to observe the match and steer an ordinary player.
export default async function fighters(ctx) {
  const { page, open, act, capture, note, sleep, check } = ctx
  const read = () => page.evaluate(() => {
    const s = window.__scene, e = window.__ipl?.engine
    const fighter = f => f ? {
      name: f.name, x: f.pos?.x, y: f.pos?.y, hp: f.hp, damage: f.dmg,
      stocks: f.stocks, state: f.state, grounded: f.grounded,
    } : null
    return {
      scene: s?.constructor?.name, phase: s?.phase, mode: s?.mode,
      over: s?.over, stage: s?.stage, round: s?.round, roundT: s?.roundT,
      elapsed: e?.elapsedTime, paused: e?.paused, fps: e?.fps,
      player: fighter(s?.player), foe: fighter(s?.foe),
      others: (s?.baseFighters || []).filter(f => f !== s?.player).map(fighter),
      cds: s?.cds ? [...s.cds] : [], casts: s?.bossArts?.casts,
      warnings: (s?.bossArts?.pending || []).map(a => ({ type: a.type, t: a.t, delay: a.delay, fired: a.fired })),
      hintOpen: !!s?.hud?.hintPanel && !s.hud.hintPanel.hidden,
      text: document.querySelector('#ui')?.innerText?.slice(-1800),
    }
  })
  const press = key => page.keyboard.press(key, { delay: 75 })
  const hold = async (key, ms) => {
    await page.keyboard.down(key)
    try { await sleep(ms) } finally { await page.keyboard.up(key) }
  }
  const waitFight = async label => {
    const until = Date.now() + 45000
    while (Date.now() < until) {
      const s = await read()
      if (s.phase === 'fight') return s
      if (s.over) return s
      if (['cine', 'bossin', 'intro'].includes(s.phase)) await press('z')
      await sleep(750)
    }
    await capture(`${label}-start-timeout`)
    note('blocker', `${label}: fight did not start`, await read())
    return null
  }
  const menuAndHelp = async label => {
    await act(`${label}: open controls`, async () => {
      await page.locator('.battle-help-toggle').click({ timeout: 5000 })
      check(`${label}: help visibly opens`, (await read()).hintOpen)
      await capture(`${label}-controls`)
      await page.locator('.battle-help-toggle').click({ timeout: 5000 })
      check(`${label}: help closes`, !(await read()).hintOpen)
    })
    await act(`${label}: pause and return with keyboard control`, async () => {
      await press('Escape')
      await page.locator('.session-overlay:not([hidden])').waitFor({ state: 'visible', timeout: 5000 })
      const before = await read()
      await sleep(1100)
      const after = await read()
      check(`${label}: pause freezes simulation`, Math.abs(after.elapsed - before.elapsed) < 0.06, { before, after })
      await capture(`${label}-pause`)
      await page.locator('[data-action="resume"]').click({ timeout: 5000 })
      await sleep(1100)
      check(`${label}: resume advances simulation`, (await read()).elapsed > after.elapsed, await read())
    })
  }
  for (const mode of ['duel&mode=tower', 'duel&mode=single', 'brawl']) {
    const label = mode === 'brawl' ? 'brawl' : mode.includes('single') ? 'single-duel' : 'tower'
    try {
      await act(`${label}: enter realm`, () => open(mode))
      await capture(`${label}-entrance`)
      const start = await waitFight(label)
      if (!start) continue
      await menuAndHelp(label)
      await capture(`${label}-battle-start`)
      if (mode !== 'brawl') {
        await act(`${label}: right-click lane walking`, async () => {
          const before = await read()
          const point = await page.evaluate(() => {
            const s = window.__scene, v = s.player.pos.clone()
            v.x -= 2; v.y += 1
            v.project(s.camera)
            return { x: (v.x + 1) * innerWidth / 2, y: (1 - v.y) * innerHeight / 2 }
          })
          await page.mouse.click(point.x, point.y, { button: 'right' })
          await sleep(1800)
          const after = await read()
          check(`${label}: right-click produces walking`, Math.abs(after.player.x - before.player.x) > 0.25, { before, after })
          await capture(`${label}-mouse-walking`)
        })
      }
      const observations = [start]
      let iteration = 0, retried = false, warningCaptured = false, resultCaptured = false
      const until = Date.now() + 70000
      while (Date.now() < until) {
        const s = await read()
        observations.push(s)
        if (!s.player) break
        const terminal = s.over || ['champion', 'defeated'].includes(s.phase)
        if (terminal) {
          if (!resultCaptured) { await capture(`${label}-natural-result`); resultCaptured = true }
          const retry = page.getByRole('button', { name: label === 'single-duel' ? 'REMATCH' : 'RETRY THIS FOE', exact: true })
          if (mode !== 'brawl' && !retried && await retry.isVisible()) {
            await act(`${label}: retry natural result`, () => retry.click())
            retried = true
            await waitFight(`${label}-retry`)
          } else {
            const hub = page.getByRole('button', { name: /^(RETURN TO HUB|CHOOSE BATTLEGROUND|ABANDON TOWER)$/ })
            if (await hub.count() === 1 && await hub.isVisible()) {
              await act(`${label}: leave natural result`, () => hub.click())
              await sleep(2000)
              await capture(`${label}-result-return`)
              break
            }
            await sleep(1000)
          }
          continue
        }
        if (s.phase !== 'fight') {
          if (s.phase === 'oblitPrompt') await press('j')
          else if (['cine', 'bossin', 'intro'].includes(s.phase)) await press('z')
          await sleep(750)
          continue
        }
        if (!warningCaptured && s.warnings.length) {
          await capture(`${label}-boss-warning`)
          warningCaptured = true
        }
        const enemy = s.foe || s.others.filter(f => f.state !== 'out' && f.state !== 'dead')
          .sort((a, b) => Math.abs(a.x - s.player.x) - Math.abs(b.x - s.player.x))[0]
        if (!enemy) { await sleep(750); continue }
        const dx = enemy.x - s.player.x
        // Recover toward the platform center if airborne near its edge.
        const direction = mode === 'brawl' && Math.abs(s.player.x) > 11 ? (s.player.x > 0 ? 'a' : 'd') : (dx > 0 ? 'd' : 'a')
        await act(`${label}: combat sequence ${iteration}`, async () => {
          if (Math.abs(dx) > 1.6 || (mode === 'brawl' && Math.abs(s.player.x) > 11)) await hold(direction, 550)
          if (s.warnings.length || iteration % 5 === 0 || (mode === 'brawl' && enemy.y > s.player.y + 1)) await press('Space')
          if (iteration % 6 === 1 && mode !== 'brawl') await hold('Shift', 500)
          else if (iteration % 6 === 2 && mode !== 'brawl') { await hold('s', 180); await press('f') }
          else { await press('j'); await sleep(160); await press('j'); await sleep(160); await press('k') }
          if (iteration % 3 === 0) await press(['q', 'w', 'e', 'r'][Math.floor(iteration / 3) % 4])
          await sleep(330)
        })
        iteration++
        if (iteration === 10 || iteration === 25) await capture(`${label}-combat-${iteration}`)
      }
      await capture(`${label}-session-end`)
      const end = await read()
      const frames = observations.filter(s => s.player)
      const numeric = frames.every(s => Number.isFinite(s.player.x) && Number.isFinite(s.player.y))
      check(`${label}: finite player position during combat`, numeric)
      check(`${label}: simulation advances during battle`, observations.some(s => s.elapsed > start.elapsed + 5), { start: start.elapsed, end: end.elapsed })
      const combatChanged = frames.some(s => mode === 'brawl'
        ? s.player.damage > 0 || s.others.some(f => f.damage > 0) || s.player.stocks < 3
        : s.player.hp < 100 || s.foe?.hp < 100)
      check(`${label}: hits or stock changes observed`, combatChanged)
      note('info', `${label}: remote battle observations`, {
        steps: iteration, naturallyReachedResult: resultCaptured, retried,
        warningCaptured, first: start, last: end,
        stagesSeen: [...new Set(observations.map(s => s.stage).filter(x => x !== undefined))],
        maxBossCasts: Math.max(0, ...observations.map(s => s.casts || 0)),
        sampleTimeline: observations.filter((_, i) => i % 5 === 0),
        limitation: 'Only naturally reached encounters and results are covered; no state injection or difficulty calibration.',
      })
    } catch (error) {
      note('error', `${label}: battle session interrupted`, { message: error.message, state: await read().catch(() => null) })
      await capture(`${label}-interrupted`).catch(() => {})
    } finally {
      for (const key of ['a', 'd', 's', 'Shift', 'Space']) await page.keyboard.up(key).catch(() => {})
    }
  }
}
