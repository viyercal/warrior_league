import { SKILLS, KEY_LABELS } from './skills.js'

export const GAME_TITLES = {
  moba: 'WAR RIFT', hoops: 'BLOOD COURT', arena: 'THE PIT',
  kart: 'WAR CHARIOTS', brawl: 'MORTAL ARENA', siege: 'LAST BASTION',
  duel: 'THE CRUCIBLE',
}
const GAME_ORDER = ['moba', 'hoops', 'arena', 'kart', 'brawl', 'siege', 'duel']
const GAME_SHORT = { moba: 'RIFT', hoops: 'COURT', arena: 'PIT', kart: 'CHARIOT', brawl: 'ARENA', siege: 'SIEGE', duel: 'CRUCIBLE' }

// war paint: bronze, blood, iron, bone, witchfire, olive, nightshade, leather
const PRIMARY = ['#b0793a', '#c23b2e', '#6b6f78', '#e8dcc4', '#7dff8a', '#8fae4a', '#75559e', '#4a352a']
// rune-glow: torch gold, forge fire, crimson, moon steel, ember, venom, wraith bone, bone white
const GLOWS = ['#ffb84d', '#ff5a26', '#c23b2e', '#9fb8c8', '#ff8a5c', '#9fce4a', '#d8d2c2', '#e8dcc4']
const SECONDARY = ['#3a2a20', '#2a2621', '#3a3e46', '#4a1a1c', '#2c2233', '#5c3d1a']

const SEGMENTS = [
  { key: 'head', label: 'HEAD', opts: [['visor', 'VISOR'], ['orb', 'ORB'], ['classic', 'CLASSIC']] },
  { key: 'hair', label: 'HAIR', opts: [['spikes', 'SPIKES'], ['swept', 'SWEPT'], ['horns', 'HORNS'], ['none', 'NONE']] },
  { key: 'cape', label: 'CAPE', opts: [[true, 'ON'], [false, 'OFF']] },
  { key: 'trail', label: 'TRAIL', opts: [['spark', 'SPARK'], ['ribbon', 'RIBBON'], ['none', 'NONE']] },
]

/**
 * The right-side WAR FORGE panel: war name, appearance swatches/segments,
 * Q-W-E-R equip slots + 12-art grid with rich tooltips, footer nav.
 * Every mutation hits ctx.profile + ctx.saveProfile() immediately.
 */
export function buildLoadoutPanel(hud, ctx, hooks = {}) {
  const { profile, audio, saveProfile, goTo, params } = ctx
  const game = params?.game || null
  const syncs = []
  const sync = () => syncs.forEach(f => f())

  const root = hud.el('div', 'loadout-panel ui-interactive')

  // ---------- header ----------
  const head = hud.el('div', 'loadout-head', '', root)
  hud.el('div', 'loadout-kicker', game ? 'PREPARE FOR BATTLE' : 'FORGE YOUR LEGEND', head)
  hud.el('div', 'loadout-title', 'WAR FORGE', head)
  const nameRow = hud.el('div', 'loadout-namerow', '', head)
  hud.el('div', 'loadout-namelabel', 'WAR NAME', nameRow)
  const nameInput = hud.el('input', 'loadout-name', '', nameRow)
  nameInput.maxLength = 12
  nameInput.spellcheck = false
  nameInput.value = profile.name || ''
  nameInput.addEventListener('input', () => {
    profile.name = nameInput.value.toUpperCase().slice(0, 12)
    nameInput.value = profile.name
    saveProfile()
  })
  nameInput.addEventListener('focus', () => nameInput.select())
  if (game) hud.el('div', `loadout-next loadout-g-${game}`, `NEXT BATTLE &nbsp;·&nbsp; ${GAME_TITLES[game]}`, head)

  const scroll = hud.el('div', 'loadout-scroll', '', root)
  const section = title => {
    const s = hud.el('div', 'loadout-sec', '', scroll)
    hud.el('div', 'loadout-sec-title', title, s)
    return s
  }

  // ---------- appearance ----------
  const secA = section('WAR PAINT & ARMOR')
  const swatchRow = (label, colors, key) => {
    const row = hud.el('div', 'loadout-row', '', secA)
    hud.el('div', 'loadout-label', label, row)
    const wrap = hud.el('div', 'loadout-swatches', '', row)
    const btns = colors.map(c => {
      const b = hud.el('div', 'loadout-swatch', '', wrap)
      b.style.setProperty('--sw', c)
      b.onclick = () => {
        if (profile.appearance[key] === c) return
        profile.appearance[key] = c
        saveProfile()
        sync()
        hooks.onAppearance?.()
      }
      return [b, c]
    })
    syncs.push(() => { for (const [b, c] of btns) b.classList.toggle('sel', profile.appearance[key] === c) })
  }
  swatchRow('PRIMARY', PRIMARY, 'primary')
  swatchRow('GLOW', GLOWS, 'glow')
  swatchRow('ARMOR', SECONDARY, 'secondary')

  for (const seg of SEGMENTS) {
    const row = hud.el('div', 'loadout-row', '', secA)
    hud.el('div', 'loadout-label', seg.label, row)
    const wrap = hud.el('div', 'loadout-seg', '', row)
    const btns = seg.opts.map(([val, name]) => {
      const b = hud.el('div', 'loadout-seg-btn', name, wrap)
      b.onclick = () => {
        if (profile.appearance[seg.key] === val) return
        profile.appearance[seg.key] = val
        saveProfile()
        sync()
        hooks.onAppearance?.()
      }
      return [b, val]
    })
    syncs.push(() => { for (const [b, val] of btns) b.classList.toggle('sel', profile.appearance[seg.key] === val) })
  }

  // ---------- skillset ----------
  const secS = section('BATTLE ARTS')
  hud.el('div', 'loadout-hintline', 'PICK A SLOT, THEN CLAIM AN ART — EQUIPPED ONES SWAP', secS)
  let active = 0
  const slotsWrap = hud.el('div', 'loadout-slots', '', secS)
  const slotEls = KEY_LABELS.map((k, i) => {
    const s = hud.el('div', 'loadout-slot', '', slotsWrap)
    hud.el('div', 'loadout-slot-key', k, s)
    const ic = hud.el('div', 'loadout-slot-icon', '', s)
    const nm = hud.el('div', 'loadout-slot-name', '', s)
    s.onclick = () => { active = i; audio.play('click', { vol: 0.5 }); sync() }
    return { s, ic, nm }
  })
  syncs.push(() => {
    profile.loadout.forEach((id, i) => {
      const sk = SKILLS.find(x => x.id === id)
      const { s, ic, nm } = slotEls[i]
      ic.textContent = sk ? sk.icon : '·'
      nm.textContent = sk ? sk.name : 'EMPTY'
      s.style.setProperty('--sw', sk ? sk.color : '#6b5a44')
      s.classList.toggle('active', i === active)
    })
  })

  const grid = hud.el('div', 'loadout-grid', '', secS)
  const tip = hud.el('div', 'loadout-tip')
  // 7 games per skill: with a destination game its line gets the full "hot"
  // row and the other six collapse into a compact dimmed stack; with no
  // destination (hub customize) all seven render as one tight legible list.
  const showTip = (sk, cell) => {
    let rows
    if (game) {
      rows = `<div class="loadout-tip-game hot"><b>${GAME_TITLES[game]}</b><span>${sk.inGame[game]}</span></div>` +
        '<div class="loadout-tip-others">OTHER GAMES</div>' +
        GAME_ORDER.filter(g => g !== game)
          .map(g => `<div class="loadout-tip-mini"><b>${GAME_SHORT[g]}</b><span>${sk.inGame[g]}</span></div>`).join('')
    } else {
      rows = GAME_ORDER
        .map(g => `<div class="loadout-tip-mini all"><b>${GAME_SHORT[g]}</b><span>${sk.inGame[g]}</span></div>`).join('')
    }
    tip.innerHTML =
      `<div class="loadout-tip-head"><span>${sk.icon}</span><b>${sk.name}</b><i>${sk.cd}s CD</i></div>` +
      `<p>${sk.desc}</p><div class="loadout-tip-games">${rows}</div>`
    tip.style.setProperty('--sw', sk.color)
    tip.classList.add('on')
    const r = cell.getBoundingClientRect()
    const pr = root.getBoundingClientRect()
    tip.style.right = `${innerWidth - pr.left + 14}px`
    const th = tip.offsetHeight
    tip.style.top = `${Math.max(12, Math.min(innerHeight - th - 12, r.top + r.height / 2 - th / 2))}px`
  }
  const hideTip = () => tip.classList.remove('on')

  const pop = el => { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop') }
  const equip = (sk, cell) => {
    const lo = profile.loadout
    const cur = lo.indexOf(sk.id)
    if (cur === active) {
      active = (active + 1) % 4
      audio.play('click', { vol: 0.4 })
      sync()
      return
    }
    if (cur >= 0) {
      lo[cur] = lo[active]
      lo[active] = sk.id
      audio.play('zap', { vol: 0.45 })
    } else {
      lo[active] = sk.id
      audio.play('coin', { vol: 0.5 })
    }
    saveProfile()
    pop(slotEls[active].s)
    pop(cell)
    active = (active + 1) % 4
    sync()
    hooks.onEquip?.(sk)
  }

  const cells = SKILLS.map(sk => {
    const c = hud.el('div', 'loadout-skill', '', grid)
    c.style.setProperty('--sw', sk.color)
    hud.el('div', 'loadout-skill-icon', sk.icon, c)
    hud.el('div', 'loadout-skill-name', sk.name, c)
    const badge = hud.el('div', 'loadout-skill-badge', '', c)
    c.onclick = () => equip(sk, c)
    c.onmouseenter = () => { audio.play('hover', { vol: 0.25 }); showTip(sk, c) }
    c.onmouseleave = hideTip
    return { c, badge, sk }
  })
  syncs.push(() => {
    for (const { c, badge, sk } of cells) {
      const i = profile.loadout.indexOf(sk.id)
      c.classList.toggle('equipped', i >= 0)
      badge.textContent = i >= 0 ? KEY_LABELS[i] : ''
    }
  })

  // ---------- footer ----------
  const foot = hud.el('div', 'loadout-foot', '', root)
  const back = hud.el('button', 'ghost loadout-back', 'BACK', foot)
  back.onclick = () => { audio.play('back'); goTo('hub') }
  const go = hud.el('button', `loadout-go${game ? ` loadout-g-${game}` : ''}`,
    game ? `ENTER ${GAME_TITLES[game]} ▶` : 'SEAL & RETURN', foot)
  go.onclick = () => {
    saveProfile()
    audio.play(game ? 'go' : 'coin')
    goTo(game || 'hub')
  }

  // ---------- stage overlay: dance toggle + drag hint ----------
  const stage = hud.el('div', 'loadout-stagebar ui-interactive')
  hud.el('div', 'loadout-draghint', '⟲ DRAG TO TURN', stage)
  const dance = hud.el('button', 'ghost loadout-dance', '♪ WAR DANCE <span>P</span>', stage)
  dance.onclick = () => hooks.onDance?.()

  sync()
  return { root, sync, setDance: on => dance.classList.toggle('on', on) }
}
