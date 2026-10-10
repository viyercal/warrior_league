// Reproducible local artwork: capture the actual rendered game worlds without HUDs.
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({channel:'chrome',headless:true})
const page = await browser.newPage({viewport:{width:640,height:360},deviceScaleFactor:1})
await mkdir('public/realms',{recursive:true})
try {
  for(const game of ['duel','moba','arena','kart','brawl','siege','hoops']) {
    await page.goto(`http://127.0.0.1:5199/?scene=${game}&mute=1&dpr=1`)
    await page.waitForFunction(n=>window.__ipl?.sm.currentName===n,game,{timeout:60000})
    await page.addStyleTag({content:'#ui, .session-menu, .session-overlay, #boot { visibility: hidden !important }'})
    await page.waitForTimeout(5500)
    await page.screenshot({path:`public/realms/${game}.jpg`,type:'jpeg',quality:82})
    console.log('Captured',game)
  }
} finally { await browser.close() }
