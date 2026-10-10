import { chromium } from 'playwright-core'
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.IPL_BASE||'http://127.0.0.1:5189'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const checks=[],errors=[];page.on('pageerror',e=>errors.push(String(e)))
const check=(name,ok)=>{checks.push({name,ok});console.log(ok?'PASS':'FAIL',name);assert.ok(ok,name)}
try{
 for(const game of ['arena','siege','hoops']){
  await page.goto(`${base}/?scene=${game}&mute=1&dpr=1`)
  await page.waitForFunction(g=>window.__ipl?.sm.currentName===g&&!window.__ipl.sm._busy,game,{timeout:60000});await page.locator('#boot').waitFor({state:'detached'});await page.keyboard.press('KeyZ')
  await page.waitForFunction(g=>{const s=window.__scene;return g==='arena'?!s.cine.active:g==='hoops'?s.game.phase==='live':s.phase==='play'},game)
  await page.mouse.click(960,420,{button:'right'})
  check(`${game} order exists before blur`,await page.evaluate(()=>window.__scene.clickMove.points.length>0))
  await page.evaluate(()=>dispatchEvent(new Event('blur')))
  check(`${game} blur cancels and pauses`,await page.evaluate(()=>window.__scene.clickMove.points.length===0&&window.__ipl.session.opened))
  await page.keyboard.press('Escape');await page.mouse.click(960,420,{button:'right'})
  await page.keyboard.press('KeyP')
  await page.getByRole('slider',{name:'Mouse sensitivity'}).fill('1.75')
  check(`${game} paused sensitivity applies without movement order`,await page.evaluate(()=>window.__ipl.input.mouseSensitivity===1.75&&window.__scene.clickMove.points.length===0))
  await page.keyboard.press('Escape');await page.mouse.click(960,420,{button:'right'})
  await page.evaluate(()=>window.__scene.debug.lose())
  await page.waitForFunction(()=>!window.__scene.clickMove.marker.visible)
  check(`${game} result cancels destination`,await page.evaluate(()=>window.__scene.clickMove.points.length===0))
 }
 check('no browser errors',errors.length===0)
}finally{await writeFile('docs/mouse-lifecycle-results.json',JSON.stringify({base,checks,errors},null,2));await browser.close()}
