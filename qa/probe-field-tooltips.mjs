import { chromium } from 'playwright-core'
import { mkdir,writeFile } from 'node:fs/promises'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const base=process.env.IPL_BASE||'http://127.0.0.1:5299',results=[],errors=[]
const check=(name,ok)=>{results.push({name,ok});console.log(ok?'PASS':'FAIL',name);if(!ok)process.exitCode=1}
page.on('pageerror',e=>errors.push(String(e)))
await mkdir('qa/screens/field',{recursive:true})
try{
 for(const game of ['duel','brawl','moba','arena','siege','hoops','kart']){
  await page.setViewportSize({width:1440,height:900})
  await page.goto(`${base}/?scene=${game}&mute=1`)
  await page.waitForFunction(n=>window.__ipl?.sm.currentName===n&&!window.__ipl.sm._busy,game,{timeout:60000})
  await page.locator('#boot').waitFor({state:'detached'})
  check(`${game} cinematic controls are hidden`,!await page.locator('.battle-help-toggle').isVisible()&&await page.locator('.ability-bar').evaluate(el=>getComputedStyle(el).visibility==='hidden'&&getComputedStyle(el).pointerEvents==='none'))
  await page.keyboard.press('KeyZ')
  await page.locator('.battle-help-toggle').waitFor({state:'visible',timeout:15000})
  await page.evaluate(()=>window.__ipl.engine.setPaused(true,'qa-capture'))
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900})
   for(let i=0;i<4;i++){
    await page.locator('.ability-slot').nth(i).hover()
    await page.waitForTimeout(200)
    const tip=await page.locator('.ability-tip').nth(i).evaluate(el=>{
     const r=el.getBoundingClientRect();return {visible:Number(getComputedStyle(el).opacity)>.9,fits:r.x>=0&&r.right<=innerWidth&&r.y>=0,text:el.textContent}
    })
    check(`${game} ${width}px art ${i+1} tooltip is readable`,tip.visible&&tip.fits&&tip.text.includes('cooldown'))
   }
   await page.screenshot({path:`qa/screens/field/${game}-${width}-tooltip.png`})
  }
 }
 check('tooltip checks have no page errors',errors.length===0)
}catch(e){check('tooltip probe completed',false);console.error(e)}
finally{await writeFile('qa/screens/field/tooltip-checks.json',JSON.stringify({results,errors},null,2));await browser.close()}
