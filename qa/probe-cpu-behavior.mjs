import { chromium } from 'playwright-core'
import { writeFile } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const checks = []
const check = (name, ok, details) => { checks.push({ name, ok: !!ok, details }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(details ?? '')}`) }
try {
  await page.goto(`${process.env.CPU_URL || 'http://127.0.0.1:5302'}/qa/cpu-lab.html`)
  await page.waitForFunction(() => window.cpuLab)
  const result = await page.evaluate(() => {
    const { SingleDuelAI, BrawlAI, cpuDifficulty, normalizeCpuLevel, ATTACKS, TOWER, loadProfile } = cpuLab
    const originalRandom = Math.random
    const seed = n => { let s = n >>> 0; Math.random = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296 } }
    const f = x => ({ pos: { x, y: 0 }, vel: { x: 0, y: 0 }, facing: x < 0 ? 1 : -1, grounded: true, blocking: false, crouching: false, attack: null, chainT: 0, kdT: 0, qrT: 0, chillT: 0, giantT: 0, hitstun: 0, hp: 100, canAct: () => true, canCast: () => false, reachMul: () => 1, state: 'fight', stocks: 3, dmg: 0, team: x, scaleMul: 1, dodgeT: 0, airJumps: 1, untouchable: () => false })
    const duel = (level, fighter, foe, overrides = {}) => new SingleDuelAI(fighter, { ...cpuDifficulty(level).duel, specials: [], ...overrides }, { fight: { foeOf: () => foe }, specials: { cast: () => true } })
    const results = { duel: [], brawl: [], profiles: [], invariant: true, specials: [] }
    try {
      for (const fps of [30, 60, 120]) for (const level of [1, 5, 6, 10]) {
        seed(73401)
        let timelyBlocks = 0, blocks = 0, minDelay = Infinity, maxChainInputs = 0, chains = 0
        for (let trial = 0; trial < 1200; trial++) {
          const bot = f(0), foe = f(1.6), ai = duel(level, bot, foe)
          foe.attack = { kind: 'heavy', t: 0 }
          let first = null
          for (let step = 0; step < Math.ceil(.72 * fps); step++) {
            foe.attack.t = step / fps
            const it = ai.update(1 / fps)
            if (it.block && first == null) first = (step + 1) / fps
          }
          if (first != null) { blocks++; minDelay = Math.min(minDelay, first); if (first <= ATTACKS.heavy.startup) timelyBlocks++ }
        }
        // Only one roll per confirmed hit opening, irrespective of frame count.
        seed(5101)
        for (let trial = 0; trial < 1200; trial++) {
          const bot = f(0), foe = f(1.6), ai = duel(level, bot, foe, { cancelProb: 0 })
          bot.lastHitKind = 'jab'
          let inputs = 0
          for (let step = 0; step < Math.floor(.35 * fps); step++) {
            bot.chainT = .35 - step / fps
            const it = ai.update(1 / fps)
            if (it.light || it.heavy) inputs++
          }
          chains += inputs
          maxChainInputs = Math.max(maxChainInputs, inputs)
        }
        seed(9010)
        const bot = f(0), foe = f(1.6), ai = duel(level, bot, foe)
        let attackIntents = 0
        for (let step = 0; step < 20 * fps; step++) { const it = ai.update(1 / fps); if (it.light || it.heavy) attackIntents++ }
        results.duel.push({ fps, level, timelyBlocks, blocks, minDelay, chains, maxChainInputs, attackIntents })
      }
      for (const level of [1, 5, 6, 10]) {
        seed(7781)
        const bot = f(0), foe = f(1.5), ai = new BrawlAI(bot, { difficulty: cpuDifficulty(level).brawl })
        let attackIntents = 0, smashes = 0, dodges = 0
        foe.dmg = 100
        for (let step = 0; step < 60 * 60; step++) {
          const it = ai.update(1 / 60, [bot, foe])
          if (it.jab || it.smash) attackIntents++
          if (it.smash) smashes++
        }
        seed(8951)
        for (let trial = 0; trial < 1200; trial++) {
          const bot = f(0), foe = f(1.5), brain = new BrawlAI(bot, { difficulty: cpuDifficulty(level).brawl })
          foe.attack = { t: 0 }
          let perAttack = 0
          for (let step = 0; step < 60; step++) if (brain.update(1 / 60, [bot, foe]).dodge) perAttack++
          if (perAttack > 1) results.invariant = false
          dodges += perAttack
        }
        const recovery = f(14), enemy = f(0), recoveryAI = new BrawlAI(recovery, { difficulty: cpuDifficulty(level).brawl })
        recovery.grounded = false; recovery.vel.y = -3
        let recoveryY = null
        for (let y = 4; y >= -8; y -= .1) { recovery.pos.y = y; if (recoveryAI.update(1 / 60, [recovery, enemy]).jump) { recoveryY = +y.toFixed(1); break } }
        results.brawl.push({ level, attackIntents, smashes, dodges, recoveryY })
      }
      // A useful ranged art uses the same real cooldown at every level.
      for (const level of [1, 10]) {
        seed(611)
        const bot = f(0), foe = f(6); bot.canCast = () => true
        const ai = duel(level, bot, foe, { specials: ['starfire'] })
        ai.cds[0] = 0
        let time = 0, casts = []
        ai.specials.cast = () => { casts.push(time); return true }
        for (let step = 0; step < 60 * 60; step++) { time = step / 60; ai.update(1 / 60) }
        results.specials.push({ level, casts, minimumCd: ai.skills[0].cd * 1.15 })
      }
      for (const [value, expected] of [[undefined, 6], [null, 6], [true, 6], [{}, 6], ['', 6], ['bad', 6], ['8', 8], [-4, 1], [100, 10], [4.5, 5]]) {
        localStorage.setItem('ipl-profile-v2', JSON.stringify({ name: 'QA', cpuLevel: value, duelMode: 'invalid', loadout: ['blink', 'starfire', 'quake', 'comet'], stats: { wins: { duel: 3 }, plays: { brawl: 2 } } }))
        const p = loadProfile()
        results.profiles.push({ value: String(value), expected, actual: p.cpuLevel, mode: p.duelMode, preserved: p.name === 'QA' && p.stats.wins.duel === 3 && p.loadout[1] === 'starfire' })
      }
      results.freeze = Object.isFrozen(cpuDifficulty(6)) && Object.isFrozen(cpuDifficulty(6).duel) && Object.isFrozen(cpuDifficulty(6).brawl)
      results.tower = TOWER.map(s => ({ name: s.name, reaction: s.ai.reaction, blockProb: s.ai.blockProb }))
      results.noStatScaling = Array.from({ length: 10 }, (_, i) => cpuDifficulty(i + 1)).every(c => [c.brawl, c.duel].every(v => !['hp', 'damage', 'speed', 'cooldown', 'hitbox'].some(k => k in v)))
    } finally { Math.random = originalRandom }
    return results
  })
  for (const r of result.duel) {
    const config = { 1: [.68, .10], 5: [.29, .64], 6: [.254, .70], 10: [.11, .94] }[r.level]
    check(`duel L${r.level} ${r.fps}fps delayed reaction`, r.minDelay >= config[0] * .85 - 1 / r.fps, r)
    check(`duel L${r.level} ${r.fps}fps one combo roll per opening`, r.maxChainInputs <= 1 && Math.abs(r.chains / 1200 - config[1]) < .04)
  }
  for (const fps of [30, 60, 120]) {
    const rows = result.duel.filter(r => r.fps === fps)
    check(`duel pressure rises across levels at ${fps}fps`, rows.every((r, i) => !i || r.attackIntents > rows[i - 1].attackIntents), rows.map(r => [r.level, r.attackIntents]))
    check(`duel L10 blocks telegraphed heavy while L1 misses startup at ${fps}fps`, rows[3].timelyBlocks > 960 && rows[3].timelyBlocks < 1150 && rows[0].timelyBlocks === 0)
  }
  for (const level of [1, 5, 6, 10]) check(`duel L${level} combo probability stable across frame rates`, new Set(result.duel.filter(r => r.level === level).map(r => r.chains)).size === 1)
  for (const r of result.specials) check(`duel L${r.level} honors art cooldown`, r.casts.length > 0 && r.casts.slice(1).every((t, i) => t - r.casts[i] >= r.minimumCd - 1 / 60), r)
  check('brawl pressure and finishing attacks rise across levels', result.brawl.every((r, i, a) => !i || r.attackIntents > a[i - 1].attackIntents && r.smashes > a[i - 1].smashes), result.brawl)
  check('brawl defense improves and does not reroll each attack', result.invariant && result.brawl.every((r, i, a) => !i || r.dodges > a[i - 1].dodges))
  check('brawl higher levels recover earlier', result.brawl.every((r, i, a) => !i || r.recoveryY > a[i - 1].recoveryY))
  check('profile migration normalizes CPU level and preserves roster/results', result.profiles.every(p => p.actual === p.expected && p.mode === 'tower' && p.preserved), result.profiles)
  check('immutable match snapshots and no stat bonuses', result.freeze && result.noStatScaling)
  check('original four Tower tunings retained', JSON.stringify(result.tower.map(t => [t.reaction, t.blockProb])) === JSON.stringify([[.42, .25], [.30, .40], [.26, .55], [.20, .70]]), result.tower)
  await writeFile('docs/cpu-behavior-results.json', JSON.stringify({ time: new Date().toISOString(), checks, result, errors }, null, 2) + '\n')
} finally { await browser.close() }
check('no browser errors', errors.length === 0, errors)
process.exitCode = checks.some(c => !c.ok) ? 1 : 0
