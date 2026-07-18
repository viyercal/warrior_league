// Craft-kit probe: sigil icons are SVG, textures installed on :root, and the
// base widgets carry the forged shapes (shield slots, blade bars, torn tips).
// Run: IPL_PORT=8381 node qa/probe-craft.mjs
import { chromium } from 'playwright-core'

const BASE = `http://localhost:${process.env.IPL_PORT || '8381'}`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

let pass = 0, fail = 0
const check = (name, ok, extra = '') => {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
}

await page.goto(`${BASE}/?scene=moba&mute=1`, { waitUntil: 'load' })
await page.waitForTimeout(4500)

// 1. all 12 skills carry SVG sigil strings
const icons = await page.evaluate(() =>
  import('/src/meta/skills.js').then(m => m.SKILLS.map(s => [s.id, typeof s.icon === 'string' && s.icon.includes('<svg')])))
check('skills: 12 defs', icons.length === 12, String(icons.length))
check('skills: every icon is an <svg> string', icons.every(([, ok]) => ok),
  icons.filter(([, ok]) => !ok).map(([id]) => id).join(',') || 'all svg')

// 2. ability bar renders 4 svg sigils
const svgCount = await page.evaluate(() => document.querySelectorAll('.ability-bar .ability-slot svg').length)
check('ability bar: 4 svg sigils', svgCount === 4, String(svgCount))

// 3. forged shapes: slot shield, blade track, torn tip, chamfered panel classes
const shapes = await page.evaluate(() => {
  const cp = sel => {
    const el = document.querySelector(sel)
    return el ? getComputedStyle(el).clipPath : 'MISSING'
  }
  return {
    slot: cp('.ability-slot'),
    track: cp('.stat-bar-track'),
    tip: cp('.ability-tip'),
    hint: cp('.hint-box'),
  }
})
check('ability-slot has clip-path', shapes.slot !== 'none' && shapes.slot !== 'MISSING', shapes.slot.slice(0, 40))
check('stat-bar-track is a blade (clip-path)', shapes.track !== 'none' && shapes.track !== 'MISSING')
check('ability-tip is torn parchment (clip-path)', shapes.tip !== 'none' && shapes.tip !== 'MISSING')
check('hint-box is torn parchment (clip-path)', shapes.hint !== 'none' && shapes.hint !== 'MISSING')

// 4. textures installed on :root as data URIs
const tex = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  return ['--tex-stone', '--tex-iron', '--tex-bronze', '--tex-parchment']
    .map(k => [k, cs.getPropertyValue(k).includes('url("data:image/png')])
})
for (const [k, ok] of tex) check(`:root ${k} set`, ok)

// 5. key badges + cd sweep classes still present (contract)
const parts = await page.evaluate(() => ({
  badges: document.querySelectorAll('.ability-bar .key-badge').length,
  sweeps: document.querySelectorAll('.ability-bar .cd-sweep').length,
  caps: document.querySelectorAll('.stat-bar .stat-bar-cap').length,
}))
check('4 key badges', parts.badges === 4, String(parts.badges))
check('4 cd sweeps', parts.sweeps === 4, String(parts.sweeps))
check('stat bars have forged end-caps', parts.caps >= 1, String(parts.caps))

console.log(`\n${pass} passed, ${fail} failed. ERRORS: ${errors.length ? JSON.stringify(errors.slice(0, 6)) : 'none'}`)
await browser.close()
process.exit(fail || errors.length ? 1 : 0)
