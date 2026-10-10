import { chromium } from 'playwright-core'
import { mkdir,writeFile } from 'node:fs/promises'
const base=process.env.IPL_BASE||'http://127.0.0.1:5299'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
const results=[],errors=[]
page.on('pageerror',e=>errors.push(String(e)))
const check=(name,ok,detail)=>{results.push({name,ok,detail});console.log(ok?'PASS':'FAIL',name,detail??'');if(!ok)process.exitCode=1}
const panel='.arena-end,.siege-end,.moba-end,.duel-panel,.hoops-panel,.kart-finish,.brawl-results'
const games=process.env.IPL_GAMES?.split(',')||['duel','moba','arena','kart','brawl','siege','hoops']
await mkdir('qa/screens/field/results',{recursive:true})
try{
  for(const game of games)for(const outcome of ['win','lose']){
    await page.goto(`${base}/?scene=${game}&mute=1`)
    await page.waitForFunction(n=>window.__ipl?.sm.currentName===n&&!window.__ipl.sm._busy,game,{timeout:60000})
    await page.locator('#boot').waitFor({state:'detached'})
    await page.evaluate(o=>window.__scene.debug[o](),outcome)
    await page.locator(panel).waitFor({state:'visible',timeout:30000})
    await page.waitForTimeout(550)
    await page.evaluate(()=>window.__ipl.engine.setPaused(true,'qa-capture'))
    for(const [width,height] of [[1440,900],[700,800],[390,844]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(100)
      const bounds=await page.locator(panel).evaluate(el=>{
        const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}
      })
      check(`${game} ${outcome} ${width}px result fits`,bounds.x>=0&&bounds.y>=0&&bounds.right<=width+1&&bounds.bottom<=height+1&&bounds.scrollWidth<=bounds.clientWidth+1,bounds)
      await page.screenshot({path:`qa/screens/field/results/${game}-${outcome}-${width}.png`})
    }
    check(`${game} ${outcome} combat controls recede`,!await page.locator('.battle-help-toggle').isVisible()&&!await page.locator('.ability-bar').isVisible())
    const retry=page.locator(`${panel.split(',').map(p=>p+' button').join(',')}`).filter({hasText:/^(RETRY|RETRY THIS FOE|RACE AGAIN \(R\))$/})
    if(await retry.count()){
      await retry.click()
      await page.waitForFunction(n=>window.__ipl.sm.currentName===n&&!window.__ipl.sm._busy&&!document.querySelector('.arena-end,.siege-end,.duel-panel,.kart-finish'),game)
      await page.evaluate(()=>window.__ipl.engine.setPaused(false,'qa-capture'))
      check(`${game} ${outcome} retry starts a new attempt`,true)
    }else{
      await page.locator(panel).getByRole('button').first().click()
      await page.waitForFunction(()=>window.__ipl.sm.currentName==='hub'&&!window.__ipl.sm._busy)
      check(`${game} ${outcome} result returns to hub`,true)
    }
  }
  check('responsive result flows have no page errors',errors.length===0,errors)
}catch(e){check('result probe completed',false,String(e));console.error(e);await page.screenshot({path:'qa/screens/field/results/failure.png'}).catch(()=>{})}
finally{await writeFile('qa/screens/field/result-checks.json',JSON.stringify({results,errors},null,2));await browser.close()}
