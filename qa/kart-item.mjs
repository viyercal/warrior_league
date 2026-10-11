import { chromium } from 'playwright-core'
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import path from 'node:path'

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Kart item retest runs only on a GitHub-hosted runner')

const dir = path.resolve('battle-artifacts/kart-item')
await mkdir(dir, { recursive: true })
const started = Date.now(), deadline = started + 360000
const report = {
  run: process.env.GITHUB_RUN_ID, sha: process.env.GITHUB_SHA,
  environment: 'GitHub-hosted Ubuntu, isolated headless Chromium, software WebGL, DPR 0.35',
  method: 'Natural pickups through real keyboard driving; ordinary locator clicks. Read-only game telemetry and trusted DOM event observations. No game-state injection.',
  attempts: [], samples: [], findings: [], screenshots: [], verifiedUses: 0, verifiedFireDraught: false,
}
const note = (severity, title, detail) => report.findings.push({ seconds: (Date.now() - started) / 1000, severity, title, detail })
const save = () => writeFile(path.join(dir, 'report.json'), JSON.stringify({ ...report, seconds: (Date.now() - started) / 1000 }, null, 2))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let browser, context, page, heartbeat, fatal
const held = new Set()
const keys = async wanted => {
  const next = new Set(wanted)
  for (const k of held) if (!next.has(k)) { await page.keyboard.up(k); held.delete(k) }
  for (const k of next) if (!held.has(k)) { await page.keyboard.down(k); held.add(k) }
}
const snapshot = () => page.evaluate(() => {
  const s = window.__scene, p = s?.player, e = window.__ipl?.engine
  const button = document.querySelector('.kart-item'), r = button?.getBoundingClientRect()
  const target = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null
  const describe = el => el ? { tag: el.tagName, className: String(el.className), text: el.textContent?.slice(0, 160) } : null
  return { state: s?.state, over: !!s?.over, paused: e?.paused, elapsed: e?.elapsedTime, clock: s?.clock, fps: e?.fps,
    frames: window.__kartItemQA?.frames, frameIntervalMs: window.__kartItemQA?.frameIntervalMs,
    item: p?.heldItem, speed: p?.speed, progress: p?.sCont, finished: p?.finished,
    position: p && { x: p.group.position.x, z: p.group.position.z },
    effect: p && { boostT: p.boostT, boostPower: p.boostPower, damage: p.damage, slickT: p.slickT,
      shells: s.items.shells.filter(x => x.owner === p).map(x => ({ speed: x.speed, homing: x.homing, alive: x.h.alive })),
      slicks: s.items.slicks.filter(x => x.owner === p).map(x => ({ radius: x.r, remaining: x.t })) },
    button: button && { disabled: button.disabled, text: button.textContent, rect: r && { x: r.x, y: r.y, width: r.width, height: r.height },
      visibility: getComputedStyle(button).visibility, display: getComputedStyle(button).display,
      pointerEvents: getComputedStyle(button).pointerEvents, hitTarget: describe(target), hitIsButton: !!target?.closest('.kart-item') },
    events: window.__kartItemQA?.events || [] }
})
const capture = async label => {
  const state = await snapshot()
  await writeFile(path.join(dir, `${label}.json`), JSON.stringify(state, null, 2))
  try {
    await page.screenshot({ path: path.join(dir, `${label}.png`), timeout: 5000 })
    report.screenshots.push({ label, available: true })
  } catch (error) { report.screenshots.push({ label, available: false, reason: error.message }) }
  await save()
  return state
}
function assessClick(item, before, after, baselineSequence) {
  const events = after.events.filter(e => e.sequence > baselineSequence)
  // The bubbling click observer runs after the game's target click handler, so
  // ephemeral bolt/boost effects can be verified before a later render removes them.
  const handled = events.find(e => e.type === 'click' && e.phase === 'bubble' && e.trusted && e.item === null)
  const entered = events.find(e => e.type === 'click' && e.phase === 'capture' && e.trusted && e.item === item)
  const previousEffect = entered?.effect || before.effect
  const effect = handled?.effect
  const matchingEffect = !!effect && (
    item === 'boost' ? effect.boostT >= 2.19 && effect.boostPower === 12
      : item === 'repair' ? effect.damage === 0 && effect.slickT === 0
        : item === 'bolt' ? effect.shells.length > previousEffect.shells.length && effect.shells.some(x => x.homing && x.speed === 40)
          : item === 'slick' ? effect.slicks.length > previousEffect.slicks.length && effect.slicks.some(x => x.radius === 2.5 && x.remaining >= 6.99)
            : false)
  return { trustedClick: !!handled, consumed: !!entered && !!handled, matchingEffect, verified: !!entered && !!handled && matchingEffect, events,
    repairWasNeeded: item === 'repair' ? before.effect.damage > 0 || before.effect.slickT > 0 : undefined }
}

try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] })
  context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  await context.tracing.start({ screenshots: false, snapshots: false })
  page = await context.newPage()
  page.setDefaultTimeout(25000)
  page.on('pageerror', error => note('error', 'Uncaught game error', error.message))
  page.on('crash', () => note('error', 'Browser page crashed'))
  page.on('console', message => { if (message.type() === 'error') note('console-error', 'Browser console error', message.text()) })
  heartbeat = setInterval(() => { console.log(`kart-item: ${Math.round((Date.now() - started) / 1000)}s, ${report.attempts.length} attempts, ${report.verifiedUses} verified`); save().catch(() => {}) }, 20000)
  await page.goto(`${process.env.BATTLE_BASE_URL || 'http://127.0.0.1:5189'}/?scene=kart&dpr=0.35`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => window.__ipl?.sm?.currentName === 'kart' && window.__scene?.player, undefined, { timeout: 90000 })
  await page.evaluate(() => {
    // Test-owned instrumentation observes input and timing; it never changes gameplay.
    const qa = window.__kartItemQA = { frames: 0, frameIntervalMs: 0, lastFrame: performance.now(), events: [], sequence: 0 }
    const tick = now => { qa.frames++; qa.frameIntervalMs = now - qa.lastFrame; qa.lastFrame = now; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    const record = (event, phase) => {
      // Consuming an item replaces the button's innerHTML. The composed event
      // path still identifies its button when the original target was removed.
      if (!event.composedPath().some(node => node?.matches?.('.kart-item'))) return
      const s = window.__scene, p = s?.player
      if (!p) return
      qa.events.push({ sequence: ++qa.sequence, type: event.type, phase, trusted: event.isTrusted,
        time: performance.now(), frame: qa.frames, clock: s.clock, item: p.heldItem,
        target: event.target.tagName, x: event.clientX, y: event.clientY,
        effect: { boostT: p.boostT, boostPower: p.boostPower, damage: p.damage, slickT: p.slickT,
          shells: s.items.shells.filter(x => x.owner === p).map(x => ({ speed: x.speed, homing: x.homing })),
          slicks: s.items.slicks.filter(x => x.owner === p).map(x => ({ radius: x.r, remaining: x.t })) } })
      if (qa.events.length > 160) qa.events.shift()
    }
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) document.addEventListener(type, e => record(e, 'capture'), true)
    document.addEventListener('click', e => record(e, 'bubble'))
  })
  await page.keyboard.press('z')
  await page.waitForFunction(() => window.__scene.state === 'race', undefined, { timeout: 60000 })
  report.initial = await snapshot()
  await save()
  let lastSample = 0
  while (Date.now() < deadline && !(report.verifiedUses >= 2 && report.verifiedFireDraught)) {
    const s = await page.evaluate(() => {
      const s = window.__scene, p = s.player, tr = s.track, pos = p.group.position
      const look = Math.max(6, Math.abs(p.speed) * .55)
      const idx = (p.idx + Math.ceil(look / tr.length * tr.N)) % tr.N
      let target = tr.pos[idx]
      // Visible supply chests may guide an ordinary steering line. Pickups still
      // require physically reaching their normal collision radius.
      const available = s.pickups.boxes.filter(b => b.cooldown === 0).map(b => ({ p: b.group.position,
        d: Math.hypot(b.group.position.x - pos.x, b.group.position.z - pos.z),
        ahead: (b.group.position.x - pos.x) * Math.sin(p.heading) + (b.group.position.z - pos.z) * Math.cos(p.heading) }))
        .filter(b => b.ahead > 1 && b.d < 22).sort((a, b) => a.d - b.d)
      if (available.length) target = available[0].p
      let angle = Math.atan2(target.x - pos.x, target.z - pos.z) - p.heading
      angle = Math.atan2(Math.sin(angle), Math.cos(angle))
      return { item: p.heldItem, speed: p.speed, angle, clock: s.clock, progress: p.sCont,
        finished: p.finished, over: !!s.over, availableNearby: available.length, fps: window.__ipl.engine.fps }
    })
    if (s.over || s.finished) { note('coverage', 'Race ended before all desired item coverage', s); break }
    if (s.item) {
      await keys([])
      const index = report.attempts.length + 1
      await capture(`attempt-${index}-before`)
      const before = await snapshot()
      const baselineSequence = before.events.at(-1)?.sequence || 0
      const attempt = { index, item: before.item, before, standard: { method: 'locator(.kart-item).click, timeout 25000ms, no force', started: (Date.now() - started) / 1000 } }
      report.attempts.push(attempt)
      await save()
      try {
        await page.locator('.kart-item').click({ timeout: 25000 })
        attempt.standard.completed = true
      } catch (error) {
        attempt.standard.completed = false
        attempt.standard.error = error.message
      }
      attempt.after = await snapshot()
      attempt.standard.assessment = assessClick(before.item, before, attempt.after, baselineSequence)
      if (attempt.standard.assessment.verified) {
        report.verifiedUses++
        if (before.item === 'boost') report.verifiedFireDraught = true
        if (!attempt.standard.completed) note('automation-warning', 'Locator reported failure after a verified trusted item click', { index, item: before.item, message: attempt.standard.error })
      } else note('failure', 'Ordinary click did not confirm consumption and matching effect', { index, item: before.item,
        message: attempt.standard.error, assessment: attempt.standard.assessment })
      await capture(`attempt-${index}-after`)
      if (!attempt.standard.completed && !attempt.standard.assessment.verified && attempt.after.item === before.item && attempt.after.button?.hitIsButton && !attempt.after.button.disabled) {
        const r = attempt.after.button.rect
        const diagnosticBaseline = attempt.after.events.at(-1)?.sequence || 0
        await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2)
        const after = await snapshot()
        attempt.coordinateDiagnostic = { method: 'ordinary mouse click at unobstructed visible button center, separate from standard locator acceptance',
          after, assessment: assessClick(before.item, attempt.after, after, diagnosticBaseline) }
        await capture(`attempt-${index}-coordinate-diagnostic`)
      }
      await save()
      if (attempt.after.item === before.item && !attempt.coordinateDiagnostic?.assessment.consumed) {
        note('coverage', 'Stopping repeated attempts on the same unconsumed item', { index, item: before.item }); break
      }
      continue
    }
    const desired = ['w']
    if (s.angle > .055) desired.push('a')
    else if (s.angle < -.055) desired.push('d')
    if (Math.abs(s.angle) > .65 && s.speed > 13) { desired.shift(); desired.push('s') }
    await keys(desired)
    if (Date.now() - lastSample > 3000) { report.samples.push({ seconds: (Date.now() - started) / 1000, ...s }); lastSample = Date.now() }
    await sleep(100)
  }
  await keys([])
  report.final = await snapshot()
  if (!report.verifiedUses) note('failure', 'No ordinary item-button use was verified', { attempts: report.attempts.length, final: report.final })
  if (report.verifiedUses < 2) note('coverage', 'Second ordinary item use remains unverified', { verifiedUses: report.verifiedUses })
  if (!report.verifiedFireDraught) note('coverage', 'Fire Draught button use remains unverified', { naturallyCollected: report.attempts.map(a => a.item) })
} catch (error) {
  fatal = error.stack
  note('error', 'Focused item retest interrupted', error.message)
} finally {
  clearInterval(heartbeat)
  await keys([]).catch(() => {})
  report.fatal = fatal
  report.passed = report.verifiedUses > 0 && !report.findings.some(f => ['failure', 'error'].includes(f.severity))
  report.completeness = report.verifiedUses >= 2 && report.verifiedFireDraught ? 'Two uses including Fire Draught verified' : 'Partial ability-specific coverage'
  await save()
  await context?.tracing.stop({ path: path.join(dir, 'trace.zip') }).catch(() => {})
  await browser?.close().catch(() => {})
  const summary = [
    '### Focused kart item click retest', '',
    `Result: ${report.passed ? 'ordinary button use verified' : 'failed or incomplete'}.`,
    `Verified ordinary locator uses: ${report.verifiedUses}. Fire Draught: ${report.verifiedFireDraught ? 'verified' : 'unverified'}.`,
    'All pickups came from real keyboard driving. Coordinate diagnostics do not count as ordinary locator-click passes.', '',
    ...report.findings.map(f => `- ${f.severity}: ${f.title}`), '',
  ].join('\n')
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
  console.log(JSON.stringify({ passed: report.passed, verifiedUses: report.verifiedUses, verifiedFireDraught: report.verifiedFireDraught,
    completeness: report.completeness, findings: report.findings, fatal: !!fatal }))
  if (!report.passed) process.exitCode = 1
}
