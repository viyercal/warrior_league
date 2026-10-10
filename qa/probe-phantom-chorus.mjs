import {chromium} from 'playwright-core'
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const base=process.env.IPL_BASE||'http://127.0.0.1:5191'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const checks=[],errors=[];page.on('pageerror',e=>errors.push(String(e)))
const check=(name,ok,detail)=>{checks.push({name,ok,detail});console.log(ok?'PASS':'FAIL',name,detail||'');assert.ok(ok,name)}
const ready=async name=>{await page.waitForFunction(name=>window.__ipl?.sm.currentName===name&&!window.__ipl.sm._busy,name,{timeout:90000});await page.locator('#boot').waitFor({state:'detached'})}
const loadout=()=>page.evaluate(()=>window.__ipl.sm.profile.loadout)
await mkdir('qa/screens/phantom-chorus',{recursive:true})
try{
 await page.goto(`${base}/?scene=loadout&mute=1&dpr=1`);await ready('loadout')
 await page.getByRole('button',{name:'Equip Phantom Twin',exact:true}).click()
 check('ordinary equip keeps a single Phantom Twin',(await loadout()).filter(x=>x==='decoy').length===1)
 await page.getByRole('button',{name:'Equip Phantom Twin',exact:true}).click({modifiers:['Shift']})
 check('secret equips Phantom Twin in all four slots',(await loadout()).every(x=>x==='decoy'))
 check('secret feedback is visible',(await page.locator('.loadout-art-detail').textContent()).includes('PHANTOM CHORUS'))
 const badge=await page.getByRole('button',{name:'Equip Phantom Twin',exact:true}).locator('.loadout-skill-badge').innerText()
 check('badge lists all four equipped keys',badge.includes('Q')&&badge.includes('W')&&badge.includes('E')&&badge.includes('R'),badge)
 for(const[width,height]of[[1440,900],[900,800],[390,844]]){await page.setViewportSize({width,height});await page.getByRole('button',{name:'Equip Phantom Twin',exact:true}).scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.screenshot({path:`qa/screens/phantom-chorus/forge-${width}.png`});check(`four-slot badge fits ${width}`,await page.getByRole('button',{name:'Equip Phantom Twin',exact:true}).locator('.loadout-skill-badge').evaluate(el=>el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1))}
 await page.setViewportSize({width:1440,height:900});await page.reload();await ready('loadout')
 check('four copies survive saved profile reload',(await loadout()).every(x=>x==='decoy'))
 await page.getByRole('button',{name:'Equip Shadow Step',exact:true}).click({modifiers:['Shift']})
 check('other arts cannot fill four slots',(await loadout()).filter(x=>x==='blink').length===1&&(await loadout()).filter(x=>x==='decoy').length===3)
 await page.getByRole('button',{name:'Equip Shadow Step',exact:true}).click({modifiers:['Shift']})
 check('other arts still swap without duplicating',(await loadout()).filter(x=>x==='blink').length===1)
 await page.getByRole('button',{name:'Equip Phantom Twin',exact:true}).focus();await page.keyboard.press('Shift+Enter')
 check('keyboard secret works',(await loadout()).every(x=>x==='decoy'))
 await page.getByRole('button',{name:'SEAL & RETURN',exact:true}).click();await ready('hub')
 for(const game of ['moba','arena','siege','brawl','duel','kart','hoops']){
  await page.evaluate(g=>window.__ipl.sm.goTo(g),game);await ready(game);await page.keyboard.press('z')
  // Allow cinematic/countdown gates to settle on simulation time.
  await page.waitForFunction(g=>{const s=window.__scene;return g==='kart'?s.state==='race':g==='moba'?s.phase==='play':['brawl','duel'].includes(g)?s.phase==='fight':g==='arena'?!s.cine.active:g==='siege'?s.phase==='play':g==='hoops'?s.game.phase==='live':true},game,{timeout:25000})
  const balance=await page.evaluate(()=>{const s=window.__scene;return s.skillDefs.map(d=>({cd:d.cd,duration:d.params.duration,duelDuration:d.params.duelDuration}))});check(`${game} shortened effect and longer cooldown`,balance.every(d=>d.cd===24&&d.duration===3&&d.duelDuration===.35),balance[0])
  const defs=await page.evaluate(()=>{const s=window.__scene;return(s.skillDefs||s.abilities?.slots||s.skills?.slots||[]).map(x=>x.id)})
  check(`${game} receives all four copies`,defs.length===4&&defs.every(x=>x==='decoy'),defs)
  if(game==='duel'){
   const advance=async seconds=>{const t=await page.evaluate(()=>window.__ipl.engine.elapsedTime);await page.waitForFunction(({t,seconds})=>window.__ipl.engine.elapsedTime>=t+seconds,{t,seconds})}
   await page.keyboard.press('q');await advance(.3);await page.keyboard.press('w');await advance(.27)
   check('rapid Crucible casts leave one visible fresh twin',await page.evaluate(()=>{const s=window.__scene,tw=s.specials.twins.filter(x=>x.caster===s.player);return tw.length===1&&tw[0].hero.group.visible&&tw[0].t<.35}))
  }
  const keys=['moba','duel','brawl'].includes(game)?['q','w','e','r']:['1','2','3','4']
  for(let i=0;i<4;i++){await page.keyboard.press(keys[i]);await page.waitForTimeout(800)}
  const cds=await page.evaluate(()=>{const s=window.__scene;return s.cds||s.abilities?.cds||s.skills?.cds})
  check(`${game} all four slots cast with independent cooldowns`,cds?.length===4&&cds.every(x=>x>18&&x<=24),cds)
  const t=await page.evaluate(()=>window.__ipl.engine.elapsedTime)
  await page.waitForFunction(t=>window.__ipl.engine.elapsedTime>=t+3.2,t,{timeout:20000})
  check(`${game} phantom expires while cooldown remains`,await page.evaluate(g=>{const s=window.__scene;const gone=g==='duel'?!s.specials.twins.some(t=>t.caster===s.player):g==='brawl'?!s.clone:g==='hoops'?!s.game.eff.decoy:!s.decoy;return gone&&(s.cds||s.abilities?.cds).every(t=>t>0)},game))
 }
 check('no browser errors',errors.length===0,errors)
}finally{await writeFile('docs/phantom-chorus-results.json',JSON.stringify({base,checks,errors},null,2));await browser.close()}
