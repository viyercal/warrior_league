import { chromium } from 'playwright-core'
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.IPL_BASE
if(!base)throw new Error('Set IPL_BASE to the public play URL')
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const errors=[],failed=[],checks=[]
page.on('pageerror',e=>errors.push(String(e)))
page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()})})
const check=(name,ok)=>{checks.push({name,ok});console.log(ok?'PASS':'FAIL',name);assert.ok(ok,name)}
try{
 await page.goto(base,{timeout:90000})
 const enter=page.locator('#bootEnter')
 await page.waitForFunction(()=>window.__ipl?.sm.currentName==='hub'&&!window.__ipl.sm._busy,{},{timeout:120000})
 await enter.click();await page.locator('#boot').waitFor({state:'detached'})
 check('public normal boot and entry',await page.evaluate(()=>!window.__ipl.input.blocked))
 await page.keyboard.press('Escape')
 await page.getByRole('slider',{name:'Mouse sensitivity'}).fill('0.75')
 check('public settings work',await page.evaluate(()=>window.__ipl.input.mouseSensitivity===.75))
 await page.keyboard.press('Escape')
 await page.goto(`${base}/?scene=arena&mute=1&dpr=1`,{timeout:90000})
 await page.waitForFunction(()=>window.__ipl?.sm.currentName==='arena'&&!window.__ipl.sm._busy,{},{timeout:120000})
 await page.locator('#boot').waitFor({state:'detached'});await page.keyboard.press('KeyZ')
 await page.waitForFunction(()=>!window.__scene.cine.active)
 const start=await page.evaluate(()=>({x:window.__scene.hero.group.position.x,z:window.__scene.hero.group.position.z}))
 await page.mouse.click(900,450,{button:'right'})
 await page.waitForFunction(p=>Math.hypot(window.__scene.hero.group.position.x-p.x,window.__scene.hero.group.position.z-p.z)>.5,start,{timeout:20000})
 check('public mouse movement works',true)
 await page.screenshot({path:'qa/screens/mouse/public-game.png'})
 check('no failed assets',failed.length===0);check('no browser errors',errors.length===0)
}finally{await writeFile('docs/public-game-results.json',JSON.stringify({base,checks,errors,failed},null,2));await browser.close()}
