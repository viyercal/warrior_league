import {chromium} from 'playwright-core'
import {writeFile,mkdir} from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.IPL_BASE||'http://127.0.0.1:5191'
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}})
const checks=[],errors=[];page.on('pageerror',e=>errors.push(String(e)))
const check=(name,ok,detail)=>{checks.push({name,ok,detail});console.log(ok?'PASS':'FAIL',name,detail||'');assert.ok(ok,name)}
try{
await page.goto(`${base}/?scene=hoops&mute=1&dpr=1`);await page.waitForFunction(()=>window.__scene?.game?.phase,null,{timeout:90000});await page.locator('#boot').waitFor({state:'detached'});await page.keyboard.press('z')
await page.evaluate(()=>{const s=window.__scene;s.debug.give('player');s.game.ai.stunT=999;s.game.ai.hero.group.position.set(8,0,-5);s.abilities.cds[3]=0})
await page.keyboard.press('4');check('keyboard cast arms a five second next-shot buff',await page.evaluate(()=>window.__scene.game.eff.skyfallT>4&&window.__scene.abilities.cds[3]>17))
await mkdir('qa/screens/skyfall',{recursive:true});await page.screenshot({path:'qa/screens/skyfall/armed.png'})
await page.keyboard.press('Escape');const frozen=await page.evaluate(()=>window.__scene.game.eff.skyfallT);await page.waitForTimeout(300);check('pause freezes buff duration',await page.evaluate(t=>window.__scene.game.eff.skyfallT===t,frozen));await page.keyboard.press('Escape')
await page.waitForTimeout(1500);check('hammer impact awards no points',await page.evaluate(()=>window.__scene.game.score.you===0&&!window.__scene.game.eff.comet))
await page.keyboard.press('Space');await page.waitForTimeout(400)
check('bad keyboard release misses and consumes buff',await page.evaluate(()=>{const s=window.__scene;return s.match.attempts===1&&s.game.eff.skyfallT===0&&s.game.score.you===0}))
const r=await page.evaluate(()=>{
 const s=window.__scene,g=s.game;window.__ipl.engine.setPaused(true,'qa');const out={};
 s.debug.give('ai');s.abilities.cds[3]=0;s.abilities.cast(3);out.noPossession=s.abilities.cds[3]===0&&g.eff.skyfallT===0;
 s.debug.give('player');s.abilities.cast(3);s.abilities.tick(5.01);out.expires=g.eff.skyfallT===0;
 s.abilities.cds[3]=0;s.abilities.cast(3);s.debug.give('ai');s.abilities.tick(.01);out.turnover=g.eff.skyfallT===0;
 s.debug.give('player');g.player.hero.group.position.set(0,0,5);g.ai.hero.group.position.set(8,0,-5);g.eff.skyfallT=0;const ordinary=s._band().halfW;g.eff.skyfallT=5;const open=s._band().halfW;g.ai.hero.group.position.copy(g.player.hero.group.position);const guarded=s._band().halfW;out.contest=open>ordinary&&guarded<open;
 g.ai.hero.group.position.set(8,0,-5);g.player.meterT=0;g.eff.skyfallT=5;s._releaseShot();out.bad=!s._pendingShot.make&&s._pendingShot.quality==='bad'&&g.eff.skyfallT===0;
 s.debug.give('player');g.player.meterT=.7;g.eff.skyfallT=5;s._releaseShot();const shot=s._pendingShot,before=g.score.you;s._pendingShot=null;s._arrive(shot);out.perfect=shot.make&&shot.perfect&&g.score.you===before+shot.val;
 s.debug.give('player');g.eff.skyfallT=5;s._resetCheck('ai');out.reset=g.eff.skyfallT===0&&!g.eff.comet;
 return out;
});for(const[name,ok]of Object.entries(r))check(name,ok)
check('no browser errors',errors.length===0,errors)
}finally{await writeFile('docs/skyfall-balance-results.json',JSON.stringify({base,checks,errors},null,2));await browser.close()}
