import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'
const out='qa/screens/unified-poses'
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1000,height:1000}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.goto('http://127.0.0.1:5302/qa/roster-studio.html');await page.waitForFunction(()=>window.studio?.hero)
 const stats=[]
 for(const id of ['caelan','nyra']) for(const pose of ['idle','run','cast','dance','ko']) {
  const stat=await page.evaluate(({id,pose})=>{
   const s=window.studio,h=s.show(id,0,{pose,angle:.25,equipmentPose:'stowed'})
   s.camera.position.set(.5,1.7,4.6);s.camera.lookAt(0,1.1,0);s.render()
   const mesh=h.skinMesh,position=mesh.geometry.attributes.position,index=mesh.geometry.index
   const a=new s.THREE.Vector3(),b=new s.THREE.Vector3(),ra=new s.THREE.Vector3(),rb=new s.THREE.Vector3()
   const stretch=[];h.group.updateMatrixWorld(true);h.skeleton.update()
   for(let i=0;i<index.count;i+=39){const ai=index.getX(i),bi=index.getX(i+1);ra.fromBufferAttribute(position,ai);rb.fromBufferAttribute(position,bi);mesh.getVertexPosition(ai,a);mesh.getVertexPosition(bi,b);const length=ra.distanceTo(rb);if(length>.0001)stretch.push(a.distanceTo(b)/length)}
   stretch.sort((a,b)=>a-b)
   return {id,pose,version:h.modelVersion,p99Stretch:stretch[Math.floor(stretch.length*.99)],maxStretch:stretch.at(-1)}
  },{id,pose})
  stats.push(stat)
  await page.screenshot({path:`${out}/${id}-${pose}.png`})
 }
 for(const id of ['caelan','nyra']) {
  await page.evaluate(id=>{const s=window.studio,h=s.show(id,0,{angle:0,equipmentPose:'stowed'});const y=h.hipHeight+h.head.getWorldPosition(new s.THREE.Vector3()).y-h.hipHeight+.12;s.camera.position.set(.05,y+.02,1.05);s.camera.lookAt(0,y,0);s.render()},id)
  await page.screenshot({path:`${out}/${id}-face.png`})
 }
 await fs.writeFile(`${out}/results.json`,JSON.stringify({stats,errors},null,2)+'\n');console.log(JSON.stringify({stats,errors}))
} finally {await browser.close()}
