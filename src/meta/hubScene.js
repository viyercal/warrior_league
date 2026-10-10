import * as THREE from 'three'
import { icon } from '../ui/craft.js'
import { getSkill } from './skills.js'
import { REALMS } from './realms.js'
import { buildRealmWorld } from './realmWorld.js'
import { damp } from '../core/utils.js'
import { selectedChampion } from './champions.js'
import { championPortrait } from '../ui/championPortrait.js'
import { createCpuPicker } from '../ui/cpuDifficulty.js'
import { hasCpuLevels, normalizeDuelMode } from '../core/cpuDifficulty.js'
import '../ui/hub.css'

const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>'
const crest = '<svg viewBox="0 0 44 48" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M22 2 40 12v20L22 46 4 32V12Z"/><path d="m13 14 18 19M31 14 13 33M11 26l8 7m6 0 8-7M22 6v5M22 38v5"/><path d="m12 12 4 2-2 4m18-6-4 2 2 4"/></svg>'

function el(tag, cls, parent, text) {
  const node = document.createElement(tag)
  node.className = cls
  if (text != null) node.textContent = text
  parent?.appendChild(node)
  return node
}
function button(cls, parent, text, action) {
  const b = el('button', cls, parent, text)
  b.type = 'button'
  b.addEventListener('click', action)
  return b
}

export default class HubScene {
  constructor(ctx) {
    this.ctx = ctx
    this.postOpts = { bloom: 0.34, bloomThreshold: 1.05, bloomRadius: 0.45, vignette: 0.34, grain: 0.006, saturation: 0.93, contrast: 1.04 }
  }

  async init() {
    const { engine, audio, profile } = this.ctx
    this.scene = new THREE.Scene()
    this.scene.environment = engine.envMap
    this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 600)
    this.camera.position.set(0, 4.2, 15)
    this.look = new THREE.Vector3(0, 2.8, 0)
    this.camera.lookAt(this.look)
    this.world = buildRealmWorld(this.scene, profile.appearance, engine)
    this.hero = this.world.hero
    this.focusIdx = -1
    this.parallax = new THREE.Vector2()
    this.motionPreference = matchMedia('(prefers-reduced-motion: reduce)')
    this.transition = false
    this._buildUI()
    const last = REALMS.findIndex(r => r.game === profile.lastRealm)
    this.select(last < 0 ? 0 : last)
    this._bindInput()
    audio.music('hub')
    audio.ambience('hub')
    this.debug = {
      focus: i => this.select(i),
      activate: i => { this.select(i); this.play() },
      screenPos: i => { const r = this.cards[i].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } },
    }
  }

  _buildUI() {
    const { profile, audio } = this.ctx
    this.root = el('main', 'realm-hub', document.getElementById('ui'))
    this.root.setAttribute('aria-label', 'Warrior League battlegrounds')
    el('div', 'realm-scrim', this.root).setAttribute('aria-hidden', 'true')
    const header = el('header', 'realm-header', this.root)
    const brand = el('div', 'realm-brand', header)
    brand.innerHTML = `${crest}<span>WARRIOR<span>LEAGUE</span></span>`
    const nav = el('nav', 'realm-nav', header)
    nav.setAttribute('aria-label', 'Main navigation')
    const realms = button('realm-nav-link selected', nav, 'Battlegrounds', () => this.cards[this.focusIdx].focus())
    realms.setAttribute('aria-current', 'page')
    button('realm-nav-link', nav, 'War forge', () => this.forge(false))
    const { champion, skin } = selectedChampion(profile)
    const player = button('realm-player', header, '', () => this.forge(false))
    player.setAttribute('aria-label', `Change champion: ${champion.name}, ${skin.name}`)
    championPortrait(el('span', 'realm-player-portrait', player), champion, skin)
    const identity = el('div', '', player)
    el('span', 'realm-player-name', identity, String(profile.name || 'Warlord'))
    el('span', 'realm-player-caption', identity, `${champion.name} · ${skin.name}`)
    const settings = button('realm-settings', header, '', () => dispatchEvent(new CustomEvent('iwl:settings')))
    settings.setAttribute('aria-label', 'Settings')
    settings.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 2-1 3 2 3-2 2 1 3-3-1-2 2-3-2-3-3-1-1-3Z"/><circle cx="11.5" cy="11.5" r="3"/></svg>'

    const body = el('section', 'realm-feature', this.root)
    this.eyebrow = el('div', 'realm-eyebrow', body)
    this.title = el('h1', 'realm-title', body)
    this.desc = el('p', 'realm-description', body)
    this.tags = el('div', 'realm-tags', body)
    this.matchOptions = el('div', 'cpu-match-options ui-interactive', body)
    this.modeField = el('fieldset', 'cpu-mode', this.matchOptions)
    el('legend', '', this.modeField, 'Crucible mode')
    this.modeButtons = ['single', 'tower'].map(mode => {
      const b = button('', this.modeField, mode === 'single' ? 'Single Duel' : 'Tower', () => {
        profile.duelMode = mode
        this.ctx.saveProfile()
        dispatchEvent(new CustomEvent('iwl:cpu-settings'))
      })
      b.dataset.mode = mode
      return b
    })
    this.cpuPicker = createCpuPicker({ profile, onChange: () => this.ctx.saveProfile() })
    this.matchOptions.append(this.cpuPicker.root)
    this.towerNote = el('p', 'cpu-tower-note', this.matchOptions, 'Four opponents with their own rising difficulty. Choose Single Duel to set a CPU level.')
    this._cpuSettingsChanged = () => this._refreshMatchOptions()
    addEventListener('iwl:cpu-settings', this._cpuSettingsChanged)
    const actions = el('div', 'realm-actions', body)
    this.playButton = button('realm-play', actions, '', () => this.play())
    this.playButton.innerHTML = `<span>ENTER BATTLE</span>${arrow}`
    button('realm-prepare', actions, 'Prepare loadout', () => this.forge(true))
    this.guideButton = button('realm-guide-toggle', body, 'How to play', () => this.toggleGuide())
    this.guideButton.setAttribute('aria-expanded', 'false')
    this.guideButton.setAttribute('aria-controls', 'realm-guide')
    this.guide = el('div', 'realm-guide', body)
    this.guide.id = 'realm-guide'
    this.guide.hidden = true
    this.objective = el('p', '', this.guide)
    this.controls = el('div', 'realm-controls', this.guide)
    this.live = el('div', 'realm-sr-only', this.root)
    this.live.setAttribute('role', 'status')

    const loadout = el('aside', 'realm-loadout', this.root)
    el('span', 'realm-small-label', loadout, `${champion.name.toUpperCase()} / ${skin.name.toUpperCase()}`)
    const arts = el('div', 'realm-arts', loadout)
    profile.loadout.forEach((id, i) => {
      const skill = getSkill(id)
      if (!skill) return
      const b = button('realm-art', arts, '', () => this.forge(true))
      b.innerHTML = `${skill.icon}<span>${i + 1}</span>`
      b.title = skill.name
      b.setAttribute('aria-label', `Edit battle art ${i + 1}: ${skill.name}`)
    })
    this.record = el('span', 'realm-record', loadout)

    const collection = el('section', 'realm-collection', this.root)
    collection.setAttribute('aria-label', 'Choose your battleground')
    const collectionHead = el('div', 'realm-collection-head', collection)
    const collectionLabel = el('div', '', collectionHead)
    el('span', 'realm-small-label', collectionLabel, 'CHOOSE YOUR BATTLEGROUND')
    this.counter = el('span', 'realm-counter', collectionLabel)
    el('span', 'realm-keyboard-hint', collectionHead, '← →  SELECT    /    ENTER  PLAY')
    const cards = el('div', 'realm-cards', collection)
    this.cards = REALMS.map((realm, i) => {
      const card = button('realm-card', cards, '', () => this.select(i, true))
      card.dataset.realm = realm.game
      card.setAttribute('aria-label', `Select ${realm.title}`)
      card.style.setProperty('--card-color', realm.color)
      const art = el('img', 'realm-card-art', card)
      art.src = realm.image
      art.alt = ''
      art.draggable = false
      el('span', 'realm-card-no', card, String(i + 1).padStart(2, '0'))
      el('span', 'realm-card-icon', card).innerHTML = icon(realm.icon, { size: 22 })
      const caption = el('span', 'realm-card-caption', card)
      el('span', 'realm-card-title', caption, realm.title)
      el('span', 'realm-card-genre', caption, realm.genre)
      card.addEventListener('pointerenter', () => this.preload(realm.game))
      card.addEventListener('focus', () => this.preload(realm.game))
      card.addEventListener('keydown', e => {
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault(); e.stopPropagation(); this.select(i); this.play()
        } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
          e.preventDefault(); e.stopPropagation()
          const next = (i + (e.code === 'ArrowRight' ? 1 : -1) + REALMS.length) % REALMS.length
          this.select(next, true)
          this.cards[next].focus()
        }
      })
      return card
    })
    const footer = el('footer', 'realm-footer', this.root)
    el('span', '', footer, 'SEVEN REALMS. ONE LEGEND.')
    el('span', '', footer, 'Keyboard + mouse · Solo vs AI')
    audio.play('hover', { vol: 0.1 })
  }

  select(index, sound = false) {
    if (this.transition || index === this.focusIdx || !REALMS[index]) return
    this.focusIdx = index
    const r = REALMS[index]
    this.root.style.setProperty('--realm-color', r.color)
    this.eyebrow.textContent = r.category
    this.title.replaceChildren(...r.lines.map(line => el('span', '', null, line)))
    this.desc.textContent = r.desc
    this.tags.replaceChildren(...r.tags.map(tag => el('span', '', null, tag)))
    this.objective.textContent = r.objective
    this.controls.replaceChildren(...r.controls.map(([key, action]) => {
      const row = el('div', 'realm-control')
      el('kbd', '', row, key); el('span', '', row, action)
      return row
    }))
    this.cards.forEach((card, i) => {
      card.classList.toggle('selected', i === index)
      card.setAttribute('aria-pressed', String(i === index))
    })
    this.counter.textContent = `${String(index + 1).padStart(2, '0')} / 07`
    this._refreshMatchOptions()
    this.world.setRealm(r.game)
    this.preload(r.game)
    this.live.textContent = `${r.title} selected. ${r.genre}.`
    if (sound) this.ctx.audio.play('hover', { vol: 0.35 })
  }

  preload(game) {
    // Speculative loading must never interrupt selection on a failed connection.
    this.ctx.preload?.(game)?.catch(() => {})
  }

  _refreshMatchOptions() {
    const r = REALMS[this.focusIdx]
    if (!r) return
    const { profile } = this.ctx
    const mode = normalizeDuelMode(profile.duelMode)
    const isDuel = r.game === 'duel'
    const enabled = hasCpuLevels(r.game, mode)
    this.matchOptions.hidden = !isDuel && !enabled
    this.root.classList.toggle('has-match-options', !this.matchOptions.hidden)
    this.modeField.hidden = !isDuel
    this.modeButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)))
    this.cpuPicker.root.hidden = !enabled
    this.cpuPicker.refresh({ game: r.game, activeLevel: null })
    this.towerNote.hidden = !isDuel || mode !== 'tower'
    const single = isDuel && mode === 'single'
    this.tags.replaceChildren(...(single ? ['1v1 combat', 'Best of three', 'Single duel'] : r.tags).map(tag => el('span', '', null, tag)))
    this.desc.textContent = single ? 'Face Ashborn in a single best-of-three duel. Set the challenge, learn his openings, and earn the rematch.' : r.desc
    const wins = Number(profile.stats?.wins?.[single ? 'duelSingle' : r.game]) || 0
    this.record.textContent = `${wins} ${wins === 1 ? 'victory' : 'victories'} in ${single ? 'Single Duel' : r.title}`
  }

  toggleGuide() {
    this.guide.hidden = !this.guide.hidden
    this.guideButton.setAttribute('aria-expanded', String(!this.guide.hidden))
    this.guideButton.textContent = this.guide.hidden ? 'How to play' : 'Hide controls'
    this.root.classList.toggle('guide-open', !this.guide.hidden)
  }

  _bindInput() {
    this.ctx.input.onKey((code, down, e) => {
      if (!down || this.transition || e.target?.closest('button, input, select, textarea, [role="dialog"]')) return
      if (code === 'ArrowRight') { e.preventDefault(); this.select((this.focusIdx + 1) % REALMS.length, true) }
      else if (code === 'ArrowLeft') { e.preventDefault(); this.select((this.focusIdx + REALMS.length - 1) % REALMS.length, true) }
      else if (/^Digit[1-7]$/.test(code)) this.select(Number(code.slice(-1)) - 1, true)
      else if (code === 'Enter' || code === 'NumpadEnter') this.play()
      else if (code === 'KeyC') this.forge(false)
      else if (code === 'KeyH') this.toggleGuide()
    })
  }

  async play() {
    if (this.transition) return
    this.transition = true
    this.playButton.disabled = true
    this.playButton.querySelector('span').textContent = 'ENTERING REALM'
    const realm = REALMS[this.focusIdx]
    this.ctx.profile.lastRealm = realm.game
    this.ctx.saveProfile()
    this.ctx.audio.unlock()
    this.ctx.audio.play('whoosh', { vol: 0.7 })
    await this.ctx.goTo(realm.game)
    if (this.root.isConnected) {
      this.transition = false
      this.playButton.disabled = false
      this.playButton.querySelector('span').textContent = 'ENTER BATTLE'
    }
  }

  forge(selected) {
    if (this.transition) return
    this.ctx.audio.play('click')
    this.ctx.goTo('loadout', { game: selected ? REALMS[this.focusIdx].game : null })
  }

  update(dt, t) {
    this.world.update(dt, t)
    const reduced = this.ctx.engine.reducedMotion || this.motionPreference.matches
    const mouse = this.ctx.input.cameraMouse
    this.parallax.x = damp(this.parallax.x, reduced ? 0 : mouse.x, 2.2, dt)
    this.parallax.y = damp(this.parallax.y, reduced ? 0 : mouse.y, 2.2, dt)
    const narrow = innerWidth < 700
    this.camera.position.set((narrow ? 1.6 : 0) + this.parallax.x * 0.24, 4.2 + this.parallax.y * 0.1, narrow ? 18 : 15)
    this.look.set(narrow ? 1.6 : 0, 2.8, 0)
    this.camera.lookAt(this.look)
  }

  dispose() {
    this.cpuPicker?.dispose()
    removeEventListener('iwl:cpu-settings', this._cpuSettingsChanged)
    this.world.dispose?.()
  }
}
