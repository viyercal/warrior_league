import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = process.env.IPL_BASE || 'http://127.0.0.1:5188'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = [], checks = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); assert.ok(ok, name) }
const ready = async game => {
  await page.goto(`${base}/?scene=${game}&mute=1&dpr=1`)
  await page.waitForFunction(g => window.__ipl?.sm.currentName === g && !window.__ipl.sm._busy, game, { timeout: 60000 })
  await page.locator('#boot').waitFor({ state: 'detached' })
}
const sim = async time => { const start = await page.evaluate(() => window.__ipl.engine.elapsedTime); await page.waitForFunction(({start,time}) => window.__ipl.engine.elapsedTime >= start + time, {start,time}, { timeout: 20000 }) }
const pos = () => page.evaluate(() => {const s=window.__scene,p=s.hero?.group.position || s.game.player.hero.group.position;return {x:p.x,z:p.z}})
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z)
const clickGround = async (dx,dz) => {
  const xy = await page.evaluate(({dx,dz}) => { const s=window.__scene,p=(s.hero?.group.position||s.game.player.hero.group.position).clone();p.x+=dx;p.z+=dz;p.y=0;p.project(s.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2}}, {dx,dz})
  await page.mouse.click(xy.x,xy.y,{button:'right'})
}
await mkdir('qa/screens/mouse', { recursive: true })
try {
  await ready('hub')
  await page.keyboard.press('Escape')
  const slider = page.getByRole('slider', {name:'Mouse sensitivity'})
  check('default sensitivity',await slider.inputValue()==='1')
  await slider.focus(); await page.keyboard.press('Home'); check('minimum through keyboard',await slider.inputValue()==='0.25')
  await page.keyboard.press('End'); check('maximum through keyboard',await slider.inputValue()==='2')
  await slider.fill('0.5')
  check('runtime applied',await page.evaluate(()=>window.__ipl.input.mouseSensitivity===0.5))
  await page.reload(); await page.waitForFunction(()=>window.__ipl?.sm.currentName==='hub'&&!window.__ipl.sm._busy); await page.locator('#boot').waitFor({state:'detached'}); await page.keyboard.press('Escape')
  check('saved across reload',await slider.inputValue()==='0.5')
  for(const [width,height] of [[1440,900],[900,800],[390,844]]) {
    await page.setViewportSize({width,height})
    await slider.fill('1.5')
    await slider.scrollIntoViewIfNeeded()
    check(`sensitivity fits ${width}`,await slider.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.width>70}))
    await page.screenshot({path:`qa/screens/mouse/settings-${width}.png`,fullPage:true})
    await page.getByRole('button',{name:'Reset mouse sensitivity'}).click()
    check(`reset ${width}`,await slider.inputValue()==='1')
  }
  await page.setViewportSize({width:1440,height:900})
  await page.getByRole('button',{name:'Return to the Convergence'}).click()
  for(const game of ['arena','siege','hoops','moba']) {
    await ready(game); await page.keyboard.press('KeyZ')
    await page.waitForFunction(g=>{const s=window.__scene;return g==='arena'?!s.cine.active:g==='hoops'?s.game.phase==='live':s.phase==='play'},game,{timeout:30000})
    await sim(0.3)
    const start=await pos();await clickGround(3,0)
    const order=await page.evaluate(()=>{const s=window.__scene;return s.clickMove?.points.at(-1)?.toArray()||s.moveTarget?.toArray()})
    check(`${game} right-click orders movement`,Boolean(order),order)
    await sim(0.6); const moved=await pos(); check(`${game} moves toward destination`,distance(start,moved)>.5)
    if(game!=='moba') {
      await sim(1);check(`${game} arrives and clears marker`,await page.evaluate(()=>!window.__scene.clickMove.marker.visible))
      await clickGround(-4,0);await page.keyboard.press('ArrowUp');check(`${game} keyboard cancels order`,await page.evaluate(()=>window.__scene.clickMove.points.length===0))
      await clickGround(4,0);await page.keyboard.press('KeyP');check(`${game} pause cancels order`,await page.evaluate(()=>window.__scene.clickMove.points.length===0&&window.__ipl.input.blocked));await page.keyboard.press('Escape')
      await page.keyboard.press('KeyH');check(`${game} help includes mouse movement`,await page.locator('.hint-box').innerText().then(s=>s.includes('Click to move')));await page.keyboard.press('KeyH')
      await clickGround(3,0)
      await page.screenshot({path:`qa/screens/mouse/${game}-move.png`})
    }
    if(game==='arena'||game==='siege') {
      await page.mouse.move(1000,430); await sim(.1)
      check(`${game} aim follows cursor`,await page.evaluate(()=>{const s=window.__scene,p=s.aim.clone();window.__ipl.input.groundPoint(s.camera,0,p);return p.distanceTo(s.aim)<1}))
      await page.mouse.down();await sim(.12);await page.mouse.up()
      check(`${game} left-click still fires`,await page.evaluate(()=>window.__scene.fireT>0))
    }
  }
  // Physics navigation regression: crossing the citadel takes a clear detour.
  await ready('siege'); await page.keyboard.press('KeyZ'); await sim(.2)
  const route = await page.evaluate(()=>{const s=window.__scene,start=s.hero.group.position.clone().set(-12,0,21),target=start.clone().set(12,0,21);s.hero.group.position.copy(start);s.clickMove.points=s.clickMove.route(start,target);const path=s.clickMove.points.map(p=>p.toArray());let min=Infinity;for(let i=0;i<2000&&s.clickMove.points.length;i++){const v=start.clone(),d=s.clickMove.direction(v);s.hero.group.position.addScaledVector(v,Math.min(d,0.08));min=Math.min(min,Math.hypot(s.hero.group.position.x,s.hero.group.position.z-21))}return {path,min,remaining:s.clickMove.points.length,error:s.hero.group.position.distanceTo(target)}})
  check('citadel route goes around collision and arrives',route.path.length>1&&route.min>=8.5&&route.remaining===0&&route.error<.2,route)
  check('no browser errors',errors.length===0,errors)
} finally {
  await writeFile('docs/mouse-controls-results.json',JSON.stringify({base,checks,errors},null,2))
  await browser.close()
}
