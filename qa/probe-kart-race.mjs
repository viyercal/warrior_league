import {chromium} from 'playwright-core'
import {writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.IPL_BASE||'http://127.0.0.1:5191'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const errors=[];page.on('pageerror',e=>errors.push(String(e)))
try{
 await page.goto(`${base}/?scene=kart&mute=1&dpr=1`)
 await page.waitForFunction(()=>window.__ipl?.sm.currentName==='kart'&&!window.__ipl.sm._busy,null,{timeout:90000});await page.locator('#boot').waitFor({state:'detached'});await page.keyboard.press('z');await page.waitForFunction(()=>window.__scene.state==='race',null,{timeout:20000})
 const race=await page.evaluate(()=>{
  const s=window.__scene,e=s.ctx.engine,uses={boost:0,bolt:0,slick:0,repair:0},orig=s._useRaceItem.bind(s)
  s._useRaceItem=k=>{const id=k.heldItem,ok=orig(k);if(ok)uses[id]++;return ok}
  let seed=211;const random=Math.random;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)
  try{
   // CPU pack races with normal collisions, hazards, damage, pads and supplies.
   // The stationary player is moved clear of the grid to avoid blocking them.
   s.player.group.position.set(200,0,200)
   for(let i=0;i<160*60&&!s.karts.slice(1).every(k=>k.finished);i++){
    e.elapsedTime+=1/60;s.update(1/60,e.elapsedTime)
    for(const[id,t]of[...e._timers])if(t.at<=e.elapsedTime){e._timers.delete(id);t.fn()}
   }
   return {time:s.clock,racers:s.karts.slice(1).map(k=>({name:k.name,finished:k.finished,time:k.finishTime,progress:k.progress,damage:k.damage})),uses}
  }finally{Math.random=random;s._useRaceItem=orig}
 })
 console.log(JSON.stringify(race,null,2));assert.ok(race.racers.every(k=>k.finished&&k.time<160),'all CPU racers finish a full contested race');assert.ok(race.uses.boost>0&&race.uses.bolt>0&&race.uses.slick>0,'CPU collects and uses race supplies')
 const effects=await page.evaluate(()=>{const s=window.__scene,p=s.player,k=s.karts[1];k.finished=false;k.ghostT=0;k.giantT=0;k.spinT=0;k.damage=0;k.group.position.copy(p.group.position).add({x:0,y:0,z:4});p.heading=0;p.heldItem='bolt';k.progress=p.progress+.01;s._useRaceItem(p);for(let i=0;i<60;i++){s.vfx.update(1/60);s.items.update(1/60,{karts:[p,k],decoy:null,t:i/60,onShellHit:(a,b)=>s._onShellHit(a,b),onSlick:(a,b)=>s._onSlick(a,b)})};const boltHit=k.damage>0&&k.spinT>0;p.heldItem='slick';s._useRaceItem(p);const sl=s.items.slicks.at(-1);k.group.position.set(sl.x,0,sl.z);s.items.update(.01,{karts:[p,k],decoy:null,t:1,onShellHit:(a,b)=>s._onShellHit(a,b),onSlick:(a,b)=>s._onSlick(a,b)});return{boltHit,slickHit:k.slickT>0}})
 console.log('effects',effects);assert.ok(effects.boltHit&&effects.slickHit,'offensive supply effects resolve real hits')
 await page.evaluate(()=>{const s=window.__scene,p=s.player,idx=s.track.N-2;p.group.position.copy(s.track.pos[idx]);p.heading=Math.atan2(s.track.tan[idx].x,s.track.tan[idx].z);p.idx=idx;p.lastS=p.s=idx/s.track.N;p.sCont=p.progress=2+idx/s.track.N;p.speed=26;p.kv.set(0,0,0);s.karts[1].finished=true})
 await page.keyboard.down('w');await page.waitForFunction(()=>!!window.__scene.over,null,{timeout:20000});await page.keyboard.up('w')
 assert.ok(await page.evaluate(()=>window.__scene.player.finished&&!!window.__scene.over),'actual finish line completes race')
 await page.waitForFunction(()=>!!document.querySelector('.kart-finish'),null,{timeout:20000})
 await page.screenshot({path:'qa/screens/kart-updates/full-race-results.png'})
 assert.equal(errors.length,0)
 await writeFile('docs/kart-race-results.json',JSON.stringify({base,race,effects,finished:true,errors},null,2));console.log('PASS full race, offensive hits and finish flow')
}finally{await browser.close()}
