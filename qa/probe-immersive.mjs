import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
const BASE = process.env.IPL_BASE || 'http://127.0.0.1:5299'
await mkdir('qa/screens/immersive', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
const results = []
const check = (name, ok, detail) => { console.log(ok ? 'PASS' : 'FAIL', name, detail ?? ''); results.push({name, ok, detail}); if (!ok) process.exitCode = 1 }
const scene = async name => page.waitForFunction(n => window.__ipl?.sm.currentName === n && !window.__ipl.sm._busy, name, {timeout:60000})
try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.locator('#bootEnter.ready').waitFor({ timeout: 60000 })
  check('boot blocks background input', await page.evaluate(() => window.__ipl.input.blocked && document.getElementById('ui').inert))
  await page.keyboard.press('Tab')
  check('boot keeps keyboard focus', await page.locator('#bootEnter').evaluate(el => el===document.activeElement))
  await page.locator('#bootEnter').click()
  await page.locator('#boot').waitFor({ state:'detached' })
  await scene('hub')
  await page.waitForTimeout(1600)
  await page.screenshot({ path:'qa/screens/immersive/hub-desktop.png' })
  check('boot loads actual hub before entry', await page.locator('.realm-title').isVisible())
  check('deferred audio starts music and ambience', await page.evaluate(() => window.__ipl.audio._timer != null && window.__ipl.audio._amb.size > 0))
  console.log('HUB', await page.evaluate(() => ({fps:window.__ipl.engine.fps,dpr:window.__ipl.engine.dprScale})))
  const games = ['duel','moba','arena','kart','brawl','siege','hoops']
  for (const game of games) {
    await page.locator(`[data-realm="${game}"]`).click()
    check(`${game} selection`, await page.locator(`[data-realm="${game}"]`).getAttribute('aria-pressed') === 'true')
  }
  await page.locator('[data-realm="duel"]').click()
  await page.getByRole('button',{name:'How to play',exact:true}).click()
  check('guide expands', await page.locator('.realm-guide').isVisible())
  await page.getByRole('button',{name:'Hide controls',exact:true}).click()
  check('guide collapses', !(await page.locator('.realm-guide').isVisible()))
  await page.getByRole('button',{name:'Settings',exact:true}).click()
  check('hub settings opens', await page.locator('.session-overlay').isVisible())
  for(const q of ['performance','high','auto']) {
    await page.locator('#session-quality').selectOption(q)
    check(`quality ${q}`, await page.evaluate(q => window.__ipl.engine.quality === q,q))
  }
  for (const action of ['sound','motion']) {
    const toggle=page.locator(`[data-action="${action}"]`)
    const original=await toggle.getAttribute('aria-pressed')
    await toggle.click()
    check(`${action} toggle`, await toggle.getAttribute('aria-pressed') !== original)
    await toggle.click()
  }
  await page.screenshot({ path:'qa/screens/immersive/settings.png' })
  await page.keyboard.press('Escape')
  check('Escape closes settings', !(await page.locator('.session-overlay').isVisible()))
  await page.getByRole('button',{name:'Prepare loadout',exact:true}).click()
  await scene('loadout')
  await page.getByRole('textbox',{name:'War name'}).fill('ASTRA')
  check('war name persists', await page.evaluate(() => window.__ipl.sm.profile.name === 'ASTRA'))
  const swatches = page.locator('.loadout-swatch')
  const swatchCount=await swatches.count()
  for(let i=0;i<swatchCount;i++) { await swatches.nth(i).click(); if(await swatches.nth(i).getAttribute('aria-pressed') !== 'true') throw Error('Swatch '+i) }
  check('all paint / armor swatches update',true,swatchCount)
  const segments=page.locator('.loadout-seg-btn')
  const segmentCount=await segments.count()
  for(let i=0;i<segmentCount;i++) { await segments.nth(i).click(); if(await segments.nth(i).getAttribute('aria-pressed') !== 'true') throw Error('Segment '+i) }
  check('all appearance options update',true,segmentCount)
  const slots=page.locator('.loadout-slot')
  for(let i=0;i<4;i++) { await slots.nth(i).click(); if(await slots.nth(i).getAttribute('aria-pressed') !== 'true') throw Error('Slot '+i) }
  const skills=page.locator('.loadout-skill')
  for(let i=0;i<12;i++) { await skills.nth(i).click(); if(await skills.nth(i).getAttribute('aria-pressed') !== 'true') throw Error('Skill '+i) }
  check('all four slots and twelve arts usable',true)
  await page.locator('.loadout-dance').click()
  check('dance toggle', await page.locator('.loadout-dance').getAttribute('aria-pressed') === 'true')
  await page.locator('.loadout-dance').click()
  await page.screenshot({path:'qa/screens/immersive/forge.png'})
  await page.setViewportSize({width:390,height:844})
  await page.screenshot({path:'qa/screens/immersive/forge-mobile.png'})
  check('mobile forge exposes art description', await page.locator('.loadout-art-detail').textContent().then(t=>t.includes('cooldown')))
  await page.setViewportSize({width:1440,height:900})
  await page.locator('.loadout-back').click()
  await scene('hub')
  // Reset only this isolated test browser's profile through UI for familiar game controls.
  await page.evaluate(() => { localStorage.removeItem('ipl-profile-v2') })
  await page.reload()
  await page.locator('#bootEnter.ready').waitFor({timeout:60000})
  await page.locator('#bootEnter').click()
  await page.locator('#boot').waitFor({state:'detached'})
  for(const game of games) {
    await page.locator(`[data-realm="${game}"]`).click()
    await page.getByRole('button',{name:'ENTER BATTLE',exact:true}).click()
    await scene(game)
    await page.waitForTimeout(1500)
    await page.keyboard.press('p')
    check(`${game} pause via P`, await page.locator('.session-overlay').isVisible())
    const t=await page.evaluate(() => window.__ipl.engine.elapsedTime)
    await page.waitForTimeout(600)
    check(`${game} simulation freezes`, await page.evaluate(t => window.__ipl.engine.elapsedTime===t,t))
    await page.getByRole('button',{name:'Return to battle',exact:false}).click()
    await page.waitForTimeout(400)
    check(`${game} resume updates`, await page.evaluate(t => window.__ipl.engine.elapsedTime>t && document.activeElement===window.__ipl.engine.renderer.domElement,t))
    // Exercise actual movement/attack inputs once intros/cinematics have completed.
    await page.waitForTimeout(5500)
    await page.keyboard.down(game==='moba'?'KeyQ':game==='kart'?'KeyW':'KeyD')
    await page.waitForTimeout(300)
    await page.keyboard.up(game==='moba'?'KeyQ':game==='kart'?'KeyW':'KeyD')
    if (['arena','siege'].includes(game)) { await page.mouse.move(900,400); await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.up() }
    else await page.keyboard.press(game==='hoops'?'Space':game==='kart'?'Digit1':'KeyJ')
    await page.screenshot({path:`qa/screens/immersive/game-${game}.png`})
    await page.getByRole('button',{name:'Pause and settings (P)',exact:true}).click()
    check(`${game} visible pause control`, await page.locator('.session-overlay').isVisible())
    if (game==='duel') {
      await page.locator('[data-action="restart"]').click()
      await scene(game)
      await page.keyboard.press('Escape')
      check('restart returns to the same realm', await page.locator('.session-overlay').isVisible())
    }
    await page.locator('[data-action="hub"]').click()
    await scene('hub')
    check(`${game} return to hub`, await page.locator('.realm-hub').isVisible())
  }
  await page.locator('[data-realm="duel"]').click()
  await page.locator('[data-realm="duel"]').press('ArrowRight')
  await page.locator('[data-realm="moba"]').press('Enter')
  await scene('moba')
  check('card arrows and Enter start selected realm', true)
  await page.keyboard.press('Escape')
  await page.locator('[data-action="hub"]').click()
  await scene('hub')
  await page.locator('[data-realm="duel"]').click()
  for (const [width,height] of [[900,800],[390,844]]) {
    await page.setViewportSize({width,height})
    await page.waitForTimeout(500)
    await page.screenshot({path:`qa/screens/immersive/hub-${width}.png`,fullPage:true})
    check(`hub ${width}px has no horizontal overflow`,await page.evaluate(()=>document.querySelector('.realm-hub').scrollWidth<=innerWidth))
    await page.getByRole('button',{name:'Select Blood Court',exact:true}).click()
    check(`realm selection at ${width}px`, await page.locator('[data-realm="hoops"]').getAttribute('aria-pressed')==='true')
    await page.getByRole('button',{name:'Settings',exact:true}).click()
    await page.screenshot({path:`qa/screens/immersive/settings-${width}.png`})
    await page.keyboard.press('Escape')
  }
  check('no browser errors',errors.length===0,errors)
} catch(e) { check('probe completed',false,String(e)); console.error(e); await page.screenshot({path:'qa/screens/immersive/failure.png'}).catch(()=>{}) }
finally { await writeFile('qa/screens/immersive/results.json',JSON.stringify({results,errors},null,2)); await browser.close() }
