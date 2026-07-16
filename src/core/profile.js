const KEY = 'ipl-profile-v2'

export const HEAD_STYLES = ['visor', 'orb', 'classic']
export const HAIR_STYLES = ['spikes', 'swept', 'horns', 'none']
export const TRAILS = ['spark', 'ribbon', 'none']

export function defaultProfile() {
  return {
    name: 'RAVAGER',
    appearance: {
      primary: '#b0793a',
      secondary: '#3a2a20',
      glow: '#ff8c3b',
      head: 'visor',
      hair: 'spikes',
      trail: 'spark',
      cape: true,
    },
    loadout: ['blink', 'starfire', 'quake', 'comet'],
    stats: { wins: {}, plays: {} },
  }
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultProfile()
    const p = JSON.parse(raw)
    const d = defaultProfile()
    return {
      ...d,
      ...p,
      appearance: { ...d.appearance, ...(p.appearance || {}) },
      stats: { wins: {}, plays: {}, ...(p.stats || {}) },
      loadout: Array.isArray(p.loadout) && p.loadout.length === 4 ? p.loadout : d.loadout,
    }
  } catch {
    return defaultProfile()
  }
}

export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* storage unavailable */ }
}
