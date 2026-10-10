import { Engine } from './core/engine.js'
import { Input } from './core/input.js'
import { GameAudio } from './core/audio.js'
import { SceneManager } from './core/sceneManager.js'
import { GameSession } from './core/session.js'
import { tickMaterials } from './art/materials.js'
import { preloadChampionTextures } from './art/anatomicalRig.js'
import { preloadUnifiedCharacters } from './art/unifiedCharacters.js'
import './ui/immersion.css'
import './ui/battle.css'

const params = new URLSearchParams(location.search)
const boot = document.getElementById('boot')
const enterBtn = document.getElementById('bootEnter')
const status = document.getElementById('bootStatus')

async function start() {
  status.textContent = 'Preparing your champions…'
  await Promise.all([preloadChampionTextures(), preloadUnifiedCharacters()])
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
  input.setBlocked(true, 'boot')
  const session = new GameSession({ engine, input, audio, sm })
  engine.addTicker(tickMaterials)
  engine.start()
  window.__ipl = { engine, input, audio, sm, session }
  // Audio is unlocked by a real gesture, including direct scene links.
  const unlock = () => { if (audio.enabled) audio.unlock() }
  addEventListener('pointerdown', unlock, { once: true })
  addEventListener('keydown', unlock, { once: true })
  let entered = false
  const enter = () => {
    if (entered) return
    entered = true
    unlock()
    boot.classList.add('out')
    boot.inert = true
    input.setBlocked(false, 'boot')
    sm.uiRoot.inert = session.opened
    setTimeout(() => boot.remove(), 650)
    engine.renderer.domElement.tabIndex = -1
    if (session.opened) session.resume.focus({ preventScroll: true })
    else engine.renderer.domElement.focus({ preventScroll: true })
  }
  enterBtn.addEventListener('click', enter)
  boot.addEventListener('keydown', event => {
    if (event.code === 'Tab') { event.preventDefault(); enterBtn.focus() }
  })
  const ready = await sm.goTo(params.get('scene') || 'hub', params.has('mode') ? { mode: params.get('mode') } : {})
  if (!ready) { input.setBlocked(false, 'boot'); boot.remove(); return }
  document.getElementById('bootFill').style.width = '100%'
  status.textContent = 'Your realm awaits.'
  enterBtn.disabled = false
  enterBtn.classList.add('ready')
  sm.uiRoot.inert = true
  enterBtn.focus({ preventScroll: true })
  if (params.has('scene') || params.has('mute') || params.has('auto')) enter()
}

start().catch(error => {
  console.error('[IWL] startup failed:', error)
  status.textContent = 'The realm could not start. Check your connection and that WebGL is available in your browser, then try again.'
  enterBtn.textContent = 'TRY AGAIN'
  enterBtn.disabled = false
  enterBtn.classList.add('ready')
  enterBtn.onclick = () => location.reload()
})
