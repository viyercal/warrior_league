import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = process.env.IPL_BASE || 'http://127.0.0.1:5194'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const checks = [], errors = []
page.on('pageerror', e => errors.push(String(e)))
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); assert.ok(ok, name) }
async function open(mode) {
  await page.goto(`${base}/?scene=${mode}&mute=1&dpr=1`)
  await page.waitForFunction(m => window.__ipl?.sm.currentName === m && !window.__ipl.sm._busy, mode, { timeout: 90000 })
  await page.locator('#boot').waitFor({ state: 'detached' }); await page.keyboard.press('z')
}
try {
  await mkdir('qa/screens/boss-arts', { recursive: true })
  await open('arena')
  const rules = process.env.PRODUCTION ? {} : await page.evaluate(async () => {
    const { BossArts } = await import('/src/games/shared/bossArts.js')
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const s = window.__scene, out = {}
    window.__ipl.engine.setPaused(true, 'qa')
    const target = new THREE.Vector3(8, 0, 8), source = new THREE.Vector3()
    let hits = 0
    const a = new BossArts({ scene: s.scene, vfx: s.vfx, audio: s.ctx.audio, source: () => source, target: () => target, canCast: () => false, onCast: () => {}, hit: () => hits++, announce: () => {}, kind: 'pit' })
    a.cast(); const line = a.pending[0]
    a.update(.9, true); out.noEarlyDamage = hits === 0
    const saved = line.end.clone(); target.set(8, 0, -8); a.update(.3, true)
    out.sidestep = hits === 0 && line.end.equals(saved)
    target.set(8, 0, 8); a.sequence = 0; a.cast()
    const q = a.pending[0]; q.warning.updateMatrixWorld(true)
    const coords = q.warning.geometry.attributes.position, world = new THREE.Vector3()
    let aligned = true
    for (let i = 0; i < coords.count; i++) { world.fromBufferAttribute(coords, i).applyMatrix4(q.warning.matrixWorld); const dx = world.x - q.pos.x, dz = world.z - q.pos.z; const cross = Math.abs(dx * q.dir.z - dz * q.dir.x); aligned &&= Math.abs(cross - q.width / 2) < .001 }
    out.lineGeometryMatchesCollision = aligned
    a.update(1.2, true); out.lineHitsInside = hits === 1
    a.sequence = 1; a.cast(); const spots = a.pending.map(p => p.pos.clone()); target.set(-12, 0, -12)
    a.update(2, true); out.salvoLockedAndAvoidable = hits === 1 && spots.length === 3
    target.copy(spots[0]); a.sequence = 1; a.cast(); a.update(1.2, true); out.salvoHitsInside = hits === 2
    a.reset(); out.resetDisposes = a.pending.length === 0 && !a.casting
    a.kind = 'duel0'; source.set(4, 0, 0); target.set(-4, 2, 0); a.cast(); a.update(2, true); out.jumpDodgesWave = hits === 2
    a.reset(); target.y = 0; a.cast(); a.update(2, true); out.waveSweepsLowFps = hits === 3; a.update(.1, true); out.waveOnlyHitsOnce = hits === 3
    a.reset(); a.kind = 'duel1'; a.cast(); a.hit = () => { hits++; a.reset() }; a.update(1.2, true); out.lethalResetSafe = a.pending.length === 0
    a.cast(); a.update(.1, false); out.inactiveClears = a.pending.length === 0
    a.kind = 'duel3'; a.sequence = 1; target.set(-10, 0, 0); a.cast(); out.cornerMarksDistinct = Math.abs(a.pending[0].pos.x - a.pending[1].pos.x) >= 3; a.dispose(); return out
  })
  for (const [name, ok] of Object.entries(rules)) check(name, ok)
  for (const mode of ['arena', 'siege']) {
    await open(mode)
    await page.evaluate(mode => window.__scene.debug.wave(mode === 'arena' ? 5 : 10), mode)
    await page.waitForFunction(() => !!window.__scene.boss)
    await page.keyboard.press('z')
    await page.waitForFunction(mode => mode === 'arena' ? !window.__scene.cine.active : window.__scene.phase === 'play', mode)
    await page.waitForTimeout(400)
    await page.evaluate(() => { const s = window.__scene; window.__ipl.engine.setPaused(true, 'qa'); s.hero.group.position.set(4, 0, 4); s.boss.group.position.set(-5, 0, -5); s.boss.actT = 99; s.bossArts.reset(); s._updateCamera(1) })
    const r = await page.evaluate(() => {
      const s = window.__scene, a = s.bossArts
      for (let i = 0; i < 160; i++) s._updateBoss(1 / 60)
      const out = { autoCast: a.casts === 1, warning: a.pending.length > 0, holdsMelee: a.casting }
      const timer = a.pending[0].t
      out.snapshot = { timer, cooldown: a.cooldown }
      return out
    })
    check(`${mode} automatically casts ranged ability`, r.autoCast && r.warning && r.holdsMelee)
    await page.waitForTimeout(350)
    for (const [width, height] of [[1440,900],[900,800],[390,844]]) {
      await page.setViewportSize({ width, height })
      await page.screenshot({ path: `qa/screens/boss-arts/${mode}-warning-${width}.png` })
      check(`${mode} spell cue fits ${width}`, await page.locator('.boss-art-cue').last().evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }))
    }
    await page.setViewportSize({ width:1440, height:900 })
    await page.waitForTimeout(200)
    check(`${mode} pause freezes spell`, await page.evaluate(t => window.__scene.bossArts.pending[0].t === t, r.snapshot.timer))
    // Real movement input through the ordinary scene loop.
    await page.evaluate(() => { const s = window.__scene; s.spawnQueue = []; (s.horde || s.army).clearAll(); s.bossArts.reset(); s.bossArts.sequence = 0; s.bossArts.cooldown = 0; s.boss.state = s.bossArts.kind === 'pit' ? 'stalk' : 'march'; s.boss.actT = 99; s.hp = 100; s.iFrames = 0; s.boss.group.position.set(-5,0,-5); s.hero.group.position.set(4,0,4); window.__ipl.engine.setPaused(false,'qa') })
    await page.waitForFunction(() => window.__scene.bossArts.pending.length > 0)
    await page.keyboard.down('d'); await page.waitForTimeout(320); await page.keyboard.up('d')
    await page.waitForFunction(() => window.__scene.bossArts.pending.length === 0)
    check(`${mode} actual sidestep avoids aimed spell`, await page.evaluate(() => window.__scene.hp === 100))
    check(`${mode} death cancels pending spell`, await page.evaluate(() => { const s = window.__scene; s._bossDeath(); return s.bossArts.pending.length === 0 }))
  }
  await open('duel')
  await page.waitForFunction(() => window.__scene.phase === 'fight', null, { timeout: 20000 })
  for (let stage = 0; stage < 4; stage++) {
    const r = await page.evaluate(stage => {
      const s = window.__scene; window.__ipl.engine.setPaused(true, 'qa'); s._setupFight(stage, { retry: true }); s._cleanupFlow(); s.phase = 'fight'; s.fight.active = true; s.player.iFrames = 999
      for (let i = 0; i < 900 && !s.bossArts.casts; i++) s.update(1 / 60, i / 60)
      return { casts: s.bossArts.casts, warnings: s.bossArts.pending.length, type: s.bossArts.pending[0]?.type, name: s.foe.name }
    }, stage)
    check(`Crucible stage ${stage + 1} automatically casts`, r.casts > 0 && r.warnings > 0, r)
    await page.screenshot({ path: `qa/screens/boss-arts/duel-${stage}.png` })
    check(`Crucible stage ${stage + 1} result clears spells`, await page.evaluate(() => { const s = window.__scene; s.debug.lose(); return s.bossArts.pending.length === 0 }))
  }
  // Actual jump control against an incoming ground wave in a live scene.
  await open('duel'); await page.waitForFunction(() => window.__scene.phase === 'fight', null, { timeout: 20000 })
  await page.evaluate(() => { const s = window.__scene; s.ai.update = () => s._zero; s.specials.reset(); s.foe.resetRound(4.2); s.player.resetRound(-4.2); s.bossArts.reset(); s.bossArts.cooldown = 0 })
  await page.waitForFunction(() => window.__scene.bossArts.pending[0]?.t >= 1.45, null, { timeout: 15000 })
  await page.keyboard.press('Space')
  await page.waitForFunction(() => window.__scene.bossArts.pending.length === 0, null, { timeout: 15000 })
  check('Space jump dodges actual incoming ground wave', await page.evaluate(() => window.__scene.player.hp === 100))
  await page.evaluate(() => { const s = window.__scene; s.player.iFrames = 0; s.bossArts.cooldown = 0 })
  await page.waitForFunction(() => window.__scene.player.hp < 100, null, { timeout: 15000 })
  check('standing still takes real spell damage', true)
  await page.evaluate(() => window.__ipl.sm.goTo('duel', { mode: 'single' }))
  await page.waitForFunction(() => window.__scene.mode === 'single')
  check('Single Duel keeps its existing difficulty behavior', await page.evaluate(() => !window.__scene.bossArts))
  check('no browser errors', errors.length === 0, errors)
} finally { await writeFile(process.env.PRODUCTION ? 'docs/boss-arts-production-results.json' : 'docs/boss-arts-results.json', JSON.stringify({ base, checks, errors }, null, 2)); await browser.close() }
