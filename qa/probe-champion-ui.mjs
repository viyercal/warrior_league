import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.IPL_BASE || 'http://127.0.0.1:5301'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = [], errors = []
const out = 'qa/screens/roster'
await mkdir(out, { recursive: true })
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) })
  console.log(ok ? 'PASS' : 'FAIL', name, !ok && detail ? JSON.stringify(detail) : '')
  if (!ok) process.exitCode = 1
}
const roster = [
  ['caelan', 'Caelan', 'vanguard', ['dawnsworn', 'Dawnsworn'], ['ashen-oath', 'Ashen Oath'], ['celestial-guard', 'Celestial Guard']],
  ['nyra', 'Nyra', 'raider', ['veil-huntress', 'Veil Huntress'], ['lunar-phantom', 'Lunar Phantom'], ['thornbound', 'Thornbound']],
  ['orren', 'Orren', 'juggernaut', ['rootbound', 'Rootbound'], ['furnace-king', 'Furnace King'], ['frost-relic', 'Frost Relic']],
  ['serai', 'Serai', 'mystic', ['tidecaller', 'Tidecaller'], ['star-cartographer', 'Star Cartographer'], ['desert-oracle', 'Desert Oracle']],
]
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
page.on('pageerror', error => errors.push(String(error)))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
const ready = async (target = 'loadout', p = page) => {
  await p.waitForFunction(name => window.__ipl?.sm.currentName === name && !window.__ipl.sm._busy, target)
  await p.locator('#boot').waitFor({ state: 'detached' })
}
const artReady = async (p = page) => p.waitForFunction(() => {
  const image = document.querySelector('.champion-splash')
  return image && !image.hidden && image.complete && image.naturalWidth > 0
})
const profile = () => page.evaluate(() => window.__ipl.sm.profile)
const snapshot = label => page.screenshot({ path: `${out}/${label}.png` })
try {
  await page.goto(`${base}/?scene=loadout&mute=1`)
  await ready(); await artReady()
  const initial = await profile()
  check('new player starts with Caelan and all four signature skins', initial.champion === 'caelan' && roster.every(([id,,, [skin]]) => initial.skins[id] === skin))
  check('all four champions and three current skins are visible', await page.locator('.champion-card').count() === 4 && await page.locator('.champion-skin').count() === 3)
  check('signature appearance needs no reset', !await page.getByRole('button', { name: 'Restore skin palette', exact: true }).isEnabled())
  await snapshot('forge-desktop')
  for (const [id, name, kind, ...skins] of roster) {
    await page.getByRole('button', { name: `Select ${name}`, exact: true }).click()
    check(`${name} opens its signature skin on first selection`, (await profile()).skins[id] === skins[0][0])
    for (const [skin, title] of skins) {
      const button = page.getByRole('button', { name: `Equip ${name}: ${title}`, exact: true })
      await button.click(); await artReady()
      const current = await profile()
      check(`${name} / ${title}: selected, saved, illustrated and applied to playable rig`, await button.getAttribute('aria-pressed') === 'true' && current.champion === id && current.skins[id] === skin && (await page.locator('.champion-splash').getAttribute('src')).endsWith(`/concepts/images/${id}-${skin}.png`) && await page.evaluate(({ id, skin, kind }) => {
        const p = JSON.parse(localStorage.getItem('ipl-profile-v2')) || window.__ipl.sm.profile
        const hero = window.__scene.hero
        return p.champion === id && p.skins[id] === skin && hero.modelKind === kind && hero.appearance.primary === p.appearance.primary && hero.appearance.glow === p.appearance.glow
      }, { id, skin, kind }))
    }
  }
  check('champion and skin changes preserve all equipped arts and stats', JSON.stringify((await profile()).loadout) === JSON.stringify(initial.loadout) && JSON.stringify((await profile()).stats) === JSON.stringify(initial.stats))
  await page.getByRole('button', { name: 'Select Nyra', exact: true }).click()
  check('returning to a champion remembers its last skin', (await profile()).skins.nyra === 'thornbound')
  await page.getByRole('button', { name: 'Equip Nyra: Lunar Phantom', exact: true }).click()
  await page.getByRole('textbox', { name: 'War name', exact: true }).fill('ASTER')
  await page.reload(); await ready(); await artReady()
  check('champion, skin, name and artwork survive reload', (await profile()).champion === 'nyra' && (await profile()).skins.nyra === 'lunar-phantom' && await page.getByRole('textbox', { name: 'War name' }).inputValue() === 'ASTER' && await page.locator('.champion-splash').getAttribute('alt') === 'Nyra: Lunar Phantom')

  await page.getByText('Fine-tune appearance', { exact: true }).click()
  await page.getByRole('button', { name: 'PRIMARY #c23b2e', exact: true }).click()
  check('customizing appearance enables the skin reset', await page.getByRole('button', { name: 'Restore skin palette', exact: true }).isEnabled() && (await profile()).appearance.primary === '#c23b2e')
  await page.getByRole('button', { name: 'Restore skin palette', exact: true }).click()
  check('reset restores current skin and preserves champion', !await page.getByRole('button', { name: 'Restore skin palette', exact: true }).isEnabled() && (await profile()).appearance.primary === '#c0cad7' && (await profile()).champion === 'nyra')
  await page.getByText('Fine-tune appearance', { exact: true }).click()

  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('link', { name: 'Open full artwork', exact: false }).click()
  const popup = await popupPromise
  await popup.waitForLoadState('load')
  check('full artwork opens the selected original without losing loadout', popup.url().endsWith('/nyra-lunar-phantom.png') && await page.locator('.loadout-go').isVisible())
  await popup.close(); await page.bringToFront()
  await page.getByRole('button', { name: '3D preview', exact: true }).click()
  check('3D preview exposes the model controls', await page.locator('#ui').getAttribute('data-preview') === 'model' && await page.locator('.loadout-dance').isVisible())
  await page.locator('.loadout-dance').click()
  check('war dance starts on the selected champion', await page.locator('.loadout-dance').getAttribute('aria-pressed') === 'true' && (await profile()).champion === 'nyra')
  await page.locator('.loadout-dance').click()
  check('war dance stops', await page.locator('.loadout-dance').getAttribute('aria-pressed') === 'false')
  await page.mouse.move(300, 450); await page.mouse.down(); await page.mouse.move(450, 450, { steps: 6 })
  check('3D turntable still responds to dragging', await page.evaluate(() => window.__scene._dragging && Math.abs(window.__scene._spin) > 0))
  await page.mouse.up()
  await page.getByRole('button', { name: 'Artwork', exact: true }).click()
  check('artwork mode restores art and hides model controls', await page.locator('#ui').getAttribute('data-preview') === 'art' && !await page.locator('.loadout-dance').isVisible())

  const arts = await page.locator('.loadout-skill').count()
  for (let i = 0; i < arts; i++) {
    await page.locator('.loadout-slot').nth(i % 4).click()
    await page.locator('.loadout-skill').nth(i).click()
  }
  check('all twelve battle arts and four slots remain usable', arts === 12 && (await profile()).loadout.length === 4 && new Set((await profile()).loadout).size === 4)
  for (const width of [1440, 1280, 900, 700, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.getByRole('button', { name: 'Select Serai', exact: true }).click()
    await page.getByRole('button', { name: 'Equip Serai: Star Cartographer', exact: true }).click(); await artReady()
    const layout = await page.evaluate(() => {
      const ui = document.querySelector('#ui'), panel = document.querySelector('.loadout-panel'), preview = document.querySelector('.champion-presentation')
      const selectors = ['.champion-card', '.champion-skin', '.champion-modes', '.loadout-go', '.loadout-back']
      const outside = selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(el => {
        const b = el.getBoundingClientRect(); return b.left < -1 || b.right > innerWidth + 1
      }).map(el => el.className))
      return { outside, noOverflow: ui.scrollWidth <= ui.clientWidth, previewFirst: preview.offsetTop < panel.offsetTop, panelHeight: panel.offsetHeight }
    })
    check(`${width}px forge keeps controls contained and artwork before equipment`, !layout.outside.length && layout.noOverflow && (width > 760 || layout.previewFirst), layout)
    // Return to the top after auto-scrolling the skin choice into view.
    await page.locator('#ui').evaluate(el => { el.scrollTop = 0 })
    await snapshot(`forge-${width}`)
    await page.locator('.loadout-go').scrollIntoViewIfNeeded()
    check(`${width}px primary navigation remains reachable`, await page.locator('.loadout-go').isVisible())
  }
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [, name,, ...skins] of roster) {
    await page.getByRole('button', { name: `Select ${name}`, exact: true }).click()
    for (const [, title] of skins) {
      const b = page.getByRole('button', { name: `Equip ${name}: ${title}`, exact: true })
      await b.click()
      check(`narrow ${name} / ${title} is selectable`, await b.getAttribute('aria-pressed') === 'true')
    }
  }
  await page.getByRole('button', { name: '3D preview', exact: true }).click()
  await page.locator('.loadout-dance').click()
  check('narrow model preview and dance remain reachable', await page.locator('.loadout-dance').getAttribute('aria-pressed') === 'true')
  await snapshot('forge-narrow-model')
  await page.getByRole('button', { name: 'Artwork', exact: true }).click()
  await page.getByRole('button', { name: 'Select Caelan', exact: true }).focus()
  await page.keyboard.press('Enter')
  check('champion selection works from the keyboard', (await profile()).champion === 'caelan')
  await page.getByRole('button', { name: 'Equip Caelan: Dawnsworn', exact: true }).focus()
  await page.keyboard.press('Space')
  check('skin selection works from the keyboard', (await profile()).skins.caelan === 'dawnsworn')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('.loadout-go').click(); await ready('hub')
  check('seal and return shows the selected champion in the hub', await page.getByRole('button', { name: 'Change champion: Caelan, Dawnsworn', exact: true }).isVisible() && (await page.locator('.realm-player .champion-portrait').getAttribute('src')).endsWith('/concepts/images/caelan-dawnsworn.png'))
  await snapshot('hub-champion')
  await page.getByRole('button', { name: 'Change champion: Caelan, Dawnsworn', exact: true }).click(); await ready()
  check('hub portrait opens champion selection', await page.locator('.champion-roster').isVisible())
  await page.locator('.loadout-back').click(); await ready('hub')
  check('forge Back returns to the hub', await page.locator('.realm-hub').isVisible())

  for (const game of ['moba', 'duel', 'arena', 'kart', 'brawl', 'siege', 'hoops']) {
    await page.locator(`[data-realm="${game}"]`).click()
    await page.getByRole('button', { name: 'Prepare loadout', exact: true }).click(); await ready()
    await page.getByRole('button', { name: 'Select Serai', exact: true }).click()
    await page.getByRole('button', { name: 'Equip Serai: Tidecaller', exact: true }).click()
    await page.locator('.loadout-go').click(); await ready(game)
    await page.waitForTimeout(5500)
    check(`${game} receives the selected champion, skin and portrait`, await page.locator('.battle-identity').getAttribute('aria-label') === 'Serai, Tidecaller' && (await page.locator('.battle-identity img').getAttribute('src')).endsWith('/concepts/images/serai-tidecaller.png') && (await profile()).champion === 'serai')
    for (const width of [1600, 1440, 1280, 900, 700, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      const layout = await page.evaluate(() => {
        const identity = document.querySelector('.battle-identity').getBoundingClientRect()
        const overlap = [...document.querySelectorAll('.stat-bar,.moba-level,.brawl-chips,.kart-cluster,.arena-heat,.duel-meter,.battle-help-toggle,.session-menu')].filter(el => {
          const b = el.getBoundingClientRect()
          return b.width && b.height && identity.left < b.right - 1 && identity.right > b.left + 1 && identity.top < b.bottom - 1 && identity.bottom > b.top + 1
        }).map(el => el.className)
        return { overlap, left: identity.left, right: identity.right, width: innerWidth }
      })
      check(`${game} ${width}px portrait clears combat controls and resources`, layout.left >= 0 && layout.right <= width && !layout.overlap.length, layout)
      if (width === 1440 || width === 390) await snapshot(`${game}-${width}`)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('button', { name: 'Pause and settings (P)', exact: true }).click()
    await page.locator('[data-action="hub"]').click(); await ready('hub')
  }
  check('selection and gameplay paths report no browser errors', errors.length === 0, errors)

  const failed = await browser.newPage({ viewport: { width: 900, height: 900 } })
  let release
  const gate = new Promise(resolve => { release = resolve })
  await failed.route('**/caelan-dawnsworn.png*', async route => {
    if (route.request().url().includes('?retry=')) await route.continue()
    else { await gate; await route.fulfill({ status: 503, body: 'QA artwork unavailable' }) }
  })
  await failed.goto(`${base}/?scene=loadout&mute=1`, { waitUntil: 'domcontentloaded' }); await ready('loadout', failed)
  check('slow artwork has a visible loading state', await failed.getByText('Loading artwork…', { exact: true }).isVisible())
  release()
  await failed.getByRole('button', { name: 'Retry artwork', exact: true }).waitFor({ state: 'visible' })
  check('failed artwork preserves a usable champion selection', await failed.getByRole('button', { name: 'Select Nyra', exact: true }).isEnabled() && await failed.getByText('Artwork could not load. Your champion is still selected.', { exact: true }).isVisible())
  await failed.getByRole('button', { name: 'Retry artwork', exact: true }).click(); await artReady(failed)
  check('Retry artwork recovers the original illustration', await failed.locator('.champion-image-state').isHidden())
  await failed.close()
} catch (error) {
  check('champion UI probe completed', false, String(error))
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {})
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2))
  await browser.close()
}
