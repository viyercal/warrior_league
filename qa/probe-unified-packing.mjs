import { chromium } from 'playwright-core'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const base = process.env.IPL_BASE || 'http://127.0.0.1:5302'
const baseline = process.env.IPL_ASSET_BASELINE
if (!baseline) throw new Error('Set IPL_ASSET_BASELINE to the saved pre-packing GLBs')
const out = process.env.IPL_QA_OUT || 'qa/screens/unified-packing'
await mkdir(out, { recursive: true })
const original = Object.fromEntries(await Promise.all(['caelan', 'nyra'].map(async id => [id, await readFile(`${baseline}/${id}.glb`)])))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const screenshots = new Map(), checks = [], errors = []
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) })
  if (!ok) process.exitCode = 1
}
try {
  for (const variant of ['baseline', 'packed']) {
    const context = await browser.newContext({ viewport: { width: 900, height: 900 } })
    await context.addInitScript(() => {
      let seed = 417
      Math.random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296)
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(`${variant}: ${error.message}`))
    page.on('console', message => { if (message.type() === 'error') errors.push(`${variant}: ${message.text()}`) })
    if (variant === 'baseline') await page.route('**/models/champions/*.glb', route => {
      const id = new URL(route.request().url()).pathname.split('/').at(-1).replace('.glb', '')
      return route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: original[id] })
    })
    await page.goto(`${base}/qa/roster-studio.html`)
    await page.waitForFunction(() => window.studio?.hero, undefined, { timeout: 60000 })
    for (const id of ['caelan', 'nyra']) for (const skin of [0, 1, 2]) for (const pose of ['idle', 'run', 'cast', 'dance', 'ko']) {
      const detail = await page.evaluate(({ id, skin, pose }) => {
        let seed = 919
        Math.random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296)
        const studio = window.studio
        const hero = studio.show(id, skin, { pose, angle: .3, equipmentPose: 'held' })
        studio.camera.position.set(.5, 1.7, 4.6)
        studio.camera.lookAt(0, 1.1, 0)
        studio.render()
        return { modelVersion: hero.modelVersion, jointIndexType: hero.skinMesh.geometry.attributes.skinIndex.array.constructor.name }
      }, { id, skin, pose })
      const key = `${id}-${skin}-${pose}`
      const pixels = await page.locator('canvas').screenshot()
      if (variant === 'baseline') screenshots.set(key, pixels)
      else {
        check(`${key}: packed rig loads as bytes`, detail.modelVersion === 4 && detail.jointIndexType === 'Uint8Array', detail)
        check(`${key}: native render exactly matches baseline`, pixels.equals(screenshots.get(key)), {
          baselineSha256: createHash('sha256').update(screenshots.get(key)).digest('hex'),
          packedSha256: createHash('sha256').update(pixels).digest('hex'),
        })
        if (!pixels.equals(screenshots.get(key))) {
          await writeFile(`${out}/${key}-baseline.png`, screenshots.get(key))
          await writeFile(`${out}/${key}-packed.png`, pixels)
        } else if (skin === 0 && pose === 'idle') await writeFile(`${out}/${id}.png`, pixels)
      }
    }
    await context.close()
  }
  check('No browser errors', errors.length === 0, errors)
} catch (error) {
  check('Packing probe completes', false, String(error))
  throw error
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify({ base, baseline, checks, errors }, null, 2) + '\n')
  await browser.close()
  console.log(JSON.stringify({ passed: checks.filter(check => check.ok).length, failed: checks.filter(check => !check.ok), errors }))
}
