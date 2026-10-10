import * as THREE from 'three'
import { angleLerp, clamp, rand } from '../../core/utils.js'

const _target = new THREE.Vector3()
const _left = new THREE.Vector3()

export const AI_ROSTER = [
  { name: 'RAGNAR', primary: '#a1252c', secondary: '#421316', glow: '#ff6b45', minion: '#c96a55', base: 29.2 },
  { name: 'KORGATH', primary: '#6b6f78', secondary: '#23262c', glow: '#c9d4e4', minion: '#9aa4b2', base: 28.8 },
  { name: 'THARGA', primary: '#5a6b2a', secondary: '#232b10', glow: '#b8cf5e', minion: '#a4b86a', base: 28.2 },
  { name: 'MORDRA', primary: '#4a2a5e', secondary: '#1d1030', glow: '#a878d8', minion: '#9a7ec2', base: 28.5 },
  { name: 'BRONN', primary: '#b0793a', secondary: '#4a2f12', glow: '#ffb84d', minion: '#d8a86a', base: 27.8 },
]

/** Attach AI brain fields to a kart entity. */
export function initBrain(kart, i) {
  kart.ai = {
    base: AI_ROSTER[i].base,
    lane: rand(-2, 2),
    laneTarget: rand(-2, 2),
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
    ai.laneTarget = rand(-2.2, 2.2)
  }
  ai.mistakeT -= dt
  if (ai.mistakeT <= 0) {
    ai.mistakeT = rand(14, 24)
    ai.mistake = rand(0.5, 0.9)
  }
  if (ai.mistake > 0) ai.mistake -= dt
  const laneMax = ai.mistake > 0 ? 3.2 : 2.2
  ai.lane += (clamp(ai.laneTarget + (ai.mistake > 0 ? Math.sign(ai.laneTarget || 1) * 1.2 : 0), -laneMax, laneMax) - ai.lane) * Math.min(1, dt * 1.4)

  // aim point ahead on the curve, offset by lane
  const lookAhead = 5 + kart.speed * 0.25
  const sAhead = kart.s + lookAhead / track.length
  track.posAt(sAhead, _target)
  track.leftAt(sAhead, _left)
  _target.addScaledVector(_left, ai.lane)

  const desired = Math.atan2(_target.x - pos.x, _target.z - pos.z)
  const turnRate = 5 + 1.2 * (1 - clamp(kart.speed / 36, 0, 1))
  kart.heading = angleLerp(kart.heading, desired, Math.min(1, turnRate * dt))
  kart.steerVis = clamp(angleDelta(desired, kart.heading) * 2, -1, 1)

  // braking into corners: cap speed by curvature ahead
  const curv = track.maxCurvAhead(kart.idx, Math.ceil((6 + kart.speed * 0.35) / track.length * track.N))
  let target = Math.min(ai.base, Math.sqrt(48 / Math.max(curv, 0.004)))

  // rubber-band pacing vs the player
  const lead = kart.progress - playerProgress
  if (lead > 0.1) target *= 0.98
  else if (lead < -0.09) target *= 1.08
  else if (lead < -0.035) target *= 1.04

  if (ai.mistake > 0) target *= 0.94
  target *= 1 - kart.damage // damage reduces top speed
  if (kart.boostT > 0) target += kart.boostPower || 10

  // spin-out / slick override
  if (kart.spinT > 0) target = 2
  else if (kart.slickT > 0) target = Math.min(target, 10)

  const accel = kart.speed < target ? 22 : 32
  kart.speed += clamp(target - kart.speed, -accel * dt, accel * dt)
}

function angleDelta(a, b) {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
