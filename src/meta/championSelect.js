import { CHAMPIONS, championArt, getSkin, selectedChampion, selectChampion, skinAppearance } from './champions.js'
import '../ui/champions.css'

/** Artwork-led character selection, backed by the same saved profile as gameplay. */
export function buildChampionSelect(hud, ctx, parent, onChange) {
  const { profile, audio } = ctx
  const stage = hud.el('section', 'champion-presentation')
  hud.root.insertBefore(stage, parent.closest('.loadout-panel'))
  stage.setAttribute('aria-label', 'Champion preview')
  const artwork = hud.el('div', 'champion-artwork', '', stage)
  const imageHost = hud.el('div', 'champion-image-host', '', artwork)
  const state = hud.el('div', 'champion-image-state', '', artwork)
  const message = hud.el('p', '', '', state)
  message.setAttribute('role', 'status')
  const retry = hud.el('button', 'champion-retry', 'Retry artwork', state)
  retry.type = 'button'
  const top = hud.el('div', 'champion-stage-head', '', stage)
  hud.el('span', 'champion-eyebrow', 'WARRIOR LEAGUE / THE ROSTER', top)
  const modes = hud.el('div', 'champion-modes ui-interactive', '', top)
  modes.setAttribute('role', 'group')
  modes.setAttribute('aria-label', 'Preview mode')
  const modeButtons = ['Artwork', '3D preview'].map((label, i) => {
    const button = hud.el('button', '', label, modes)
    button.type = 'button'
    button.onclick = () => setMode(i === 0 ? 'art' : 'model')
    return button
  })
  function setMode(mode) {
    hud.root.dataset.preview = mode
    modeButtons.forEach((button, i) => button.setAttribute('aria-pressed', String((mode === 'art') === (i === 0))))
  }

  const caption = hud.el('div', 'champion-caption', '', stage)
  const role = hud.el('p', 'champion-eyebrow', '', caption)
  const name = hud.el('h1', 'champion-name', '', caption)
  const motif = hud.el('p', 'champion-motif', '', caption)
  const original = hud.el('a', 'champion-original ui-interactive', 'Open full artwork ↗', caption)
  original.target = '_blank'
  original.rel = 'noopener'
  const roster = hud.el('div', 'champion-roster ui-interactive', '', stage)
  roster.setAttribute('role', 'group')
  roster.setAttribute('aria-label', 'Choose your champion')
  const cards = CHAMPIONS.map(champion => {
    const button = hud.el('button', 'champion-card', '', roster)
    button.type = 'button'
    button.dataset.champion = champion.id
    button.setAttribute('aria-label', `Select ${champion.name}`)
    const image = hud.el('img', '', '', button)
    image.alt = ''
    image.draggable = false
    image.style.objectPosition = champion.focal
    image.addEventListener('error', () => { image.style.opacity = '0' })
    image.addEventListener('load', () => { image.style.opacity = '' })
    const text = hud.el('span', 'champion-card-copy', '', button)
    hud.el('span', 'champion-card-number', champion.number, text)
    hud.el('b', '', champion.name, text)
    hud.el('small', '', champion.role, text)
    hud.el('span', 'champion-card-check', '✓', button).setAttribute('aria-hidden', 'true')
    button.onclick = () => {
      if (profile.champion === champion.id) return
      selectChampion(profile, champion.id)
      changed(true)
    }
    return { champion, button, image }
  })

  const section = hud.el('section', 'champion-wardrobe', '', parent)
  hud.el('p', 'champion-eyebrow', 'YOUR CHAMPION', section)
  const identity = hud.el('div', 'champion-identity', '', section)
  const panelName = hud.el('h2', '', '', identity)
  const panelRole = hud.el('span', '', '', identity)
  const description = hud.el('p', 'champion-description', '', section)
  const skinHead = hud.el('div', 'champion-skin-head', '', section)
  hud.el('h3', '', 'Choose a skin', skinHead)
  hud.el('span', '', 'ALL THREE INCLUDED', skinHead)
  const skins = hud.el('div', 'champion-skins', '', section)
  skins.setAttribute('role', 'group')
  skins.setAttribute('aria-label', 'Choose a skin')
  const skinDescription = hud.el('p', 'champion-skin-description', '', section)
  const paletteRow = hud.el('div', 'champion-palette-row', '', section)
  const paletteLabel = hud.el('span', '', '', paletteRow)
  const reset = hud.el('button', 'champion-reset', 'Restore skin defaults', paletteRow)
  reset.type = 'button'
  reset.onclick = () => {
    const { champion, skin } = selectedChampion(profile)
    selectChampion(profile, champion.id, skin.id)
    changed()
  }
  const live = hud.el('span', 'realm-sr-only', '', section)
  live.setAttribute('role', 'status')
  let renderedChampion = null
  let artKey = ''
  let skinButtons = []
  let activeImage
  function loadArtwork(bustCache = false) {
    const { champion, skin } = selectedChampion(profile)
    const image = document.createElement('img')
    activeImage = image
    image.className = 'champion-splash'
    image.alt = `${champion.name}: ${skin.name}`
    image.draggable = false
    image.style.objectPosition = champion.focal
    image.hidden = true
    state.hidden = false
    retry.hidden = true
    message.textContent = 'Loading artwork…'
    image.onload = () => {
      if (image !== activeImage) return
      image.hidden = false
      state.hidden = true
    }
    image.onerror = () => {
      if (image !== activeImage) return
      message.textContent = 'Artwork could not load. Your champion is still selected.'
      retry.hidden = false
    }
    imageHost.replaceChildren(image)
    image.src = championArt(champion, skin) + (bustCache ? `?retry=${Date.now()}` : '')
  }
  retry.onclick = () => loadArtwork(true)
  function changed(championChanged = false) {
    ctx.saveProfile()
    audio.play(championChanged ? 'go' : 'coin', { vol: .4 })
    sync()
    const { champion, skin } = selectedChampion(profile)
    live.textContent = `${champion.name}, ${skin.name} equipped.`
    onChange()
  }
  function sync() {
    const { champion, skin } = selectedChampion(profile)
    role.textContent = `${champion.number} / ${champion.role}`
    name.textContent = champion.name
    motif.textContent = `${skin.name} · ${champion.motif}`
    panelName.textContent = champion.name
    panelRole.textContent = champion.title
    description.textContent = champion.description
    skinDescription.textContent = skin.description
    original.href = championArt(champion, skin)
    stage.style.setProperty('--champion-accent', skin.glow)
    for (const card of cards) {
      card.button.setAttribute('aria-pressed', String(card.champion.id === champion.id))
      const source = championArt(card.champion, getSkin(card.champion, profile.skins?.[card.champion.id]))
      if (card.image.getAttribute('src') !== source) card.image.src = source
    }
    if (renderedChampion !== champion.id) {
      renderedChampion = champion.id
      skins.replaceChildren()
      skinButtons = champion.skins.map((look, i) => {
        const button = hud.el('button', 'champion-skin', '', skins)
        button.type = 'button'
        button.dataset.skin = look.id
        button.setAttribute('aria-label', `Equip ${champion.name}: ${look.name}`)
        const image = hud.el('img', '', '', button)
        image.alt = ''
        image.draggable = false
        image.addEventListener('error', () => { image.style.opacity = '0' })
        image.src = championArt(champion, look)
        hud.el('span', 'champion-skin-type', i === 0 ? 'SIGNATURE' : `SKIN ${String(i + 1).padStart(2, '0')}`, button)
        hud.el('b', '', look.name, button)
        button.onclick = () => {
          if (selectedChampion(profile).skin.id === look.id) return
          selectChampion(profile, champion.id, look.id)
          changed()
        }
        return { button, look }
      })
    }
    skinButtons.forEach(({ button, look }) => button.setAttribute('aria-pressed', String(look.id === skin.id)))
    const expected = skinAppearance(champion, skin)
    const custom = Object.keys(expected).some(key => profile.appearance[key] !== expected[key])
    paletteLabel.textContent = custom ? 'Custom battle effects' : 'Signature effects equipped'
    reset.disabled = !custom
    if (artKey !== `${champion.id}/${skin.id}`) {
      artKey = `${champion.id}/${skin.id}`
      loadArtwork()
    }
  }
  setMode('art')
  sync()
  return { sync, showModel: () => setMode('model') }
}
