import { chromium } from 'playwright-core'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.launch({channel:'chrome',headless:true})
try {
 const page = await browser.newPage()
 await page.goto('http://127.0.0.1:5191/?scene=kart&mute=1&dpr=1')
 await page.waitForFunction(()=>window.__scene?.karts?.length===6&&!window.__ipl.sm._busy,null,{timeout:90000})
 const result=await page.evaluate(async()=>{
  const s=window.__scene; s.ctx.engine.setPaused(true,'qa')
  const {updateAI}=await import('/src/games/kart/racers.js')
  const out=[]
  for(const k of s.karts.slice(1)){
   let ticks=0,off=0,sum=0,max=0
   while(k.sCont<3&&ticks<60*220){
    updateAI(k,1/60,s.track,k.progress);s._integrate(k,1/60)
    sum+=k.speed;max=Math.max(max,k.speed);if(k.group.position.distanceTo(s.track.pos[k.idx])>s.track.halfW+.7)off++
    ticks++
   }
   out.push({name:k.name,time:ticks/60,meanSpeed:sum/ticks,maxSpeed:max,offroadPct:off/ticks*100,progress:k.progress})
  }
  return out
 })
 console.log(JSON.stringify(result,null,2));await writeFile(process.argv[2]||'/tmp/kart-pace.json',JSON.stringify(result,null,2))
}finally{await browser.close()}
