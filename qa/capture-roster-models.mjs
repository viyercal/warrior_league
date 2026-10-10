import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
const base=process.env.IPL_BASE || 'http://127.0.0.1:5302'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1100,height:1000},deviceScaleFactor:1})
const errors=[],stats=[]
page.on('pageerror',e=>errors.push(String(e)))
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
await mkdir('qa/screens/models',{recursive:true})
try {
 await page.goto(base+'/qa/roster-studio.html');await page.waitForFunction(()=>window.studio?.hero)
 for(const champion of ['caelan','nyra','orren','serai']) for(let skin=0;skin<3;skin++) {
   const info=await page.evaluate(({champion,skin})=>{
     const s=window.studio,h=s.show(champion,skin),box=new s.THREE.Box3().setFromObject(h.hips)
     let triangles=0,meshes=0,valid=true
     h.group.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count || o.geometry.attributes.position.count)/3;for(const attr of Object.values(o.geometry.attributes))if(!attr.array.every(Number.isFinite))valid=false}})
     return {champion,skin:h.skinId,meshes,triangles,valid,bounds:[box.min.toArray(),box.max.toArray()],calls:s.renderer.info.render.calls}
   },{champion,skin})
   stats.push(info)
   await page.evaluate(async()=>{await window.studio.hero.assetsReady;window.studio.render()})
   await page.screenshot({path:`qa/screens/models/${champion}-${skin}.png`})
 }
 await writeFile('qa/screens/models/stats.json',JSON.stringify({stats,errors},null,2))
 console.log(JSON.stringify({stats,errors},null,2))
 if(errors.length||stats.some(s=>!s.valid))process.exitCode=1
} finally {await browser.close()}
