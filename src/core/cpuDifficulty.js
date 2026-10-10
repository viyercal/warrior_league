export const DEFAULT_CPU_LEVEL = 6
export const CPU_LABELS = ['Initiate', 'Recruit', 'Apprentice', 'Fighter', 'Warrior', 'Veteran', 'Elite', 'Champion', 'Master', 'Legend']

export function normalizeCpuLevel(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return DEFAULT_CPU_LEVEL
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.min(10, Math.round(number))) : DEFAULT_CPU_LEVEL
}

export const normalizeDuelMode = value => value === 'single' ? 'single' : 'tower'
export const hasCpuLevels = (game, mode) => game === 'brawl' || (game === 'duel' && mode === 'single')

// Level 5 sits near the old platform-brawler tuning. These are authored
// behavior tiers, not ratings calibrated to a human win-rate dataset.
const curve = (level, low, middle, high) => level <= 5
  ? low + (middle - low) * (level - 1) / 4
  : middle + (high - middle) * (level - 5) / 5

const levels = CPU_LABELS.map((label, index) => {
  const level = index + 1
  const at = (low, middle, high) => curve(level, low, middle, high)
  return Object.freeze({
    level, label,
    brawl: Object.freeze({
      level, reaction: at(.72, .28, .10), aggression: at(.25, .9, .98),
      dodgeChance: at(.03, .32, .80), smashChance: at(.12, .22, .28),
      finishChance: at(.22, .60, .88), targetFinishBias: at(0, 7, 11),
      retarget: at(3.2, 2.1, .7), recoveryHeight: at(-2.5, .8, 1.7),
      spacing: at(1.7, 1.25, 1.10), anticipation: at(0, .08, .20),
    }),
    duel: Object.freeze({
      level, reaction: at(.68, .29, .11), aggression: at(.30, .76, .98),
      blockProb: at(.06, .42, .88), chainProb: at(.10, .64, .94),
      cancelProb: at(.02, .32, .75), whiffPunish: at(.02, .38, .88),
      antiAir: at(.03, .4, .90), throwProb: at(.03, .25, .74),
      quickRise: at(.02, .40, .88), specialChance: at(.15, .60, .95),
      readBlockTime: at(1.7, .85, .40), dashiness: at(.08, .40, .72),
      jumpiness: at(.03, .12, .20), prefRange: 1.65, walkMul: 1,
      archetype: 'duelist',
    }),
  })
})

export const cpuDifficulty = value => levels[normalizeCpuLevel(value) - 1]

export function cpuDescription(level, game) {
  const c = cpuDifficulty(level)
  const reaction = Math.round((game === 'brawl' ? c.brawl.reaction : c.duel.reaction) * 1000)
  const style = c.level <= 3 ? 'Forgiving reactions and frequent missed openings.'
    : c.level <= 6 ? 'Steady pressure with room to outplay.'
      : c.level <= 8 ? 'Quick reactions and deliberate defense.'
        : 'Relentless pressure, strong defense and fewer mistakes.'
  return `${style} About ${reaction} ms between decisions.`
}
