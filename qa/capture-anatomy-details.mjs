import {chromium} from 'playwright-core'
import {mkdir} from 'node:fs/promises'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1000,height:1000},deviceScaleFactor:1})
await mkdir('qa/screens/anatomy-details',{recursive:true})
try {
 await page.goto((process.env.IPL_BASE||'http://127.0.0.1:5302')+'/qa/roster-studio.html');await page.waitForFunction(()=>window.studio?.hero)
 for(const id of ['caelan','nyra','orren','serai'])for(const angle of [0,1.3,3.14]) {
  await page.evaluate(async({id,angle})=>{
   const s=window.studio,h=s.show(id,0,{angle});await h.assetsReady
   const head=h.head.getWorldPosition(new s.THREE.Vector3())
   s.camera.position.set(0,head.y+.10,1.22);s.camera.lookAt(0,head.y+.035,0)
   s.render()
  },{id,angle})
  await page.screenshot({path:`qa/screens/anatomy-details/${id}-${angle}.png`})
 }
}finally{await browser.close()}
