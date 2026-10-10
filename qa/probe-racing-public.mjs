import {chromium} from 'playwright-core'
import {writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.IPL_BASE
if(!base)throw Error('Set IPL_BASE')
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const checks=[],errors=[],failed=[]
page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()})})
const check=(name,ok)=>{checks.push({name,ok});console.log(ok?'PASS':'FAIL',name);assert.ok(ok,name)}
const ready=async game=>{await page.waitForFunction(g=>window.__ipl?.sm.currentName===g&&!window.__ipl.sm._busy,game,{timeout:120000});await page.locator('#boot').waitFor({state:'detached'})}
try{
 await page.goto(`${base}/?scene=loadout&mute=1&dpr=1`,{timeout:90000});await ready('loadout')
 await page.getByRole('button',{name:'Equip Phantom Twin',exact:true}).click({modifiers:['Shift']})
 check('public Phantom Chorus equips four slots',await page.evaluate(()=>window.__ipl.sm.profile.loadout.every(x=>x==='decoy')))
 await page.evaluate(()=>window.__ipl.sm.goTo('kart'));await ready('kart');await page.keyboard.press('z');await page.waitForFunction(()=>window.__scene.state==='race',null,{timeout:20000})
 check('public Phantom Twin balance is current',await page.evaluate(()=>window.__scene.skillDefs.every(d=>d.cd===24&&d.params.duration===3)))
 check('public course clearance and supply chests present',await page.evaluate(()=>{const s=window.__scene;return s.pickups.boxes.length===18&&s.track.mesas.every(p=>s.track.distanceToTrack(p)-p.r>s.track.halfW+4)}))
 await page.evaluate(()=>{const s=window.__scene;s.player.heldItem='boost';s._updateHud(0)})
 await page.locator('.kart-item').click();check('public item button uses supply',await page.evaluate(()=>window.__scene.player.boostT>0&&!window.__scene.player.heldItem))
 check('public racing CPU pace updated',await page.evaluate(()=>window.__scene.karts.slice(1).every(k=>k.ai.base>=27.8)))
 await page.evaluate(()=>window.__ipl.sm.goTo('brawl'));await ready('brawl');await page.keyboard.press('z');await page.waitForFunction(()=>window.__scene.phase==='fight',null,{timeout:20000})
 await page.waitForFunction(()=>window.__scene.baseFighters.some(f=>f.dmg>0),null,{timeout:25000})
 check('public Mortal Arena CPU combat works',true)
 check('public assets load without failures',failed.length===0);check('no browser errors',errors.length===0)
}finally{await writeFile('docs/racing-public-results.json',JSON.stringify({base,checks,errors,failed},null,2));await browser.close()}
