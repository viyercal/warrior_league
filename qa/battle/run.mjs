import { chromium } from 'playwright-core'
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import path from 'node:path'

// Never launch a browser on the user's workstation for these sessions.
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Battle sessions require a GitHub-hosted runner')
const group = process.argv[2]
if (!['field', 'fighters', 'sports'].includes(group)) throw new Error('Unknown battle group')
const dir = path.resolve('battle-artifacts', group)
await mkdir(dir, { recursive: true })
const started = Date.now(), events = [], checks = [], findings = []
let sequence = 0, browser, context, page, fatal
const record = (type, detail) => {
  const event = { seconds: +((Date.now() - started) / 1000).toFixed(2), type, ...detail }
  events.push(event)
  return event
}
const note = (severity, title, detail) => findings.push(record('finding', { severity, title, detail }))
const check = (name, condition, detail) => checks.push(record('check', { name, passed: !!condition, detail }))
const persist = () => writeFile(path.join(dir, 'report.json'), JSON.stringify({
  group, sha: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID,
  environment: 'GitHub-hosted Ubuntu, isolated headless Chromium, software WebGL',
  method: 'Adaptive scripted real browser inputs with read-only game telemetry; no runtime state injection',
  seconds: (Date.now() - started) / 1000, fatal, checks, findings, events,
}, null, 2))
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] })
  context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  await context.tracing.start({ screenshots: true, snapshots: true })
  page = await context.newPage()
  page.setDefaultTimeout(8000)
  page.setDefaultNavigationTimeout(90000)
  page.on('pageerror', error => note('error', 'Uncaught page error', error.message))
  page.on('crash', () => note('blocker', 'Browser page crashed'))
  page.on('console', message => {
    if (message.type() === 'error') record('console-error', { text: message.text() })
  })
  page.on('requestfailed', request => record('request-failed', { url: request.url(), error: request.failure()?.errorText }))
  const observe = () => page.evaluate(() => {
    const s = window.__scene, e = window.__ipl?.engine
    const p = s?.player?.pos || s?.hero?.group?.position || s?.game?.player?.hero?.group?.position
    return { mode: window.__ipl?.sm?.currentName, phase: s?.phase ?? s?.game?.phase,
      elapsed: e?.elapsedTime, fps: e?.fps, paused: e?.paused, hp: s?.hp ?? s?.player?.hp,
      over: s?.over, wave: s?.wave, stage: s?.stage, gold: s?.gold,
      position: p && { x: p.x, y: p.y, z: p.z },
      text: document.body.innerText.slice(0, 12000), url: location.href }
  })
  const capture = async label => {
    const stem = `${String(++sequence).padStart(3, '0')}-${label.replace(/[^a-z0-9-]/gi, '-').slice(0, 90)}`
    const state = await observe()
    await writeFile(path.join(dir, `${stem}.json`), JSON.stringify(state, null, 2))
    await page.screenshot({ path: path.join(dir, `${stem}.png`), timeout: 20000 })
    record('capture', { label, file: `${stem}.png`, state })
    await persist()
    return state
  }
  const open = async mode => {
    await page.goto(`http://127.0.0.1:5189/?scene=${mode}&dpr=1`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(name => window.__ipl?.sm?.currentName === name && !!window.__scene, mode.split('&')[0], { timeout: 90000 })
    record('open', { mode })
  }
  const act = async (label, fn) => {
    record('input-start', { label })
    try { const result = await fn(); record('input-end', { label }); return result }
    catch (error) { record('input-error', { label, message: error.message }); throw error }
  }
  const play = (await import(`./${group}.mjs`)).default
  const heartbeat = setInterval(() => { console.log(`${group}: ${Math.round((Date.now()-started)/1000)}s, ${events.length} events`); persist().catch(() => {}) }, 30000)
  let deadline
  try {
    await Promise.race([
      play({ page, open, act, capture, note, observe, check, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)) }),
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Session exceeded 10 minute bound')), 600000) }),
    ])
  } finally { clearInterval(heartbeat); clearTimeout(deadline) }
  await capture('final')
} catch (error) {
  fatal = error.stack
  note('blocker', 'Battle harness stopped', error.message)
  process.exitCode = 1
} finally {
  if (checks.some(x => !x.passed) || findings.some(x => ['error', 'blocker'].includes(x.severity))) process.exitCode = 1
  await persist()
  await context?.tracing.stop({ path: path.join(dir, 'trace.zip') }).catch(() => {})
  await browser?.close().catch(() => {})
  await appendFile(path.join(dir, 'events.jsonl'), events.map(x => JSON.stringify(x)).join('\n') + '\n')
  console.log(JSON.stringify({ group, checks: checks.length, failed: checks.filter(x => !x.passed).length, findings: findings.length, fatal: !!fatal }))
}
