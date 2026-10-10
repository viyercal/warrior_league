import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'
const id=process.argv[2]||'caelan-dawnsworn'
const output=`qa/screens/textured-${id}`
await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1000,height:1000},deviceScaleFactor:1})
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.goto('http://127.0.0.1:5302/qa/asset-studio.html')
 await page.waitForFunction(()=>window.assetStudio)
 const bounds=await page.evaluate(id=>window.assetStudio.load(`/tools/character-assets/generated/${id}/character.glb`),id)
 for(const [name,angle] of [['front',0],['side',Math.PI/2],['back',Math.PI],['three-quarter',.5]]) {
  await page.evaluate(angle=>{window.assetStudio.root.rotation.y=angle;window.assetStudio.render()},angle)
  await page.screenshot({path:`${output}/${name}.png`})
 }
 await fs.writeFile(`${output}/inspection.json`,JSON.stringify({id,bounds,errors},null,2)+'\n')
 console.log(JSON.stringify({id,bounds,errors}))
} finally { await browser.close() }
