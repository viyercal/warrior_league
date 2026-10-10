import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const base=process.env.IPL_BASE || 'http://127.0.0.1:5299'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1})
const errors=[],results=[]
page.on('pageerror',e=>errors.push(String(e)))
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
const check=(name,ok,detail)=>{results.push({name,ok,detail});console.log(ok?'PASS':'FAIL',name,detail??'');if(!ok)process.exitCode=1}
const games=process.env.IPL_GAMES?.split(',') || ['duel','brawl','arena','siege','moba','hoops','kart']
const position=()=>page.evaluate(()=>{
  const s=window.__scene,p=s.player?.pos || s.hero?.group.position || s.game?.player.hero.group.position || s.player?.group.position
  return {x:p.x,y:p.y,z:p.z,speed:s.player?.speed,steer:s.player?.steer}
})
const hold=async(key,ms=240)=>{
  const start=await page.evaluate(()=>window.__ipl.engine.elapsedTime)
  await page.keyboard.down(key)
  await page.waitForFunction(({start,ms})=>window.__ipl.engine.elapsedTime>=start+ms/1000,{start,ms},{timeout:8000})
  const p=await position();await page.keyboard.up(key);return p
}
const distance=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z)
await mkdir('qa/screens/field',{recursive:true})
try {
  for(const game of games) {
    await page.setViewportSize({width:1440,height:900})
    await page.goto(`${base}/?scene=${game}&mute=1`)
    await page.waitForFunction(n=>window.__ipl?.sm.currentName===n&&!window.__ipl.sm._busy,game,{timeout:60000})
    await page.locator('#boot').waitFor({state:'detached'})
    await page.keyboard.press('KeyZ')
    await page.waitForFunction(g=>{
      const s=window.__scene
      return g==='kart'?s.state==='race':g==='hoops'?s.game.phase==='live':g==='arena'?!s.cine.active:['duel','brawl'].includes(g)?s.phase==='fight':s.phase==='play'
    },game,{timeout:30000})
    await page.locator('.battle-help-toggle').waitFor({state:'visible'})
    check(`${game} controls start collapsed`,!await page.locator('.hint-box').isVisible())
    await page.locator('.battle-help-toggle').click()
    check(`${game} Controls button opens instructions`,await page.locator('.hint-box').isVisible()&&await page.locator('.battle-help-toggle').getAttribute('aria-expanded')==='true')
    check(`${game} instructions include arrows`,await page.locator('.hint-box').innerText().then(t=>/arrow|[←→↑↓]/i.test(t)))
    await page.keyboard.press('KeyH')
    check(`${game} H closes instructions`,!await page.locator('.hint-box').isVisible())

    if(game==='kart') {
      const start=await position(),forward=await hold('ArrowUp',600)
      check('kart ArrowUp accelerates and moves',forward.speed>start.speed&&distance(start,forward)>.2,{start,forward})
      const right=await hold('ArrowRight'),left=await hold('ArrowLeft')
      check('kart Left/Right steer both directions',right.steer<-.05&&left.steer>.05,{right:right.steer,left:left.steer})
      const before=await position(),braked=await hold('ArrowDown',300)
      check('kart ArrowDown brakes',braked.speed<before.speed,{before:before.speed,after:braked.speed})
    } else {
      for(const key of ['ArrowRight','ArrowLeft']) {
        const start=await position(),end=await hold(key)
        check(`${game} ${key} moves the character`,distance(start,end)>.08,{start,end})
      }
      if(['duel','brawl'].includes(game)) {
        const start=await position(),jump=await hold('ArrowUp',120)
        check(`${game} ArrowUp jumps`,jump.y>start.y+.1,{before:start.y,after:jump.y})
        await page.keyboard.down('ArrowDown')
        await page.waitForTimeout(80)
        check(`${game} ArrowDown ${game==='duel'?'crouches':'fast falls'}`,await page.evaluate(g=>g==='duel'?window.__scene._pIntent.crouch:window.__scene._pIntent.fastFall,game))
        await page.keyboard.up('ArrowDown')
      } else for(const key of ['ArrowUp','ArrowDown']) {
        const start=await position(),end=await hold(key)
        check(`${game} ${key} moves the character`,distance(start,end)>.08,{start,end})
      }
    }

    if(game!=='moba') {
      await page.keyboard.down('KeyD');await page.keyboard.down('ArrowRight');await page.keyboard.up('KeyD')
      check(`${game} releasing D preserves held Right`,await page.evaluate(()=>window.__ipl.input.isDown('KeyD')))
      await page.keyboard.up('ArrowRight')
      check(`${game} releasing both clears movement`,await page.evaluate(()=>!window.__ipl.input.isDown('KeyD')))
    } else {
      await page.keyboard.press('KeyB');await page.waitForTimeout(100)
      const recalling=await page.evaluate(()=>window.__scene.recallT>=0)
      await hold('ArrowRight',150)
      check('moba arrow movement cancels recall',recalling&&await page.evaluate(()=>window.__scene.recallT<0))
      // Real right-click order, followed by direct movement taking priority.
      await page.mouse.click(860,430,{button:'right'})
      await hold('ArrowRight',100)
      check('moba arrows replace mouse orders',await page.evaluate(()=>!window.__scene.moveTarget&&!window.__scene.chaseTgt))
    }
    await page.keyboard.down('ArrowLeft');await page.keyboard.press('KeyP')
    check(`${game} pause releases held arrows`,await page.evaluate(()=>window.__ipl.engine.paused&&window.__ipl.input.keys.size===0))
    const elapsed=await page.evaluate(()=>window.__ipl.engine.elapsedTime)
    await page.keyboard.up('ArrowLeft');await page.keyboard.press('ArrowRight');await page.waitForTimeout(100)
    check(`${game} arrows cannot move a paused match`,await page.evaluate(t=>window.__ipl.engine.elapsedTime===t&&window.__ipl.input.keys.size===0,elapsed))
    await page.locator('[data-action="resume"]').click()
    await page.waitForTimeout(500)
    const artKeys=['duel','brawl','moba'].includes(game)?['KeyQ','KeyW','KeyE','KeyR']:['Digit1','Digit2','Digit3','Digit4']
    for(let i=0;i<4;i++) {
      // Specials can be gated by hitstun/recovery; hitstop also delays HUD updates.
      for(let attempt=0;attempt<6;attempt++) {
        await page.keyboard.press(artKeys[i]);await page.waitForTimeout(350)
        if(await page.locator('.ability-slot').nth(i).getAttribute('class').then(c=>c.includes('on-cd')))break
      }
      check(`${game} art ${i+1} shows cooldown`,await page.locator('.ability-slot').nth(i).getAttribute('class').then(c=>c.includes('on-cd')))
    }
    const model=await page.evaluate(()=>{
      const s=window.__scene,h=s.hero||s.game?.player.hero||s.player?.hero||s.player?.visual?.hero
      if(!h)return null
      h.group.updateMatrixWorld(true)
      let meshes=0,valid=true
      h.group.traverse(o=>{if(o.isMesh)meshes++;if(!o.matrixWorld.elements.every(Number.isFinite))valid=false})
      return {kind:h.modelKind,meshes,valid}
    })
    check(`${game} articulated champion renders in gameplay`,!!model?.kind&&model.valid&&model.meshes>40,model)
    // Freeze simulation for consistent responsive captures while still exercising real HUD events.
    await page.evaluate(()=>window.__ipl.engine.setPaused(true,'qa-capture'))
    for(const [width,height] of [[1440,900],[900,800],[700,800],[390,844]]) {
      await page.setViewportSize({width,height})
      await page.waitForTimeout(100)
      const layout=await page.evaluate(()=>{
        const selectors=['.ability-bar','.battle-help-toggle','.session-menu','.moba-minimap','.kart-minimap','.brawl-chips','.hoops-score','.siege-citadel']
        const boxes=selectors.flatMap(sel=>Array.from(document.querySelectorAll(sel)).filter(el=>getComputedStyle(el).visibility!=='hidden'&&el.getBoundingClientRect().width>0).map(el=>{const r=el.getBoundingClientRect();return {sel,x:r.x,y:r.y,right:r.right,bottom:r.bottom}}))
        const outside=boxes.filter(r=>r.x<0||r.y<0||r.right>innerWidth+1||r.bottom>innerHeight+1)
        const controls=boxes.filter(r=>['.battle-help-toggle','.session-menu'].includes(r.sel)),other=boxes.filter(r=>!controls.includes(r))
        const overlaps=controls.flatMap(c=>other.filter(o=>c.x<o.right&&c.right>o.x&&c.y<o.bottom&&c.bottom>o.y).map(o=>[c.sel,o.sel]))
        return {outside,overlaps}
      })
      check(`${game} ${width}px HUD fits and controls are clear`,!layout.outside.length&&!layout.overlaps.length,layout)
      await page.locator('.battle-help-toggle').click()
      check(`${game} ${width}px help is reachable`,await page.locator('.hint-box').isVisible())
      if(width===700)await page.screenshot({path:`qa/screens/field/${game}-${width}-help.png`})
      await page.locator('.battle-help-toggle').click()
      await page.screenshot({path:`qa/screens/field/${game}-${width}.png`})
    }
    await page.evaluate(()=>window.__ipl.engine.setPaused(false,'qa-capture'))
  }
  // Aliases must not alter form editing or hub navigation after leaving a battle.
  await page.setViewportSize({width:1440,height:900})
  await page.keyboard.press('Escape');await page.locator('[data-action="hub"]').click()
  await page.waitForFunction(()=>window.__ipl.sm.currentName==='hub'&&!window.__ipl.sm._busy)
  await page.locator('[data-realm="duel"]').click()
  await page.locator('[data-realm="duel"]').press('ArrowRight')
  check('hub ArrowRight still changes selection',await page.locator('[data-realm="moba"]').getAttribute('aria-pressed')==='true')
  await page.getByRole('button',{name:'Prepare loadout',exact:true}).click()
  await page.waitForFunction(()=>window.__ipl.sm.currentName==='loadout'&&!window.__ipl.sm._busy)
  const name=page.getByRole('textbox',{name:'War name'})
  await name.fill('CHAMPION');await name.press('End');await name.press('ArrowLeft')
  check('forge ArrowLeft edits text without moving a character',await name.evaluate(el=>el.selectionStart===7)&&await page.evaluate(()=>window.__ipl.input.keys.size===0&&Object.keys(window.__ipl.input.keyAliases).length===0))
  check('field integration has no browser errors',errors.length===0,errors)
} catch(e) {check('field probe completed',false,String(e));console.error(e);await page.screenshot({path:'qa/screens/field/failure.png'}).catch(()=>{})}
finally {await writeFile('qa/screens/field/results.json',JSON.stringify({results,errors},null,2));await browser.close()}
