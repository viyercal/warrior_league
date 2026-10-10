import {chromium} from 'playwright-core'
import {mkdir} from 'node:fs/promises'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1800,height:850},deviceScaleFactor:1})
try {
 await page.goto((process.env.IPL_BASE||'http://127.0.0.1:5302')+'/qa/roster-studio.html')
 await page.waitForFunction(()=>window.studio?.hero)
 await page.evaluate(async()=>{
  const s=window.studio,T=s.THREE
  s.scene.remove(s.hero.group);s.disposeObject3D(s.hero.group)
  const camera=new T.OrthographicCamera(-4.25,4.25,2.007,-2.007,.1,100)
  camera.position.set(0,2.7,10);camera.lookAt(0,1.2,0)
  document.querySelector('#label').textContent='WARRIOR LEAGUE / PLAYABLE ROSTER'
  document.querySelector('#detail').textContent='ACTUAL GAME MODELS / SIGNATURE COSTUMES'
  for(const [i,c] of s.CHAMPIONS.entries()) {
   const h=s.createHero(s.skinAppearance(c,c.skins[0]));h.group.position.x=(i-1.5)*2.0;h.group.rotation.y=-.25
   h.t=1;h._lookTimer=999;h._lookTarget={yaw:0,pitch:0}
   for(let frame=0;frame<30;frame++)h.update(1/60)
   s.scene.add(h.group)
   await h.assetsReady
   const point=new T.Vector3(h.group.position.x,0,0).project(camera)
   const label=document.createElement('div');label.style.cssText=`position:absolute;top:730px;left:${(point.x*.5+.5)*innerWidth}px;transform:translateX(-50%);text-align:center;letter-spacing:.08em;font-size:22px;`
   label.textContent=c.name
   const skin=document.createElement('div');skin.style.cssText='font-size:12px;color:#a5b0bd;margin-top:10px;text-transform:uppercase';skin.textContent=c.skins[0].name;label.append(skin);document.body.append(label)
  }
  s.renderer.render(s.scene,camera)
 })
 await mkdir('docs/screenshots',{recursive:true})
 await page.screenshot({path:'docs/screenshots/playable-roster.png'})
} finally {await browser.close()}
