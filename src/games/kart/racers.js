import * as THREE from 'three'
import { angleLerp, clamp, rand } from '../../core/utils.js'

const _target = new THREE.Vector3()
const _tan = new THREE.Vector3()
const _left = new THREE.Vector3()

export const AI_ROSTER = [
  { name: 'BLAZE', primary: '#ff4757', secondary: '#5e1220', glow: '#ff8a5c', minion: '#ff7a6e', base: 25.6 },
  { name: 'VOLT', primary: '#3d6cfa', secondary: '#101c4d', glow: '#7df9ff', minion: '#7db8ff', base: 25.2 },
  { name: 'JADE', primary: '#2ed573', secondary: '#0d3d24', glow: '#7dffa8', minion: '#8fe8a8', base: 24.8 },
  { name: 'HEX', primary: '#a55eea', secondary: '#2e1450', glow: '#c58fff', minion: '#c9a2ff', base: 25.0 },
  { name: 'SOL', primary: '#ffa502', secondary: '#59380a', glow: '#ffd166', minion: '#ffd97a', base: 24.5 },
]

/** Attach AI brain fields to a kart entity. */
export function initBrain(kart, i) {
  kart.ai = {
    base: AI_ROSTER[i].base,
    lane: rand(-2.6, 2.6),
    laneTarget: rand(-2.6, 2.6),
    laneT: rand(2, 5),
    mistakeT: rand(6, 14),
    mistake: 0, // >0 = running wide
  }
}

/**
 * Steer/accelerate one AI kart along the racing line.
 * ctx: { track, playerProgress, dt }
 */
export function updateAI(kart, dt, track, playerProgress) {
  const ai = kart.ai
  const pos = kart.group.position

  // lane wander + occasional mistakes (wide lines)
  ai.laneT -= dt
  if (ai.laneT <= 0) {
    ai.laneT = rand(2.5, 6)
    ai.laneTarget = rand(-2.8, 2.8)
  }
  ai.mistakeT -= dt
  if (ai.mistakeT <= 0) {
    ai.mistakeT = rand(9, 18)
    ai.mistake = rand(1, 1.8)
  }
  if (ai.mistake > 0) ai.mistake -= dt
  const laneMax = ai.mistake > 0 ? 4.6 : 2.8
  ai.lane += (clamp(ai.laneTarget + (ai.mistake > 0 ? Math.sign(ai.laneTarget || 1) * 2.4 : 0), -laneMax, laneMax) - ai.lane) * Math.min(1, dt * 1.4)

  // aim point ahead on the curve, offset by lane
  const lookAhead = 14 + kart.speed * 0.42
  const sAhead = kart.s + lookAhead / track.length
  track.posAt(sAhead, _target)
  track.leftAt(sAhead, _left)
  _target.addScaledVector(_left, ai.lane)

  const desired = Math.atan2(_target.x - pos.x, _target.z - pos.z)
  const turnRate = 2.1 + 0.9 * (1 - clamp(kart.speed / 30, 0, 1))
  kart.heading = angleLerp(kart.heading, desired, Math.min(1, turnRate * dt))
  kart.steerVis = clamp(angleDelta(desired, kart.heading) * 2, -1, 1)

  // braking into corners: cap speed by curvature ahead
  const curv = track.maxCurvAhead(kart.idx, 52)
  let target = Math.min(ai.base, Math.sqrt(34 / Math.max(curv, 0.004)))

  // rubber-band pacing vs the player
  const lead = kart.progress - playerProgress
  if (lead > 0.1) target *= 0.9
  else if (lead > 0.045) target *= 0.96
  else if (lead < -0.09) target *= 1.16
  else if (lead < -0.035) target *= 1.08

  if (ai.mistake > 0) target *= 0.86
  target *= 1 - kart.damage // damage reduces top speed
  if (kart.boostT > 0) target += 9

  // spin-out / slick override
  if (kart.spinT > 0) target = 2
  else if (kart.slickT > 0) target = Math.min(target, 10)

  const accel = kart.speed < target ? 15 : 26
  kart.speed += clamp(target - kart.speed, -accel * dt, accel * dt)
}

function angleDelta(a, b) {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
