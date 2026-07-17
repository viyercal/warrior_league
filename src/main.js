import { Engine } from './core/engine.js'
import { Input } from './core/input.js'
import { GameAudio } from './core/audio.js'
import { SceneManager } from './core/sceneManager.js'
import { tickMaterials } from './art/materials.js'

const params = new URLSearchParams(location.search)

const engine = new Engine(document.getElementById('app'))
const input = new Input(engine.renderer.domElement)
const audio = new GameAudio()
if (params.has('mute')) audio.enabled = false

const sm = new SceneManager({ engine, input, audio })
sm.register('hub', () => import('./meta/hubScene.js'))
sm.register('loadout', () => import('./meta/loadoutScene.js'))
sm.register('moba', () => import('./games/moba/mobaScene.js'))
sm.register('hoops', () => import('./games/hoops/hoopsScene.js'))
sm.register('arena', () => import('./games/arena/arenaScene.js'))
sm.register('kart', () => import('./games/kart/kartScene.js'))
sm.register('brawl', () => import('./games/brawl/brawlScene.js'))
sm.register('siege', () => import('./games/siege/siegeScene.js'))
sm.register('duel', () => import('./games/duel/duelScene.js'))

engine.addTicker(tickMaterials)
engine.start()

// Global escape hatch: back to hub from anywhere
addEventListener('keydown', e => {
  if (e.code === 'Escape' && sm.currentName && sm.currentName !== 'hub') {
    audio.play('back')
    sm.goTo('hub')
  }
})

// dev/QA introspection
window.__ipl = { engine, input, audio, sm }

// ---------- boot flow ----------
const boot = document.getElementById('boot')
const fill = document.getElementById('bootFill')
const enterBtn = document.getElementById('bootEnter')
const startScene = params.get('scene') || 'hub'

let p = 0
const fillTimer = setInterval(() => {
  p = Math.min(100, p + 12 + Math.random() * 18)
  fill.style.width = `${p}%`
  if (p >= 100) {
    clearInterval(fillTimer)
    enterBtn.classList.add('ready')
  }
}, 130)

function enter() {
  audio.unlock()
  boot.classList.add('out')
  setTimeout(() => boot.remove(), 700)
  sm.goTo(startScene)
}
enterBtn.addEventListener('click', () => { audio.play('click'); enter() })

// Headless/QA runs skip the gesture gate
if (params.has('scene') || params.has('mute') || params.has('auto')) {
  setTimeout(enter, 400)
}
