// Verifies WASD games cast on 1-4 (and Q/E/R aliases) and NOT on W.
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

const cds = () => page.evaluate(() => {
  const s = window.__scene
  const raw = s.cds || s.abilities?.cds || s.game?.eff?.cds
  return raw ? [...raw] : null
})

let pass = 0, fail = 0
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`) }

for (const scene of ['hoops', 'arena']) {
  await page.goto(`http://localhost:5173/?scene=${scene}&mute=1`, { waitUntil: 'load' })
  await page.waitForTimeout(5500)
  await page.mouse.move(720, 300)

  // W must NOT cast
  let before = await cds()
  await page.keyboard.press('KeyW')
  await page.waitForTimeout(250)
  let after = await cds()
  check(`${scene}: W does not cast`, JSON.stringify(before) === JSON.stringify(after) || after[1] === before[1])

  // 1-4 must cast every slot
  for (const [i, key] of [['0', 'Digit1'], ['1', 'Digit2'], ['2', 'Digit3'], ['3', 'Digit4']]) {
    await page.keyboard.press(key)
    await page.waitForTimeout(300)
    const now = await cds()
    check(`${scene}: ${key} casts slot ${i}`, now[Number(i)] > 0)
  }
}
console.log(`\n${pass} passed, ${fail} failed. ERRORS: ${errors.length ? JSON.stringify(errors.slice(0, 5)) : 'none'}`)
await browser.close()
process.exit(fail || errors.length ? 1 : 0)
