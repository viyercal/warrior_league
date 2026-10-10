import {chromium} from 'playwright-core'
import {writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const checks=[],errors=[];page.on('pageerror',e=>errors.push(String(e)))
const check=(name,ok,detail)=>{checks.push({name,ok,detail});console.log(ok?'PASS':'FAIL',name,detail||'');assert.ok(ok,name)}
try{
 await page.goto('http://127.0.0.1:5191/?scene=brawl&mute=1&dpr=1')
 await page.waitForFunction(()=>window.__ipl?.sm.currentName==='brawl'&&!window.__ipl.sm._busy,null,{timeout:90000});await page.locator('#boot').waitFor({state:'detached'});await page.keyboard.press('z');await page.waitForFunction(()=>window.__scene.phase==='fight',null,{timeout:20000})
 // First verify pursuit and attacks during ordinary running gameplay.
 await page.evaluate(()=>{const s=window.__scene;s.player.pos.set(-4,0,0);s.baseFighters[1].pos.set(0,0,0);s.baseFighters[2].pos.set(7,0,0)})
 await page.waitForFunction(()=>window.__scene.player.dmg>0,null,{timeout:20000})
 check('CPU pursues and hits player in live match',await page.evaluate(()=>window.__scene.player.dmg>0))
 await page.screenshot({path:'qa/screens/brawl-updated-live.png'})
 const results=await page.evaluate(async()=>{
  const s=window.__scene;s.ctx.engine.setPaused(true,'qa')
  const {BrawlAI}=await import('/src/games/brawl/brawlAi.js')
  const {PLATFORMS,MAIN}=await import('/src/games/brawl/stage.js')
  const {cpuDifficulty}=await import('/src/core/cpuDifficulty.js')
  const bot=s.baseFighters[1],foe=s.player,other=s.baseFighters[2]
  other.state='out';other.stocks=0
  let seed=42;const random=Math.random;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)
  const reset=(x=0,y=0)=>{for(const f of[bot,foe])Object.assign(f,{state:'fight',stocks:3,dmg:0,attack:null,hitstun:0,iFrames:0,ghostT:0,dodgeT:0,dodgeCd:0,airJumps:1,dropT:0,scaleMul:1,buffT:0,giantT:0,chillT:0,grounded:true,platform:MAIN});bot.pos.set(x,y,0);bot.vel.set(0,0);bot.facing=1;foe.pos.set(1.5,0,0);foe.vel.set(0,0);return new BrawlAI(bot,{difficulty:cpuDifficulty(6).brawl})}
  const step=(ai,n,combat=false)=>{const attacks=new Set();for(let i=0;i<n;i++){const it=ai.update(1/60,[bot,foe]);bot.update(1/60,1/60,it,PLATFORMS);if(combat){foe.update(1/60,1/60,{move:0},PLATFORMS);s._separate(1/60);s._resolveMelee()}if(bot.attack)attacks.add(bot.attack.kind)}return [...attacks]}
  const out={}
  try{
   let ai=reset();out.comboKinds=step(ai,240,true);out.comboDamage=foe.dmg
   ai=reset(0,3.6);bot.grounded=false;bot.platform=null;bot.vel.set(7,0);foe.pos.set(1.5,3.6,0);ai.decideT=0;const it=ai.update(1/60,[bot,foe]);bot.update(1/60,1/60,it,PLATFORMS);out.airFacing=bot.facing;out.airAttack=bot.attack?.kind
   ai=reset(7.2,0);foe.pos.set(7.2,6.2,0);foe.platform=PLATFORMS[2];let reached=false,maxY=0;for(let i=0;i<360;i++){step(ai,1);maxY=Math.max(maxY,bot.pos.y);if(bot.grounded&&bot.platform===PLATFORMS[2]){reached=true;break}}out.upperPlatform={reached,maxY}
   out.recoveries=[]
   for(const [x,vx,vy]of[[14,16,6],[-14,-15,4],[15,14,-2]]){ai=reset(x,2);bot.grounded=false;bot.platform=null;bot.vel.set(vx,vy);bot.hitstun=.3;foe.pos.set(0,0,0);let recovered=false;for(let i=0;i<420;i++){step(ai,1);if(bot.grounded&&Math.abs(bot.pos.x)<13.25){recovered=true;break}if(bot.pos.y< -14)break}out.recoveries.push({x,vx,vy,recovered,end:[bot.pos.x,bot.pos.y]})}
   ai=reset(11.8,0);foe.pos.set(10.2,0,0);foe.attack={kind:'smash',t:.1};ai.decideT=0;Math.random=()=>0;const dodge=ai.update(1/60,[bot,foe]).dodge;out.edgeDodge=dodge
   ai=reset();foe.state='respawn';out.noRespawnTarget=ai.update(1/60,[bot,foe]).jab===false&&ai.target===null
   ai=reset();bot.attack={kind:'jab1',t:.1,hasHit:true,buffered:false};let intents=0;for(let i=0;i<120;i++)if(ai.update(1/60,[bot,foe]).jab)intents++;out.comboIntents=intents
  }finally{Math.random=random}
  return out
 })
 check('CPU connects real jab chain',results.comboKinds.includes('jab2')&&results.comboKinds.includes('jab3')&&results.comboDamage>=14,results)
 check('airborne approach attacks face target',results.airFacing===1&&!!results.airAttack)
 check('CPU reaches upper platform using ordinary double jump',results.upperPlatform.reached,results.upperPlatform)
 check('CPU recovers from launches on both sides',results.recoveries.every(r=>r.recovered),results.recoveries)
 check('edge dodge rolls inward',results.edgeDodge===-1)
 check('respawning opponents are not pursued',results.noRespawnTarget)
 check('one combo decision per connected attack',results.comboIntents===1,results.comboIntents)
 check('no browser errors',errors.length===0,errors)
}finally{await writeFile('docs/brawl-updates-results.json',JSON.stringify({checks,errors},null,2));await browser.close()}
