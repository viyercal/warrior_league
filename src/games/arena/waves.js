/**
 * THE PIT wave director data: per-wave enemy mixes that shift brutal
 * over time, plus queue building. Wave 5 is the PIT WARDEN boss wave.
 */
export const WAVE_COUNT = 8
export const BOSS_WAVE = 5

const MIXES = {
  1: { grunt: 1 },
  2: { grunt: 0.7, sprinter: 0.3 },
  3: { grunt: 0.5, sprinter: 0.3, exploder: 0.2 },
  4: { grunt: 0.4, sprinter: 0.25, exploder: 0.2, brute: 0.15 },
  5: { grunt: 0.5, sprinter: 0.3, exploder: 0.2 },
  6: { grunt: 0.3, sprinter: 0.3, exploder: 0.2, brute: 0.2 },
  7: { grunt: 0.25, sprinter: 0.3, exploder: 0.25, brute: 0.2 },
  8: { grunt: 0.2, sprinter: 0.3, exploder: 0.25, brute: 0.25 },
}

export const waveEnemyCount = n => (n === BOSS_WAVE ? 10 : 6 + 4 * n)

/** Build a shuffled spawn queue (array of type ids) for wave n. */
export function buildWaveQueue(n) {
  const mix = MIXES[Math.min(Math.max(n, 1), WAVE_COUNT)]
  const count = waveEnemyCount(n)
  const types = Object.keys(mix)
  const q = []
  for (const t of types) {
    const c = Math.round(mix[t] * count)
    for (let i = 0; i < c; i++) q.push(t)
  }
  while (q.length < count) q.push(types[0])
  q.length = count
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[q[i], q[j]] = [q[j], q[i]]
  }
  return q
}
