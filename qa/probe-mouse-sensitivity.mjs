import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
const base=process.env.IPL_BASE||'http://127.0.0.1:5189'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const checks=[],errors=[]
page.on('pageerror',e=>errors.push(String(e)))
const check=(name,ok,detail)=>{checks.push({name,ok,detail});console.log(ok?'PASS':'FAIL',name);assert.ok(ok,name)}
const ready=async scene=>{await page.goto(`${base}/?scene=${scene}&mute=1&dpr=1`);await page.waitForFunction(g=>window.__ipl?.sm.currentName===g&&!window.__ipl.sm._busy,scene,{timeout:90000});await page.locator('#boot').waitFor({state:'detached'})}
try{
 await ready('hub')
 await page.mouse.move(1080,300)
 const scaled=await page.evaluate(()=>{const i=window.__ipl.input;i.setMouseSensitivity(.25);const low=i.cameraMouse.clone(),raw=i.mouse.clone();i.setMouseSensitivity(2);return {ratio:i.cameraMouse.x/low.x,rawUnchanged:raw.equals(i.mouse)}})
 check('sensitivity scales camera input without shifting cursor',scaled.ratio===8&&scaled.rawUnchanged,scaled)
 await page.evaluate(()=>{localStorage.setItem('iwl-session-v1',JSON.stringify({mouseSensitivity:'bogus'}))})
 await ready('hub');check('invalid saved sensitivity defaults safely',await page.evaluate(()=>window.__ipl.input.mouseSensitivity===1))
 await page.evaluate(()=>{localStorage.setItem('iwl-session-v1',JSON.stringify({mouseSensitivity:50}))})
 await ready('hub');check('out-of-range saved sensitivity clamped',await page.evaluate(()=>window.__ipl.input.mouseSensitivity===2))
 await ready('loadout')
 const spins=[]
 for(const v of [.25,2]){
  await page.evaluate(v=>{window.__ipl.input.setMouseSensitivity(v);window.__ipl.engine.setPaused(true,'qa')},v)
  await page.mouse.move(150,400);await page.mouse.down();await page.mouse.move(160,400)
  spins.push(await page.evaluate(()=>{window.__scene.update(.05,1);return window.__scene._spin}))
  await page.mouse.up()
 }
 check('Forge actual drag scales with sensitivity',Math.abs(spins[1]/spins[0]-8)<.01,spins)
 await page.evaluate(()=>window.__ipl.engine.setPaused(false,'qa'))
 await ready('moba');await page.keyboard.press('KeyZ');await page.waitForFunction(()=>window.__scene.phase==='play')
 await page.evaluate(()=>{window.__ipl.engine.setPaused(true,'qa');window.__scene.camLock=false})
 await page.mouse.move(1435,450)
 const pans=await page.evaluate(()=>{const s=window.__scene,i=window.__ipl.input,result=[];for(const v of [.25,2]){i.setMouseSensitivity(v);s.camFocus.set(0,0,0);s._updateCamera(.05);result.push(s.camFocus.x)}return result})
 check('War Rift edge pan scales',Math.abs(pans[1]/pans[0]-8)<.01,pans)
 check('no browser errors',errors.length===0,errors)
}finally{await writeFile('docs/mouse-sensitivity-results.json',JSON.stringify({base,checks,errors},null,2));await browser.close()}
