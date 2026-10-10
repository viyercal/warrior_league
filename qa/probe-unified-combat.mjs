import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'
const out='qa/screens/unified-combat',results=[],errors=[]
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const check=(name,ok,detail)=>{results.push({name,ok:Boolean(ok),detail});console.log(ok?'PASS':'FAIL',name);if(!ok)process.exitCode=1}
try {
 for(const id of ['caelan','nyra']) {
  const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage()
  page.on('pageerror',e=>errors.push(String(e)))
  await page.addInitScript(id=>localStorage.setItem('ipl-profile-v2',JSON.stringify({champion:id})),id)
  await page.goto('http://127.0.0.1:5303/?scene=duel&mute=1')
  await page.waitForFunction(()=>window.__ipl?.sm.currentName==='duel'&&!window.__ipl.sm._busy);await page.locator('#boot').waitFor({state:'detached'})
  await page.keyboard.press('KeyZ');await page.waitForFunction(()=>window.__scene.phase==='fight')
  await page.keyboard.down('ShiftLeft');await page.waitForTimeout(220)
  const block=await page.evaluate(()=>{
   const f=window.__scene.player,h=f.hero
   return {blocking:f.blocking,valid:['L','R'].every(key=>Math.abs(h.arms[key].pivot.rotation.z-((key==='L'?-1:1)*.38+h.armRestOffset[key]))<.001)}
  })
  check(`${id} real block input preserves the authored arm pose`,block.blocking&&block.valid,block)
  await page.screenshot({path:`${out}/${id}-block.png`});await page.keyboard.up('ShiftLeft')
  for(const game of ['duel','brawl']) {
   if(game==='brawl') {
    await page.evaluate(()=>window.__ipl.sm.goTo('brawl'))
    await page.waitForFunction(()=>window.__ipl.sm.currentName==='brawl'&&!window.__ipl.sm._busy)
    await page.keyboard.press('KeyZ');await page.waitForFunction(()=>window.__scene.phase==='fight')
   }
   await page.evaluate(()=>{
    window.__attacks=[]
    window.__unobserve=window.__ipl.engine.addTicker(()=>{
     const f=window.__scene.player
     if(f.attack)window.__attacks.push({kind:f.attack.kind,z:f.hero.arms.R.pivot.rotation.z})
    })
   })
   await page.keyboard.press('KeyJ');await page.waitForTimeout(350)
   await page.keyboard.press('KeyK');await page.waitForTimeout(650)
   const attack=await page.evaluate(()=>{window.__unobserve();return {samples:window.__attacks.length,kinds:[...new Set(window.__attacks.map(a=>a.kind))],maxZ:Math.max(...window.__attacks.map(a=>a.z))}})
   check(`${id} ${game} light/heavy inputs animate without resetting the arm rest pose`,attack.samples>0&&attack.kinds.length>=2&&attack.maxZ<.02,attack)
  }
  await page.evaluate(()=>window.__ipl.sm.goTo('kart'))
  await page.waitForFunction(()=>window.__ipl.sm.currentName==='kart'&&!window.__ipl.sm._busy)
  await page.keyboard.press('KeyZ');await page.waitForFunction(()=>window.__scene.state==='race')
  await page.keyboard.down('ArrowUp');await page.keyboard.down('ArrowRight');await page.waitForTimeout(350)
  const driver=await page.evaluate(()=>{const h=window.__scene.player.visual.hero;return ['L','R'].every(key=>Math.abs(h.arms[key].pivot.rotation.z-((key==='L'?-1:1)*-.14+h.armRestOffset[key]))<.001)})
  check(`${id} accelerating and steering preserves the driving pose`,driver)
  await page.keyboard.up('ArrowUp');await page.keyboard.up('ArrowRight')
  await context.close()
 }
 check('No browser errors',errors.length===0,errors)
} finally {await fs.writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2)+'\n');await browser.close()}
