import {chromium} from 'playwright-core'
import {mkdir,writeFile} from 'node:fs/promises'
const base=process.env.IPL_BASE||'http://127.0.0.1:5299',url=base+'/concepts/index.html'
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}})
const results=[],errors=[]
const check=(name,ok,detail)=>{results.push({name,ok,detail});console.log(ok?'PASS':'FAIL',name,detail??'');if(!ok)process.exitCode=1}
page.on('pageerror',e=>errors.push(String(e)))
const loaded=async(p=page)=>p.waitForFunction(()=>{const img=document.querySelector('#full-art');return img.complete&&img.naturalWidth>0&&!img.hidden})
await mkdir('qa/screens/gallery',{recursive:true})
try{
 await page.goto(url)
 check('twelve illustrations and four costume boards are offered',await page.locator('.art-open').count()===12&&await page.locator('.board-button').count()===4)
 for(const id of ['caelan','nyra','orren','serai','all']){
  await page.locator(`[data-filter="${id}"]`).click()
  check(`filter ${id}`,await page.locator('.champion:visible').count()===(id==='all'?4:1)&&await page.locator(`[data-filter="${id}"]`).getAttribute('aria-pressed')==='true')
 }
 for(let i=0;i<12;i++){
  const button=page.locator('.art-open').nth(i),label=await button.getAttribute('aria-label')
  await button.click();await loaded()
  const alt=await page.locator('#full-art').getAttribute('alt')
  check(`illustration ${i+1} opens its matching image`,label===`View ${alt}`)
  await page.getByRole('button',{name:'Close artwork',exact:true}).click()
  check(`illustration ${i+1} restores focus`,await button.evaluate(el=>el===document.activeElement))
 }
 for(let i=0;i<4;i++){
  await page.locator('.board-button').nth(i).click();await loaded()
  check(`costume board ${i+1} loads`,await page.locator('#art-title').innerText()==='Costume studies')
  await page.keyboard.press('Escape')
 }
 await page.locator('.art-open').first().click();await loaded()
 await page.getByRole('button',{name:'Next artwork',exact:true}).click();await loaded()
 check('Next opens Ashen Oath',await page.locator('#art-title').innerText()==='Ashen Oath')
 await page.getByRole('button',{name:'Previous artwork',exact:true}).click();await loaded()
 check('Previous opens Dawnsworn',await page.locator('#art-title').innerText()==='Dawnsworn')
 await page.keyboard.press('ArrowLeft');await loaded()
 check('keyboard previous wraps to last board',await page.locator('#art-character').innerText().then(t=>t.startsWith('Serai')))
 await page.keyboard.press('ArrowRight');await loaded()
 check('keyboard next wraps to first artwork',await page.locator('#art-title').innerText()==='Dawnsworn')
 const width=await page.locator('#full-art').evaluate(el=>el.width)
 await page.getByRole('button',{name:'Zoom in',exact:true}).click()
 check('Zoom in enlarges artwork',await page.locator('#full-art').evaluate(el=>el.width)>width&&await page.locator('#zoom-level').innerText()==='1.5×')
 await page.getByRole('button',{name:'Zoom out',exact:true}).click()
 check('Zoom out returns to fit and disables lower limit',await page.locator('#zoom-level').innerText()==='Fit'&&await page.getByRole('button',{name:'Zoom out',exact:true}).isDisabled())
 for(let i=0;i<4;i++)await page.getByRole('button',{name:'Zoom in',exact:true}).click()
 check('zoom caps at three times fit',await page.getByRole('button',{name:'Zoom in',exact:true}).isDisabled()&&await page.locator('#zoom-level').innerText()==='3.0×')
 await page.locator('.image-stage').focus()
 const scroll=await page.locator('.image-stage').evaluate(el=>el.scrollLeft)
 await page.keyboard.press('ArrowRight');await page.waitForTimeout(150)
 check('keyboard arrow pans a zoomed image without changing artwork',await page.locator('.image-stage').evaluate(el=>el.scrollLeft)>scroll&&await page.locator('#art-title').innerText()==='Dawnsworn')
 const modifiers=await page.locator('.image-stage').evaluate(el=>{
  return [{key:'+',code:'Equal',ctrlKey:true},{key:'-',code:'Minus',metaKey:true},{key:'ArrowLeft',code:'ArrowLeft',altKey:true}].every(init=>{const e=new KeyboardEvent('keydown',{...init,cancelable:true,bubbles:true});el.dispatchEvent(e);return !e.defaultPrevented})
 })
 check('browser zoom and navigation shortcuts remain available',modifiers)
 await page.getByRole('button',{name:'Fit image',exact:true}).click()
 check('Fit resets image and disables redundant action',await page.locator('#zoom-level').innerText()==='Fit'&&await page.getByRole('button',{name:'Fit image',exact:true}).isDisabled())
 await page.keyboard.press('+');check('plus keyboard shortcut zooms',await page.locator('#zoom-level').innerText()==='1.5×')
 await page.keyboard.press('-');check('minus keyboard shortcut zooms out',await page.locator('#zoom-level').innerText()==='Fit')
 const [original]=await Promise.all([page.context().waitForEvent('page'),page.getByRole('link',{name:'Open original',exact:false}).click()])
 await original.waitForLoadState();check('Open original opens full PNG',original.url().endsWith('caelan-dawnsworn.png')&&await original.locator('img').evaluate(el=>el.complete&&el.naturalWidth>0));await original.close()
 await page.keyboard.press('Escape')
 for(const [width,height] of [[1440,1000],[700,900],[390,844]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0))
  check(`${width}px gallery fits viewport`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.screenshot({path:`qa/screens/gallery/gallery-${width}.png`})
  await page.locator('.art-open').first().click();await loaded()
  const fit=await page.locator('#full-art').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('.image-stage').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right+1&&r.top>=p.top&&r.bottom<=p.bottom+1})
  check(`${width}px viewer fits the whole artwork`,fit)
  await page.screenshot({path:`qa/screens/gallery/viewer-${width}.png`})
  await page.getByRole('button',{name:'Zoom in',exact:true}).click()
  await page.getByRole('button',{name:'Fit image',exact:true}).click()
  await page.getByRole('button',{name:'Close artwork',exact:true}).click()
 }
 for(const label of ['WARRIOR LEAGUE','Return to the game']){
  await page.getByRole('link',{name:label,exact:label==='WARRIOR LEAGUE'}).click();await page.waitForURL(base+'/')
  check(`${label} link opens game`,true)
  await page.goBack();await page.locator('.art-open').first().waitFor()
 }
 check('gallery has no page errors',errors.length===0,errors)
 // An isolated page intentionally fails one asset to exercise real loading and recovery UI.
 const unavailable=await browser.newPage({viewport:{width:900,height:800}})
 let phase='error',release
 const gate=new Promise(resolve=>{release=resolve})
 await unavailable.route('**/caelan-dawnsworn.png*',async route=>{if(phase==='error')await route.abort();else{await gate;await route.continue()}})
 await unavailable.goto(url)
 await unavailable.locator('.art-open').first().click()
 await unavailable.getByRole('button',{name:'Try again',exact:true}).waitFor()
 check('missing illustration has a visible recovery action',await unavailable.getByText('This artwork could not load. Try again or open the original.').isVisible())
 await unavailable.screenshot({path:'qa/screens/gallery/error.png'})
 phase='loading';await unavailable.getByRole('button',{name:'Try again',exact:true}).click()
 check('loading state disables zoom until image arrives',await unavailable.getByText('Loading artwork…',{exact:true}).isVisible()&&await unavailable.getByRole('button',{name:'Zoom in',exact:true}).isDisabled())
 release();await loaded(unavailable)
 check('Try again recovers the original image',!await unavailable.getByRole('button',{name:'Try again',exact:true}).isVisible()&&await unavailable.getByRole('button',{name:'Zoom in',exact:true}).isEnabled())
 await unavailable.close()
}catch(e){check('gallery probe completed',false,String(e));console.error(e);await page.screenshot({path:'qa/screens/gallery/failure.png'}).catch(()=>{})}
finally{await writeFile('qa/screens/gallery/results.json',JSON.stringify({results,errors},null,2));await browser.close()}
