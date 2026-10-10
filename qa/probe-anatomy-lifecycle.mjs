import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.IPL_BASE || 'http://127.0.0.1:5302'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = [], errors = [], expectedErrors = []
const out = process.env.IPL_QA_OUT || 'qa/screens/anatomy-lifecycle'
await mkdir(out, { recursive: true })
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) })
  console.log(ok ? 'PASS' : 'FAIL', name)
  if (!ok) process.exitCode = 1
}
function observe(page, expected = false) {
  const list = expected ? expectedErrors : errors
  page.on('pageerror', e => list.push(String(e)))
  page.on('console', m => { if (m.type() === 'error') list.push(m.text()) })
}
async function ready(page, name) {
  await page.waitForFunction(n => window.__ipl?.sm.currentName === n && !window.__ipl.sm._busy, name, { timeout: 60000 })
  await page.locator('#boot').waitFor({ state: 'detached' })
}
try {
  const loadingContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const loading = await loadingContext.newPage()
  observe(loading)
  let release
  const requested = new Promise(resolve => { release = resolve })
  await loading.route('**/models/textures/caelan-face.webp', route => release(route))
  await loading.goto(base + '/?scene=loadout&mute=1', { waitUntil: 'domcontentloaded' })
  const held = await requested
  check('Champion loading keeps entry disabled', await loading.locator('#bootEnter').isDisabled())
  check('Champion loading has a visible status', (await loading.locator('#bootStatus').textContent()).includes('Preparing your champions'))
  await held.continue()
  await ready(loading, 'loadout')
  check('Entry resumes after textures finish', await loading.evaluate(async () => {
    const h = window.__scene.hero
    await h.assetsReady
    return h.modelVersion === 3 && h.mats.face.map.image.complete && !h.assetError
  }))
  await loadingContext.close()

  const retryContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const retry = await retryContext.newPage()
  observe(retry, true)
  await retry.route('**/models/textures/hair-atlas.webp', route => route.abort('failed'))
  await retry.goto(base + '/?scene=loadout&mute=1')
  const retryButton = retry.getByRole('button', { name: 'TRY AGAIN', exact: true })
  await retryButton.waitFor()
  check('Texture failure exposes an enabled retry', await retryButton.isEnabled())
  check('Texture failure explains recovery', (await retry.locator('#bootStatus').textContent()).includes('Check your connection'))
  await retry.screenshot({ path: `${out}/texture-error.png` })
  await retry.unroute('**/models/textures/hair-atlas.webp')
  await retryButton.click()
  await ready(retry, 'loadout')
  check('Retry reloads the real model successfully', await retry.evaluate(async () => {
    const h = window.__scene.hero
    await h.assetsReady
    return h.mats.hairCards.map.image.complete && !h.assetError
  }))
  await retryContext.close()

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  observe(page)
  await page.addInitScript(() => localStorage.setItem('ipl-profile-v2', JSON.stringify({
    champion: 'caelan', loadout: ['decoy', 'ghost', 'quake', 'comet'],
  })))
  await page.goto(base + '/?scene=moba&mute=1')
  await ready(page, 'moba')
  await page.keyboard.press('KeyZ')
  await page.waitForFunction(() => window.__scene.phase === 'play')
  await page.evaluate(() => {
    const mats = new Set()
    window.__scene.hero.hips.traverse(o => { if (o.material) mats.add(o.material) })
    window.__beforeGhost = [...mats].map(m => [m, m.transparent, m.opacity])
  })
  await page.keyboard.press('KeyW')
  await page.waitForFunction(() => window.__scene.ghostT > 0)
  check('Wraith Walk applies to every unique body material', await page.evaluate(() => window.__beforeGhost.every(([m, , op]) => m.transparent && m.opacity === Math.min(op, .35))))
  await page.waitForFunction(() => window.__scene.ghostT <= 0, undefined, { timeout: 15000 })
  check('Wraith Walk restores every original material', await page.evaluate(() => window.__beforeGhost.every(([m, tr, op]) => m.transparent === tr && m.opacity === op)))

  const captureClone = async game => {
    const result = await page.evaluate(async game => {
      const s = window.__scene
      const hero = game === 'moba' ? s.hero : s.game.player.hero
      const clone = game === 'moba' ? s.decoy.hero : s.game.eff.decoy.hero
      await clone.assetsReady
      const original = new Set(), resources = new Set()
      hero.group.traverse(o => { if (o.material) original.add(o.material) })
      let valid = true
      clone.hips.traverse(o => {
        if (o.isMesh) valid &&= !Array.isArray(o.material) && !original.has(o.material) && o.material.opacity === .42
      })
      clone.group.traverse(o => {
        if (!o.isMesh) return
        resources.add(o.geometry)
        for (const value of Object.values(o.material)) if (value?.isTexture) resources.add(value)
        if (o.isSkinnedMesh && o.skeleton.boneTexture) resources.add(o.skeleton.boneTexture)
      })
      window.__cloneDisposals = { total: resources.size, count: 0 }
      const disposed = new Set()
      for (const resource of resources) resource.addEventListener('dispose', () => {
        disposed.add(resource)
        window.__cloneDisposals.count = disposed.size
      })
      window.__originalFace = hero.mats.face.map
      window.__originalDisposed = false
      hero.mats.face.map.addEventListener('dispose', () => { window.__originalDisposed = true })
      return { valid, modelVersion: clone.modelVersion, total: resources.size, skinned: Boolean(clone.skeleton), pose: clone.equipmentPose }
    }, game)
    check(`${game} clone preserves the textured skinned model and independent materials`, result.valid && result.modelVersion === 3 && result.skinned && result.total > 0, result)
    if (game === 'hoops') check('Court clone stows its equipment', result.pose === 'stowed', result.pose)
    await page.screenshot({ path: `${out}/${game}-clone.png` })
    await page.waitForFunction(game => game === 'moba' ? !window.__scene.decoy : !window.__scene.game.eff.decoy, game, { timeout: 20000 })
    const disposed = await page.evaluate(() => ({ ...window.__cloneDisposals, originalDisposed: window.__originalDisposed, faceLoaded: window.__originalFace.image.complete }))
    check(`${game} expired clone releases all captured geometry and textures`, disposed.count === disposed.total, disposed)
    check(`${game} clone cleanup preserves the player texture`, !disposed.originalDisposed && disposed.faceLoaded, disposed)
  }
  await page.keyboard.press('KeyQ')
  await page.waitForFunction(() => window.__scene.decoy?.hero)
  await captureClone('moba')
  await page.evaluate(() => window.__ipl.sm.goTo('hoops'))
  await ready(page, 'hoops')
  await page.keyboard.press('KeyZ')
  await page.waitForFunction(() => window.__scene.game.phase !== 'intro')
  await page.keyboard.press('Digit1')
  await page.waitForFunction(() => window.__scene.game.eff.decoy?.hero)
  await captureClone('hoops')
  check('No unexpected browser errors', errors.length === 0, errors)
  await context.close()
} catch (error) {
  check('Lifecycle probe completed', false, String(error))
  throw error
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify({ base, results, errors, expectedErrors }, null, 2))
  await browser.close()
}
