import { chromium } from 'playwright-core'
import { mkdir,writeFile } from 'node:fs/promises'

const base=process.env.IPL_BASE || 'http://127.0.0.1:5302'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1})
const results=[],errors=[],metrics=[],out='qa/screens/unified-qa'
await mkdir(out,{recursive:true})
page.on('pageerror',e=>errors.push(String(e)))
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
const check=(name,ok,detail)=>{results.push({name,ok:Boolean(ok),detail});console.log(ok?'PASS':'FAIL',name,ok?'':JSON.stringify(detail));if(!ok)process.exitCode=1}
const ready=async name=>{
 await page.waitForFunction(n=>window.__ipl?.sm.currentName===n&&!window.__ipl.sm._busy,name,{timeout:60000})
 await page.locator('#boot').waitFor({state:'detached'})
}
const go=async name=>{await page.evaluate(n=>window.__ipl.sm.goTo(n),name);await ready(name)}
const snapshot=async name=>page.screenshot({path:`${out}/${name}.png`})
try {
 await page.goto(base+'/qa/roster-studio.html');await page.waitForFunction(()=>window.studio?.hero)
 const studio=await page.evaluate(()=>{
  const s=window.studio,checks=[],memory=[]
  for(const champion of s.CHAMPIONS) for(let skin=0;skin<3;skin++) {
   const prefix=`${champion.id}/${champion.skins[skin].id}`
   for(const pose of ['idle','run','cast','dance','ko']) {
    const h=s.show(champion.id,skin,{pose,angle:-.4})
    let valid=true,geometryValid=true
    h.group.updateMatrixWorld(true)
    h.group.traverse(o=>{
     if(!o.matrixWorld.elements.every(Number.isFinite))valid=false
     if(o.isMesh)for(const a of Object.values(o.geometry.attributes))if(!a.array.every(Number.isFinite))geometryValid=false
    })
    const cast=h.castPoint(),box=new s.THREE.Box3().setFromObject(h.hips)
    checks.push({name:`${prefix} ${pose}: bounded articulated mesh and casting hand`,ok:valid&&geometryValid&&[cast.x,cast.y,cast.z].every(Number.isFinite)&&box.max.length()<8&&box.min.length()<8})
   }
   const h=s.show(champion.id,skin)
   const original=h.equipment.map(e=>e.group.position.clone())
   h.setEquipmentPose('stowed');h.update(.016)
   checks.push({name:`${prefix} stowed gear leaves both hands free`,ok:h.equipment.every(e=>e.group.parent===h.hips)&&(!h.shield||h.shield.parent===h.hips)})
   h.setEquipmentPose('held');h.update(.016)
   checks.push({name:`${prefix} held gear restores exact attachments`,ok:h.equipment.every((e,i)=>e.group.parent===e.hand&&e.group.position.distanceTo(original[i])<1e-9)&&(!h.shield||h.shield.parent===h.arms.L.elbow)})
   const originalColor=h.mats.primary.color.getHexString()
   checks.push({name:`${prefix} hit material reaches the body`,ok:h.modelVersion===4?h.skinMesh.material===h.mats.primary:!!h.mats.primary})
   if(champion.id==='orren') {
    let body=0;h.group.traverse(o=>{if(o.isMesh&&o.material===h.mats.primary)body++})
    checks.push({name:`${prefix} hit flash reaches stone body`,ok:body>=10})
   }
   const twin=s.createHero({...h.appearance,cape:false},{equipmentPose:'stowed'})
   twin.mats.primary.color.set('#ffffff')
   checks.push({name:`${prefix} clone has independent tint and intact identity`,ok:twin.championId===champion.id&&twin.skinId===h.skinId&&h.mats.primary!==twin.mats.primary&&h.mats.primary.color.getHexString()===originalColor})
   s.disposeObject3D(twin.group)
  }
  for(let cycle=0;cycle<3;cycle++) {
   for(const c of s.CHAMPIONS) for(let i=0;i<3;i++)s.show(c.id,i)
   memory.push({...s.renderer.info.memory})
  }
  checks.push({name:'Repeated roster rebuilds release GPU resources',ok:memory[2].geometries===memory[1].geometries&&memory[2].textures===memory[1].textures,detail:memory})
  return {checks,memory}
 })
 for(const c of studio.checks)check(c.name,c.ok,c.detail)
 for(const id of ['caelan','nyra','orren','serai']) {
  await page.evaluate(id=>window.studio.show(id,0,{angle:-.4}),id);await snapshot(`${id}-three-quarter`)
  await page.evaluate(id=>window.studio.show(id,0,{angle:2.8}),id);await snapshot(`${id}-back`)
  await page.evaluate(id=>window.studio.show(id,0,{pose:'run',angle:-.4}),id);await snapshot(`${id}-running`)
 }

 await page.goto(base+'/?scene=loadout&mute=1');await ready('loadout')
 await page.getByRole('button',{name:'3D preview',exact:true}).click()
 await page.getByText('Battle effects',{exact:true}).click()
 await page.getByRole('button',{name:'Select Orren',exact:true}).click()
 const swatches=page.locator('.loadout-swatch')
 for(let i=0;i<await swatches.count();i++) {
  await swatches.nth(i).click()
  check(`Effect swatch ${i+1} applies to selected champion`,await page.evaluate(()=>{
   const h=window.__scene.hero,a=window.__ipl.sm.profile.appearance
   return h.appearance.glow===a.glow&&h.championId==='orren'
  }))
 }
 check('Unsupported paint and cape controls are removed',await page.getByRole('button',{name:/^(PRIMARY|ARMOR|CAPE):? /}).count()===0)
 for(const value of ['NONE','RIBBON','SPARK']) {
  await page.getByRole('button',{name:`TRAIL: ${value}`,exact:true}).click()
  check(`Trail ${value} updates selected model`,await page.evaluate(()=>window.__scene.hero.appearance.trail)===value.toLowerCase())
 }
 await page.getByRole('button',{name:'Restore skin defaults',exact:true}).click()
 check('Restoring skin preserves the authored model',await page.evaluate(()=>window.__scene.hero.championId==='orren'&&window.__scene.hero.skinId==='rootbound'))
 await page.getByText('Battle effects',{exact:true}).click()

 for(const [id,name] of [['caelan','Caelan'],['nyra','Nyra'],['orren','Orren'],['serai','Serai']]) {
  await page.getByRole('button',{name:`Select ${name}`,exact:true}).click()
  const skins=page.locator('.champion-skin')
  for(let i=0;i<3;i++) {
   await skins.nth(i).click()
   check(`${name} skin ${i+1} creates matching model identity`,await page.evaluate(()=>{
    const h=window.__scene.hero,p=window.__ipl.sm.profile
    return h.modelVersion===(['caelan','nyra'].includes(p.champion)?4:3)&&h.championId===p.champion&&h.skinId===p.skins[p.champion]
   }))
  }
  await skins.nth(0).click()
  await page.locator('.loadout-dance').click()
  check(`${name} war dance starts`,await page.evaluate(()=>window.__scene.hero.state)==='dance')
  await page.locator('.loadout-dance').click()
  check(`${name} war dance returns to idle`,await page.evaluate(()=>window.__scene.hero.state)==='normal')
  await page.evaluate(()=>{const s=window.__scene;s.stage.turntable.rotation.y=-.25})
  await snapshot(`${id}-forge`)
  for(const game of ['moba','arena','siege','hoops','kart','brawl','duel']) {
   await go(game);await page.keyboard.press('KeyZ')
   await page.waitForFunction(g=>{const s=window.__scene;return g==='kart'?s.state==='race':g==='hoops'?s.game.phase==='live':g==='arena'?!s.cine.active:['duel','brawl'].includes(g)?s.phase==='fight':s.phase==='play'},game,{timeout:30000})
   const before=await page.evaluate(()=>{
    const s=window.__scene,h=s.hero||s.game?.player.hero||s.player?.hero||s.player?.visual?.hero
    window.__modelQA=h;window.__modelFrames=[];window.__modelLast=performance.now()
    window.__modelTick=()=>{const n=performance.now();window.__modelFrames.push(n-window.__modelLast);window.__modelLast=n}
    window.__modelUntick=window.__ipl.engine.addTicker(window.__modelTick)
    const p=s.player?.pos||s.hero?.group.position||s.game?.player.hero.group.position||s.player?.group.position
    return {champion:h.championId,skin:h.skinId,pose:h.equipmentPose,pos:[p.x,p.y,p.z],t:h.t,time:window.__ipl.engine.elapsedTime}
   })
   check(`${name} appears as the selected playable model in ${game}`,before.champion===id&&before.pose===(['hoops','kart','brawl','duel'].includes(game)?'stowed':'held'),before)
   await page.keyboard.down(game==='kart'?'ArrowUp':'ArrowRight')
   await page.waitForFunction(t=>window.__ipl.engine.elapsedTime>t+.6,before.time,{timeout:12000})
   await page.keyboard.up(game==='kart'?'ArrowUp':'ArrowRight')
   const after=await page.evaluate(()=>{
    const s=window.__scene,h=window.__modelQA
    const p=s.player?.pos||s.hero?.group.position||s.game?.player.hero.group.position||s.player?.group.position
    h.group.updateMatrixWorld(true);let valid=true
    h.group.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))valid=false})
    return {pos:[p.x,p.y,p.z],t:h.t,valid}
   })
   check(`${name} arrow movement and rig animation work in ${game}`,after.valid&&after.t>before.t&&Math.hypot(after.pos[0]-before.pos[0],after.pos[2]-before.pos[2])>.05,{before:before.pos,after:after.pos})
   const key=['duel','brawl','moba'].includes(game)?'KeyW':'Digit2'
   let cast=false
   for(let i=0;i<4&&!cast;i++){
    await page.keyboard.press(key);await page.waitForTimeout(160)
    cast=await page.locator('.ability-slot').nth(1).getAttribute('class').then(c=>c.includes('on-cd'))
   }
   check(`${name} casting action works in ${game}`,cast)
   const frame=await page.evaluate(()=>{
    window.__modelUntick()
    const sorted=window.__modelFrames.filter(n=>n>0&&n<300).sort((a,b)=>a-b)
    return {frames:sorted.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],geometries:window.__ipl.engine.renderer.info.memory.geometries}
   })
   metrics.push({champion:id,game,...frame})
   await snapshot(`${id}-${game}`)
  }
  await go('loadout');await page.getByRole('button',{name:'3D preview',exact:true}).click()
 }
 for(const width of [900,390]) {
  await page.setViewportSize({width,height:900})
  await page.getByRole('button',{name:'Select Serai',exact:true}).click()
  await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(200)
  check(`3D preview and selection remain available at ${width}px`,await page.getByRole('button',{name:'3D preview',exact:true}).isVisible()&&await page.getByRole('button',{name:'Select Serai',exact:true}).isVisible())
  await snapshot(`forge-${width}`)
 }
 check('No browser errors during model and gameplay checks',errors.length===0,errors)
} catch(error) {check('Probe completed',false,String(error));throw error}
finally {
 await writeFile(`${out}/results.json`,JSON.stringify({results,errors,metrics},null,2))
 console.log(JSON.stringify({passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,errors,metrics},null,2))
 await browser.close()
}
