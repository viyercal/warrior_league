import { chromium } from 'playwright-core'
import { writeFile, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.IPL_BASE||'http://127.0.0.1:5190'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const checks=[],errors=[]
page.on('pageerror',e=>errors.push(String(e)))
const check=(name,ok,detail)=>{checks.push({name,ok,detail});console.log(ok?'PASS':'FAIL',name,detail||'');assert.ok(ok,name)}
const sim=async seconds=>{const t=await page.evaluate(()=>window.__ipl.engine.elapsedTime);await page.waitForFunction(({t,seconds})=>window.__ipl.engine.elapsedTime>=t+seconds,{t,seconds},{timeout:20000})}
const clickX=async(x,y=1)=>{const pt=await page.evaluate(({x,y})=>{const s=window.__scene,p=s.player.pos.clone().set(x,y,0).project(s.camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2}},{x,y});await page.mouse.click(pt.x,pt.y,{button:'right'})}
const target=()=>page.evaluate(()=>window.__scene.moveTargetX)
await mkdir('qa/screens/duel-mouse',{recursive:true})
try{
for(const mode of ['tower','single']){
 await page.goto(`${base}/?scene=duel&mode=${mode}&mute=1&dpr=1`)
 await page.waitForFunction(()=>window.__ipl?.sm.currentName==='duel'&&!window.__ipl.sm._busy,{},{timeout:90000});await page.locator('#boot').waitFor({state:'detached'})
 await page.mouse.click(650,400,{button:'right'})
 check(`${mode} intro click creates no movement order`,await target()===null)
 await page.waitForFunction(()=>window.__scene.phase==='fight',{},{timeout:20000})
 // Deterministic opponent fixture isolates navigation from attacks and knockback.
 await page.evaluate(()=>{const s=window.__scene;s.ai.update=()=>s._zero;s.player.resetRound(-4.2);s.foe.resetRound(4.2);s.roundT=300})
 await sim(.4)
 await clickX(-1.5,1.6)
 check(`${mode} side-view click maps to world x`,Math.abs(await target()+1.5)<.05)
 check(`${mode} destination visible`,await page.evaluate(()=>window.__scene.moveMarker.visible))
 await page.waitForFunction(()=>window.__scene.moveTargetX===null)
 await sim(.4)
 const arrived=await page.evaluate(()=>window.__scene.player.pos.x)
 check(`${mode} arrives without oscillation`,Math.abs(arrived+1.5)<.25,arrived)
 await clickX(-4,0.3);await page.waitForFunction(()=>window.__scene.moveTargetX===null);await sim(.4)
 check(`${mode} retreat works`,await page.evaluate(()=>Math.abs(window.__scene.player.pos.x+4)<.25))
 await clickX(1);await page.keyboard.down('ArrowLeft');check(`${mode} keyboard takeover`,await target()===null);await page.keyboard.up('ArrowLeft')
 for(const key of ['KeyJ','KeyK','KeyF','KeyQ','Space','ShiftLeft','KeyS']){
  await clickX(-1);await page.keyboard.press(key);check(`${mode} ${key} cancels mouse order`,await target()===null);await sim(.8)
 }
 await clickX(-1);await page.keyboard.press('KeyP');check(`${mode} pause clears order`,await target()===null);await page.keyboard.press('Escape')
 await clickX(-1);await page.evaluate(()=>dispatchEvent(new Event('blur')));check(`${mode} blur clears order`,await target()===null);await page.keyboard.press('Escape')
 await page.evaluate(()=>{const s=window.__scene;s.player.resetRound(-3);s.foe.resetRound(1);s._cancelMouseMove()});await sim(.3)
 await clickX(3);check(`${mode} opponent clips destination`,Math.abs(await target()-.05)<.05)
 await page.waitForFunction(()=>window.__scene.moveTargetX===null);await sim(.4)
 check(`${mode} does not walk through opponent`,await page.evaluate(()=>window.__scene.player.pos.x<window.__scene.foe.pos.x-.7))
 await clickX(-3);await page.keyboard.press('KeyH');await page.evaluate(()=>window.__ipl.engine.setPaused(true,'qa'));const beforeUi=await target();await page.locator('.hint-box').click({button:'right'});check(`${mode} UI click does not change target`,await target()===beforeUi);await page.evaluate(()=>window.__ipl.engine.setPaused(false,'qa'))
 check(`${mode} help advertises mouse`,(await page.locator('.hint-box').innerText()).includes('Click to move'))
 for(const [width,height] of [[1440,900],[900,800],[390,844]]){await page.setViewportSize({width,height});await page.screenshot({path:`qa/screens/duel-mouse/${mode}-help-${width}.png`});check(`${mode} help fits ${width}`,await page.locator('.hint-box').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}))}
 await page.setViewportSize({width:1440,height:900});await page.keyboard.press('KeyH')
 await clickX(-3);await page.evaluate(()=>window.__scene.debug.winRound());check(`${mode} round end clears order`,await target()===null)
 await page.mouse.click(700,350,{button:'right'});check(`${mode} non-fight click ignored`,await target()===null)
 await page.evaluate(()=>window.__scene.debug.lose());check(`${mode} result clears marker`,await page.evaluate(()=>!window.__scene.moveMarker.visible))
}
check('no browser errors',errors.length===0,errors)
}finally{await writeFile('docs/duel-mouse-results.json',JSON.stringify({base,checks,errors},null,2));await browser.close()}
