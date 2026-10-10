import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.IPL_BASE||'http://127.0.0.1:5191'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const checks=[],errors=[]
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
const check=(name,ok,detail)=>{checks.push({name,ok,detail});console.log(ok?'PASS':'FAIL',name,detail||'');assert.ok(ok,name)}
const sim=async(seconds)=>{const t=await page.evaluate(()=>window.__ipl.engine.elapsedTime);await page.waitForFunction(({t,seconds})=>window.__ipl.engine.elapsedTime>=t+seconds,{t,seconds},{timeout:30000})}
await mkdir('qa/screens/kart-updates',{recursive:true})
try{
 await page.goto(`${base}/?scene=kart&mute=1&dpr=1`)
 await page.waitForFunction(()=>window.__ipl?.sm.currentName==='kart'&&!window.__ipl.sm._busy,null,{timeout:90000});await page.locator('#boot').waitFor({state:'detached'})
 check('supply disabled before race',await page.locator('.kart-item').isDisabled())
 await page.keyboard.press('KeyZ');await page.waitForFunction(()=>window.__scene.state==='race',null,{timeout:20000})
 const clearance=await page.evaluate(()=>{const s=window.__scene; s.scene.updateMatrixWorld(true);return {mesas:s.track.mesas.length,minimumMesaShoulder:Math.min(...s.track.mesas.map(p=>s.track.distanceToTrack(p)-p.r-s.track.halfW)),minimumPropShoulder:Math.min(...s.track.clutter.map(p=>s.track.distanceToTrack(p)-p.r-s.track.halfW))}})
 check('whole mesa footprints clear road and camera shoulder',clearance.mesas>0&&clearance.minimumMesaShoulder>=4,clearance)
 check('all registered scenery stays outside road',clearance.minimumPropShoulder>0)
 await page.evaluate(()=>{const s=window.__scene,p=s.player,b=s.pickups.boxes[1];s.track.posAt(.1-4/s.track.length,p.group.position);s.track.tanAt(.1,p.kv);p.heading=Math.atan2(p.kv.x,p.kv.z);p.kv.set(0,0,0);p.idx=Math.floor(.1*s.track.N);p.s=p.lastS=p.sCont=p.progress=.1;p.speed=0;p.heldItem=null;b.cooldown=0;for(const k of s.karts.slice(1))k.group.position.set(200,0,200)})
 await page.keyboard.down('w');await page.waitForFunction(()=>!!window.__scene.player.heldItem);await page.keyboard.up('w')
 check('driving through chest fills slot and removes chest',await page.evaluate(()=>!!window.__scene.player.heldItem&&window.__scene.pickups.boxes[1].cooldown>0))
 check('collected item button enabled',await page.locator('.kart-item').isEnabled())
 const inventory=await page.evaluate(()=>{const s=window.__scene;s.ctx.engine.setPaused(true,'qa');const p=s.player,b=s.pickups.boxes[0],old=p.heldItem;p.group.position.copy(b.group.position);s.pickups.update(.1,[p],()=>{});return p.heldItem===old&&b.cooldown===0})
 check('held item cannot be overwritten by another chest',inventory)
 const respawn=await page.evaluate(()=>{const s=window.__scene,b=s.pickups.boxes[1];s.pickups.update(5.1,[],()=>{});return b.cooldown===0&&b.group.visible})
 check('supplies respawn on simulation time',respawn)
 await page.evaluate(()=>{const s=window.__scene;s.player.heldItem='boost';s.player.speed=0;s.player.boostT=0;s.player.group.position.copy(s.track.pos[20]);s._updateHud(0);s.ctx.engine.setPaused(false,'qa')})
 await page.keyboard.press('f')
 check('F uses boost exactly once',await page.evaluate(()=>!window.__scene.player.heldItem&&window.__scene.player.boostT>1.5))
 await page.evaluate(()=>{const s=window.__scene;s.player.damage=.25;s.player.heldItem='repair';s._updateHud(0)})
 await page.locator('.kart-item').click()
 check('click repairs damage and consumes item',await page.evaluate(()=>window.__scene.player.damage===0&&!window.__scene.player.heldItem))
 await page.keyboard.down('w');await sim(.3);await page.keyboard.up('w')
 check('clicking item preserves keyboard driving',await page.evaluate(()=>window.__scene.player.speed>1))
 await page.evaluate(()=>{const s=window.__scene;s.player.heldItem='bolt';s._updateHud(0);s.karts[1].finished=false;s.karts[1].progress=s.player.progress+.01})
 await page.keyboard.press('f')
 check('bolt projectile targets the next unfinished rival',await page.evaluate(()=>window.__scene.items.shells.some(x=>x.owner===window.__scene.player&&x.homing&&x.target===window.__scene.karts[1])))
 await page.evaluate(()=>{const s=window.__scene;s.player.heldItem='slick';s._updateHud(0)})
 await page.locator('.kart-item').click()
 check('click deploys trap behind player',await page.evaluate(()=>{const s=window.__scene;return !s.player.heldItem&&s.items.slicks.some(x=>x.owner===s.player)}))
 await page.evaluate(()=>{const s=window.__scene;for(const k of s.karts.slice(1)){k.heldItem='repair';k.damage=.2;k.itemWait=0;k.spinT=0};s.player.heldItem='repair';s._updateHud(0)})
 await sim(.1)
 check('CPUs use collected items',await page.evaluate(()=>window.__scene.karts.slice(1).every(k=>!k.heldItem&&k.damage===0)))
 await page.keyboard.press('Escape');const before=await page.evaluate(()=>({clock:window.__scene.clock,boxes:window.__scene.pickups.boxes.map(b=>b.cooldown)}));await page.keyboard.press('f');await page.waitForTimeout(300)
 check('pause freezes pickups and blocks item use',await page.evaluate(b=>{const s=window.__scene;return s.clock===b.clock&&s.player.heldItem==='repair'&&s.pickups.boxes.every((x,i)=>x.cooldown===b.boxes[i])},before))
 await page.keyboard.press('Escape')
 for(const [width,height]of[[1440,900],[900,800],[390,844]]){
  await page.setViewportSize({width,height});await page.screenshot({path:`qa/screens/kart-updates/hud-${width}.png`})
  check(`supply control fits ${width}`,await page.locator('.kart-item').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}))
  check(`supply control clear of other buttons ${width}`,await page.locator('.kart-item').evaluate(el=>{const a=el.getBoundingClientRect();return [...document.querySelectorAll('button')].filter(b=>b!==el&&b.offsetWidth&&b.offsetHeight).every(b=>{const r=b.getBoundingClientRect();return a.right<=r.left||a.left>=r.right||a.bottom<=r.top||a.top>=r.bottom})}))
 }
 await page.setViewportSize({width:1440,height:900})
 await page.evaluate(()=>{const s=window.__scene;s.ctx.engine.setPaused(true,'qa');s.player.heldItem=null;s._updateHud(0)})
 for(let i=0;i<12;i++){
  await page.evaluate(i=>{const s=window.__scene,p=s.player,idx=Math.floor(i/12*s.track.N);p.group.position.copy(s.track.pos[idx]);p.heading=Math.atan2(s.track.tan[idx].x,s.track.tan[idx].z);p.speed=25;p.steer=0;p.driftOff=0;s._updateCamera(2);s.track.sun.position.copy(p.group.position).addScaledVector(s.track.sunDir,130);s.track.sun.target.position.copy(p.group.position)},i)
  await page.screenshot({path:`qa/screens/kart-updates/route-${i}.png`})
 }
 await page.evaluate(()=>{const s=window.__scene;s.player.heldItem='boost';s.player.finished=true;s._updateHud(0)})
 check('finished racer cannot use supplies',await page.locator('.kart-item').isDisabled()&&await page.evaluate(()=>!window.__scene._useRaceItem(window.__scene.player)))
 await page.evaluate(async()=>{window.__ipl.engine.setPaused(false,'qa');await window.__ipl.sm.goTo('hub');await window.__ipl.sm.goTo('kart')})
 await page.waitForFunction(()=>window.__ipl.sm.currentName==='kart'&&!window.__ipl.sm._busy)
 check('re-entry resets all supply state',await page.evaluate(()=>window.__scene.pickups.boxes.length===18&&window.__scene.karts.every(k=>!k.heldItem)&&window.__scene.pickups.boxes.every(b=>b.cooldown===0)))
 check('no browser errors',errors.length===0,errors)
}finally{await writeFile('docs/kart-updates-results.json',JSON.stringify({base,checks,errors},null,2));await browser.close()}
