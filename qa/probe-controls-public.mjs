import { chromium } from 'playwright-core'
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.IPL_BASE
if(!base)throw new Error('Set IPL_BASE to the shared game URL')
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const checks=[],errors=[],failed=[]
page.on('pageerror',e=>errors.push(String(e)))
page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()})})
const check=(name,ok)=>{checks.push({name,ok});console.log(ok?'PASS':'FAIL',name);assert.ok(ok,name)}
try{
 for(const game of ['duel','moba']){
  await page.goto(`${base}/?scene=${game}&mode=single&mute=1&dpr=1`,{timeout:90000})
  await page.waitForFunction(g=>window.__ipl?.sm.currentName===g&&!window.__ipl.sm._busy,game,{timeout:120000});await page.locator('#boot').waitFor({state:'detached'});await page.keyboard.press('KeyZ')
  await page.waitForFunction(g=>window.__scene.phase===(g==='duel'?'fight':'play'),game,{timeout:30000})
  if(game==='duel'){
   const start=await page.evaluate(()=>window.__scene.player.pos.x)
   const xy=await page.evaluate(()=>{const s=window.__scene,p=s.player.pos.clone().set(s.player.pos.x-2,1,0).project(s.camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2}})
   await page.mouse.click(xy.x,xy.y,{button:'right'})
   await page.waitForFunction(start=>window.__scene.player.pos.x<start-.5,start,{timeout:15000})
   check('public Crucible right-click retreat',true)
  }else{
   await page.evaluate(()=>{const s=window.__scene;s.hero.group.position.set(-40.5,0,0);s.hp=20})
   await page.keyboard.down('ArrowLeft');await page.waitForFunction(()=>window.__scene.hp===window.__scene.maxHp,{},{timeout:15000});await page.keyboard.up('ArrowLeft')
   check('public fountain restores full health on walking entry',true)
  }
 }
 check('no failed assets',failed.length===0);check('no browser errors',errors.length===0)
}finally{await writeFile('docs/controls-public-results.json',JSON.stringify({base,checks,errors,failed},null,2));await browser.close()}
