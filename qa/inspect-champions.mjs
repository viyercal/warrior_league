import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
const base=process.env.IPL_BASE || 'http://127.0.0.1:5299'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1})
const errors=[]
page.on('pageerror',e=>errors.push(String(e)))
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
await mkdir('qa/screens/champions',{recursive:true})
try {
  await page.goto(base+'/?scene=loadout&mute=1')
  await page.waitForFunction(()=>window.__ipl?.sm.currentName==='loadout'&&!window.__ipl.sm._busy)
  await page.locator('#boot').waitFor({state:'detached'})
  await page.waitForTimeout(1000)
  await page.getByRole('button',{name:'3D preview',exact:true}).click()
  await page.getByText('Fine-tune appearance',{exact:true}).click()
  // Freeze only the portrait's presentation angle for comparable QA captures.
  await page.evaluate(()=>{ const s=window.__scene; s.stage.turntable.rotation.y=.2; s.update(0,0); window.__ipl.engine.setPaused(true,'portrait') })
  const captures=[]
  const swatches=page.locator('.loadout-swatch')
  for(let i=0;i<await swatches.count();i++) {
    await swatches.nth(i).click()
    const correct=await page.evaluate(()=>{
      const h=window.__scene.hero,a=window.__ipl.sm.profile.appearance
      return '#'+h.mats.primary.color.getHexString()===a.primary&&'#'+h.mats.secondary.color.getHexString()===a.secondary&&h.appearance.glow===a.glow
    })
    if(!correct)throw Error(`Material identity failed for swatch ${i}`)
  }
  for(const value of ['OFF','ON']) {
    await page.getByRole('button',{name:`CAPE: ${value}`,exact:true}).click()
    if(await page.evaluate(()=>Boolean(window.__scene.hero.cape))!==(value==='ON'))throw Error('Cape toggle failed')
  }
  for(const value of ['RIBBON','NONE','SPARK']) {
    await page.getByRole('button',{name:`TRAIL: ${value}`,exact:true}).click()
    if(await page.evaluate(()=>window.__scene.hero.appearance.trail)!==value.toLowerCase())throw Error('Trail appearance failed')
  }
  await page.getByRole('button',{name:'PRIMARY #b0793a',exact:true}).click()
  await page.getByRole('button',{name:'ARMOR #3a2a20',exact:true}).click()
  await page.getByRole('button',{name:'GLOW #ffb84d',exact:true}).click()
  // Faces and hair are now authored per champion; all twelve costumes build
  // their matching mesh instead of recombining generic heads and bodies.
  for(const name of ['Caelan','Nyra','Orren','Serai']) for(let skin=0;skin<3;skin++) {
    await page.getByRole('button',{name:`Select ${name}`,exact:true}).click()
    await page.locator('.champion-skin').nth(skin).click()
    const finite=await page.evaluate(()=>{
      const h=window.__scene.hero
      for(let i=0;i<30;i++) h.update(1/60)
      h.group.updateMatrixWorld(true)
      let valid=true
      h.group.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))valid=false})
      return valid && h.modelVersion===3 && h.championId===window.__ipl.sm.profile.champion && h.skinId===window.__ipl.sm.profile.skins[h.championId]
    })
    if(!finite)throw Error(`Invalid rig: ${name}/${skin}`)
  }
  for(const [champion,kind] of [['Caelan','vanguard'],['Nyra','raider'],['Serai','mystic'],['Orren','juggernaut']]) {
    await page.getByRole('button',{name:`Select ${champion}`,exact:true}).click()
    await page.locator('.champion-skin').nth(0).click()
    if(await page.evaluate(()=>window.__scene.hero.modelKind)!==kind)throw Error(`Champion rig mismatch: ${champion}`)
    await page.evaluate(()=>window.__scene.hero.update(.15))
    const stats=await page.evaluate(()=>{
      let triangles=0,meshes=0
      window.__scene.hero.group.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3}})
      return {kind:window.__scene.hero.modelKind,meshes,triangles}
    })
    const file=`qa/screens/champions/${champion.toLowerCase()}.png`
    await page.screenshot({path:file})
    captures.push({champion,...stats,file})
  }
  const coverage={authoredCostumes:12,swatches:await swatches.count(),capeStates:2,trailStates:3}
  console.log(JSON.stringify({coverage,captures,errors},null,2))
  await writeFile('qa/screens/champions/inspection.json',JSON.stringify({coverage,captures,errors},null,2))
  if(errors.length)process.exitCode=1
} finally {await browser.close()}
