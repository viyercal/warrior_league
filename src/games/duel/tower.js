/**
 * The Crucible tower — four named opponents, climbed in order.
 * Reactive block probability rises by stage: 0.25 / 0.4 / 0.55 / 0.7.
 * quickRise: odds the AI taps a direction on landing to skip the prone beat
 * (0 at stage 1 so first-timers get the full knockdown rhythm).
 */
export const TOWER = [
  {
    id: 'ashborn', name: 'ASHBORN', short: 'ASHBORN', title: 'THE RECKLESS FLAME', color: '#ff5a26',
    appearance: { primary: '#8a2f1c', secondary: '#2c1410', glow: '#ff5a26', head: 'classic', hair: 'spikes', cape: false },
    specials: ['blink', 'quake'],
    ai: {
      archetype: 'rusher', reaction: 0.42, blockProb: 0.25, aggression: 0.9,
      prefRange: 1.7, throwProb: 0.08, antiAir: 0.15, whiffPunish: 0.1,
      jumpiness: 0.18, dashiness: 0.5, chainProb: 0.55, cancelProb: 0.25, walkMul: 1, quickRise: 0,
    },
  },
  {
    id: 'sera', name: 'SERA THE COLD', short: 'SERA', title: 'MISTRESS OF THE STILL AIR', color: '#b8c4c8',
    appearance: { primary: '#5d7078', secondary: '#1e262c', glow: '#bcd8e0', head: 'orb', hair: 'swept', cape: true },
    specials: ['starfire', 'frostring'],
    ai: {
      archetype: 'zoner', reaction: 0.3, blockProb: 0.4, aggression: 0.35,
      prefRange: 6.8, throwProb: 0.14, antiAir: 0.55, whiffPunish: 0.35,
      jumpiness: 0.06, dashiness: 0.25, chainProb: 0.5, cancelProb: 0.3, walkMul: 1, quickRise: 0.3,
    },
  },
  {
    id: 'gorehowl', name: 'GOREHOWL', short: 'GOREHOWL', title: 'THE UNCHAINED', color: '#ffb84d',
    appearance: { primary: '#6d4b22', secondary: '#241a12', glow: '#ffb84d', head: 'visor', hair: 'horns', cape: true },
    specials: ['titan', 'gravity'],
    ai: {
      archetype: 'grappler', reaction: 0.26, blockProb: 0.55, aggression: 0.62,
      prefRange: 1.4, throwProb: 0.55, antiAir: 0.35, whiffPunish: 0.45,
      jumpiness: 0.04, dashiness: 0.12, chainProb: 0.6, cancelProb: 0.3, walkMul: 0.85, quickRise: 0.5,
    },
  },
  {
    id: 'eternal', name: 'THE ETERNAL', short: 'ETERNAL', title: 'CHAMPION OF A THOUSAND CRUCIBLES', color: '#c23b2e', boss: true,
    appearance: { primary: '#3a3f4a', secondary: '#1a1015', glow: '#ff3524', head: 'visor', hair: 'horns', cape: true },
    specials: ['blink', 'starfire', 'quake', 'comet'],
    ai: {
      archetype: 'boss', reaction: 0.2, blockProb: 0.7, aggression: 0.72,
      prefRange: 3.2, throwProb: 0.4, antiAir: 0.8, whiffPunish: 0.8,
      jumpiness: 0.12, dashiness: 0.5, chainProb: 0.75, cancelProb: 0.55, walkMul: 1, quickRise: 0.8,
    },
  },
]
