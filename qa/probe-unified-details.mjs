import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'
const browser=await chromium.launch({channel:'chrome',headless:true})
const results=[],errors=[],out='qa/screens/unified-details'
await fs.mkdir(out,{recursive:true})
const check=(name,ok,detail)=>{results.push({name,ok:Boolean(ok),detail});if(!ok)process.exitCode=1;console.log(ok?'PASS':'FAIL',name)}
try {
 const page=await browser.newPage({viewport:{width:1200,height:950}})
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.goto('http://127.0.0.1:5302/qa/roster-studio.html');await page.waitForFunction(()=>window.studio?.hero)
 for(const id of ['caelan','nyra']) {
  const tint=await page.evaluate(id=>{
   const s=window.studio,h=s.show(id,0,{angle:0,equipmentPose:'stowed'})
   s.camera.position.set(0,1.7,3.8);s.camera.lookAt(0,1.05,0)
   const canvas=document.createElement('canvas');canvas.width=innerWidth;canvas.height=innerHeight
   const context=canvas.getContext('2d')
   const sample=(height)=>{
    s.render();context.drawImage(s.renderer.domElement,0,0)
    const p=new s.THREE.Vector3(0,height,.12).project(s.camera),x=Math.round((p.x*.5+.5)*innerWidth),y=Math.round((-p.y*.5+.5)*innerHeight)
    const a=context.getImageData(x-6,y-6,12,12).data
    let sum=0;for(let i=0;i<a.length;i+=4)sum+=a[i]+a[i+1]+a[i+2]
    return sum/(a.length/4)
   }
   const faceHeight=id==='caelan'?1.84:1.65
   const before={face:sample(faceHeight),body:sample(id==='caelan'?1.43:1.3)}
   h.mats.primary.color.multiplyScalar(.3)
   const after={face:sample(faceHeight),body:sample(id==='caelan'?1.43:1.3)}
   return {before,after}
  },id)
  check(`${id} Phantom Twin tint darkens face and body`,tint.after.face<tint.before.face*.85&&tint.after.body<tint.before.body*.85,tint)
 }
 await page.addInitScript(()=>localStorage.setItem('ipl-profile-v2',JSON.stringify({name:'KEPT',champion:'caelan',skins:{caelan:'dawnsworn'},appearance:{primary:'#75559e',secondary:'#4a1a1c',cape:false,glow:'#ffb84d',trail:'none'},loadout:['blink','starfire','quake','comet'],stats:{wins:{duel:7}}})))
 await page.goto('http://127.0.0.1:5303/?scene=loadout&mute=1')
 await page.waitForFunction(()=>window.__ipl?.sm.currentName==='loadout'&&!window.__ipl.sm._busy);await page.locator('#boot').waitFor({state:'detached'})
 check('Legacy paint migrates while player identity, effects and results survive',await page.evaluate(()=>{
  const p=window.__ipl.sm.profile,h=window.__scene.hero
  return p.appearance.primary==='#d6c5a0'&&p.name==='KEPT'&&p.stats.wins.duel===7&&p.appearance.trail==='none'&&p.appearance.glow==='#ffb84d'&&h.modelVersion===4&&!h.cape
 }))
 await page.getByRole('button',{name:'3D preview',exact:true}).click()
 const before=await page.evaluate(()=>window.__scene.stage.turntable.rotation.y)
 await page.mouse.move(300,430);await page.mouse.down();await page.mouse.move(480,450,{steps:12});await page.mouse.up()
 check('Dragging rotates the new 3D character',await page.evaluate(before=>Math.abs(window.__scene.stage.turntable.rotation.y-before)>.1,before))
 await page.setViewportSize({width:390,height:844})
 await page.getByText('Battle effects',{exact:true}).click()
 await page.getByRole('button',{name:'GLOW #9fce4a',exact:true}).click()
 check('Mobile glow control updates character effects',await page.evaluate(()=>window.__scene.hero.appearance.glow==='#9fce4a'&&window.__ipl.sm.profile.appearance.glow==='#9fce4a'))
 await page.getByRole('button',{name:'TRAIL: RIBBON',exact:true}).click()
 check('Mobile trail control updates the selected character',await page.evaluate(()=>window.__scene.hero.appearance.trail==='ribbon'))
 await page.getByRole('button',{name:'Restore skin defaults',exact:true}).click()
 check('Restore defaults resets effects and disables itself',await page.getByRole('button',{name:'Restore skin defaults',exact:true}).isDisabled())
 await page.screenshot({path:`out/mobile-effects.png`.replace('out/',out+'/')})
 check('No browser errors',errors.length===0,errors)
} finally {
 await fs.writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2)+'\n')
 await browser.close()
}
