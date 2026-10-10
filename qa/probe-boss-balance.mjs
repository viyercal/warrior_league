import {chromium} from 'playwright-core'
import {writeFile,mkdir} from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.IPL_BASE||'http://127.0.0.1:5191',browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}})
const checks=[],errors=[];page.on('pageerror',e=>errors.push(String(e)))
const check=(name,ok)=>{checks.push({name,ok});console.log(ok?'PASS':'FAIL',name);assert.ok(ok,name)}
async function open(mode){await page.goto(`${base}/?scene=${mode}&mute=1&dpr=1`);await page.waitForFunction(m=>window.__ipl?.sm.currentName===m&&!window.__ipl.sm._busy,mode,{timeout:90000});await page.locator('#boot').waitFor({state:'detached'});await page.keyboard.press('z')}
try{
await mkdir('qa/screens/boss-balance',{recursive:true});await open('arena')
const arena=await page.evaluate(()=>{
 const s=window.__scene;window.__ipl.engine.setPaused(true,'qa');s.debug.wave(5);s._spawnBoss();s.cine.skip(true);const b=s.boss,P=s.hero.group.position,out={};
 b.group.position.set(0,0,0);P.set(2,0,0);b.actT=0;b.attackIndex=0;b.update(.01,false);out.slamWarning=b.state==='slam'&&b.tele.visible&&b.tele.scale.x===6;
 const locked=b.slamPos.clone();P.set(15,0,0);out.slamLocked=b.slamPos.equals(locked);s.iFrames=0;const hp=s.hp;b.update(1.1,false);out.slamDodge=s.hp===hp&&b.state==='recover';
 b.state='stalk';b.actT=0;b.attackIndex=1;b.group.position.set(0,0,0);P.set(2,0,0);b.update(.01,false);out.burstWarning=b.state==='burst';b.update(.8,false);out.burstRecovery=b.state==='recover';
 b.state='stalk';b.actT=0;b.attackIndex=2;b.group.position.set(0,0,0);P.set(18,0,0);b.update(.01,false);const target=b.slamPos.clone();out.chargeWarning=b.state==='chargeTell'&&b.tele.scale.x===4&&target.length()<=14.1;P.set(-15,0,0);b.update(1.1,false);for(let i=0;i<60&&b.state==='charge';i++)b.update(1/60,false);out.chargeLocked=b.state==='recover'&&b.group.position.distanceTo(target)<.1;
 const pre=s.horde.aliveCount();b.hp=199;b.update(.01,false);out.enrage=b.enraged&&s.horde.aliveCount()===pre+4;b.update(.01,false);out.enrageOnce=s.horde.aliveCount()===pre+4;b.hp=79;b.update(.01,false);out.lastStand=b.lastStand&&s.horde.aliveCount()===pre+8;
 b.state='stalk';b.actT=0;b.update(.01,true);out.finished=b.state==='stalk'&&!b.tele.visible;
 b.state='stalk';b.attackIndex=0;b.actT=0;b.group.position.set(0,0,0);P.set(2,0,0);b.update(.01,false);return out;
});for(const[k,v]of Object.entries(arena))check(`Warden ${k}`,v);await page.screenshot({path:'qa/screens/boss-balance/warden-warning.png'})
await open('siege');const siege=await page.evaluate(()=>{
 const s=window.__scene;window.__ipl.engine.setPaused(true,'qa');s.debug.wave(10);s._spawnBoss();const b=s.boss,P=s.hero.group.position,out={};
 b.group.position.set(0,0,0);P.set(2,0,0);b.actT=0;b.attackIndex=0;b.update(.01,false);out.slamWarning=b.state==='slam'&&b.tele.scale.x===6.7&&b.teleT>=1;P.set(14,0,0);const hp=s.hp;b.update(1.3,false);out.slamDodge=s.hp===hp;
 for(const p of s.turrets.pads.slice(0,3)){s.turrets.build(p);p.turret.buildT=0} s.turrets.upgrade(s.turrets.pads[2].turret);s._mortarVolley();out.distinct=s.mortars.length===2&&s.mortars[0].target.distanceTo(s.mortars[1].target)>1;out.priority=s.mortars[0].target.x===s.turrets.pads[2].x&&s.mortars[0].target.z===s.turrets.pads[2].z;out.aligned=s.mortars.every(m=>m.target.x===m.ring.position.x&&m.target.z===m.ring.position.z);
 const m=s.mortars[0];P.copy(m.target);P.x+=2.7;s.iFrames=0;const before=s.hp;m.h.pos.copy(P).setY(0);s._updateMortars(.01);out.outsideWarningSafe=s.hp===before;
 b.hp=349;b.update(.01,false);out.enrage=b.enraged;s._mortarVolley();out.playerTarget=s.mortars.some(m=>m.target.x===P.x&&m.target.z===P.z);
 b.alive=false;s._updateMortars(.01);out.deathClearsMortars=s.mortars.length===0;b.alive=true;
 b.state='march';b.wpIdx=b.wps.length-1;const end=b.wps.at(-1);b.group.position.set(end[0],0,end[1]);b.hitCd=0;const gate=s.citadel.hp;b.update(.01,false);out.gateWarning=b.state==='gate'&&b.tele.visible&&s.citadel.hp===gate;b.update(1,false);out.gateImpact=s.citadel.hp===gate-20;b.state='march';b.actT=0;b.update(.01,true);out.finished=b.state==='march'&&!b.tele.visible;
 s.debug.lose();out.defeat=s.over&&!s.hud.prompt?.offsetWidth;return out;
});for(const[k,v]of Object.entries(siege))check(`Colossus ${k}`,v)
// Use the actual exported Tower AI and definitions with controlled fighter state.
const ai=await page.evaluate(async()=>{
 const {DuelAI}=await import('/src/games/duel/duelAi.js'),{TOWER}=await import('/src/games/duel/tower.js');const out={};
 const fighter=x=>({pos:{x,y:0},vel:{x:0,y:0},hero:{t:0},hp:100,facing:1,grounded:true,kdT:0,chainT:0,canAct:()=>true,canCast:()=>false,reachMul:()=>1});
 for(const stage of TOWER){const f=fighter(0),foe=fighter(5),a=new DuelAI(f,{...stage.ai,specials:stage.specials},{specials:{cast:()=>false},fight:{foeOf:()=>foe}});a.cds.fill(10);a.decideT=99;out[stage.id+' closes distance']=a.update(.016).move>0;foe.pos.x=1.5;f.lastHitKind='jab';let inputs=0;for(let i=0;i<20;i++){f.chainT=.35-i*.016;const v=a.update(.016);if(v.light||v.heavy)inputs++}out[stage.id+' one combo decision']=inputs<=1;
 if(stage.boss){f.chainT=0;f.hp=40;a.decideT=0;a.update(.016);out['Eternal faster wounded reactions']=a.decideT<=.2*1.15*.85}}
 return out;
});for(const[k,v]of Object.entries(ai))check(k,v)
check('no browser errors',errors.length===0)
}finally{await writeFile('docs/boss-balance-results.json',JSON.stringify({base,checks,errors},null,2));await browser.close()}
