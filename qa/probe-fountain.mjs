import { chromium } from 'playwright-core'
import { writeFile, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.IPL_BASE||'http://127.0.0.1:5190'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const checks=[],errors=[];page.on('pageerror',e=>errors.push(String(e)))
const check=(name,ok,detail)=>{checks.push({name,ok,detail});console.log(ok?'PASS':'FAIL',name,detail||'');assert.ok(ok,name)}
const sim=async seconds=>{const t=await page.evaluate(()=>window.__ipl.engine.elapsedTime);await page.waitForFunction(({t,seconds})=>window.__ipl.engine.elapsedTime>=t+seconds,{t,seconds},{timeout:20000})}
const hurtOutside=()=>page.evaluate(()=>{const s=window.__scene;s.cancelOrders();s.heroK.set(0,0,0);s.hero.group.position.set(-40.5,0,0);s.hp=20;s._inFountain=false;s.camFocus.copy(s.hero.group.position);s._updateCamera(1)})
await mkdir('qa/screens/fountain',{recursive:true})
try{
 await page.goto(`${base}/?scene=moba&mute=1&dpr=1`)
 await page.waitForFunction(()=>window.__ipl?.sm.currentName==='moba'&&!window.__ipl.sm._busy,{},{timeout:90000});await page.locator('#boot').waitFor({state:'detached'});await page.keyboard.press('KeyZ');await page.waitForFunction(()=>window.__scene.phase==='play')
 await hurtOutside();await sim(.15)
 check('outside fountain retains damage',await page.evaluate(()=>window.__scene.hp<25))
 await page.keyboard.down('ArrowLeft');await page.waitForFunction(()=>window.__scene.hp===window.__scene.maxHp);await page.keyboard.up('ArrowLeft')
 check('walking into allied fountain restores full health immediately',await page.evaluate(()=>window.__scene.hp===window.__scene.maxHp&&window.__scene._inFountain))
 await hurtOutside()
 const xy=await page.evaluate(()=>{const s=window.__scene,p=s.hero.group.position.clone().set(-43,0,0).project(s.camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2}})
 await page.mouse.click(xy.x,xy.y,{button:'right'});await page.waitForFunction(()=>window.__scene.hp===window.__scene.maxHp)
 check('click-to-move into fountain restores health',true)
 // Isolate the restoration rule from unrelated enemy damage and passive regen.
 const cases=await page.evaluate(()=>{const s=window.__scene,oldHp=s.maxHp;s.ctx.engine.setPaused(true,'qa');const results=[];for(const c of [{name:'outside radial boundary',x:-41.2,z:0,want:20},{name:'inside radial boundary',x:-41.3,z:0,want:100},{name:'outside side boundary',x:-48,z:6.8,want:20},{name:'inside side boundary',x:-48,z:6.7,want:100},{name:'enemy fountain',x:48,z:0,want:20},{name:'dead in allied fountain',x:-48,z:0,dead:true,want:0},{name:'match ended',x:-48,z:0,over:'won',want:20},{name:'levelled max health',x:-42.5,z:0,max:175,want:175}]){s.hero.group.position.set(c.x,0,c.z);s.maxHp=c.max||100;s.hp=c.dead?0:20;s.playerDead=!!c.dead;s.over=c.over||null;s._restoreAtFountain();results.push({name:c.name,hp:s.hp,want:c.want})}s.maxHp=oldHp;s.playerDead=false;s.over=null;return results})
 for(const c of cases)check(c.name,c.hp===c.want,c)
 await page.evaluate(()=>{const s=window.__scene;s.hp=30;s._restoreAtFountain()});check('remaining in fountain restores damage',await page.evaluate(()=>window.__scene.hp===window.__scene.maxHp))
 await page.evaluate(()=>{window.__ipl.engine.setPaused(false,'qa');window.__scene.camFocus.copy(window.__scene.hero.group.position)})
 await sim(.2)
 await page.keyboard.press('KeyH');check('help explains fountain',(await page.locator('.hint-box').innerText()).includes('Return home for full health'))
 for(const [width,height] of [[1440,900],[900,800],[390,844]]){await page.setViewportSize({width,height});await page.screenshot({path:`qa/screens/fountain/help-${width}.png`});check(`help fits ${width}`,await page.locator('.hint-box').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}))}
 check('no browser errors',errors.length===0,errors)
}finally{await writeFile('docs/fountain-results.json',JSON.stringify({base,checks,errors},null,2));await browser.close()}
