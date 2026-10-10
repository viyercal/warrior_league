import { CHAMPIONS, defaultSkins, getChampion, getSkin, skinAppearance } from '../meta/champions.js'
import { DEFAULT_CPU_LEVEL, normalizeCpuLevel, normalizeDuelMode } from './cpuDifficulty.js'

const KEY = 'ipl-profile-v2'

export const HEAD_STYLES = ['visor', 'orb', 'classic']
export const HAIR_STYLES = ['spikes', 'swept', 'horns', 'none']
export const TRAILS = ['spark', 'ribbon', 'none']

export function defaultProfile() {
  return {
    name: 'RAVAGER',
    champion: 'caelan',
    skins: defaultSkins(),
    appearance: skinAppearance(CHAMPIONS[0], CHAMPIONS[0].skins[0]),
    loadout: ['blink', 'starfire', 'quake', 'comet'],
    cpuLevel: DEFAULT_CPU_LEVEL,
    duelMode: 'tower',
    stats: { wins: {}, plays: {} },
  }
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultProfile()
    const p = JSON.parse(raw)
    const d = defaultProfile()
    const champion = getChampion(p?.champion)
    const skins = Object.fromEntries(CHAMPIONS.map(c => [c.id, getSkin(c, p?.skins?.[c.id]).id]))
    const appearance = skinAppearance(champion, getSkin(champion, skins[champion.id]))
    return {
      ...d,
      ...p,
      champion: champion.id,
      skins,
      cpuLevel: normalizeCpuLevel(p.cpuLevel),
      duelMode: normalizeDuelMode(p.duelMode),
      // Authored outfits keep their intended material palette. Preserve only
      // supported effect choices from old custom-paint profiles.
      appearance: {
        ...appearance,
        glow: /^#[0-9a-f]{6}$/i.test(p.appearance?.glow) ? p.appearance.glow : appearance.glow,
        trail: TRAILS.includes(p.appearance?.trail) ? p.appearance.trail : appearance.trail,
      },
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
