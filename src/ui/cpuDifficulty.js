import { CPU_LABELS, cpuDifficulty, cpuDescription, normalizeCpuLevel } from '../core/cpuDifficulty.js'
import './cpuDifficulty.css'

let serial = 0

/** Native radio controls keep arrow-key selection separate from gameplay. */
export function createCpuPicker({ profile, onChange, game = 'brawl', activeLevel = null }) {
  const id = `cpu-picker-${++serial}`
  const root = document.createElement('fieldset')
  root.className = 'cpu-difficulty ui-interactive'
  const legend = document.createElement('legend')
  legend.textContent = 'CPU difficulty'
  const value = document.createElement('output')
  value.className = 'cpu-value'
  const row = document.createElement('div')
  row.className = 'cpu-levels'
  const description = document.createElement('p')
  description.className = 'cpu-description'
  description.id = `${id}-description`
  const note = document.createElement('p')
  note.className = 'cpu-note'
  note.id = `${id}-note`
  note.setAttribute('role', 'status')
  const inputs = CPU_LABELS.map((label, index) => {
    const wrap = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'radio'
    input.name = id
    input.value = index + 1
    input.setAttribute('aria-label', `Level ${index + 1}: ${label}`)
    input.setAttribute('aria-describedby', `${id}-description ${id}-note`)
    const number = document.createElement('span')
    number.textContent = index + 1
    wrap.append(input, number)
    row.append(wrap)
    input.addEventListener('change', () => {
      if (!input.checked) return
      profile.cpuLevel = normalizeCpuLevel(input.value)
      refresh()
      onChange?.()
      dispatchEvent(new CustomEvent('iwl:cpu-settings'))
    })
    return input
  })
  root.append(legend, value, row, description, note)
  function refresh(context = {}) {
    if ('game' in context) game = context.game
    if ('activeLevel' in context) activeLevel = context.activeLevel
    const c = cpuDifficulty(profile.cpuLevel)
    value.textContent = `${c.level} / 10 · ${c.label}`
    inputs.forEach((input, index) => { input.checked = index + 1 === c.level })
    description.textContent = cpuDescription(c.level, game)
    note.textContent = activeLevel != null && activeLevel !== c.level
      ? `This match stays at level ${activeLevel}. Level ${c.level} applies on restart or your next battle.`
      : 'Saved for Mortal Arena and Single Duel. Health and damage stay the same.'
  }
  const sync = () => refresh()
  addEventListener('iwl:cpu-settings', sync)
  refresh()
  return { root, refresh, dispose: () => removeEventListener('iwl:cpu-settings', sync) }
}
