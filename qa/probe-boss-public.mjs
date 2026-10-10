import {chromium} from 'playwright-core'
import {writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.IPL_BASE
if(!base)throw Error('Set IPL_BASE')
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}})
const checks=[],errors=[],failed=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()})})
const check=(name,ok)=>{checks.push({name,ok});console.log(ok?'PASS':'FAIL',name);assert.ok(ok,name)}
const ready=async game=>{await page.waitForFunction(g=>window.__ipl?.sm.currentName===g&&!window.__ipl.sm._busy,game,{timeout:120000});await page.locator('#boot').waitFor({state:'detached'});await page.keyboard.press('z')}
try{
 await page.goto(`${base}/?scene=siege&mute=1&dpr=1`,{timeout:90000});await ready('siege');await page.waitForFunction(()=>window.__scene.phase==='play')
 await page.evaluate(()=>{const s=window.__scene,p=s.turrets.pads[0];s.hero.group.position.set(p.x,0,p.z);s.gold=1000;s._updateHud(0)})
 await page.getByRole('button',{name:/F · Build/}).click();await page.waitForFunction(()=>window.__scene.turrets.pads[0].turret.buildT<=0)
 await page.evaluate(()=>{const s=window.__scene;s.turrets.take(s.turrets.pads[0].turret,30);s._updateHud(0)})
 await page.getByRole('button',{name:/G · Repair/}).click();check('public repair restores HP and spends correct gold',await page.evaluate(()=>{const s=window.__scene;return s.turrets.pads[0].turret.hp===60&&s.gold===877}))
 await page.getByRole('button',{name:/F · Upgrade/}).click();check('public upgrade restores higher maximum HP',await page.evaluate(()=>window.__scene.turrets.pads[0].turret.maxHp===90))
 await page.evaluate(()=>{window.__scene.debug.wave(10)});await page.waitForFunction(()=>window.__scene.boss)
 check('public Colossus has revised attack patterns',await page.evaluate(()=>{const s=window.__scene;s.boss.hp=349;s.boss.update(.01,false);return s.boss.enraged&&typeof s.boss.attackIndex==='number'}))
 await page.evaluate(()=>window.__ipl.sm.goTo('hoops'));await ready('hoops');await page.evaluate(()=>{const s=window.__scene;s.debug.give('player');s.game.ai.stunT=999;s.abilities.cds[3]=0})
 await page.keyboard.press('4');check('public Skyfall arms timed-shot buff',await page.evaluate(()=>window.__scene.game.eff.skyfallT>4));await page.waitForTimeout(1600)
 check('public Skyfall impact does not score',await page.evaluate(()=>window.__scene.game.score.you===0&&!window.__scene.game.eff.comet))
 await page.evaluate(()=>window.__ipl.sm.goTo('arena'));await ready('arena');await page.evaluate(()=>window.__scene.debug.wave(5));await page.waitForFunction(()=>window.__scene.boss)
 check('public Warden has charge and last-stand state',await page.evaluate(()=>{const b=window.__scene.boss;return b.attackIndex===0&&b.lastStand===false&&b.attackRadius===6}))
 await page.evaluate(()=>window.__ipl.sm.goTo('duel',{mode:'tower'}));await ready('duel');await page.waitForFunction(()=>window.__scene.phase==='fight',null,{timeout:30000})
 check('public Crucible loads and fights',await page.evaluate(()=>window.__scene.foe.name==='ASHBORN'))
 check('public assets load without failures',failed.length===0);check('no browser errors',errors.length===0)
}finally{await writeFile('docs/boss-public-results.json',JSON.stringify({base,checks,errors,failed},null,2));await browser.close()}
